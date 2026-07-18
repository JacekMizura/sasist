"""Structured WMS audit trail — canonical ``wms_order_events`` + OMS timeline presentation."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.app_user import AppUser, UserWmsProfile
from ..models.cart import Cart
from ..models.carton import Carton
from ..models.location import Location
from ..models.order import Order
from ..models.order_activity_log import OrderActivityLog
from ..models.order_ui_status import OrderUiStatus
from ..models.product import Product
from ..models.wms_operation_session import WmsOperationSession
from ..models.wms_packing_session import WmsPackingSession
from ..models.wms_order_event import (
    EVT_CARTON_CHANGED,
    EVT_CARTON_SELECTED,
    EVT_LABEL_GENERATED,
    EVT_LABEL_REPRINTED,
    EVT_LOCATION_EMPTIED,
    EVT_PACKED_ITEM,
    EVT_PACKAGE_WEIGHT_CONFIRMED,
    EVT_PACKING_FINISHED,
    EVT_PACKING_AUTOMATION_FINISHED,
    EVT_PACKING_PAUSED,
    EVT_PACKING_RESUMED,
    EVT_PACKING_STARTED,
    EVT_PICKED_ITEM,
    EVT_PICK_UNDONE,
    EVT_PICKING_FINISHED,
    EVT_PICKING_STARTED,
    EVT_SHORTAGE_REPORTED,
    EVT_ORDER_LINE_SHORTAGE_REPORTED,
    EVT_REPLACEMENT_SHORTAGE_REPORTED,
    EVT_RECOVERY_SHORTAGE_REPORTED,
    EVT_ORDER_LINE_REMOVED,
    EVT_ORDER_ITEM_REMOVED,
    EVT_REPLACEMENT_ITEM_REMOVED,
    EVT_ORDER_LINE_REPLACED,
    EVT_OMS_DECISION_WAIT,
    EVT_OMS_DECISION_ACCEPTED,
    EVT_RECOVERY_STARTED,
    EVT_RECOVERY_FINISHED,
    WmsOrderEvent,
)
from ..schemas.wms_packing import WmsOperationTimesOut, WmsOrderTimelineEvent
from .cart_display import cart_display_name_for_wms
from .picking_assignment_service import format_cart_basket_label

logger = logging.getLogger(__name__)


def _json_meta(ev: WmsOrderEvent) -> dict[str, Any]:
    raw = getattr(ev, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        return dict(json.loads(raw))
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}


def _fmt_qty(q: float) -> str:
    if abs(q - round(q)) < 1e-6:
        return str(int(round(q)))
    return f"{q:g}"


def _fmt_pl_dt(at: Optional[datetime]) -> str:
    if at is None:
        return ""
    try:
        return at.strftime("%d.%m.%Y %H:%M")
    except Exception:
        return ""


def _format_duration_pl(seconds: int) -> str:
    if seconds < 0:
        seconds = 0
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    parts: list[str] = []
    if h > 0:
        parts.append(f"{h} h")
    if m > 0 or h > 0:
        parts.append(f"{m} min")
    parts.append(f"{s}s")
    return " ".join(parts)


def _naive_utc_dt(value: datetime | None) -> datetime | None:
    """Normalize DB timestamps for safe naive UTC arithmetic (PG timestamptz vs utcnow)."""
    if value is None:
        return None
    if getattr(value, "tzinfo", None) is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def location_display_label(db: Session, location_id: int) -> str:
    loc = (
        db.query(Location)
        .execution_options(include_inactive=True)
        .filter(Location.id == int(location_id))
        .first()
    )
    if loc is None:
        return f"#{location_id}"
    nm = (getattr(loc, "name", None) or "").strip()
    if nm:
        return nm
    rack = (getattr(loc, "rack_name", None) or "").strip()
    lv = getattr(loc, "level", None)
    pos = getattr(loc, "position", None)
    bn = (getattr(loc, "bin", None) or "").strip()
    bits = [rack] if rack else []
    if lv is not None:
        bits.append(str(int(lv)))
    if pos is not None:
        bits.append(str(int(pos)))
    if bn:
        bits.append(bn)
    return "-".join(bits) if bits else f"#{location_id}"


def operator_display_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    if user_id is None or int(user_id) <= 0:
        return None
    u = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    if u is None:
        return None
    fn = (getattr(u, "first_name", None) or "").strip()
    ln = (getattr(u, "last_name", None) or "").strip()
    full = f"{fn} {ln}".strip()
    if full:
        return full
    return (getattr(u, "login", None) or "").strip() or f"Użytkownik #{u.id}"


def workstation_id_for_operator(db: Session, operator_user_id: Optional[int]) -> Optional[int]:
    if operator_user_id is None or int(operator_user_id) <= 0:
        return None
    pr = (
        db.query(UserWmsProfile)
        .filter(UserWmsProfile.user_id == int(operator_user_id))
        .first()
    )
    if pr is None:
        return None
    wid = getattr(pr, "packing_station_id", None)
    return int(wid) if wid is not None and int(wid) > 0 else None


def carton_dimensions_label(row: Carton) -> str:
    try:
        return f"{float(row.length_cm):g}×{float(row.width_cm):g}×{float(row.height_cm):g} cm"
    except (TypeError, ValueError):
        return (row.name or "").strip() or str(row.id)


def carton_label_by_id(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    carton_id: str,
) -> tuple[Optional[str], Optional[str]]:
    """Returns (dimensions_label, display_name)."""
    cid = (carton_id or "").strip()
    if not cid:
        return None, None
    row = (
        db.query(Carton)
        .filter(
            Carton.id == cid,
            Carton.tenant_id == int(tenant_id),
            Carton.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row is None:
        return None, None
    return carton_dimensions_label(row), (row.name or "").strip() or None


def carton_audit_snapshot(db: Session, order: Order) -> dict[str, Any]:
    raw = getattr(order, "selected_carton_id", None)
    cid = str(raw).strip() if raw else ""
    if not cid:
        return {}
    dim, name = carton_label_by_id(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        carton_id=cid,
    )
    out: dict[str, Any] = {"selected_carton_id": cid}
    if dim:
        out["carton_label"] = dim
    if name:
        out["carton_name"] = name
    return out


def get_open_wms_packing_session(db: Session, order_id: int) -> Optional[WmsPackingSession]:
    return (
        db.query(WmsPackingSession)
        .filter(
            WmsPackingSession.order_id == int(order_id),
            WmsPackingSession.completed_at.is_(None),
        )
        .order_by(WmsPackingSession.id.desc())
        .first()
    )


def _meta_load(raw: Optional[str]) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _meta_dump(meta: dict[str, Any]) -> str:
    return json.dumps(meta, ensure_ascii=False, default=str)


def _merge_session_metadata(raw: Optional[str], extra: Optional[dict[str, Any]]) -> str:
    meta = _meta_load(raw)
    if extra:
        for key, value in extra.items():
            if value is not None:
                meta[str(key)] = value
    return _meta_dump(meta)


def ensure_wms_packing_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    operator_user_id: Optional[int],
    queue_meta: Optional[dict[str, Any]] = None,
) -> WmsPackingSession:
    existing = get_open_wms_packing_session(db, int(order.id))
    if existing is not None:
        uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
        if uid is not None and getattr(existing, "operator_user_id", None) is None:
            existing.operator_user_id = uid
        existing.last_activity_at = datetime.utcnow()
        existing.metadata_json = _merge_session_metadata(existing.metadata_json, queue_meta)
        db.add(existing)
        return existing
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    ws = workstation_id_for_operator(db, uid)
    meta = dict(queue_meta or {})
    meta.setdefault("source", "wms_packing")
    now = datetime.utcnow()
    sess = WmsPackingSession(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order.id),
        operator_user_id=uid,
        workstation_id=ws,
        started_at=now,
        last_activity_at=now,
        completed_at=None,
        duration_seconds=None,
        metadata_json=json.dumps(meta, ensure_ascii=False),
    )
    db.add(sess)
    db.flush()
    return sess


def touch_wms_packing_session_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    operator_user_id: Optional[int],
    metadata: Optional[dict[str, Any]] = None,
) -> WmsPackingSession:
    sess = ensure_wms_packing_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order=order,
        operator_user_id=operator_user_id,
        queue_meta=metadata,
    )
    now = datetime.utcnow()
    sess.last_activity_at = now
    if getattr(order, "packing_started_at", None) is None:
        order.packing_started_at = getattr(sess, "started_at", None) or now
    sess.metadata_json = _merge_session_metadata(
        getattr(sess, "metadata_json", None),
        {"source": "wms_packing", **(metadata or {})},
    )
    db.add(order)
    db.add(sess)
    return sess


class WmsOperationSessionNotFound(Exception):
    """Brak otwartej sesji — touch NIGDY nie tworzy (409 SessionNotFound)."""

    code = "SessionNotFound"

    def __init__(self, message: str = "Brak aktywnej sesji operacyjnej."):
        super().__init__(message)
        self.message = message


def find_open_wms_operation_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    session_kind: str,
    operator_user_id: Optional[int],
    cart_id: Optional[int] = None,
    order_id: Optional[int] = None,
) -> Optional[WmsOperationSession]:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    if uid is None:
        return None
    kind = str(session_kind or "operation_active").strip()[:32] or "operation_active"
    q = db.query(WmsOperationSession).filter(
        WmsOperationSession.tenant_id == int(tenant_id),
        WmsOperationSession.warehouse_id == int(warehouse_id),
        WmsOperationSession.session_kind == kind,
        WmsOperationSession.operator_user_id == uid,
        WmsOperationSession.completed_at.is_(None),
    )
    if cart_id is None:
        q = q.filter(WmsOperationSession.cart_id.is_(None))
    else:
        q = q.filter(WmsOperationSession.cart_id == int(cart_id))
    if order_id is None:
        q = q.filter(WmsOperationSession.order_id.is_(None))
    else:
        q = q.filter(WmsOperationSession.order_id == int(order_id))
    return q.order_by(WmsOperationSession.id.desc()).first()


def ensure_wms_operation_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    session_kind: str,
    operator_user_id: Optional[int],
    cart_id: Optional[int] = None,
    order_id: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> Optional[WmsOperationSession]:
    """
    Utwórz sesję operacyjną jeśli brak (putaway / MM / tasks).
    NIE używać dla picking_active — to robi wyłącznie CartLifecycleService.start_picking.
    """
    kind = str(session_kind or "operation_active").strip()[:32] or "operation_active"
    if kind in ("picking_active", "picking_recovery_active"):
        raise ValueError(
            "Sesji picking nie wolno tworzyć przez ensure_wms_operation_session — "
            "użyj CartLifecycleService.start_picking."
        )
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    if uid is None:
        return None
    sess = find_open_wms_operation_session(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        session_kind=kind,
        operator_user_id=uid,
        cart_id=cart_id,
        order_id=order_id,
    )
    now = datetime.utcnow()
    if sess is None:
        sess = WmsOperationSession(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            cart_id=int(cart_id) if cart_id is not None else None,
            order_id=int(order_id) if order_id is not None else None,
            session_kind=kind,
            operator_user_id=uid,
            started_at=now,
            last_activity_at=now,
            completed_at=None,
            paused_duration_seconds=0,
            active_duration_seconds=None,
            metadata_json=_meta_dump(metadata or {}),
        )
    else:
        sess.last_activity_at = now
        sess.metadata_json = _merge_session_metadata(sess.metadata_json, metadata)
    db.add(sess)
    return sess


def touch_wms_operation_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    session_kind: str,
    operator_user_id: Optional[int],
    cart_id: Optional[int] = None,
    order_id: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
    bind_cart: bool = True,
) -> Optional[WmsOperationSession]:
    """
    Wyłącznie UPDATE last_activity_at. NIGDY nie tworzy sesji.
    Brak sesji → WmsOperationSessionNotFound (API: 409 SessionNotFound).

    ``bind_cart`` zignorowane (lifecycle wózka tylko w CartLifecycleService).
    """
    del bind_cart  # legacy kwarg — no-op
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    if uid is None:
        return None
    sess = find_open_wms_operation_session(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        session_kind=session_kind,
        operator_user_id=uid,
        cart_id=cart_id,
        order_id=order_id,
    )
    if sess is None:
        raise WmsOperationSessionNotFound(
            f"Brak aktywnej sesji ({session_kind}) — najpierw start operacji."
        )
    now = datetime.utcnow()
    sess.last_activity_at = now
    if metadata:
        sess.metadata_json = _merge_session_metadata(sess.metadata_json, metadata)
    db.add(sess)
    return sess


def complete_wms_operation_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    session_kind: str,
    operator_user_id: Optional[int],
    cart_id: Optional[int] = None,
    order_id: Optional[int] = None,
    completed_reason: str = "finished",
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    sess = find_open_wms_operation_session(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        session_kind=session_kind,
        operator_user_id=operator_user_id,
        cart_id=cart_id,
        order_id=order_id,
    )
    if sess is None:
        return
    if metadata:
        sess.metadata_json = _merge_session_metadata(sess.metadata_json, metadata)
    done = datetime.utcnow()
    sess.last_activity_at = done
    sess.completed_at = done
    sess.completed_reason = str(completed_reason or "finished")[:32]
    started = _naive_utc_dt(getattr(sess, "started_at", None))
    if started is not None:
        done_naive = _naive_utc_dt(done) or done
        sess.active_duration_seconds = max(0, int((done_naive - started).total_seconds()))
    db.add(sess)


def complete_wms_packing_session_for_order(
    db: Session,
    order: Order,
    *,
    completed_at: Optional[datetime] = None,
    automation_finished_at: Optional[datetime] = None,
) -> None:
    sess = get_open_wms_packing_session(db, int(order.id))
    if sess is None:
        return
    done = completed_at or automation_finished_at or datetime.utcnow()
    af = automation_finished_at or completed_at or done
    sess.automation_finished_at = af
    sess.completed_at = done
    sess.last_activity_at = done
    sess.completed_reason = "finished"
    pack_start = getattr(order, "packing_started_at", None) or getattr(sess, "started_at", None)
    end_for_duration = af if af is not None else done
    if pack_start is not None and end_for_duration is not None and end_for_duration >= pack_start:
        sess.duration_seconds = int((end_for_duration - pack_start).total_seconds())
    elif getattr(sess, "started_at", None) is not None and end_for_duration >= sess.started_at:
        sess.duration_seconds = int((end_for_duration - sess.started_at).total_seconds())
    db.add(sess)


def insert_wms_order_event(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: Optional[int],
    event_type: str,
    product_id: Optional[int] = None,
    order_item_id: Optional[int] = None,
    source_location_id: Optional[int] = None,
    target_cart_id: Optional[int] = None,
    quantity: Optional[float] = None,
    metadata: Optional[dict[str, Any]] = None,
    created_at: Optional[datetime] = None,
) -> WmsOrderEvent:
    row = WmsOrderEvent(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        operator_user_id=int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None,
        event_type=str(event_type),
        product_id=int(product_id) if product_id is not None else None,
        order_item_id=int(order_item_id) if order_item_id is not None else None,
        source_location_id=int(source_location_id) if source_location_id is not None else None,
        target_cart_id=int(target_cart_id) if target_cart_id is not None else None,
        quantity=float(quantity) if quantity is not None else None,
        metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
        created_at=created_at or datetime.utcnow(),
    )
    db.add(row)
    return row


def append_order_activity_for_wms(
    db: Session,
    *,
    order_id: int,
    tenant_id: int,
    warehouse_id: int,
    event_type: str,
    message: str,
    operator_user_id: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """OMS text log + dual-write into shared Activity Log (ready PL description)."""
    db.add(
        OrderActivityLog(
            order_id=int(order_id),
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            event_type=str(event_type)[:64],
            message=str(message)[:8000],
            created_at=datetime.utcnow(),
        )
    )
    try:
        from .activity_log import ActivityLinkSpec, record_activity

        uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
        record_activity(
            db,
            event_code=str(event_type)[:64],
            description=str(message).strip()[:512] or "Zdarzenie zamówienia.",
            links=[
                ActivityLinkSpec(
                    object_type="order",
                    object_id=int(order_id),
                    role="primary",
                    object_label=f"#{int(order_id)}",
                )
            ],
            severity="INFO",
            category="status",
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            actor_user_id=uid,
            source_module="wms_audit",
            metadata=dict(metadata or {}),
        )
    except Exception:
        logger.exception(
            "activity_log dual-write failed for order_id=%s event=%s",
            order_id,
            event_type,
        )


def emit_wms_picking_started(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    cart: Cart,
    operator_user_id: Optional[int],
) -> None:
    cart_label = cart_display_name_for_wms(cart)
    meta: dict[str, Any] = {"target_cart": cart_label}
    bsk = getattr(order, "basket", None)
    if bsk is not None:
        try:
            meta["basket"] = format_cart_basket_label(bsk)
        except Exception:
            meta["basket"] = (getattr(bsk, "code", None) or getattr(bsk, "label", None) or "") or None
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    op_name = operator_display_name(db, uid)
    title = f"{op_name} rozpoczął zbieranie" if op_name else "Rozpoczęto zbieranie"
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order.id),
        operator_user_id=uid,
        event_type=EVT_PICKING_STARTED,
        target_cart_id=int(cart.id) if getattr(cart, "id", None) else None,
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PICKING_STARTED,
        message=title,
        operator_user_id=uid,
        metadata=meta,
    )


def emit_wms_picked_item(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    pick,
    cart: Cart,
    product_sku: Optional[str],
    product_id: int,
    location_id: int,
    operator_user_id: Optional[int],
) -> None:
    cart_label = cart_display_name_for_wms(cart)
    loc_label = location_display_label(db, int(location_id))
    bsk = getattr(order, "basket", None)
    basket_lbl: Optional[str] = None
    if bsk is not None:
        try:
            basket_lbl = format_cart_basket_label(bsk)
        except Exception:
            basket_lbl = (getattr(bsk, "code", None) or None) or None
    sku = (product_sku or "").strip() or f"#{product_id}"
    qty = float(getattr(pick, "quantity", 0) or 0)
    meta = {
        "sku": sku,
        "product_id": int(product_id),
        "quantity": qty,
        "source_location": loc_label,
        "target_cart": cart_label,
        "basket": basket_lbl,
    }
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order.id),
        operator_user_id=uid,
        event_type=EVT_PICKED_ITEM,
        product_id=int(product_id),
        order_item_id=int(getattr(pick, "order_item_id"))
        if getattr(pick, "order_item_id", None) is not None
        else None,
        source_location_id=int(location_id),
        target_cart_id=int(cart.id),
        quantity=qty,
        metadata=meta,
    )
    op_name = operator_display_name(db, uid)
    qtxt = _fmt_qty(qty)
    msg = f"Zebrano {qtxt}× {sku} — {loc_label} → {cart_label}"
    if basket_lbl:
        msg += f", koszyk {basket_lbl}"
    title = f"Zebrano {qtxt}× {sku}"
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PICKED_ITEM,
        message=f"{title}" + (f" — {op_name}" if op_name else ""),
    )


def emit_wms_pick_undone(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: Optional[int],
    product_id: int,
    location_id: Optional[int],
    cart_id: int,
    quantity: float,
    operator_user_id: Optional[int],
) -> None:
    product = db.query(Product).filter(Product.id == int(product_id)).first() if product_id else None
    ean = (getattr(product, "ean", None) or "").strip() if product is not None else ""
    sku = ean or (getattr(product, "sku", None) or "").strip() or f"#{product_id}"
    loc_label = location_display_label(db, int(location_id)) if location_id is not None else None
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    order_no = (getattr(order, "order_number", None) or "").strip() if order is not None else f"#{order_id}"
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    op_name = operator_display_name(db, uid)
    qtxt = _fmt_qty(float(quantity))
    meta = {
        "product_id": int(product_id),
        "ean": ean or None,
        "quantity": float(quantity),
        "location_id": int(location_id) if location_id is not None else None,
        "source_location": loc_label,
        "cart_id": int(cart_id),
        "order_item_id": int(order_item_id) if order_item_id is not None else None,
        "event_code": EVT_PICK_UNDONE,
    }
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_PICK_UNDONE,
        product_id=int(product_id),
        order_item_id=int(order_item_id) if order_item_id is not None else None,
        source_location_id=int(location_id) if location_id is not None else None,
        target_cart_id=int(cart_id),
        quantity=float(quantity),
        metadata=meta,
    )
    loc_part = f" z lokalizacji {loc_label}" if loc_label else ""
    msg = (
        f"Cofnięto pobranie {qtxt} szt. produktu EAN {sku}{loc_part} "
        f"dla zamówienia #{order_no}."
    )
    if op_name:
        msg = f"{msg} — {op_name}"
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PICK_UNDONE,
        message=msg,
        operator_user_id=uid,
        metadata=meta,
    )


def emit_wms_location_emptied(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: Optional[int],
    cart_id: int,
    product_id: int,
    product_ean: Optional[str],
    location_id: int,
    location_code: str,
    previous_qty: float,
    new_qty: float,
    operator_user_id: Optional[int],
    stock_document_id: Optional[int] = None,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    op_name = operator_display_name(db, uid)
    ean = (product_ean or "").strip() or f"#{product_id}"
    meta = {
        "product_id": int(product_id),
        "ean": product_ean,
        "location_id": int(location_id),
        "location_code": location_code,
        "previous_qty": float(previous_qty),
        "new_qty": float(new_qty),
        "cart_id": int(cart_id),
        "stock_document_id": int(stock_document_id) if stock_document_id is not None else None,
        "event_code": EVT_LOCATION_EMPTIED,
        "reason": "picking_confirm_empty_location",
    }
    oid = int(order_id) if order_id is not None and int(order_id) > 0 else None
    if oid is None:
        # Activity without order row — still dual-write via a cart-scoped order if possible
        from .cart_stats_service import list_orders_on_cart

        try:
            rows = list_orders_on_cart(db, int(cart_id))
            if rows:
                oid = int(rows[0].id)
        except Exception:
            oid = None
    msg = (
        f"Potwierdzono pustą lokalizację {location_code}. "
        f"Stan produktu EAN {ean} skorygowano z {_fmt_qty(float(previous_qty))} szt. "
        f"do {_fmt_qty(float(new_qty))} szt."
    )
    if op_name:
        msg = f"{msg} — {op_name}"
    if oid is not None:
        insert_wms_order_event(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            order_id=int(oid),
            operator_user_id=uid,
            event_type=EVT_LOCATION_EMPTIED,
            product_id=int(product_id),
            source_location_id=int(location_id),
            target_cart_id=int(cart_id),
            quantity=float(previous_qty),
            metadata=meta,
        )
        append_order_activity_for_wms(
            db,
            order_id=int(oid),
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            event_type=EVT_LOCATION_EMPTIED,
            message=msg,
            operator_user_id=uid,
            metadata=meta,
        )
    else:
        try:
            from .activity_log import ActivityLinkSpec, record_activity

            record_activity(
                db,
                event_code=EVT_LOCATION_EMPTIED,
                description=msg[:512],
                links=[
                    ActivityLinkSpec(
                        object_type="cart",
                        object_id=int(cart_id),
                        role="primary",
                        object_label=f"Wózek #{int(cart_id)}",
                    )
                ],
                severity="WARNING",
                category="inventory",
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                actor_user_id=uid,
                source_module="wms_picking",
                metadata=dict(meta),
            )
        except Exception:
            logger.exception("emit_wms_location_emptied activity_log failed")


def emit_wms_picking_finished(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    cart_id: int,
    operator_user_id: Optional[int],
    new_order_ui_status_id: Optional[int],
) -> None:
    ps = _naive_utc_dt(getattr(order, "picking_started_at", None))
    pf = _naive_utc_dt(getattr(order, "picking_finished_at", None) or getattr(order, "picked_at", None))
    dur_sec: Optional[int] = None
    if ps is not None and pf is not None and pf >= ps:
        dur_sec = int((pf - ps).total_seconds())
    meta: dict[str, Any] = {
        "cart_id": int(cart_id),
        "picking_seconds": dur_sec,
        "picking_duration_label": _format_duration_pl(dur_sec) if dur_sec is not None else None,
    }
    if new_order_ui_status_id is not None:
        meta["new_order_ui_status_id"] = int(new_order_ui_status_id)
        st = (
            db.query(OrderUiStatus)
            .filter(OrderUiStatus.id == int(new_order_ui_status_id))
            .first()
        )
        if st is not None and getattr(st, "name", None):
            meta["new_order_ui_status_name"] = str(st.name)
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order.id),
        operator_user_id=uid,
        event_type=EVT_PICKING_FINISHED,
        target_cart_id=int(cart_id),
        metadata=meta,
    )
    body_extra = _format_duration_pl(dur_sec) if dur_sec is not None else ""
    status_bit = ""
    if meta.get("new_order_ui_status_name"):
        status_bit = f" → {meta['new_order_ui_status_name']}"
    msg = f"Zakończono zbieranie{status_bit}"
    if body_extra:
        msg += f" (czas zbierania: {body_extra})"
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PICKING_FINISHED,
        message=msg,
    )


def emit_line_shortage_reported(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: int,
    product_id: int,
    product_name: str,
    location_id: Optional[int],
    cart_id: int,
    shortage_qty: float,
    operator_user_id: Optional[int],
    is_replacement: bool = False,
    is_recovery: bool = False,
    original_order_item_id: Optional[int] = None,
    original_product_name: Optional[str] = None,
    reason: str = "",
) -> None:
    """Audyt braku na konkretnej linii (zwykła / zamiennik / dogrywka)."""
    if is_recovery:
        event_type = EVT_RECOVERY_SHORTAGE_REPORTED
        title = "Brak na dogrywce (recovery)"
    elif is_replacement:
        event_type = EVT_REPLACEMENT_SHORTAGE_REPORTED
        title = "Brak na zamienniku"
    else:
        event_type = EVT_ORDER_LINE_SHORTAGE_REPORTED
        title = "Zgłoszono brak na linii"
    loc_label = location_display_label(db, int(location_id)) if location_id is not None else None
    cart_row = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    cart_label = cart_display_name_for_wms(cart_row) if cart_row is not None else f"#{cart_id}"
    meta: dict[str, Any] = {
        "product_id": int(product_id),
        "product_name": product_name[:512],
        "quantity": float(shortage_qty),
        "source_location": loc_label,
        "target_cart": cart_label,
        "cart_id": int(cart_id),
        "order_item_id": int(order_item_id),
        "reason": reason[:256] if reason else None,
    }
    if original_order_item_id is not None and int(original_order_item_id) > 0:
        meta["original_order_item_id"] = int(original_order_item_id)
    if original_product_name:
        meta["original_product_name"] = original_product_name[:512]
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=event_type,
        product_id=int(product_id),
        order_item_id=int(order_item_id),
        source_location_id=int(location_id) if location_id is not None else None,
        target_cart_id=int(cart_id),
        quantity=float(shortage_qty),
        metadata=meta,
    )
    msg_parts = [title, f"{product_name} ({_fmt_qty(float(shortage_qty))} szt.)"]
    if is_replacement and original_product_name:
        msg_parts.append(f"zamiast: {original_product_name}")
    if loc_label:
        msg_parts.append(f"lokalizacja: {loc_label}")
    if cart_label:
        msg_parts.append(cart_label)
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=event_type,
        message=" — ".join(msg_parts),
    )


def emit_wms_shortage_reported(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    location_id: Optional[int],
    cart_id: int,
    shortage_qty: float,
    operator_user_id: Optional[int],
) -> None:
    loc_label = location_display_label(db, int(location_id)) if location_id is not None else None
    cart_row = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    cart_label = cart_display_name_for_wms(cart_row) if cart_row is not None else f"#{cart_id}"
    meta = {
        "product_id": int(product_id),
        "quantity": float(shortage_qty),
        "source_location": loc_label,
        "target_cart": cart_label,
        "cart_id": int(cart_id),
    }
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_SHORTAGE_REPORTED,
        product_id=int(product_id),
        source_location_id=int(location_id) if location_id is not None else None,
        target_cart_id=int(cart_id),
        quantity=float(shortage_qty),
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_SHORTAGE_REPORTED,
        message=f"Zgłoszono brak {_fmt_qty(float(shortage_qty))} szt. produktu #{product_id} ({loc_label or 'lokalizacja ?'}, {cart_label})",
    )


def emit_replacement_item_removed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: int,
    product_id: int | None,
    product_name: str,
    original_product_name: str | None,
    original_order_item_id: int | None,
    quantity: float,
    operator_user_id: int | None = None,
    reason: str = "",
) -> None:
    meta = {
        "product_name": product_name[:512],
        "original_product_name": (original_product_name or "")[:512] or None,
        "original_order_item_id": int(original_order_item_id) if original_order_item_id else None,
        "reason": reason[:256],
        "quantity": float(quantity),
    }
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_REPLACEMENT_ITEM_REMOVED,
        product_id=int(product_id) if product_id else None,
        order_item_id=int(order_item_id),
        quantity=float(quantity),
        metadata=meta,
    )
    orig = (original_product_name or "").strip()
    msg = f"Usunięto zamiennik: {product_name} ({_fmt_qty(quantity)} szt.)"
    if orig:
        msg += f" · zamiast: {orig}"
    if reason:
        msg += f" — {reason}"
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_REPLACEMENT_ITEM_REMOVED,
        message=msg,
    )


def emit_order_item_removed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: int,
    product_id: int | None,
    product_name: str,
    quantity: float,
    operator_user_id: int | None = None,
    reason: str = "",
) -> None:
    """Audyt usunięcia zwykłej linii (alias operacyjny ORDER_ITEM_REMOVED)."""
    meta = {"product_name": product_name[:512], "reason": reason[:256], "quantity": float(quantity)}
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_ORDER_ITEM_REMOVED,
        product_id=int(product_id) if product_id else None,
        order_item_id=int(order_item_id),
        quantity=float(quantity),
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_ORDER_ITEM_REMOVED,
        message=f"Usunięto pozycję: {product_name} ({_fmt_qty(quantity)} szt.)"
        + (f" — {reason}" if reason else ""),
    )


def emit_order_line_removed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: int,
    product_id: int | None,
    product_name: str,
    quantity: float,
    operator_user_id: int | None = None,
    reason: str = "",
) -> None:
    meta = {"product_name": product_name[:512], "reason": reason[:256], "quantity": float(quantity)}
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_ORDER_LINE_REMOVED,
        product_id=int(product_id) if product_id else None,
        order_item_id=int(order_item_id),
        quantity=float(quantity),
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_ORDER_LINE_REMOVED,
        message=f"Usunięto linię: {product_name} ({_fmt_qty(quantity)} szt.)" + (f" — {reason}" if reason else ""),
    )


def emit_order_line_replaced(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: int,
    old_product_name: str,
    new_product_id: int,
    new_product_name: str,
    quantity: float,
    operator_user_id: int | None = None,
) -> None:
    meta = {
        "old_product_name": old_product_name[:512],
        "new_product_id": int(new_product_id),
        "new_product_name": new_product_name[:512],
        "quantity": float(quantity),
    }
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_ORDER_LINE_REPLACED,
        product_id=int(new_product_id),
        order_item_id=int(order_item_id),
        quantity=float(quantity),
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_ORDER_LINE_REPLACED,
        message=f"Zamiana produktu: {old_product_name} → {new_product_name} ({_fmt_qty(quantity)} szt.)",
    )


def emit_oms_decision_wait(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: int,
    product_id: int | None,
    quantity: float,
    operator_user_id: int | None = None,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_OMS_DECISION_WAIT,
        product_id=int(product_id) if product_id else None,
        order_item_id=int(order_item_id),
        quantity=float(quantity),
        metadata={"quantity": float(quantity)},
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_OMS_DECISION_WAIT,
        message=f"OMS: oznaczono „czeka na towar” ({_fmt_qty(quantity)} szt.)",
    )


def emit_oms_decision_accepted(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: int,
    product_id: int | None,
    product_name: str,
    quantity: float,
    action: str,
    operator_user_id: int | None = None,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_OMS_DECISION_ACCEPTED,
        product_id=int(product_id) if product_id else None,
        order_item_id=int(order_item_id),
        quantity=float(quantity),
        metadata={"action": action[:128], "product_name": product_name[:512]},
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_OMS_DECISION_ACCEPTED,
        message=f"OMS: {action} — {product_name} ({_fmt_qty(quantity)} szt.)",
    )


def emit_recovery_finished(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    cart_id: int,
    operator_user_id: int | None = None,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_RECOVERY_FINISHED,
        target_cart_id=int(cart_id),
        metadata={"cart_id": int(cart_id)},
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_RECOVERY_FINISHED,
        message="Zakończono dogrywkę zbierki",
    )


def record_picking_cart_finalize_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    operator_user_id: Optional[int],
    orders: List[Order],
    completed_at: datetime,
) -> None:
    starts = [_naive_utc_dt(getattr(o, "picking_started_at", None)) for o in orders]
    starts_ok = [x for x in starts if x is not None]
    completed_naive = _naive_utc_dt(completed_at) or completed_at
    started_at = min(starts_ok) if starts_ok else completed_naive
    paused = 0
    active = max(0, int((completed_naive - started_at).total_seconds()) - paused)
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    meta = {"order_ids": [int(o.id) for o in orders], "cart_finalize": True}
    complete_wms_operation_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_kind="picking_active",
        operator_user_id=uid,
        cart_id=int(cart_id),
        completed_reason="finished",
        metadata=meta,
    )
    sess = WmsOperationSession(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        cart_id=int(cart_id),
        order_id=None,
        session_kind="picking_finalize",
        operator_user_id=uid,
        started_at=started_at,
        last_activity_at=completed_at,
        completed_at=completed_at,
        completed_reason="finished",
        paused_duration_seconds=paused,
        active_duration_seconds=active,
        metadata_json=json.dumps(meta, ensure_ascii=False),
    )
    db.add(sess)


def emit_wms_packing_started(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    operator_user_id: Optional[int],
    queue_meta: Optional[dict[str, Any]] = None,
) -> WmsPackingSession:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    sess = ensure_wms_packing_session(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order=order,
        operator_user_id=operator_user_id,
        queue_meta=queue_meta,
    )
    ws = workstation_id_for_operator(db, uid)
    meta: dict[str, Any] = {
        "packing_session_id": int(sess.id),
        "workstation_id": ws,
    }
    meta.update(carton_audit_snapshot(db, order))
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order.id),
        operator_user_id=uid,
        event_type=EVT_PACKING_STARTED,
        metadata=meta,
    )
    nm = operator_display_name(db, uid)
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PACKING_STARTED,
        message=f"{nm} rozpoczął pakowanie" if nm else "Rozpoczęto pakowanie",
    )
    return sess


def emit_wms_packed_item(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    product_id: int,
    order_item_id: int,
    quantity: int,
    operator_user_id: Optional[int],
    sku: Optional[str],
    queue_meta: Optional[dict[str, Any]] = None,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    sku_s = (sku or "").strip() or f"#{product_id}"
    ensure_wms_packing_session(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order=order,
        operator_user_id=operator_user_id,
        queue_meta=queue_meta,
    )
    sess = get_open_wms_packing_session(db, int(order.id))
    meta: dict[str, Any] = {
        "sku": sku_s,
        "product_id": int(product_id),
        "quantity": int(quantity),
    }
    if sess is not None:
        meta["packing_session_id"] = int(sess.id)
    ws = workstation_id_for_operator(db, uid)
    if ws is not None:
        meta["workstation_id"] = ws
    meta.update(carton_audit_snapshot(db, order))
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order.id),
        operator_user_id=uid,
        event_type=EVT_PACKED_ITEM,
        product_id=int(product_id),
        order_item_id=int(order_item_id),
        quantity=float(quantity),
        metadata=meta,
    )
    cart_bit = (meta.get("carton_label") or "").strip()
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PACKED_ITEM,
        message=f"Spakowano {_fmt_qty(float(quantity))}× {sku_s}"
        + (f" → {cart_bit}" if cart_bit else ""),
    )


def emit_wms_packing_finished(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    operator_user_id: Optional[int],
) -> None:
    ks = getattr(order, "packing_started_at", None)
    kd = getattr(order, "packed_at", None)
    dur_sec: Optional[int] = None
    if ks is not None and kd is not None and kd >= ks:
        dur_sec = int((kd - ks).total_seconds())
    sess = get_open_wms_packing_session(db, int(order.id))
    psid = int(sess.id) if sess is not None else None
    meta: dict[str, Any] = {
        "physical_packing_seconds": dur_sec,
        "packing_duration_label": _format_duration_pl(dur_sec) if dur_sec is not None else None,
        "packing_session_id": psid,
        "physical_phase_complete": True,
    }
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    meta.update(carton_audit_snapshot(db, order))
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order.id),
        operator_user_id=uid,
        event_type=EVT_PACKING_FINISHED,
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PACKING_FINISHED,
        message=f"Kompletacja fizyczna (czas skanów: {_format_duration_pl(dur_sec)})"
        if dur_sec is not None
        else "Kompletacja fizyczna — wszystkie pozycje spakowane",
    )


def emit_wms_packing_automation_finished(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    operator_user_id: Optional[int],
    post_pack_steps: Optional[List[dict[str, Any]]] = None,
) -> None:
    """Po udanym ``packing_finish_order`` — zamknięcie sesji i czas pakowania do końca automatyki."""
    af = getattr(order, "wms_packing_automation_finished_at", None) or datetime.utcnow()
    ks = getattr(order, "packing_started_at", None)
    dur_sec: Optional[int] = None
    if ks is not None and af is not None and af >= ks:
        dur_sec = int((af - ks).total_seconds())
    complete_wms_packing_session_for_order(
        db, order, completed_at=af, automation_finished_at=af
    )
    meta: dict[str, Any] = {
        "packing_seconds_including_automation": dur_sec,
        "packing_duration_label": _format_duration_pl(dur_sec) if dur_sec is not None else None,
        "packing_session_closed": True,
    }
    if post_pack_steps:
        meta["post_pack_steps"] = post_pack_steps[:24]
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    meta.update(carton_audit_snapshot(db, order))
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order.id),
        operator_user_id=uid,
        event_type=EVT_PACKING_AUTOMATION_FINISHED,
        metadata=meta,
        created_at=af,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PACKING_AUTOMATION_FINISHED,
        message=f"Automatyka pakowania zakończona (czas: {_format_duration_pl(dur_sec)})"
        if dur_sec is not None
        else "Automatyka pakowania zakończona",
    )


def emit_wms_carton_selected_or_changed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: Optional[int],
    old_carton_id: Optional[str],
    new_carton_id: str,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    new_dim, new_nm = carton_label_by_id(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), carton_id=new_carton_id
    )
    meta: dict[str, Any] = {
        "new_carton_id": str(new_carton_id).strip(),
        "carton_label": new_dim,
        "carton_name": new_nm,
    }
    prev_s = (old_carton_id or "").strip()
    if prev_s:
        odim, onm = carton_label_by_id(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), carton_id=prev_s
        )
        meta["old_carton_id"] = prev_s
        meta["old_carton_label"] = odim
        meta["old_carton_name"] = onm
        evt = EVT_CARTON_CHANGED
        title_pl = "Zmieniono karton"
        msg = f"Karton {odim or prev_s} → {new_dim or new_carton_id}"
    else:
        evt = EVT_CARTON_SELECTED
        title_pl = "Wybrano karton"
        msg = f"Karton {new_dim or new_carton_id}"
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=evt,
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=evt,
        message=msg,
    )


def emit_wms_label_generated(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: Optional[int],
    carrier_name: str,
    tracking_number: Optional[str] = None,
    template_hint: Optional[str] = None,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    meta = {
        "carrier_name": (carrier_name or "").strip() or "Przewoźnik",
        "tracking_number": (tracking_number or "").strip() or None,
        "template_hint": template_hint,
    }
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_LABEL_GENERATED,
        metadata=meta,
    )
    cn = meta["carrier_name"]
    tn = meta.get("tracking_number") or ""
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_LABEL_GENERATED,
        message=f"Wygenerowano etykietę {cn}" + (f", nr {tn}" if tn else ""),
    )


def emit_wms_label_reprinted(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: Optional[int],
    carrier_name: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    meta = {"carrier_name": carrier_name, "reason": reason}
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_LABEL_REPRINTED,
        metadata={k: v for k, v in meta.items() if v is not None},
    )
    nm = operator_display_name(db, uid)
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_LABEL_REPRINTED,
        message=f"Ponowny wydruk etykiety ({nm or 'operator'})",
    )


def emit_wms_package_weight_confirmed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: Optional[int],
    weight_kg: float,
    source: str = "wms_scale",
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    meta = {"weight_kg": float(weight_kg), "source": source}
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_PACKAGE_WEIGHT_CONFIRMED,
        quantity=float(weight_kg),
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PACKAGE_WEIGHT_CONFIRMED,
        message=f"Potwierdzono wagę przesyłki: {weight_kg:g} kg",
    )


def emit_wms_packing_paused(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: Optional[int],
    reason: Optional[str] = None,
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    meta = {"reason": reason} if reason else {}
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_PACKING_PAUSED,
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PACKING_PAUSED,
        message="Wstrzymano pakowanie" + (f" ({reason})" if reason else ""),
    )


def emit_wms_packing_resumed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: Optional[int],
) -> None:
    uid = int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    insert_wms_order_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=int(order_id),
        operator_user_id=uid,
        event_type=EVT_PACKING_RESUMED,
        metadata={},
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVT_PACKING_RESUMED,
        message="Wznowiono pakowanie",
    )


def _delta_seconds(a: datetime, b: datetime) -> Optional[int]:
    if b < a:
        return None
    return int((b - a).total_seconds())


def _timeline_event_from_row(db: Session, ev: WmsOrderEvent) -> WmsOrderTimelineEvent:
    meta = _json_meta(ev)
    uid = getattr(ev, "operator_user_id", None)
    user_label = operator_display_name(db, int(uid) if uid is not None else None)
    et = str(ev.event_type or "")
    at = getattr(ev, "created_at", None) or datetime.utcnow()
    title = et
    body: list[str] = []
    badge = "WMS"

    if et == EVT_PICKING_STARTED:
        op = user_label or "Operator"
        title = f"{op} rozpoczął zbieranie"
        tc = meta.get("target_cart")
        if tc:
            body.append(f"wózek: {tc}")
        if meta.get("basket"):
            body.append(f"koszyk: {meta['basket']}")
    elif et == EVT_PICKED_ITEM:
        qty = float(getattr(ev, "quantity", 0) or meta.get("quantity") or 0)
        sku = (meta.get("sku") or "").strip() or "?"
        title = f"Zebrano {_fmt_qty(qty)}× {sku}"
        if meta.get("source_location"):
            body.append(f"lokalizacja: {meta['source_location']}")
        if meta.get("target_cart"):
            body.append(f"wózek: {meta['target_cart']}")
        if meta.get("basket"):
            body.append(f"koszyk: {meta['basket']}")
    elif et == EVT_PICKING_FINISHED:
        title = "Zbieranie zakończone"
        if meta.get("picking_duration_label"):
            body.append(f"czas: {meta['picking_duration_label']}")
        if meta.get("new_order_ui_status_name"):
            body.append(f"status: {meta['new_order_ui_status_name']}")
    elif et in (EVT_ORDER_LINE_REMOVED, EVT_ORDER_ITEM_REMOVED, EVT_REPLACEMENT_ITEM_REMOVED):
        title = {
            EVT_REPLACEMENT_ITEM_REMOVED: "Usunięto zamiennik",
            EVT_ORDER_ITEM_REMOVED: "Usunięto pozycję",
        }.get(et, "Usunięto produkt z zamówienia")
        if meta.get("product_name"):
            body.append(str(meta["product_name"]))
        if meta.get("original_product_name"):
            body.append(f"zamiast: {meta['original_product_name']}")
        if meta.get("reason"):
            body.append(str(meta["reason"]))
    elif et == EVT_ORDER_LINE_REPLACED:
        title = "Zamiana produktu"
        if meta.get("old_product_name") and meta.get("new_product_name"):
            body.append(f"{meta['old_product_name']} → {meta['new_product_name']}")
    elif et == EVT_OMS_DECISION_WAIT:
        title = "OMS: czeka na towar"
    elif et == EVT_OMS_DECISION_ACCEPTED:
        title = meta.get("action") or "Decyzja OMS"
        if meta.get("product_name"):
            body.append(str(meta["product_name"]))
    elif et == EVT_RECOVERY_FINISHED:
        title = "Zakończono dogrywkę zbierki"
    elif et in (
        EVT_SHORTAGE_REPORTED,
        EVT_ORDER_LINE_SHORTAGE_REPORTED,
        EVT_REPLACEMENT_SHORTAGE_REPORTED,
        EVT_RECOVERY_SHORTAGE_REPORTED,
    ):
        title = {
            EVT_RECOVERY_SHORTAGE_REPORTED: "Brak na dogrywce",
            EVT_REPLACEMENT_SHORTAGE_REPORTED: "Brak na zamienniku",
            EVT_ORDER_LINE_SHORTAGE_REPORTED: "Brak na linii",
        }.get(et, "Zgłoszono brak")
        if meta.get("product_name"):
            body.append(str(meta["product_name"]))
        if meta.get("original_product_name"):
            body.append(f"zamiast: {meta['original_product_name']}")
        pq = meta.get("quantity")
        if pq is not None:
            body.append(f"ilość: {_fmt_qty(float(pq))}")
        if meta.get("source_location"):
            body.append(f"lokalizacja: {meta['source_location']}")
        if meta.get("target_cart"):
            body.append(f"wózek: {meta['target_cart']}")
    elif et == EVT_PACKING_STARTED:
        title = f"{user_label} rozpoczął pakowanie" if user_label else "Rozpoczęto pakowanie"
        if meta.get("carton_label"):
            body.append(f"karton: {meta['carton_label']}")
        if meta.get("workstation_id") is not None:
            body.append(f"stanowisko: #{meta['workstation_id']}")
    elif et == EVT_PACKED_ITEM:
        qty = float(meta.get("quantity") or getattr(ev, "quantity") or 0)
        sku = (meta.get("sku") or "").strip() or "?"
        title = f"Spakowano {_fmt_qty(qty)}× {sku}"
        if meta.get("carton_label"):
            body.append(f"karton: {meta['carton_label']}")
        if meta.get("workstation_id") is not None:
            body.append(f"stanowisko: #{meta['workstation_id']}")
    elif et == EVT_PACKING_PAUSED:
        title = "Wstrzymano pakowanie"
        if meta.get("reason"):
            body.append(str(meta["reason"]))
    elif et == EVT_PACKING_RESUMED:
        title = "Wznowiono pakowanie"
    elif et == EVT_PACKING_FINISHED:
        title = "Kompletacja fizyczna — wszystkie pozycje spakowane"
        if meta.get("packing_duration_label"):
            body.append(f"czas (skany / kompletacja): {meta['packing_duration_label']}")
    elif et == EVT_PACKING_AUTOMATION_FINISHED:
        title = "Automatyka i synchronizacja zakończone"
        if meta.get("packing_duration_label"):
            body.append(f"czas pakowania (do końca automatyki): {meta['packing_duration_label']}")
        for row in meta.get("post_pack_steps") or []:
            if not isinstance(row, dict):
                continue
            step = str(row.get("step") or "").strip()
            ok = row.get("ok")
            msg = (row.get("message") or "").strip()
            if not step:
                continue
            sym = "✓" if ok else "✗"
            body.append(f"{sym} {step}" + (f" — {msg}" if msg else ""))
    elif et == EVT_CARTON_SELECTED:
        title = "Wybrano karton"
        if meta.get("carton_label"):
            body.append(meta["carton_label"])
        elif meta.get("new_carton_id"):
            body.append(str(meta["new_carton_id"]))
    elif et == EVT_CARTON_CHANGED:
        title = "Zmieniono karton"
        if meta.get("old_carton_label") and meta.get("carton_label"):
            body.append(f"{meta['old_carton_label']} → {meta['carton_label']}")
        elif meta.get("carton_label"):
            body.append(str(meta["carton_label"]))
    elif et == EVT_LABEL_GENERATED:
        cn = (meta.get("carrier_name") or "").strip() or "Przewoźnik"
        title = f"Wygenerowano etykietę: {cn}"
        if meta.get("tracking_number"):
            body.append(f"numer: {meta['tracking_number']}")
    elif et == EVT_LABEL_REPRINTED:
        title = "Ponownie wydrukowano etykietę"
        if user_label:
            body.append(f"operator: {user_label}")
        if meta.get("carrier_name"):
            body.append(str(meta["carrier_name"]))
    elif et == EVT_PACKAGE_WEIGHT_CONFIRMED:
        wraw = meta.get("weight_kg")
        try:
            wf = float(wraw) if wraw is not None else None
        except (TypeError, ValueError):
            wf = None
        title = f"Potwierdzono wagę: {wf:g} kg" if wf is not None else "Potwierdzono wagę przesyłki"
    else:
        title = et.replace("_", " ").title()
        if meta:
            body.append(json.dumps(meta, ensure_ascii=False)[:500])

    return WmsOrderTimelineEvent(
        at=at,
        title=title,
        body=body,
        badge=badge,
        user_label=user_label,
        event_type=et[:64],
    )


def build_wms_timeline_from_audit_events(
    db: Session, order: Order
) -> Tuple[List[WmsOrderTimelineEvent], Optional[WmsOperationTimesOut]]:
    rows = (
        db.query(WmsOrderEvent)
        .filter(WmsOrderEvent.order_id == int(order.id))
        .order_by(WmsOrderEvent.created_at.asc(), WmsOrderEvent.id.asc())
        .all()
    )
    if not rows:
        return [], None
    timeline = [_timeline_event_from_row(db, ev) for ev in rows]

    ps = getattr(order, "picking_started_at", None)
    pd = getattr(order, "picking_finished_at", None) or getattr(order, "picked_at", None)
    ks = getattr(order, "packing_started_at", None)
    kd = getattr(order, "packed_at", None)
    ke = getattr(order, "wms_packing_automation_finished_at", None) or kd
    pick_sec = _delta_seconds(ps, pd) if ps is not None and pd is not None else None
    pack_sec = _delta_seconds(ks, ke) if ks is not None and ke is not None else None
    wf_sec = _delta_seconds(ps, ke) if ps is not None and ke is not None else None
    if pick_sec is not None and pack_sec is not None:
        tot_sec: Optional[int] = int(pick_sec) + int(pack_sec)
    else:
        tot_sec = None
    if pick_sec is None and pack_sec is None and tot_sec is None and not timeline:
        return [], None
    op = WmsOperationTimesOut(
        picking_time=pick_sec,
        packing_time=pack_sec,
        total_time=tot_sec,
        picking_seconds=pick_sec,
        packing_seconds=pack_sec,
        total_seconds=tot_sec,
        picking_partial_label=None,
        warehouse_flow_seconds=wf_sec,
    )
    return timeline, op


def order_has_wms_audit_events(db: Session, order_id: int) -> bool:
    q = (
        db.query(func.count(WmsOrderEvent.id))
        .filter(WmsOrderEvent.order_id == int(order_id))
        .scalar()
    )
    return int(q or 0) > 0


def last_pick_audit_summaries_for_order_lines(
    db: Session, order_id: int, order_item_ids: List[int]
) -> Dict[int, str]:
    if not order_item_ids:
        return {}
    rows = (
        db.query(WmsOrderEvent)
        .filter(
            WmsOrderEvent.order_id == int(order_id),
            WmsOrderEvent.order_item_id.in_(list(order_item_ids)),
            WmsOrderEvent.event_type == EVT_PICKED_ITEM,
        )
        .order_by(WmsOrderEvent.created_at.desc(), WmsOrderEvent.id.desc())
        .all()
    )
    seen: set[int] = set()
    out: dict[int, str] = {}
    for ev in rows:
        oi = getattr(ev, "order_item_id", None)
        if oi is None:
            continue
        oi_i = int(oi)
        if oi_i in seen:
            continue
        seen.add(oi_i)
        meta = _json_meta(ev)
        uid = getattr(ev, "operator_user_id", None)
        op = operator_display_name(db, int(uid) if uid is not None else None) or "Operator"
        at_ev = getattr(ev, "created_at", None)
        dt_s = _fmt_pl_dt(at_ev if isinstance(at_ev, datetime) else None)
        out[oi_i] = f"{op} · {dt_s}".strip() if dt_s else op
    return out


def last_pack_audit_summaries_for_order_lines(
    db: Session, order_id: int, order_item_ids: List[int]
) -> Dict[int, str]:
    if not order_item_ids:
        return {}
    rows = (
        db.query(WmsOrderEvent)
        .filter(
            WmsOrderEvent.order_id == int(order_id),
            WmsOrderEvent.order_item_id.in_(list(order_item_ids)),
            WmsOrderEvent.event_type == EVT_PACKED_ITEM,
        )
        .order_by(WmsOrderEvent.created_at.desc(), WmsOrderEvent.id.desc())
        .all()
    )
    seen: set[int] = set()
    out: dict[int, str] = {}
    for ev in rows:
        oi = getattr(ev, "order_item_id", None)
        if oi is None:
            continue
        oi_i = int(oi)
        if oi_i in seen:
            continue
        seen.add(oi_i)
        meta = _json_meta(ev)
        uid = getattr(ev, "operator_user_id", None)
        op = operator_display_name(db, int(uid) if uid is not None else None) or "Operator"
        at_ev = getattr(ev, "created_at", None)
        dt_s = _fmt_pl_dt(at_ev if isinstance(at_ev, datetime) else None)
        out[oi_i] = f"{op} · {dt_s}".strip() if dt_s else op
    return out
