"""Read-only WMS operations control-center aggregation."""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, time
from typing import Any, Callable, Iterable, TypeVar

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.cart import Cart
from ..models.location import Location
from ..models.order import Order
from ..models.order_item import OrderItem
from .bundle_order_item_ops import sqlalchemy_operational_picking_order_item_clause
from ..models.order_issue_task import OrderIssueTask
from ..models.pick import Pick
from ..models.receiving_scan_log import ReceivingScanLog
from ..models.stock_document import StockDocument
from ..models.user_activity_log import UserActivityLog
from ..models.warehouse_inventory_movement import WarehouseInventoryMovement
from ..models.wms_operation_session import WmsOperationSession
from ..models.wms_operational_task import ACTIVE_STATUSES, WmsOperationalTask
from ..models.wms_order_event import (
    EVT_PACKED_ITEM,
    EVT_PACKING_AUTOMATION_FINISHED,
    EVT_PACKING_FINISHED,
    EVT_PACKING_PAUSED,
    EVT_PACKING_RESUMED,
    EVT_PACKING_STARTED,
    EVT_PICKED_ITEM,
    EVT_PICKING_FINISHED,
    EVT_PICKING_STARTED,
    EVT_SHORTAGE_REPORTED,
    WmsOrderEvent,
)
from ..models.wms_packing_session import WmsPackingSession
from ..models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from ..schemas.warehouse_operations import (
    WarehouseInboundSummaryOut,
    WarehouseOperationsAlertOut,
    WarehouseOperationsConfigOut,
    WarehouseOperationsQueueOut,
    WarehouseOperationsSnapshotOut,
    WarehouseOperationsSummaryOut,
    WarehouseOperatorCardOut,
    WarehouseOperatorIdleStatsOut,
    WarehouseOperatorOrderProgressOut,
    WarehouseOperatorTimelineEventOut,
    WarehousePutawayLoadOut,
)
from .wms_dashboard_service import build_wms_dashboard_summary
from .warehouse_operations_domains import (
    build_bottlenecks,
    build_carrier_issues,
    build_employee_rankings,
    build_inbound_overview,
    build_putaway_load,
    build_replenishment_alerts,
    extend_alerts,
)

MODE_PICKING = "KOMPLETACJA"
MODE_PACKING = "PAKOWANIE"
MODE_OPERATIONS = "OPERACJE MAGAZYNOWE"
MODE_SHORTAGES = "BRAKI"

logger = logging.getLogger(__name__)
_VALID_MAIN_MODES = frozenset({MODE_PICKING, MODE_PACKING, MODE_OPERATIONS, MODE_SHORTAGES})
_T = TypeVar("_T")


def _safe_main_mode(value: Any) -> str:
    mode = str(value or MODE_OPERATIONS)
    return mode if mode in _VALID_MAIN_MODES else MODE_OPERATIONS


def _snapshot_section(
    name: str,
    *,
    tenant_id: int,
    warehouse_id: int,
    default: _T,
    fn: Callable[[], _T],
) -> _T:
    try:
        return fn()
    except Exception:
        logger.exception(
            "[warehouse.snapshot] section=%s failed tenant=%s warehouse=%s",
            name,
            tenant_id,
            warehouse_id,
        )
        return default

PICKING_EVENTS = {EVT_PICKING_STARTED, EVT_PICKED_ITEM, EVT_PICKING_FINISHED}
PACKING_EVENTS = {
    EVT_PACKING_STARTED,
    EVT_PACKED_ITEM,
    EVT_PACKING_PAUSED,
    EVT_PACKING_RESUMED,
    EVT_PACKING_FINISHED,
    EVT_PACKING_AUTOMATION_FINISHED,
}


def _parse_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat(timespec="seconds")


def _time_label(dt: datetime | None) -> str:
    if dt is None:
        return "--:--"
    return dt.strftime("%H:%M")


def _minutes_between(start: datetime, end: datetime) -> int:
    return max(0, int((end - start).total_seconds() // 60))


def _duration_label(minutes: int) -> str:
    minutes = max(0, int(minutes))
    if minutes < 60:
        return f"{minutes} min"
    total_hours, mins = divmod(minutes, 60)
    if total_hours < 24:
        return f"{total_hours}h {mins} min" if mins else f"{total_hours}h"
    total_days, hours = divmod(total_hours, 24)
    day_label = "1 dzień" if total_days == 1 else f"{total_days} dni"
    if total_days < 7:
        parts = [day_label]
        if hours:
            parts.append(f"{hours}h")
        if mins:
            parts.append(f"{mins} min")
        return " ".join(parts)
    weeks, days = divmod(total_days, 7)
    parts = [f"{weeks} tydz."]
    if days:
        parts.append("1 dzień" if days == 1 else f"{days} dni")
    if hours:
        parts.append(f"{hours}h")
    return " ".join(parts)


def _operator_name(user: AppUser | None, fallback_id: int | None = None) -> str:
    if user is None:
        return f"Operator #{fallback_id}" if fallback_id else "Operator"
    full = " ".join([p for p in [user.first_name, user.last_name] if p]).strip()
    return full or user.login or f"Operator #{user.id}"


def _initials(name: str) -> str:
    parts = [p for p in name.replace(".", " ").split() if p]
    if not parts:
        return "OP"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][:1] + parts[-1][:1]).upper()


def _location_label(loc: Location | None) -> str | None:
    if loc is None:
        return None
    return (loc.name or loc.bin or "").strip() or f"#{loc.id}"


def _cart_label(cart: Cart | None) -> str | None:
    if cart is None:
        return None
    return (cart.code or cart.name or "").strip() or f"CART-{cart.id}"


def _event_location(ev: dict[str, Any]) -> str | None:
    meta = ev.get("metadata") or {}
    raw = ev.get("location") or meta.get("last_location") or meta.get("last_scanned_location")
    raw = raw or meta.get("current_location") or meta.get("location") or meta.get("location_label")
    raw = raw or meta.get("source_location") or meta.get("target_location")
    if not raw and meta.get("workstation_id") is not None:
        raw = f"Stanowisko {meta.get('workstation_id')}"
    text = str(raw or "").strip()
    return text or None


def _last_known_location(rows: list[dict[str, Any]]) -> str | None:
    for row in reversed(rows):
        loc = _event_location(row)
        if loc:
            return loc
    return None


def _navigation_for_event(ev: dict[str, Any]) -> tuple[str | None, dict[str, Any]]:
    meta = ev.get("metadata") or {}
    mode = ev.get("main_mode")
    order_id = ev.get("order_id")
    if mode == MODE_PACKING and order_id:
        return f"/wms/packing/order/{int(order_id)}", {"orderId": int(order_id)}
    if mode == MODE_PICKING:
        state: dict[str, Any] = {"orderId": int(order_id)} if order_id else {}
        if meta.get("cart_code"):
            state["cartCode"] = meta.get("cart_code")
        return "/wms/picking/products", state
    task_id = meta.get("task_id")
    if mode == MODE_SHORTAGES:
        if task_id:
            return f"/wms/issues/task/{int(task_id)}", {"taskId": int(task_id)}
        if order_id:
            return f"/wms/braki?order_id={int(order_id)}", {"orderId": int(order_id)}
        return "/wms/braki", {}
    doc_id = meta.get("document_id")
    if task_id:
        path = (
            f"/wms/operational-queues/relocation/{int(task_id)}"
            if "relocation" in str(ev.get("event_type") or "").lower()
            else f"/wms/operational-queues/task/{int(task_id)}"
        )
        return path, {"taskId": int(task_id)}
    if doc_id:
        submode = str(ev.get("submode") or "").lower()
        event_type = str(ev.get("event_type") or "").lower()
        if "mm" in submode or "mm" in event_type:
            return f"/wms/mm/relocation/{int(doc_id)}", {"documentId": int(doc_id)}
        if "przyj" in submode or "receiv" in event_type:
            return f"/wms/receiving/pz/{int(doc_id)}", {"documentId": int(doc_id)}
        return f"/wms/putaway/{int(doc_id)}", {"documentId": int(doc_id)}
    return None, {}


def _order_number(order: Order | None, order_id: int | None = None) -> str | None:
    if order is None:
        return f"#{order_id}" if order_id else None
    for attr in ("order_number", "number", "external_id", "sales_document_number"):
        val = getattr(order, attr, None)
        if val:
            text = str(val).strip()
            if text:
                return text if text.startswith("#") else f"#{text}"
    return f"#{order.id}"


def _status(minutes: int, *, short_break_minutes: int, long_break_minutes: int) -> tuple[str, str]:
    if minutes > long_break_minutes:
        return "red", "Nieaktywny"
    if minutes > short_break_minutes:
        return "gray", "Bez ruchu"
    return "green", "Aktywny"


def _idle_stats_for_events(
    timestamps: Iterable[datetime],
    *,
    now: datetime,
    range_start: datetime,
    short_break_minutes: int,
    long_break_minutes: int,
) -> WarehouseOperatorIdleStatsOut:
    points = sorted(ts for ts in timestamps if ts is not None and ts >= range_start and ts <= now)
    if not points:
        return WarehouseOperatorIdleStatsOut()
    gaps: list[int] = []
    prev = points[0]
    for ts in points[1:]:
        gap = _minutes_between(prev, ts)
        if gap > short_break_minutes:
            gaps.append(gap)
        prev = ts
    trailing = _minutes_between(points[-1], now)
    if trailing > short_break_minutes:
        gaps.append(trailing)
    total = sum(gaps)
    return WarehouseOperatorIdleStatsOut(
        total_idle_minutes=total,
        total_idle_label=_duration_label(total),
        short_idle_periods=sum(1 for gap in gaps if short_break_minutes < gap < long_break_minutes),
        long_idle_periods=sum(1 for gap in gaps if gap > long_break_minutes),
    )


def _submode_for_wms_event(event_type: str, metadata: dict[str, Any]) -> tuple[str, str, str]:
    et = (event_type or "").upper()
    meta_text = json.dumps(metadata, ensure_ascii=False).lower() if metadata else ""
    if et == EVT_SHORTAGE_REPORTED:
        return MODE_SHORTAGES, "Brak produktu", "zgłosił brak produktu"
    if et in PICKING_EVENTS:
        if "recovery" in meta_text or "dogryw" in meta_text:
            sub = "Recovery picking"
        else:
            sub = "Kompletacja"
        labels = {
            EVT_PICKING_STARTED: "rozpoczął kompletację",
            EVT_PICKED_ITEM: "zeskanował produkt",
            EVT_PICKING_FINISHED: "zakończył kompletację",
        }
        return MODE_PICKING, sub, labels.get(et, "kompletacja")
    if et in PACKING_EVENTS:
        labels = {
            EVT_PACKING_STARTED: "rozpoczął pakowanie",
            EVT_PACKED_ITEM: "spakował produkt",
            EVT_PACKING_PAUSED: "wstrzymał pakowanie",
            EVT_PACKING_RESUMED: "wznowił pakowanie",
            EVT_PACKING_FINISHED: "zakończył pakowanie",
            EVT_PACKING_AUTOMATION_FINISHED: "zakończył automatykę pakowania",
        }
        return MODE_PACKING, "Pakowanie", labels.get(et, "pakowanie")
    return MODE_OPERATIONS, "Operacja magazynowa", et.replace("_", " ").title()


def _submode_for_activity(module: str, action_type: str, metadata: dict[str, Any]) -> tuple[str, str, str]:
    mod = (module or "").upper()
    act = (action_type or "").lower()
    meta_text = json.dumps(metadata, ensure_ascii=False).lower() if metadata else ""
    text = f"{mod.lower()} {act} {meta_text}"
    if "shortage" in text or "brak" in text or "/braki" in text:
        return MODE_SHORTAGES, "Obsługa braków", "obsłużył brak"
    if "pack" in text or "pakow" in text or "/wms/packing" in text:
        return MODE_PACKING, "Pakowanie", "pakowanie"
    if "pick" in text or "komplet" in text or "/wms/picking" in text:
        return MODE_PICKING, "Kompletacja", "kompletacja"
    if mod == "WMS_RECEIVING" or "receiv" in text or "/wms/receiving" in text or "przyj" in text:
        return MODE_OPERATIONS, "Przyjęcie", "pracował przy przyjęciu"
    if mod == "WMS_PUTAWAY" or "putaway" in text:
        return MODE_OPERATIONS, "Rozlokowanie PZ", "rozlokował towar z PZ"
    if "relocation" in text and "putaway" not in text:
        return MODE_OPERATIONS, "Rozlokowanie produktów", "rozlokował produkty na nośniki"
    if "rozlok" in text:
        return MODE_OPERATIONS, "Rozlokowanie PZ", "rozlokował towar z PZ"
    if mod == "WMS_MOVEMENTS" or "movement" in text or "transfer" in text or "mm" in text:
        return MODE_OPERATIONS, "Przesunięcia MM", "wykonał przesunięcie"
    if mod == "WMS_CARRIERS":
        return MODE_OPERATIONS, "Nośniki", "obsłużył nośnik"
    if mod in {"WMS_RETURNS", "WMS_RETURN_MODULE"} or "return" in text or "rmz" in text or "complaint" in text or "reklamac" in text:
        return MODE_OPERATIONS, "Zwroty", "obsłużył zwrot"
    sub = str(metadata.get("operation_type") or metadata.get("operation") or "Operacja magazynowa")
    return MODE_OPERATIONS, sub[:64], "operacja magazynowa"


def _mode_for_operation_session_kind(session_kind: str) -> tuple[str, str, str]:
    kind = (session_kind or "").strip().lower()
    if "pack" in kind:
        return MODE_PACKING, "Pakowanie", "aktywna sesja pakowania"
    if "pick" in kind or "cart" in kind:
        return MODE_PICKING, "Kompletacja", "aktywna sesja kompletacji"
    if "shortage" in kind or "issue" in kind or "brak" in kind:
        return MODE_SHORTAGES, "Obsługa braków", "aktywna obsługa braków"
    if "receiv" in kind or "pz" in kind:
        return MODE_OPERATIONS, "Przyjęcie", "aktywna sesja przyjęcia"
    if "putaway" in kind or "rozlok" in kind:
        return MODE_OPERATIONS, "Rozlokowanie PZ", "aktywna sesja rozlokowania PZ"
    if "relocation" in kind:
        return MODE_OPERATIONS, "Rozlokowanie produktów", "aktywna sesja rozlokowania produktów"
    if "mm" in kind or "transfer" in kind or "move" in kind:
        return MODE_OPERATIONS, "Przesunięcia MM", "aktywna sesja MM"
    if "return" in kind or "rmz" in kind or "complaint" in kind:
        return MODE_OPERATIONS, "Zwroty / reklamacje", "aktywna obsługa zwrotu"
    return MODE_OPERATIONS, "Operacja magazynowa", "aktywna sesja operacyjna"


def _submode_for_product_operation(movement_type: str, wms_mode: str | None = None) -> tuple[str, str, str]:
    text = f"{movement_type or ''} {wms_mode or ''}".upper()
    if "SHORTAGE" in text or "BRAK" in text:
        return MODE_SHORTAGES, "Obsługa braków", "operacja braków"
    if "PICK" in text:
        return MODE_PICKING, "Kompletacja", "operacja kompletacji"
    if "PACK" in text:
        return MODE_PACKING, "Pakowanie", "operacja pakowania"
    if "RECEIPT" in text or "RECEIVING" in text or "PZ" in text:
        return MODE_OPERATIONS, "Przyjęcie", "operacja przyjęcia"
    if "PUTAWAY" in text or ("ROZLOK" in text and "RELOCATION" not in text):
        return MODE_OPERATIONS, "Rozlokowanie PZ", "operacja rozlokowania PZ"
    if "RELOCATION" in text:
        return MODE_OPERATIONS, "Rozlokowanie produktów", "operacja rozlokowania produktów"
    if "MOVE" in text or "MM" in text or "TRANSFER" in text:
        return MODE_OPERATIONS, "Przesunięcia MM", "operacja przesunięcia"
    if "RETURN" in text or "RMZ" in text or "COMPLAINT" in text:
        return MODE_OPERATIONS, "Zwroty / reklamacje", "operacja zwrotu"
    return MODE_OPERATIONS, "Operacja magazynowa", "operacja magazynowa"


def _event_title(action_label: str, location: str | None = None) -> str:
    return f"{action_label} — {location}" if location else action_label


def _activity_event(
    *,
    user_id: int,
    at: datetime,
    main_mode: str,
    submode: str,
    title: str,
    location: str | None = None,
    order_id: int | None = None,
    cart_id: int | None = None,
    document: str | None = None,
    carrier: str | None = None,
    quantity: float | None = None,
    event_type: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta = dict(metadata or {})
    if order_id is not None:
        meta["order_id"] = int(order_id)
    if cart_id is not None:
        meta["cart_id"] = int(cart_id)
    if document:
        meta["document"] = document
    if carrier:
        meta["carrier"] = carrier
    if quantity is not None:
        meta["quantity"] = quantity
    if event_type:
        meta["event_type"] = event_type
    return {
        "user_id": int(user_id),
        "at": at,
        "main_mode": main_mode,
        "submode": submode,
        "title": title,
        "location": location,
        "order_id": order_id,
        "cart_id": cart_id,
        "document": document,
        "carrier": carrier,
        "quantity": quantity,
        "event_type": event_type,
        "metadata": meta,
    }


def _timeline_out(ev: dict[str, Any]) -> WarehouseOperatorTimelineEventOut:
    at = ev["at"]
    return WarehouseOperatorTimelineEventOut(
        at=_iso(at) or "",
        time_label=_time_label(at),
        title=str(ev.get("title") or ""),
        main_mode=_safe_main_mode(ev.get("main_mode")),
        submode=str(ev.get("submode") or "Operacja"),
        location=ev.get("location"),
        metadata=ev.get("metadata") or {},
    )


def _collect_wms_order_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    rows = (
        db.query(WmsOrderEvent)
        .filter(
            WmsOrderEvent.tenant_id == tenant_id,
            WmsOrderEvent.warehouse_id == warehouse_id,
            WmsOrderEvent.created_at >= start,
            WmsOrderEvent.created_at <= end,
            WmsOrderEvent.operator_user_id.isnot(None),
        )
        .order_by(WmsOrderEvent.created_at.asc(), WmsOrderEvent.id.asc())
        .limit(10000)
        .all()
    )
    location_ids = {int(r.source_location_id) for r in rows if r.source_location_id}
    cart_ids = {int(r.target_cart_id) for r in rows if r.target_cart_id}
    locs = {int(l.id): l for l in db.query(Location).filter(Location.id.in_(location_ids)).all()} if location_ids else {}
    carts = {int(c.id): c for c in db.query(Cart).filter(Cart.id.in_(cart_ids)).all()} if cart_ids else {}

    out: list[dict[str, Any]] = []
    for row in rows:
        uid = getattr(row, "operator_user_id", None)
        at = getattr(row, "created_at", None)
        if uid is None or at is None:
            continue
        metadata = _parse_json(getattr(row, "metadata_json", None))
        main_mode, submode, label = _submode_for_wms_event(str(row.event_type or ""), metadata)
        loc_label = str(metadata.get("source_location") or "").strip() or _location_label(locs.get(int(row.source_location_id or 0)))
        cart_label = str(metadata.get("target_cart") or "").strip() or _cart_label(carts.get(int(row.target_cart_id or 0)))
        if cart_label:
            metadata["cart_code"] = cart_label
        out.append(
            _activity_event(
                user_id=int(uid),
                at=at,
                main_mode=main_mode,
                submode=submode,
                title=_event_title(label, loc_label or None),
                location=loc_label or None,
                order_id=int(row.order_id) if row.order_id else None,
                cart_id=int(row.target_cart_id) if row.target_cart_id else None,
                quantity=float(row.quantity) if row.quantity is not None else None,
                event_type=str(row.event_type or ""),
                metadata=metadata,
            )
        )
    return out


def _collect_workforce_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    rows = (
        db.query(UserActivityLog)
        .filter(
            UserActivityLog.tenant_id == tenant_id,
            UserActivityLog.created_at >= start,
            UserActivityLog.created_at <= end,
            UserActivityLog.user_id.isnot(None),
        )
        .order_by(UserActivityLog.created_at.asc(), UserActivityLog.id.asc())
        .limit(10000)
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        module = str(row.module or "")
        if not module.upper().startswith("WMS"):
            continue
        at = getattr(row, "created_at", None)
        uid = getattr(row, "user_id", None)
        if at is None or uid is None:
            continue
        metadata = _parse_json(row.metadata_json)
        meta_warehouse_id = metadata.get("warehouse_id")
        if meta_warehouse_id is not None:
            try:
                if int(meta_warehouse_id) != int(warehouse_id):
                    continue
            except (TypeError, ValueError):
                pass
        main_mode, submode, label = _submode_for_activity(module, str(row.action_type or ""), metadata)
        location = (
            str(metadata.get("location") or metadata.get("location_label") or metadata.get("current_location") or "").strip()
            or None
        )
        document = str(metadata.get("document") or metadata.get("document_number") or metadata.get("pz_number") or "").strip() or None
        carrier = str(metadata.get("carrier") or metadata.get("carrier_name") or "").strip() or None
        out.append(
            _activity_event(
                user_id=int(uid),
                at=at,
                main_mode=main_mode,
                submode=submode,
                title=_event_title(label, location),
                location=location,
                document=document,
                carrier=carrier,
                event_type=str(row.action_type or ""),
                metadata={"module": module, **metadata},
            )
        )
    return out


def _collect_inventory_movement_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    rows = (
        db.query(WarehouseInventoryMovement)
        .filter(
            WarehouseInventoryMovement.tenant_id == tenant_id,
            WarehouseInventoryMovement.warehouse_id == warehouse_id,
            WarehouseInventoryMovement.created_at >= start,
            WarehouseInventoryMovement.created_at <= end,
            WarehouseInventoryMovement.operator_admin_id.isnot(None),
        )
        .order_by(WarehouseInventoryMovement.created_at.asc(), WarehouseInventoryMovement.id.asc())
        .limit(5000)
        .all()
    )
    loc_ids = {
        int(v)
        for row in rows
        for v in (getattr(row, "to_location_id", None), getattr(row, "from_location_id", None))
        if v
    }
    locs = {int(l.id): l for l in db.query(Location).filter(Location.id.in_(loc_ids)).all()} if loc_ids else {}
    out: list[dict[str, Any]] = []
    for row in rows:
        at = getattr(row, "created_at", None)
        uid = getattr(row, "operator_admin_id", None)
        if at is None or uid is None:
            continue
        meta = _parse_json(row.metadata_json)
        movement_type = str(row.movement_type or "MOVE").upper()
        if "RECEIPT" in movement_type:
            submode = "Przyjęcie"
        elif "PUTAWAY" in movement_type:
            submode = "Rozlokowanie PZ"
        elif "RELOCATION" in movement_type:
            submode = "Rozlokowanie produktów"
        elif "RETURN" in movement_type:
            submode = "Zwroty"
        else:
            submode = "Przesunięcia MM"
        loc = _location_label(locs.get(int(row.to_location_id or 0))) or _location_label(locs.get(int(row.from_location_id or 0)))
        doc = str(meta.get("document_number") or row.source_document_type or "").strip() or None
        out.append(
            _activity_event(
                user_id=int(uid),
                at=at,
                main_mode=MODE_OPERATIONS,
                submode=submode,
                title=_event_title(f"{submode}: {movement_type}", loc),
                location=loc,
                document=doc,
                quantity=float(row.quantity or 0),
                event_type=movement_type,
                metadata=meta,
            )
        )
    return out


def _collect_packing_session_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    rows = (
        db.query(WmsPackingSession)
        .filter(
            WmsPackingSession.tenant_id == tenant_id,
            WmsPackingSession.warehouse_id == warehouse_id,
            WmsPackingSession.operator_user_id.isnot(None),
            WmsPackingSession.started_at <= end,
            (WmsPackingSession.completed_at.is_(None)) | (WmsPackingSession.completed_at >= start),
        )
        .order_by(WmsPackingSession.started_at.asc(), WmsPackingSession.id.asc())
        .limit(2000)
        .all()
    )
    order_ids = {int(r.order_id) for r in rows if r.order_id}
    orders = (
        {int(o.id): o for o in db.query(Order).filter(Order.id.in_(order_ids)).all()}
        if order_ids
        else {}
    )
    latest_event_at: dict[tuple[int, int], datetime] = {}
    if order_ids:
        for oid, uid, mx in (
            db.query(WmsOrderEvent.order_id, WmsOrderEvent.operator_user_id, func.max(WmsOrderEvent.created_at))
            .filter(
                WmsOrderEvent.tenant_id == tenant_id,
                WmsOrderEvent.warehouse_id == warehouse_id,
                WmsOrderEvent.order_id.in_(list(order_ids)),
                WmsOrderEvent.operator_user_id.isnot(None),
                WmsOrderEvent.created_at >= start,
                WmsOrderEvent.created_at <= end,
            )
            .group_by(WmsOrderEvent.order_id, WmsOrderEvent.operator_user_id)
            .all()
        ):
            if oid is not None and uid is not None and mx is not None:
                latest_event_at[(int(oid), int(uid))] = mx
    item_totals: dict[int, tuple[int, int]] = {}
    if order_ids:
        for oid, total, packed in (
            db.query(
                OrderItem.order_id,
                func.coalesce(func.sum(OrderItem.quantity), 0),
                func.coalesce(func.sum(OrderItem.packing_quantity_packed), 0),
            )
            .filter(OrderItem.order_id.in_(list(order_ids)), sqlalchemy_operational_picking_order_item_clause(OrderItem))
            .group_by(OrderItem.order_id)
            .all()
        ):
            item_totals[int(oid)] = (int(total or 0), int(packed or 0))

    out: list[dict[str, Any]] = []
    for row in rows:
        uid = int(row.operator_user_id)
        order = orders.get(int(row.order_id))
        candidates = [
            getattr(row, "started_at", None),
            getattr(row, "last_activity_at", None),
            getattr(row, "automation_finished_at", None),
            getattr(row, "completed_at", None),
            latest_event_at.get((int(row.order_id), uid)),
        ]
        at = max([x for x in candidates if x is not None], default=None)
        if at is None or at < start or at > end:
            continue
        meta = _parse_json(getattr(row, "metadata_json", None))
        if row.workstation_id is not None:
            meta["workstation_id"] = int(row.workstation_id)
            meta.setdefault("last_location", f"Stanowisko {int(row.workstation_id)}")
        meta["packing_session_id"] = int(row.id)
        total, packed = item_totals.get(int(row.order_id), (0, 0))
        meta["progress_total"] = total
        meta["progress_done"] = min(total, max(0, packed))
        meta["progress_percent"] = int(round((meta["progress_done"] / total) * 100)) if total > 0 else 0
        title = "aktywna sesja pakowania" if row.completed_at is None else "sesja pakowania"
        out.append(
            _activity_event(
                user_id=uid,
                at=at,
                main_mode=MODE_PACKING,
                submode="Pakowanie",
                title=title,
                location=_event_location({"metadata": meta}),
                order_id=int(row.order_id),
                document=_order_number(order, int(row.order_id)),
                event_type="PACKING_SESSION_ACTIVE" if row.completed_at is None else "PACKING_SESSION",
                metadata=meta,
            )
        )
    return out


def _collect_operation_session_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    rows = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.tenant_id == tenant_id,
            WmsOperationSession.warehouse_id == warehouse_id,
            WmsOperationSession.operator_user_id.isnot(None),
            WmsOperationSession.started_at <= end,
            (WmsOperationSession.completed_at.is_(None)) | (WmsOperationSession.completed_at >= start),
        )
        .order_by(WmsOperationSession.started_at.asc(), WmsOperationSession.id.asc())
        .limit(3000)
        .all()
    )
    cart_ids = {int(r.cart_id) for r in rows if r.cart_id}
    order_ids = {int(r.order_id) for r in rows if r.order_id}
    carts = {int(c.id): c for c in db.query(Cart).filter(Cart.id.in_(cart_ids)).all()} if cart_ids else {}
    orders = {int(o.id): o for o in db.query(Order).filter(Order.id.in_(order_ids)).all()} if order_ids else {}
    out: list[dict[str, Any]] = []
    for row in rows:
        at = max([x for x in [row.started_at, getattr(row, "last_activity_at", None), row.completed_at] if x is not None], default=None)
        if at is None or at < start or at > end:
            continue
        main_mode, submode, label = _mode_for_operation_session_kind(str(row.session_kind or ""))
        meta = _parse_json(getattr(row, "metadata_json", None))
        if row.cart_id:
            meta["cart_code"] = _cart_label(carts.get(int(row.cart_id)))
        meta["operation_session_id"] = int(row.id)
        location = _event_location({"metadata": meta})
        out.append(
            _activity_event(
                user_id=int(row.operator_user_id),
                at=at,
                main_mode=main_mode,
                submode=submode,
                title=label,
                location=location,
                order_id=int(row.order_id) if row.order_id else None,
                cart_id=int(row.cart_id) if row.cart_id else None,
                document=_order_number(orders.get(int(row.order_id)), int(row.order_id)) if row.order_id else None,
                event_type=f"SESSION_{str(row.session_kind or '').upper()}",
                metadata=meta,
            )
        )
    return out


def _collect_receiving_scan_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    rows = (
        db.query(ReceivingScanLog, StockDocument)
        .join(StockDocument, StockDocument.id == ReceivingScanLog.document_id)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.warehouse_id == warehouse_id,
            ReceivingScanLog.created_at >= start,
            ReceivingScanLog.created_at <= end,
        )
        .order_by(ReceivingScanLog.created_at.asc(), ReceivingScanLog.id.asc())
        .limit(5000)
        .all()
    )
    out: list[dict[str, Any]] = []
    for log, doc in rows:
        meta = {
            "receiving_scan_log_id": int(log.id),
            "document_id": int(doc.id),
            "packaging_type": log.packaging_type,
            "scan_kind": log.scan_kind,
        }
        out.append(
            _activity_event(
                user_id=int(log.admin_id),
                at=log.created_at,
                main_mode=MODE_OPERATIONS,
                submode="Przyjęcie",
                title="skan przyjęcia",
                document=f"{doc.document_type}/{doc.id}",
                quantity=float(log.quantity_added or 0),
                event_type="RECEIVING_SCAN",
                metadata=meta,
            )
        )
    return out


def _collect_product_operation_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    rows = (
        db.query(WmsProductWarehouseOperation)
        .filter(
            WmsProductWarehouseOperation.tenant_id == tenant_id,
            WmsProductWarehouseOperation.warehouse_id == warehouse_id,
            WmsProductWarehouseOperation.created_at >= start,
            WmsProductWarehouseOperation.created_at <= end,
        )
        .order_by(WmsProductWarehouseOperation.created_at.asc(), WmsProductWarehouseOperation.id.asc())
        .limit(5000)
        .all()
    )
    loc_ids = {
        int(v)
        for row in rows
        for v in (getattr(row, "target_location_id", None), getattr(row, "source_location_id", None))
        if v
    }
    locs = {int(l.id): l for l in db.query(Location).filter(Location.id.in_(loc_ids)).all()} if loc_ids else {}
    out: list[dict[str, Any]] = []
    for row in rows:
        main_mode, submode, label = _submode_for_product_operation(str(row.movement_type or ""), row.wms_mode)
        loc = _location_label(locs.get(int(row.target_location_id or 0))) or _location_label(locs.get(int(row.source_location_id or 0)))
        out.append(
            _activity_event(
                user_id=int(row.admin_id),
                at=row.created_at,
                main_mode=main_mode,
                submode=submode,
                title=_event_title(label, loc),
                location=loc,
                document=row.reference_document or (f"DOC/{row.stock_document_id}" if row.stock_document_id else None),
                quantity=float(row.quantity or 0),
                event_type=str(row.movement_type or "PRODUCT_OPERATION"),
                metadata={
                    "product_operation_id": int(row.id),
                    "product_id": int(row.product_id),
                    "wms_mode": row.wms_mode,
                    "packaging_type": row.packaging_type,
                },
            )
        )
    return out


def _collect_pick_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[dict[str, Any]]:
    rows = (
        db.query(Pick)
        .filter(
            Pick.tenant_id == tenant_id,
            Pick.warehouse_id == warehouse_id,
            Pick.picker_id.isnot(None),
            ((Pick.picked_at >= start) & (Pick.picked_at <= end))
            | ((Pick.picked_at.is_(None)) & (Pick.created_at >= start) & (Pick.created_at <= end)),
        )
        .order_by(Pick.created_at.asc(), Pick.id.asc())
        .limit(5000)
        .all()
    )
    location_ids = {int(r.location_id) for r in rows if r.location_id}
    cart_ids = {int(r.cart_id) for r in rows if r.cart_id}
    order_ids = {int(r.order_id) for r in rows if r.order_id}
    locs = {int(l.id): l for l in db.query(Location).filter(Location.id.in_(location_ids)).all()} if location_ids else {}
    carts = {int(c.id): c for c in db.query(Cart).filter(Cart.id.in_(cart_ids)).all()} if cart_ids else {}
    orders = {int(o.id): o for o in db.query(Order).filter(Order.id.in_(order_ids)).all()} if order_ids else {}
    out: list[dict[str, Any]] = []
    for row in rows:
        at = row.picked_at or row.created_at
        if at is None:
            continue
        meta = {
            "pick_id": int(row.id),
            "product_id": int(row.product_id),
            "pick_status": row.status,
        }
        cart_code = _cart_label(carts.get(int(row.cart_id or 0)))
        if cart_code:
            meta["cart_code"] = cart_code
        loc = _location_label(locs.get(int(row.location_id or 0)))
        out.append(
            _activity_event(
                user_id=int(row.picker_id),
                at=at,
                main_mode=MODE_PICKING,
                submode="Kompletacja",
                title=_event_title("pobrał produkt", loc),
                location=loc,
                order_id=int(row.order_id),
                cart_id=int(row.cart_id) if row.cart_id else None,
                document=_order_number(orders.get(int(row.order_id)), int(row.order_id)),
                quantity=float(row.quantity or 0),
                event_type=EVT_PICKED_ITEM,
                metadata=meta,
            )
        )
    return out


def _order_progress_for_user(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    user_id: int,
    order_ids: list[int],
    mode: str,
    rows: list[dict[str, Any]],
    now: datetime,
    long_break_minutes: int,
) -> list[WarehouseOperatorOrderProgressOut]:
    if not order_ids:
        return []
    order_ids = list(dict.fromkeys(int(x) for x in order_ids if x))
    orders = {
        int(o.id): o
        for o in db.query(Order)
        .filter(Order.tenant_id == tenant_id, Order.warehouse_id == warehouse_id, Order.id.in_(order_ids))
        .all()
    }
    totals: dict[int, float] = defaultdict(float)
    item_rows = (
        db.query(OrderItem.order_id, func.coalesce(func.sum(OrderItem.quantity), 0))
        .filter(
            OrderItem.order_id.in_(order_ids),
            sqlalchemy_operational_picking_order_item_clause(OrderItem),
            func.upper(func.coalesce(OrderItem.oms_line_status, "")) != "REPLACED",
        )
        .group_by(OrderItem.order_id)
        .all()
    )
    for oid, qty in item_rows:
        totals[int(oid)] = float(qty or 0)

    done_by_order: dict[int, float] = defaultdict(float)
    if mode == MODE_PACKING:
        packed_rows = (
            db.query(OrderItem.order_id, func.coalesce(func.sum(OrderItem.packing_quantity_packed), 0))
            .filter(
                OrderItem.order_id.in_(order_ids),
                sqlalchemy_operational_picking_order_item_clause(OrderItem),
                func.upper(func.coalesce(OrderItem.oms_line_status, "")) != "REPLACED",
            )
            .group_by(OrderItem.order_id)
            .all()
        )
        for oid, qty in packed_rows:
            done_by_order[int(oid)] = float(qty or 0)
    else:
        pick_rows = (
            db.query(Pick.order_id, func.coalesce(func.sum(Pick.quantity), 0))
            .filter(Pick.tenant_id == tenant_id, Pick.warehouse_id == warehouse_id, Pick.order_id.in_(order_ids))
            .filter((Pick.picker_id == user_id) | (Pick.picker_id.is_(None)))
            .group_by(Pick.order_id)
            .all()
        )
        for oid, qty in pick_rows:
            done_by_order[int(oid)] = float(qty or 0)

    last_by_order: dict[int, dict[str, Any]] = {}
    blocked_orders: set[int] = set()
    for row in rows:
        oid_raw = row.get("order_id")
        if not oid_raw:
            continue
        oid = int(oid_raw)
        last_by_order[oid] = row
        event_type = str(row.get("event_type") or "").upper()
        if event_type == EVT_SHORTAGE_REPORTED or row.get("main_mode") == MODE_SHORTAGES:
            blocked_orders.add(oid)

    active_order_id = int(rows[-1]["order_id"]) if rows and rows[-1].get("order_id") else None
    out: list[WarehouseOperatorOrderProgressOut] = []
    for oid in order_ids[:12]:
        total = totals.get(oid, 0.0)
        done = min(total, max(0.0, done_by_order.get(oid, 0.0))) if total else max(0.0, done_by_order.get(oid, 0.0))
        progress = int(round((done / total) * 100)) if total else (100 if done else 0)
        last = last_by_order.get(oid)
        last_at = last.get("at") if last else None
        minutes = _minutes_between(last_at, now) if last_at else 999999
        if progress >= 100:
            status = "completed"
            status_label = "Zakończone"
            tone = "green"
        elif oid in blocked_orders:
            status = "blocked"
            status_label = "Problem / brak"
            tone = "red"
        elif oid == active_order_id:
            status = "active"
            status_label = "Aktywne"
            tone = "blue"
        elif minutes > long_break_minutes:
            status = "inactive"
            status_label = "Bez ruchu"
            tone = "amber"
        else:
            status = "active"
            status_label = "W toku"
            tone = "blue"
        nav_path, nav_state = _navigation_for_event(last or {"main_mode": mode, "order_id": oid, "metadata": {}})
        out.append(
            WarehouseOperatorOrderProgressOut(
                order_id=oid,
                order_number=_order_number(orders.get(oid), oid) or f"#{oid}",
                picked_products=int(round(done)),
                total_products=int(round(total)),
                products_completed=round(done, 6),
                products_total=round(total, 6),
                progress_percent=max(0, min(100, progress)),
                status=status,
                status_label=status_label,
                progress_tone=tone,
                last_activity_at=_iso(last_at) if last_at else None,
                last_activity_label=_time_label(last_at) if last_at else None,
                navigation_path=nav_path,
                navigation_state=nav_state,
            )
        )
    return out


def _fallback_progress_for_event(ev: dict[str, Any], now: datetime, long_break_minutes: int) -> WarehouseOperatorOrderProgressOut | None:
    meta = ev.get("metadata") or {}
    label = ev.get("document") or meta.get("document_number") or meta.get("document") or meta.get("task_id")
    if not label:
        return None
    done = float(meta.get("progress_done") or 0)
    total = float(meta.get("progress_total") or 0)
    progress = int(round((done / total) * 100)) if total > 0 else int(meta.get("progress_percent") or 0)
    minutes = _minutes_between(ev.get("at"), now)
    if progress >= 100:
        status, status_label, tone = "completed", "Zakończone", "green"
    elif ev.get("main_mode") == MODE_SHORTAGES:
        status, status_label, tone = "blocked", "Problem / brak", "red"
    elif minutes > long_break_minutes:
        status, status_label, tone = "inactive", "Bez ruchu", "amber"
    else:
        status, status_label, tone = "active", "Aktywne", "blue"
    nav_path, nav_state = _navigation_for_event(ev)
    return WarehouseOperatorOrderProgressOut(
        order_id=int(ev["order_id"]) if ev.get("order_id") else None,
        order_number=str(label),
        picked_products=int(round(done)),
        total_products=int(round(total)),
        products_completed=round(done, 6),
        products_total=round(total, 6),
        progress_percent=max(0, min(100, progress)),
        status=status,
        status_label=status_label,
        progress_tone=tone,
        last_activity_at=_iso(ev.get("at")),
        last_activity_label=_time_label(ev.get("at")),
        navigation_path=nav_path,
        navigation_state=nav_state,
    )


def _build_operator_cards(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    events: list[dict[str, Any]],
    now: datetime,
    range_start: datetime,
    short_break_minutes: int,
    long_break_minutes: int,
) -> list[WarehouseOperatorCardOut]:
    by_user: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for ev in events:
        by_user[int(ev["user_id"])].append(ev)
    users = (
        {int(u.id): u for u in db.query(AppUser).filter(AppUser.id.in_(list(by_user.keys()))).all()}
        if by_user
        else {}
    )
    cards: list[WarehouseOperatorCardOut] = []
    for uid, rows in by_user.items():
        rows = sorted(rows, key=lambda r: r["at"])
        last = rows[-1]
        first = rows[0]
        minutes = _minutes_between(last["at"], now)
        color, status_label = _status(
            minutes,
            short_break_minutes=short_break_minutes,
            long_break_minutes=long_break_minutes,
        )
        user_name = _operator_name(users.get(uid), uid)
        idle = _idle_stats_for_events(
            [r["at"] for r in rows],
            now=now,
            range_start=range_start,
            short_break_minutes=short_break_minutes,
            long_break_minutes=long_break_minutes,
        )
        order_ids = [int(r["order_id"]) for r in rows if r.get("order_id")]
        order_progress = _order_progress_for_user(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            user_id=uid,
            order_ids=order_ids,
            mode=last["main_mode"],
            rows=rows,
            now=now,
            long_break_minutes=long_break_minutes,
        )
        if not order_progress:
            fallback_progress = _fallback_progress_for_event(last, now, long_break_minutes)
            if fallback_progress is not None:
                order_progress = [fallback_progress]
        assigned_orders = [r.order_number for r in order_progress[:4]]
        products_completed = round(sum(float(r.products_completed or r.picked_products or 0) for r in order_progress), 6)
        products_total = round(sum(float(r.products_total or r.total_products or 0) for r in order_progress), 6)
        orders_total = len([r for r in order_progress if r.order_id is not None or r.products_total > 0])
        orders_completed = len([r for r in order_progress if r.status == "completed"])
        progress = int(round((products_completed / products_total) * 100)) if products_total > 0 else None
        session_progress_raw = last["metadata"].get("progress_percent")
        if session_progress_raw is not None and products_total <= 0:
            try:
                progress = max(0, min(100, int(round(float(session_progress_raw)))))
            except (TypeError, ValueError):
                pass
        if progress is None and order_progress:
            progress_values = [r.progress_percent for r in order_progress]
            progress = int(round(sum(progress_values) / len(progress_values))) if progress_values else None
        blocked = any(r.status == "blocked" for r in order_progress)
        progress_tone = "red" if blocked else ("green" if progress is not None and progress >= 100 else "blue")
        picked_products = sum(1 for r in rows if r.get("event_type") == EVT_PICKED_ITEM)
        packed_items = sum(1 for r in rows if r.get("event_type") == EVT_PACKED_ITEM)
        packing_finished = [r for r in rows if r.get("event_type") in {EVT_PACKING_FINISHED, EVT_PACKING_AUTOMATION_FINISHED}]
        hours = max(1 / 60, (now - first["at"]).total_seconds() / 3600)
        packed_per_hour = round(len(packing_finished) / hours, 1) if packing_finished else None
        last_packed_order = None
        for r in reversed(rows):
            if r.get("event_type") in {EVT_PACKED_ITEM, EVT_PACKING_FINISHED, EVT_PACKING_AUTOMATION_FINISHED} and r.get("order_id"):
                last_packed_order = f"#{r['order_id']}"
                break
        active_reference_type = None
        active_reference_id = None
        active_reference_label = None
        if last.get("order_id"):
            active_reference_type = "order"
            active_reference_id = str(last["order_id"])
            active_reference_label = last.get("document") or f"#{last['order_id']}"
        elif last["metadata"].get("document_id"):
            active_reference_type = "document"
            active_reference_id = str(last["metadata"].get("document_id"))
            active_reference_label = last.get("document") or str(last["metadata"].get("document_number") or f"DOC/{active_reference_id}")
        elif last["metadata"].get("task_id"):
            active_reference_type = "task"
            active_reference_id = str(last["metadata"].get("task_id"))
            active_reference_label = f"Zadanie #{active_reference_id}"
        card = WarehouseOperatorCardOut(
            user_id=uid,
            user_name=user_name,
            initials=_initials(user_name),
            main_mode=last["main_mode"],
            submode=last["submode"],
            last_activity_at=_iso(last["at"]) or "",
            last_activity_label=_time_label(last["at"]),
            minutes_since_activity=minutes,
            status_color=color,
            activity_status_label=status_label,
            device_name=str(last["metadata"].get("device_name") or "").strip() or None,
            cart_code=str(last["metadata"].get("cart_code") or "").strip() or None,
            assigned_order=assigned_orders[0] if assigned_orders else last.get("document"),
            assigned_orders=assigned_orders or ([str(last.get("document"))] if last.get("document") else []),
            document=last.get("document") or str(last["metadata"].get("document") or "").strip() or None,
            carrier=last.get("carrier") or str(last["metadata"].get("carrier") or "").strip() or None,
            current_location=_last_known_location(rows),
            progress_percent=progress if last["main_mode"] != MODE_PACKING else None,
            progress_tone=progress_tone,
            products_completed=products_completed,
            products_total=products_total,
            orders_completed=orders_completed,
            orders_total=orders_total,
            active_reference_type=active_reference_type,
            active_reference_id=active_reference_id,
            active_reference_label=active_reference_label,
            orders_picked=orders_completed if orders_completed else len(set(order_ids)),
            products_picked=int(round(products_completed)) if products_completed else picked_products,
            first_activity_at=_iso(first["at"]),
            idle=idle,
            packing_progress_percent=progress if last["main_mode"] == MODE_PACKING else None,
            last_packed_order=last_packed_order,
            packed_orders_per_hour=packed_per_hour,
            operation_count=sum(1 for r in rows if r["main_mode"] == MODE_OPERATIONS),
            timeline=[_timeline_out(r) for r in reversed(rows[-30:])],
            order_progress=order_progress,
        )
        if last["main_mode"] == MODE_PACKING and card.packing_progress_percent is None:
            card.packing_progress_percent = min(100, packed_items * 10) if packed_items else None
            if card.packing_progress_percent is not None:
                card.progress_tone = "green" if card.packing_progress_percent >= 100 else "blue"
        cards.append(card)
    return sorted(cards, key=lambda c: c.minutes_since_activity)


def _queue_counts(db: Session, *, tenant_id: int, warehouse_id: int) -> tuple[list[WarehouseOperationsQueueOut], dict[str, int]]:
    dash = build_wms_dashboard_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    open_issue_tasks = int(
        db.query(func.count(OrderIssueTask.id))
        .filter(
            OrderIssueTask.tenant_id == tenant_id,
            OrderIssueTask.warehouse_id == warehouse_id,
            OrderIssueTask.status == "OPEN",
        )
        .scalar()
        or 0
    )
    active_shortage_tasks = int(
        db.query(func.count(WmsOperationalTask.id))
        .filter(
            WmsOperationalTask.tenant_id == tenant_id,
            WmsOperationalTask.warehouse_id == warehouse_id,
            WmsOperationalTask.status.in_(ACTIVE_STATUSES),
            WmsOperationalTask.task_type.in_(["SHORTAGE_DECISION", "SHORTAGE_RECOLLECT", "WAITING_SUPPLY"]),
        )
        .scalar()
        or 0
    )
    active_relocation_tasks = int(
        db.query(func.count(WmsOperationalTask.id))
        .filter(
            WmsOperationalTask.tenant_id == tenant_id,
            WmsOperationalTask.warehouse_id == warehouse_id,
            WmsOperationalTask.status.in_(ACTIVE_STATUSES),
            WmsOperationalTask.task_type == "RELOCATION",
        )
        .scalar()
        or 0
    )
    receiving_docs = int(
        db.query(func.count(StockDocument.id))
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.warehouse_id == warehouse_id,
            StockDocument.document_type == "PZ",
            StockDocument.receiving_status.in_(["NEW", "IN_PROGRESS"]),
        )
        .scalar()
        or 0
    )
    z_pz_putaway_docs = int(
        db.query(func.count(StockDocument.id))
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.warehouse_id == warehouse_id,
            StockDocument.document_type == "Z_PZ",
            StockDocument.putaway_status.in_(["NOT_STARTED", "IN_PROGRESS"]),
        )
        .scalar()
        or 0
    )
    putaway_docs = int(
        db.query(func.count(StockDocument.id))
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.warehouse_id == warehouse_id,
            StockDocument.document_type.in_(["PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT"]),
            StockDocument.putaway_status.in_(["NOT_STARTED", "IN_PROGRESS"]),
        )
        .scalar()
        or 0
    )
    queues = [
        WarehouseOperationsQueueOut(
            key="picking",
            label="Kompletacja",
            value=int(dash.orders_to_collect),
            detail=f"{int(dash.picking_to_collect)} szt. do zebrania",
            tone="blue",
        ),
        WarehouseOperationsQueueOut(
            key="packing",
            label="Pakowanie",
            value=int(dash.packing_do_spakowania + dash.packing_w_trakcie),
            detail=f"{dash.packing_to_pack} szt. do spakowania",
            tone="green",
        ),
        WarehouseOperationsQueueOut(
            key="operations",
            label="Operacje magazynowe",
            value=receiving_docs + putaway_docs + active_relocation_tasks,
            detail=f"PZ: {receiving_docs}, Z-PZ: {z_pz_putaway_docs}, rozlokowanie: {putaway_docs}, relokacje: {active_relocation_tasks}",
            tone="neutral",
        ),
        WarehouseOperationsQueueOut(
            key="shortages",
            label="Braki",
            value=open_issue_tasks + active_shortage_tasks + int(dash.packing_braki),
            detail=f"zadania: {open_issue_tasks + active_shortage_tasks}, pakowanie: {dash.packing_braki}",
            tone="red" if (open_issue_tasks + active_shortage_tasks + int(dash.packing_braki)) else "amber",
        ),
    ]
    return queues, {
        "open_issue_tasks": open_issue_tasks,
        "active_shortage_tasks": active_shortage_tasks,
        "active_relocation_tasks": active_relocation_tasks,
        "receiving_docs": receiving_docs,
        "z_pz_putaway_docs": z_pz_putaway_docs,
        "putaway_docs": putaway_docs,
        "packing_braki": int(dash.packing_braki),
        "orders_delayed": int(getattr(dash, "orders_delayed", 0) or 0),
    }


def _alerts(
    *,
    operators: list[WarehouseOperatorCardOut],
    queue_meta: dict[str, int],
    now: datetime,
    long_break_minutes: int,
) -> list[WarehouseOperationsAlertOut]:
    alerts: list[WarehouseOperationsAlertOut] = []
    for op in operators:
        if op.minutes_since_activity > long_break_minutes:
            alerts.append(
                WarehouseOperationsAlertOut(
                    id=f"idle-{op.user_id}",
                    level="critical" if op.minutes_since_activity >= 30 else "warning",
                    message=f"{op.user_name} — brak aktywności {_duration_label(op.minutes_since_activity)}",
                    created_at=op.last_activity_at,
                    minutes_ago=op.minutes_since_activity,
                )
            )
    shortage_count = queue_meta.get("open_issue_tasks", 0) + queue_meta.get("active_shortage_tasks", 0)
    if shortage_count > 0:
        alerts.append(
            WarehouseOperationsAlertOut(
                id="shortages",
                level="warning",
                message=f"{shortage_count} zadań oczekuje w kolejce braków / dogrywki",
                created_at=_iso(now) or "",
                minutes_ago=0,
            )
        )
    if queue_meta.get("packing_braki", 0) > 0:
        alerts.append(
            WarehouseOperationsAlertOut(
                id="packing-shortages",
                level="warning",
                message=f"{queue_meta['packing_braki']} zamówień ma braki na etapie pakowania",
                created_at=_iso(now) or "",
                minutes_ago=0,
            )
        )
    if queue_meta.get("receiving_docs", 0) >= 10:
        alerts.append(
            WarehouseOperationsAlertOut(
                id="receiving-buffer",
                level="warning",
                message=f"Bufor przyjęć: {queue_meta['receiving_docs']} dokumentów w toku",
                created_at=_iso(now) or "",
                minutes_ago=0,
            )
        )
    if queue_meta.get("orders_delayed", 0) > 0:
        alerts.append(
            WarehouseOperationsAlertOut(
                id="orders-delayed",
                level="warning",
                message=f"{queue_meta['orders_delayed']} zamówień operacyjnie opóźnionych",
                created_at=_iso(now) or "",
                minutes_ago=0,
            )
        )
    seen_carts: set[str] = set()
    for op in operators:
        if op.cart_code and op.minutes_since_activity > long_break_minutes and op.cart_code not in seen_carts:
            seen_carts.add(op.cart_code)
            alerts.append(
                WarehouseOperationsAlertOut(
                    id=f"cart-{op.cart_code}",
                    level="warning",
                    message=f"{op.cart_code} nie ruszał się {_duration_label(op.minutes_since_activity)}",
                    created_at=op.last_activity_at,
                    minutes_ago=op.minutes_since_activity,
                )
            )
    return sorted(alerts, key=lambda a: (a.minutes_ago == 0, a.minutes_ago), reverse=True)[:20]


def _range_start(date_from: datetime | None) -> datetime:
    if date_from is not None:
        return date_from
    return datetime.combine(datetime.utcnow().date(), time.min)


def _average_gap_minutes(events: list[dict[str, Any]], start_event: str, end_event: str) -> int | None:
    starts: dict[tuple[int, int | None], datetime] = {}
    durations: list[int] = []
    for ev in sorted(events, key=lambda e: e["at"]):
        key = (int(ev["user_id"]), int(ev["order_id"]) if ev.get("order_id") else None)
        et = str(ev.get("event_type") or "").upper()
        if et == start_event and key not in starts:
            starts[key] = ev["at"]
        elif et == end_event and key in starts:
            durations.append(_minutes_between(starts.pop(key), ev["at"]))
    if not durations:
        return None
    return int(round(sum(durations) / len(durations)))


def build_warehouse_operations_snapshot(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    short_break_minutes: int = 5,
    long_break_minutes: int = 10,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> WarehouseOperationsSnapshotOut:
    now = datetime.utcnow()
    start = _range_start(date_from)
    end = date_to or now
    short_break_minutes = max(1, int(short_break_minutes or 5))
    long_break_minutes = max(short_break_minutes + 1, int(long_break_minutes or 10))
    tid = int(tenant_id)
    wid = int(warehouse_id)

    def _events() -> list[dict[str, Any]]:
        collected: list[dict[str, Any]] = []
        collectors: list[tuple[str, Callable[[], list[dict[str, Any]]]]] = [
            (
                "events.wms_order",
                lambda: _collect_wms_order_events(
                    db, tenant_id=tid, warehouse_id=wid, start=start, end=end
                ),
            ),
            (
                "events.packing_session",
                lambda: _collect_packing_session_events(
                    db, tenant_id=tid, warehouse_id=wid, start=start, end=end
                ),
            ),
            (
                "events.operation_session",
                lambda: _collect_operation_session_events(
                    db, tenant_id=tid, warehouse_id=wid, start=start, end=end
                ),
            ),
            (
                "events.pick",
                lambda: _collect_pick_events(db, tenant_id=tid, warehouse_id=wid, start=start, end=end),
            ),
            (
                "events.workforce",
                lambda: _collect_workforce_events(
                    db, tenant_id=tid, warehouse_id=wid, start=start, end=end
                ),
            ),
            (
                "events.receiving_scan",
                lambda: _collect_receiving_scan_events(
                    db, tenant_id=tid, warehouse_id=wid, start=start, end=end
                ),
            ),
            (
                "events.product_operation",
                lambda: _collect_product_operation_events(
                    db, tenant_id=tid, warehouse_id=wid, start=start, end=end
                ),
            ),
            (
                "events.inventory_movement",
                lambda: _collect_inventory_movement_events(
                    db, tenant_id=tid, warehouse_id=wid, start=start, end=end
                ),
            ),
        ]
        for section_name, collector in collectors:
            collected.extend(
                _snapshot_section(
                    section_name,
                    tenant_id=tid,
                    warehouse_id=wid,
                    default=[],
                    fn=collector,
                )
            )
        return sorted(collected, key=lambda e: e["at"])

    events = _snapshot_section(
        "events",
        tenant_id=tid,
        warehouse_id=wid,
        default=[],
        fn=_events,
    )

    operators = _snapshot_section(
        "operators",
        tenant_id=tid,
        warehouse_id=wid,
        default=[],
        fn=lambda: _build_operator_cards(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            events=events,
            now=now,
            range_start=start,
            short_break_minutes=short_break_minutes,
            long_break_minutes=long_break_minutes,
        ),
    )
    live = [op for op in operators if op.minutes_since_activity <= long_break_minutes]
    active_by_mode = {MODE_PICKING: 0, MODE_PACKING: 0, MODE_OPERATIONS: 0, MODE_SHORTAGES: 0}
    for op in live:
        active_by_mode[_safe_main_mode(op.main_mode)] = active_by_mode.get(_safe_main_mode(op.main_mode), 0) + 1

    queues, queue_meta = _snapshot_section(
        "queues",
        tenant_id=tid,
        warehouse_id=wid,
        default=([], {}),
        fn=lambda: _queue_counts(db, tenant_id=tid, warehouse_id=wid),
    )
    replenishments = _snapshot_section(
        "replenishments",
        tenant_id=tid,
        warehouse_id=wid,
        default=[],
        fn=lambda: build_replenishment_alerts(db, tenant_id=tid, warehouse_id=wid, now=now),
    )
    inbound_summary, inbound_deliveries = _snapshot_section(
        "inbound",
        tenant_id=tid,
        warehouse_id=wid,
        default=(WarehouseInboundSummaryOut(), []),
        fn=lambda: build_inbound_overview(db, tenant_id=tid, warehouse_id=wid, now=now),
    )
    putaway_load = _snapshot_section(
        "putaway",
        tenant_id=tid,
        warehouse_id=wid,
        default=WarehousePutawayLoadOut(),
        fn=lambda: build_putaway_load(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            active_putaway_operators=sum(
                1
                for op in live
                if _safe_main_mode(op.main_mode) == MODE_OPERATIONS
                and "rozlok" in str(op.submode or "").lower()
            ),
            now=now,
        ),
    )
    carrier_issues = _snapshot_section(
        "carrier_issues",
        tenant_id=tid,
        warehouse_id=wid,
        default=[],
        fn=lambda: build_carrier_issues(db, tenant_id=tid, warehouse_id=wid, now=now),
    )
    employee_rankings = _snapshot_section(
        "employee_rankings",
        tenant_id=tid,
        warehouse_id=wid,
        default=[],
        fn=lambda: build_employee_rankings(operators),
    )
    bottlenecks = _snapshot_section(
        "bottlenecks",
        tenant_id=tid,
        warehouse_id=wid,
        default=[],
        fn=lambda: build_bottlenecks(
            queues=queues,
            inbound=inbound_summary,
            putaway=putaway_load,
            operators=live,
            now=now,
        ),
    )
    base_alerts = _snapshot_section(
        "base_alerts",
        tenant_id=tid,
        warehouse_id=wid,
        default=[],
        fn=lambda: _alerts(
            operators=operators,
            queue_meta=queue_meta,
            now=now,
            long_break_minutes=long_break_minutes,
        ),
    )
    alerts = _snapshot_section(
        "alerts",
        tenant_id=tid,
        warehouse_id=wid,
        default=base_alerts,
        fn=lambda: extend_alerts(
            base_alerts=base_alerts,
            bottlenecks=bottlenecks,
            replenishments=replenishments,
            inbound=inbound_summary,
            putaway=putaway_load,
            carrier_issues=carrier_issues,
            queues=queues,
            operators=operators,
            now=now,
        ),
    )
    completed_today = sum(
        1
        for ev in events
        if ev["at"].date() == now.date()
        and str(ev.get("event_type") or "").upper()
        in {EVT_PICKING_FINISHED, EVT_PACKING_FINISHED, EVT_PACKING_AUTOMATION_FINISHED}
    )
    avg_pick_minutes = _average_gap_minutes(events, EVT_PICKING_STARTED, EVT_PICKING_FINISHED)
    avg_pack_minutes = _average_gap_minutes(events, EVT_PACKING_STARTED, EVT_PACKING_FINISHED)
    blocked_orders = sum(r.blocked_orders for r in replenishments)
    delayed_operations = len([b for b in bottlenecks if b.level in {"warning", "critical"}]) + inbound_summary.delayed_deliveries
    sla_risk = max([b.sla_risk_percent for b in bottlenecks], default=0)
    top_scores = [r.efficiency_score for r in employee_rankings[:10]]
    efficiency = int(round(sum(top_scores) / len(top_scores))) if top_scores else (100 if live else 0)
    summary = WarehouseOperationsSummaryOut(
        active_operators=len(live),
        picking=active_by_mode.get(MODE_PICKING, 0),
        packing=active_by_mode.get(MODE_PACKING, 0),
        warehouse_operations=active_by_mode.get(MODE_OPERATIONS, 0),
        shortages=active_by_mode.get(MODE_SHORTAGES, 0) + int((queues[-1].value or 0) if queues else 0),
        idle_operators=sum(1 for op in operators if op.minutes_since_activity > short_break_minutes),
        orders_completed_today=completed_today,
        warehouse_efficiency_percent=efficiency,
        average_picking_minutes=avg_pick_minutes,
        average_packing_minutes=avg_pack_minutes,
        products_waiting_putaway=putaway_load.products_waiting,
        inbound_deliveries_waiting=inbound_summary.active_deliveries,
        delayed_operations=delayed_operations,
        blocked_orders=blocked_orders,
        sla_risk_percent=sla_risk,
        generated_at=_iso(now) or "",
    )
    activity_stream: list[WarehouseOperatorTimelineEventOut] = []
    for ev in reversed(events[-50:]):
        try:
            activity_stream.append(_timeline_out(ev))
        except Exception:
            logger.exception(
                "[warehouse.snapshot] section=activity_stream.item failed tenant=%s warehouse=%s",
                tid,
                wid,
            )
    return WarehouseOperationsSnapshotOut(
        config=WarehouseOperationsConfigOut(
            short_break_minutes=short_break_minutes,
            long_break_minutes=long_break_minutes,
        ),
        summary=summary,
        operators=operators,
        picking_operators=[
            op
            for op in operators
            if _safe_main_mode(op.main_mode) == MODE_PICKING and op.minutes_since_activity <= long_break_minutes
        ],
        packing_operators=[
            op
            for op in operators
            if _safe_main_mode(op.main_mode) == MODE_PACKING and op.minutes_since_activity <= long_break_minutes
        ],
        warehouse_operation_operators=[
            op
            for op in operators
            if _safe_main_mode(op.main_mode) == MODE_OPERATIONS and op.minutes_since_activity <= long_break_minutes
        ],
        shortage_operators=[
            op
            for op in operators
            if _safe_main_mode(op.main_mode) == MODE_SHORTAGES and op.minutes_since_activity <= long_break_minutes
        ],
        queues=queues,
        alerts=alerts,
        activity_stream=activity_stream,
        replenishments=replenishments,
        inbound_summary=inbound_summary,
        inbound_deliveries=inbound_deliveries,
        putaway_load=putaway_load,
        carrier_issues=carrier_issues,
        employee_rankings=employee_rankings,
        bottlenecks=bottlenecks,
    )


def warehouse_operations_export_rows(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    short_break_minutes: int,
    long_break_minutes: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    operator_id: int | None = None,
    mode: str | None = None,
    zone: str | None = None,
) -> list[dict[str, Any]]:
    snapshot = build_warehouse_operations_snapshot(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        short_break_minutes=short_break_minutes,
        long_break_minutes=long_break_minutes,
        date_from=date_from,
        date_to=date_to,
    )
    selected_mode = (mode or "").strip().upper()
    selected_zone = (zone or "").strip().lower()
    rows: list[dict[str, Any]] = []
    for op in snapshot.operators:
        if operator_id is not None and op.user_id != int(operator_id):
            continue
        if selected_mode and op.main_mode != selected_mode:
            continue
        if selected_zone and selected_zone not in str(op.current_location or "").lower():
            continue
        rows.append(
            {
                "operator": op.user_name,
                "user_id": op.user_id,
                "main_mode": op.main_mode,
                "submode": op.submode,
                "last_activity_at": op.last_activity_at,
                "status": op.activity_status_label,
                "status_color": op.status_color,
                "idle_total": op.idle.total_idle_label,
                "idle_total_minutes": op.idle.total_idle_minutes,
                "short_idle_periods": op.idle.short_idle_periods,
                "long_idle_periods": op.idle.long_idle_periods,
                "cart": op.cart_code or "",
                "document": op.document or "",
                "carrier": op.carrier or "",
                "location": op.current_location or "",
                "progress_percent": op.progress_percent if op.progress_percent is not None else op.packing_progress_percent,
                "orders_picked": op.orders_picked,
                "products_picked": op.products_picked,
                "packed_orders_per_hour": op.packed_orders_per_hour,
                "operation_count": op.operation_count,
            }
        )
    return rows
