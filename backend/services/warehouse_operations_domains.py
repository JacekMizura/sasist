"""Domain aggregations for the WMS operations command center."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, time
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.inbound_delivery import InboundDelivery
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.order import Order
from ..models.order_issue_task import OrderIssueTask
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.receiving_document_carrier import ReceivingDocumentCarrier
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.supplier import Supplier
from ..models.wms_operation_session import WmsOperationSession
from ..models.wms_operational_task import ACTIVE_STATUSES, WmsOperationalTask
from ..models.wms_order_event import WmsOrderEvent
from ..schemas.warehouse_operations import (
    WarehouseBottleneckOut,
    WarehouseCarrierIssueOut,
    WarehouseEmployeeRankingOut,
    WarehouseInboundDeliveryOut,
    WarehouseInboundSummaryOut,
    WarehouseOperationsAlertOut,
    WarehouseOperationsQueueOut,
    WarehouseOperatorCardOut,
    WarehousePutawayLoadOut,
    WarehousePutawayZoneLoadOut,
    WarehouseReplenishmentAlertOut,
)

MODE_PICKING = "KOMPLETACJA"
MODE_PACKING = "PAKOWANIE"
MODE_OPERATIONS = "OPERACJE MAGAZYNOWE"
MODE_SHORTAGES = "BRAKI"


def _parse_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat(timespec="seconds") if dt is not None else None


def _minutes_between(start: datetime | None, end: datetime) -> int:
    if start is None:
        return 0
    return max(0, int((end - start).total_seconds() // 60))


def _location_label(loc: Location | None, loc_id: int | None = None) -> str | None:
    if loc is None:
        return f"#{loc_id}" if loc_id else None
    return (loc.name or loc.bin or "").strip() or f"#{loc.id}"


def _zone_for_location(loc: Location | None) -> str | None:
    if loc is None:
        return None
    for raw in (loc.rack_name, loc.name, loc.bin):
        text = str(raw or "").strip()
        if text:
            return text.split("-")[0].split()[0][:32]
    return None


def _operator_names(db: Session, user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    out: dict[int, str] = {}
    for user in db.query(AppUser).filter(AppUser.id.in_(list(user_ids))).all():
        name = " ".join([p for p in [user.first_name, user.last_name] if p]).strip()
        out[int(user.id)] = name or user.login or f"Operator #{user.id}"
    return out


def _session_operator_by_document(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    kinds: set[str],
) -> dict[int, str]:
    rows = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.tenant_id == int(tenant_id),
            WmsOperationSession.warehouse_id == int(warehouse_id),
            WmsOperationSession.session_kind.in_(list(kinds)),
            WmsOperationSession.completed_at.is_(None),
        )
        .order_by(WmsOperationSession.last_activity_at.desc(), WmsOperationSession.id.desc())
        .limit(500)
        .all()
    )
    uids = {int(r.operator_user_id) for r in rows if r.operator_user_id}
    names = _operator_names(db, uids)
    out: dict[int, str] = {}
    for row in rows:
        meta = _parse_json(getattr(row, "metadata_json", None))
        doc_id = meta.get("document_id")
        try:
            did = int(doc_id)
        except (TypeError, ValueError):
            continue
        if did not in out and row.operator_user_id:
            out[did] = names.get(int(row.operator_user_id), f"Operator #{row.operator_user_id}")
    return out


def build_replenishment_alerts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    now: datetime,
) -> list[WarehouseReplenishmentAlertOut]:
    inv_rows = (
        db.query(
            Inventory.product_id,
            Location.type,
            func.coalesce(func.sum(Inventory.quantity), 0),
            func.min(Location.id),
        )
        .join(Location, Location.id == Inventory.location_id)
        .join(Product, Product.id == Inventory.product_id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.quantity > 0,
        )
        .group_by(Inventory.product_id, Location.type)
        .all()
    )
    pick_stock: dict[int, float] = defaultdict(float)
    reserve_stock: dict[int, float] = defaultdict(float)
    first_pick_loc: dict[int, int] = {}
    first_reserve_loc: dict[int, int] = {}
    product_ids: set[int] = set()
    for pid, loc_type, qty, loc_id in inv_rows:
        product_ids.add(int(pid))
        lt = str(loc_type or "").lower()
        if lt == "pick":
            pick_stock[int(pid)] += float(qty or 0)
            if loc_id is not None:
                first_pick_loc.setdefault(int(pid), int(loc_id))
        else:
            reserve_stock[int(pid)] += float(qty or 0)
            if loc_id is not None:
                first_reserve_loc.setdefault(int(pid), int(loc_id))

    blocked_by_product: dict[int, set[int]] = defaultdict(set)
    first_shortage_at: dict[int, datetime] = {}
    tasks = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.status == "OPEN",
        )
        .limit(2000)
        .all()
    )
    for task in tasks:
        try:
            missing = json.loads(task.missing_items or "[]")
        except (json.JSONDecodeError, TypeError, ValueError):
            missing = []
        if not isinstance(missing, list):
            continue
        for item in missing:
            if not isinstance(item, dict):
                continue
            try:
                pid = int(item.get("product_id"))
            except (TypeError, ValueError):
                continue
            product_ids.add(pid)
            blocked_by_product[pid].add(int(task.order_id))
            ts = getattr(task, "updated_at", None) or getattr(task, "created_at", None)
            if ts is not None and (pid not in first_shortage_at or ts < first_shortage_at[pid]):
                first_shortage_at[pid] = ts

    active_relocations = {
        int(pid)
        for (pid,) in db.query(WmsOperationalTask.product_id)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.status.in_(ACTIVE_STATUSES),
            WmsOperationalTask.task_type == "RELOCATION",
            WmsOperationalTask.product_id.isnot(None),
        )
        .distinct()
        .all()
    }
    product_ids.update(active_relocations)

    products = (
        {int(p.id): p for p in db.query(Product).filter(Product.tenant_id == int(tenant_id), Product.id.in_(list(product_ids))).all()}
        if product_ids
        else {}
    )
    loc_ids = set(first_pick_loc.values()) | set(first_reserve_loc.values())
    locs = {int(l.id): l for l in db.query(Location).filter(Location.id.in_(list(loc_ids))).all()} if loc_ids else {}

    out: list[WarehouseReplenishmentAlertOut] = []
    for pid, product in products.items():
        min_pick = float(getattr(product, "min_pick_quantity", None) or 0)
        current_pick = round(float(pick_stock.get(pid, 0)), 6)
        reserve = round(float(reserve_stock.get(pid, 0)), 6)
        blocked = len(blocked_by_product.get(pid, set()))
        missing = max(0.0, min_pick - current_pick)
        if blocked <= 0 and missing <= 1e-9 and pid not in active_relocations:
            continue
        priority = "blue" if pid in active_relocations else ("red" if blocked > 0 else "orange")
        target = locs.get(first_pick_loc.get(pid, 0))
        source = locs.get(first_reserve_loc.get(pid, 0))
        out.append(
            WarehouseReplenishmentAlertOut(
                id=f"repl-{pid}",
                product_id=pid,
                product_name=str(product.name or f"Produkt #{pid}"),
                sku=(str(product.sku).strip() if product.sku else None),
                ean=(str(product.ean).strip() if product.ean else None),
                image_url=(str(product.image_url).strip() if product.image_url else None),
                source_location=_location_label(source, first_reserve_loc.get(pid)),
                target_location=_location_label(target, first_pick_loc.get(pid)),
                missing_quantity=round(missing, 6),
                current_picking_stock=current_pick,
                reserve_stock=reserve,
                blocked_orders=blocked,
                priority=priority,
                priority_label="Przesunięcie w toku" if priority == "blue" else ("Blokuje zamówienia" if priority == "red" else "Niski stan pick-face"),
                minutes_since_detected=_minutes_between(first_shortage_at.get(pid), now),
                zone=_zone_for_location(target),
                category=(str(product.manufacturer or "").strip() or None),
            )
        )
    return sorted(out, key=lambda r: ({"red": 0, "orange": 1, "blue": 2}[r.priority], -r.blocked_orders, -r.missing_quantity))[:40]


def build_inbound_overview(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    now: datetime,
) -> tuple[WarehouseInboundSummaryOut, list[WarehouseInboundDeliveryOut]]:
    docs = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.document_type.in_(["PZ", "PZ_RT", "RETURN_RECEIPT"]),
            StockDocument.receiving_status.in_(["NEW", "IN_PROGRESS"]),
        )
        .order_by(StockDocument.created_at.asc())
        .limit(200)
        .all()
    )
    doc_ids = [int(d.id) for d in docs]
    delivery_ids = {int(d.delivery_id) for d in docs if d.delivery_id}
    deliveries = (
        {int(d.id): d for d in db.query(InboundDelivery).filter(InboundDelivery.id.in_(list(delivery_ids))).all()}
        if delivery_ids
        else {}
    )
    supplier_ids = {int(d.supplier_id) for d in docs if d.supplier_id}
    supplier_ids.update(int(d.supplier_id) for d in deliveries.values() if d.supplier_id)
    suppliers = {int(s.id): str(s.name or f"#{s.id}") for s in db.query(Supplier).filter(Supplier.id.in_(list(supplier_ids))).all()} if supplier_ids else {}
    item_rows = (
        db.query(
            StockDocumentItem.document_id,
            func.count(func.distinct(StockDocumentItem.product_id)),
            func.coalesce(func.sum(StockDocumentItem.ordered_quantity), 0),
            func.coalesce(func.sum(StockDocumentItem.received_quantity), 0),
            func.coalesce(func.sum(StockDocumentItem.quantity_putaway), 0),
        )
        .filter(StockDocumentItem.document_id.in_(doc_ids))
        .group_by(StockDocumentItem.document_id)
        .all()
        if doc_ids
        else []
    )
    item_map = {int(did): (int(skus or 0), float(ord_qty or 0), float(rec_qty or 0), float(put_qty or 0)) for did, skus, ord_qty, rec_qty, put_qty in item_rows}
    carrier_counts = {
        int(did): int(cnt or 0)
        for did, cnt in (
            db.query(ReceivingDocumentCarrier.document_id, func.count(ReceivingDocumentCarrier.id))
            .filter(ReceivingDocumentCarrier.document_id.in_(doc_ids))
            .group_by(ReceivingDocumentCarrier.document_id)
            .all()
            if doc_ids
            else []
        )
    }
    assigned = _session_operator_by_document(db, tenant_id=tenant_id, warehouse_id=warehouse_id, kinds={"receiving_active"})
    rows: list[WarehouseInboundDeliveryOut] = []
    delayed = 0
    waiting_receiving = 0
    waiting_putaway = 0
    oldest = 0
    for doc in docs:
        skus, ordered, received, putaway = item_map.get(int(doc.id), (0, 0.0, 0.0, 0.0))
        eta = deliveries.get(int(doc.delivery_id)) if doc.delivery_id else None
        eta_dt = getattr(eta, "expected_date", None)
        waiting = _minutes_between(getattr(doc, "created_at", None), now)
        oldest = max(oldest, waiting)
        overdue_minutes = _minutes_between(eta_dt, now) if eta_dt and eta_dt < now else 0
        is_delayed = overdue_minutes > 0 or waiting >= 24 * 60
        is_critical = overdue_minutes >= 24 * 60 or waiting >= 48 * 60
        delayed += 1 if is_delayed else 0
        waiting_receiving += int(max(0, ordered - received))
        waiting_putaway += int(max(0, received - putaway))
        rows.append(
            WarehouseInboundDeliveryOut(
                id=f"doc-{doc.id}",
                supplier=suppliers.get(int(doc.supplier_id or 0)) or suppliers.get(int(getattr(eta, "supplier_id", 0) or 0)) or "Dostawca nieznany",
                eta=_iso(eta_dt),
                status_label="Opóźniona krytycznie" if is_critical else ("Opóźniona" if is_delayed else "Na czas"),
                status_color="red" if is_critical else ("orange" if is_delayed else "green"),
                sku_count=skus,
                total_quantity=round(ordered, 6),
                carriers_count=carrier_counts.get(int(doc.id), 0),
                receiving_progress_percent=int(round((received / ordered) * 100)) if ordered > 0 else 0,
                assigned_operator=assigned.get(int(doc.id)),
                waiting_minutes=waiting,
            )
        )
    return (
        WarehouseInboundSummaryOut(
            active_deliveries=len(rows),
            delayed_deliveries=delayed,
            products_waiting_receiving=waiting_receiving,
            products_waiting_putaway=waiting_putaway,
            oldest_waiting_minutes=oldest,
        ),
        rows,
    )


def build_putaway_load(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    active_putaway_operators: int,
    now: datetime,
) -> WarehousePutawayLoadOut:
    docs = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.putaway_status.in_(["NOT_STARTED", "IN_PROGRESS"]),
        )
        .limit(300)
        .all()
    )
    doc_ids = [int(d.id) for d in docs]
    rows = (
        db.query(StockDocumentItem, Location)
        .outerjoin(Location, Location.id == StockDocumentItem.mm_line_from_location_id)
        .filter(StockDocumentItem.document_id.in_(doc_ids))
        .all()
        if doc_ids
        else []
    )
    products_waiting: set[int] = set()
    waiting_qty = 0.0
    zones: dict[str, float] = defaultdict(float)
    updated_points: list[datetime] = []
    for item, loc in rows:
        remaining = max(0.0, float(item.received_quantity or 0) - float(item.quantity_putaway or 0))
        if remaining <= 1e-9:
            continue
        if item.product_id:
            products_waiting.add(int(item.product_id))
        waiting_qty += remaining
        zone = _zone_for_location(loc) or "Nieprzypisane"
        zones[zone] += remaining
        if item.putaway_updated_at:
            updated_points.append(item.putaway_updated_at)
    max_zone = max(zones.values()) if zones else 0
    zone_rows = [
        WarehousePutawayZoneLoadOut(
            zone=zone,
            waiting_products=0,
            waiting_quantity=round(qty, 6),
            heat_percent=int(round((qty / max_zone) * 100)) if max_zone > 0 else 0,
            tone="red" if qty >= 50 else ("orange" if qty >= 15 else "green"),
        )
        for zone, qty in sorted(zones.items(), key=lambda x: x[1], reverse=True)[:8]
    ]
    carriers_waiting = int(
        db.query(func.count(func.distinct(StockDocumentItem.warehouse_carrier_id)))
        .filter(StockDocumentItem.document_id.in_(doc_ids), StockDocumentItem.warehouse_carrier_id.isnot(None))
        .scalar()
        or 0
    ) if doc_ids else 0
    oldest = max((_minutes_between(d.created_at, now) for d in docs if d.created_at), default=0)
    avg = int(sum(_minutes_between(pt, now) for pt in updated_points) / len(updated_points)) if updated_points else None
    return WarehousePutawayLoadOut(
        products_waiting=len(products_waiting),
        pallets_waiting=carriers_waiting,
        oldest_unprocessed_carrier_minutes=oldest,
        active_putaway_operators=active_putaway_operators,
        average_putaway_minutes=avg,
        queue_growth_trend=len(docs),
        zones=zone_rows,
    )


def build_carrier_issues(db: Session, *, tenant_id: int, warehouse_id: int, now: datetime) -> list[WarehouseCarrierIssueOut]:
    since = datetime.combine(now.date(), time.min)
    rows = (
        db.query(WmsOrderEvent)
        .filter(
            WmsOrderEvent.tenant_id == int(tenant_id),
            WmsOrderEvent.warehouse_id == int(warehouse_id),
            WmsOrderEvent.created_at >= since,
        )
        .order_by(WmsOrderEvent.created_at.desc(), WmsOrderEvent.id.desc())
        .limit(500)
        .all()
    )
    out: list[WarehouseCarrierIssueOut] = []
    for ev in rows:
        meta = _parse_json(ev.metadata_json)
        text = " ".join(str(meta.get(k) or "") for k in ("error", "message", "step", "carrier", "status")).lower()
        if not any(token in text for token in ("error", "fail", "no_shipment", "label", "carrier", "tracking")):
            continue
        msg = str(meta.get("error") or meta.get("message") or ev.event_type or "Problem przewoźnika")
        severity = "blocked" if "blocked" in text else ("critical" if "error" in text or "fail" in text else "warning")
        out.append(
            WarehouseCarrierIssueOut(
                id=f"carrier-{ev.id}",
                order_id=int(ev.order_id) if ev.order_id else None,
                carrier=str(meta.get("carrier") or meta.get("shipping_method") or "").strip() or None,
                error_message=msg[:500],
                time=_iso(ev.created_at) or "",
                retry_count=int(meta.get("retry_count") or 0),
                current_status=str(meta.get("status") or "open"),
                severity=severity,
            )
        )
    return out[:30]


def build_employee_rankings(operators: list[WarehouseOperatorCardOut]) -> list[WarehouseEmployeeRankingOut]:
    out: list[WarehouseEmployeeRankingOut] = []
    for op in operators:
        hours = max(1 / 60, (op.minutes_since_activity + max(0, op.idle.total_idle_minutes)) / 60)
        products_hour = round(float(op.products_picked or 0) / hours, 1)
        orders_hour = round(float(op.orders_picked or 0) / hours, 1)
        errors = sum(1 for ev in op.timeline if "brak" in (ev.title or "").lower() or "error" in json.dumps(ev.metadata).lower())
        completions = sum(1 for ev in op.timeline if "zakoń" in (ev.title or "").lower() or "finish" in json.dumps(ev.metadata).lower())
        productivity_score = min(45, int(products_hour * 4 + orders_hour * 6))
        inactivity_score = max(0, 25 - min(25, op.idle.total_idle_minutes))
        accuracy_score = max(0, 20 - errors * 4)
        completion_score = min(10, completions * 2)
        out.append(
            WarehouseEmployeeRankingOut(
                user_id=op.user_id,
                user_name=op.user_name,
                mode=op.main_mode,
                products_per_hour=products_hour,
                orders_per_hour=orders_hour,
                average_operation_minutes=None,
                inactivity_minutes=op.idle.total_idle_minutes,
                errors_count=errors,
                shortages_created=sum(1 for ev in op.timeline if ev.main_mode == MODE_SHORTAGES),
                successful_completions=completions,
                packing_quality_percent=max(0, 100 - errors * 10) if op.main_mode == MODE_PACKING else None,
                return_ratio_percent=None,
                scan_efficiency_percent=max(0, min(100, productivity_score + accuracy_score)),
                efficiency_score=max(0, min(100, productivity_score + inactivity_score + accuracy_score + completion_score)),
            )
        )
    return sorted(out, key=lambda r: r.efficiency_score, reverse=True)[:50]


def build_bottlenecks(
    *,
    queues: list[WarehouseOperationsQueueOut],
    inbound: WarehouseInboundSummaryOut,
    putaway: WarehousePutawayLoadOut,
    operators: list[WarehouseOperatorCardOut],
    now: datetime,
) -> list[WarehouseBottleneckOut]:
    active_by_mode = defaultdict(int)
    for op in operators:
        active_by_mode[op.main_mode] += 1
    out: list[WarehouseBottleneckOut] = []
    for queue in queues:
        pressure = int(min(200, float(queue.value or 0) * 10))
        area = str(queue.label)
        no_staff = (
            queue.key == "packing" and active_by_mode[MODE_PACKING] == 0 and float(queue.value or 0) > 0
        ) or (
            queue.key == "picking" and active_by_mode[MODE_PICKING] == 0 and float(queue.value or 0) > 0
        )
        if pressure < 30 and not no_staff:
            continue
        level = "critical" if pressure >= 100 or no_staff else ("warning" if pressure >= 60 else "info")
        out.append(
            WarehouseBottleneckOut(
                id=f"queue-{queue.key}",
                area=area,
                message=f"{area}: presja kolejki {pressure}%" + (" bez aktywnych operatorów" if no_staff else ""),
                level=level,
                average_waiting_minutes=0,
                queue_growth=int(queue.value or 0),
                oldest_waiting_minutes=0,
                processing_speed=float(active_by_mode[MODE_PACKING if queue.key == "packing" else MODE_PICKING] or 0),
                sla_risk_percent=min(100, pressure),
                pressure_percent=pressure,
                trend_label=f"+{max(0, pressure - 50)}%",
            )
        )
    if inbound.delayed_deliveries:
        out.append(
            WarehouseBottleneckOut(
                id="inbound-delayed",
                area="Dostawy",
                message=f"{inbound.delayed_deliveries} dostaw opóźnionych",
                level="warning" if inbound.delayed_deliveries < 3 else "critical",
                oldest_waiting_minutes=inbound.oldest_waiting_minutes,
                queue_growth=inbound.active_deliveries,
                sla_risk_percent=min(100, inbound.delayed_deliveries * 25),
                pressure_percent=min(100, inbound.active_deliveries * 10),
            )
        )
    if putaway.products_waiting:
        out.append(
            WarehouseBottleneckOut(
                id="putaway-load",
                area="Rozlokowanie",
                message=f"{putaway.products_waiting} produktów czeka na rozlokowanie",
                level="critical" if putaway.products_waiting >= 50 else "warning",
                oldest_waiting_minutes=putaway.oldest_unprocessed_carrier_minutes,
                queue_growth=putaway.queue_growth_trend,
                sla_risk_percent=min(100, putaway.products_waiting * 2),
                pressure_percent=min(100, putaway.products_waiting * 3),
            )
        )
    return sorted(out, key=lambda b: ({"critical": 0, "warning": 1, "info": 2}[b.level], -b.pressure_percent))[:20]


def _minutes_label(minutes: int | None) -> str:
    safe = max(0, int(minutes or 0))
    if safe < 60:
        return f"{safe} min"
    total_hours, mins = divmod(safe, 60)
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


def _alert(
    *,
    alert_id: str,
    level: str,
    title: str,
    category: str,
    priority_group: str,
    description: str,
    responsible_area: str,
    recommended_action: str,
    now: datetime,
    impact: list[dict[str, Any]] | None = None,
    context: list[dict[str, Any]] | None = None,
    actions: list[dict[str, Any]] | None = None,
    related_entities: list[dict[str, Any]] | None = None,
    prediction_label: str | None = None,
    manager_focus: bool = False,
    affected_orders: list[int] | None = None,
    responsible_operator: str | None = None,
) -> WarehouseOperationsAlertOut:
    severity_label = {"critical": "Krytyczne teraz", "warning": "Wymaga reakcji", "info": "Informacyjne"}.get(
        level,
        "Informacyjne",
    )
    return WarehouseOperationsAlertOut(
        id=alert_id,
        level=level,  # type: ignore[arg-type]
        message=title,
        title=title,
        description=description,
        created_at=_iso(now) or "",
        minutes_ago=0,
        area=category,
        category=category,  # type: ignore[arg-type]
        priority_group=priority_group,  # type: ignore[arg-type]
        severity_label=severity_label,
        responsible_area=responsible_area,
        responsible_operator=responsible_operator,
        recommended_action=recommended_action,
        impact=impact or [],
        context=context or [],
        actions=actions or [],
        related_entities=related_entities or [],
        prediction_label=prediction_label,
        manager_focus=manager_focus,
        affected_orders=affected_orders or [],
        resolution_status="open",
    )


def _queue_value(queues: list[WarehouseOperationsQueueOut], key: str) -> int:
    for queue in queues:
        if queue.key == key:
            return int(queue.value or 0)
    return 0


def extend_alerts(
    *,
    base_alerts: list[WarehouseOperationsAlertOut],
    bottlenecks: list[WarehouseBottleneckOut],
    replenishments: list[WarehouseReplenishmentAlertOut],
    inbound: WarehouseInboundSummaryOut,
    putaway: WarehousePutawayLoadOut,
    carrier_issues: list[WarehouseCarrierIssueOut],
    queues: list[WarehouseOperationsQueueOut],
    operators: list[WarehouseOperatorCardOut],
    now: datetime,
) -> list[WarehouseOperationsAlertOut]:
    alerts: list[WarehouseOperationsAlertOut] = []
    active_packers = sum(1 for op in operators if op.main_mode == MODE_PACKING and op.minutes_since_activity <= 10)
    active_pickers = sum(1 for op in operators if op.main_mode == MODE_PICKING and op.minutes_since_activity <= 10)
    packing_queue = _queue_value(queues, "packing")
    picking_queue = _queue_value(queues, "picking")

    for row in [r for r in replenishments if r.priority == "red"][:6]:
        alerts.append(
            _alert(
                alert_id=f"critical-shortage-{row.product_id}",
                level="critical",
                title="Krytyczny brak produktu",
                category="Braki",
                priority_group="critical_now",
                description="Ten SKU blokuje aktywne zamówienia i wymaga natychmiastowej decyzji operacyjnej.",
                responsible_area="Kompletacja / uzupełnienia",
                recommended_action="Utwórz przesunięcie z rezerwy albo wskaż zamiennik dla zablokowanych zamówień.",
                now=now,
                impact=[
                    {"label": "Blokuje", "value": f"{row.blocked_orders} zamówień", "tone": "red"},
                    {"label": "Najstarsze oczekuje", "value": _minutes_label(row.minutes_since_detected), "tone": "amber"},
                    {"label": "Brakuje", "value": str(row.missing_quantity), "detail": "szt. na pick-face", "tone": "red"},
                ],
                context=[
                    {"label": "SKU", "value": row.sku or row.ean or f"ID {row.product_id}", "tone": "neutral"},
                    {"label": "Strefa", "value": row.zone or row.target_location or "Nieprzypisana", "tone": "neutral"},
                    {"label": "Rezerwa", "value": str(row.reserve_stock), "tone": "blue" if row.reserve_stock > 0 else "red"},
                ],
                actions=[
                    {
                        "label": "Utwórz zadanie",
                        "action_type": "create_task",
                        "target_path": "/wms/operational-queues",
                        "tone": "primary",
                        "payload": {
                            "task_type": "replenishment",
                            "title": f"Uzupełnij {row.target_location or 'pick-face'}",
                            "description": f"Przenieś z rezerwy do {row.target_location or 'lokalizacji pickingowej'}: {row.product_name}",
                            "product_id": row.product_id,
                            "sku": row.sku,
                            "quantity": row.missing_quantity,
                            "source_location": row.source_location,
                            "target_location": row.target_location,
                            "blocked_orders": row.blocked_orders,
                            "target_path": "/wms/operational-queues",
                        },
                    },
                    {"label": "Zobacz zamówienia", "action_type": "navigate", "target_path": "/wms/braki", "tone": "secondary"},
                    {"label": "Znajdź zamiennik", "action_type": "navigate", "target_path": f"/products/{row.product_id}/edit", "tone": "secondary"},
                ],
                related_entities=[
                    {"kind": "sku", "label": row.sku or row.ean or f"Produkt #{row.product_id}", "id": str(row.product_id)},
                    {"kind": "zone", "label": row.zone or row.target_location or "Nieprzypisana"},
                ],
                prediction_label=(
                    f"Ryzyko SLA rośnie od {_minutes_label(row.minutes_since_detected)}"
                    if row.minutes_since_detected >= 15
                    else None
                ),
                manager_focus=True,
            )
        )

    if packing_queue > 0 and (active_packers == 0 or packing_queue >= 5):
        risk_minutes = max(10, packing_queue * 6 - active_packers * 10)
        alerts.append(
            _alert(
                alert_id="packing-overload",
                level="critical" if active_packers == 0 else "warning",
                title="Pakowanie przeciążone" if active_packers else "Pakowanie bez aktywnych operatorów",
                category="Pakowanie",
                priority_group="critical_now" if active_packers == 0 else "requires_action",
                description="Kolejka pakowania rośnie szybciej niż bieżąca obsada może ją obsłużyć.",
                responsible_area="Pakowanie",
                recommended_action="Dołóż operatora do pakowania lub przenieś część pracy z kompletacji.",
                now=now,
                impact=[
                    {"label": "Oczekuje", "value": f"{packing_queue} zamówień", "tone": "amber"},
                    {"label": "Aktywni operatorzy", "value": str(active_packers), "tone": "red" if active_packers == 0 else "blue"},
                    {"label": "Szacowane ryzyko SLA", "value": _minutes_label(risk_minutes), "tone": "amber"},
                ],
                context=[
                    {"label": "Zespół", "value": "Pakowanie", "tone": "neutral"},
                    {"label": "Przepustowość", "value": f"{active_packers} aktywnych", "tone": "neutral"},
                ],
                actions=[
                    {
                        "label": "Przypisz operatora",
                        "action_type": "create_task",
                        "target_path": "/wms/packing/orders",
                        "tone": "primary",
                        "payload": {
                            "task_type": "priority_packing",
                            "title": "Priorytet pakowania",
                            "description": f"Obsłuż kolejkę pakowania: {packing_queue} zamówień oczekuje",
                            "order_count": packing_queue,
                            "target_path": "/wms/packing/orders",
                        },
                    },
                    {"label": "Przejdź do pakowania", "action_type": "navigate", "target_path": "/wms/packing/orders", "tone": "secondary"},
                ],
                prediction_label=f"Za około {_minutes_label(risk_minutes)} pakowanie może przekroczyć SLA",
                manager_focus=True,
            )
        )

    if picking_queue >= 10 and active_pickers <= 1:
        alerts.append(
            _alert(
                alert_id="picking-throughput-risk",
                level="warning",
                title="Kompletacja nie nadąża",
                category="Kompletacja",
                priority_group="requires_action",
                description="Liczba zamówień do kompletacji jest wysoka względem aktywnej obsady.",
                responsible_area="Kompletacja",
                recommended_action="Przypisz kolejnego operatora do kompletacji albo ogranicz dopływ do pakowania.",
                now=now,
                impact=[
                    {"label": "Kolejka", "value": f"{picking_queue} zamówień", "tone": "amber"},
                    {"label": "Aktywni kompletujący", "value": str(active_pickers), "tone": "amber"},
                ],
                actions=[
                    {
                        "label": "Przypisz operatora",
                        "action_type": "create_task",
                        "target_path": "/wms/picking/products",
                        "tone": "primary",
                        "payload": {
                            "task_type": "priority_picking",
                            "title": "Priorytet kompletacji",
                            "description": f"Przejmij kolejkę kompletacji: {picking_queue} zamówień",
                            "order_count": picking_queue,
                            "target_path": "/wms/picking/products",
                        },
                    },
                    {"label": "Przejdź do kompletacji", "action_type": "navigate", "target_path": "/wms/picking/products", "tone": "secondary"},
                ],
                prediction_label="Kompletacja będzie zwiększać zaległość przy obecnej obsadzie.",
            )
        )

    if putaway.products_waiting or putaway.pallets_waiting:
        top_zone = putaway.zones[0] if putaway.zones else None
        level = "critical" if putaway.oldest_unprocessed_carrier_minutes >= 120 or putaway.products_waiting >= 50 else "warning"
        alerts.append(
            _alert(
                alert_id="putaway-delayed",
                level=level,
                title=f"Rozlokowanie opóźnione{f' — Strefa {top_zone.zone}' if top_zone else ''}",
                category="Rozlokowanie",
                priority_group="critical_now" if level == "critical" else "requires_action",
                description="Towar po przyjęciu czeka na rozlokowanie i może blokować uzupełnienia pick-face.",
                responsible_area="Rozlokowanie",
                recommended_action="Otwórz kolejkę rozlokowania i przypisz operatora do najbardziej obciążonej strefy.",
                now=now,
                impact=[
                    {"label": "Produkty oczekujące", "value": str(putaway.products_waiting), "tone": "amber"},
                    {"label": "Nośniki oczekujące", "value": str(putaway.pallets_waiting), "tone": "amber"},
                    {"label": "Najstarsze oczekuje", "value": _minutes_label(putaway.oldest_unprocessed_carrier_minutes), "tone": "red" if level == "critical" else "amber"},
                ],
                context=[
                    {"label": "Strefa", "value": top_zone.zone if top_zone else "Nieprzypisana", "tone": "neutral"},
                    {"label": "Aktywni operatorzy", "value": str(putaway.active_putaway_operators), "tone": "blue" if putaway.active_putaway_operators else "amber"},
                ],
                actions=[
                    {
                        "label": "Przypisz zadanie",
                        "action_type": "create_task",
                        "target_path": "/wms/putaway",
                        "tone": "primary",
                        "payload": {
                            "task_type": "putaway",
                            "title": "Priorytet rozlokowania",
                            "description": "Rozładuj najstarsze nośniki i najbardziej obciążoną strefę.",
                            "zone": top_zone.zone if top_zone else None,
                            "quantity": putaway.products_waiting,
                            "target_path": "/wms/putaway",
                        },
                    },
                    {"label": "Zobacz obciążenie", "action_type": "switch_tab", "target_tab": "putaway-load", "tone": "secondary"},
                ],
                prediction_label=(
                    f"Strefa {top_zone.zone} będzie przeciążona" if top_zone and top_zone.heat_percent >= 80 else None
                ),
                manager_focus=level == "critical",
            )
        )

    if inbound.delayed_deliveries:
        alerts.append(
            _alert(
                alert_id="inbound-delayed",
                level="critical" if inbound.oldest_waiting_minutes >= 24 * 60 else "warning",
                title="Dostawy oczekują na przyjęcie",
                category="Dostawy",
                priority_group="requires_action",
                description="Opóźnione dostawy zwiększają ryzyko braków i zaległości rozlokowania.",
                responsible_area="Przyjęcia",
                recommended_action="Otwórz przyjęcia i zdecyduj, które PZ obsłużyć jako pierwsze.",
                now=now,
                impact=[
                    {"label": "Opóźnione dostawy", "value": str(inbound.delayed_deliveries), "tone": "amber"},
                    {"label": "Do przyjęcia", "value": str(inbound.products_waiting_receiving), "tone": "blue"},
                    {"label": "Najstarsza", "value": _minutes_label(inbound.oldest_waiting_minutes), "tone": "amber"},
                ],
                actions=[
                    {"label": "Otwórz dostawy", "action_type": "navigate", "target_path": "/wms/receiving", "tone": "primary"},
                    {"label": "Zobacz dostawy", "action_type": "switch_tab", "target_tab": "inbound", "tone": "secondary"},
                ],
                prediction_label="Opóźnione przyjęcia mogą przejść w braki pick-face.",
            )
        )
    elif inbound.active_deliveries:
        alerts.append(
            _alert(
                alert_id="inbound-waiting-info",
                level="info",
                title="Dostawy czekają na przyjęcie",
                category="Dostawy",
                priority_group="informational",
                description="Są aktywne dostawy do obsłużenia, ale bez krytycznego opóźnienia.",
                responsible_area="Przyjęcia",
                recommended_action="Monitoruj kolejkę przyjęć i utrzymuj płynne rozlokowanie.",
                now=now,
                impact=[{"label": "Aktywne dostawy", "value": str(inbound.active_deliveries), "tone": "blue"}],
                actions=[{"label": "Otwórz dostawy", "action_type": "navigate", "target_path": "/wms/receiving", "tone": "secondary"}],
            )
        )

    for issue in carrier_issues[:5]:
        alerts.append(
            _alert(
                alert_id=f"carrier-issue-{issue.id}",
                level="critical" if issue.severity in {"critical", "blocked"} else "warning",
                title="Problem przewoźnika blokuje wysyłkę" if issue.severity == "blocked" else "Problem przewoźnika",
                category="Przewoźnicy",
                priority_group="critical_now" if issue.severity in {"critical", "blocked"} else "requires_action",
                description=issue.error_message,
                responsible_area="Pakowanie / wysyłka",
                recommended_action="Sprawdź błąd przewoźnika, ponów etykietę albo zmień metodę dostawy.",
                now=now,
                impact=[
                    {"label": "Zamówienie", "value": f"#{issue.order_id}" if issue.order_id else "Nieznane", "tone": "red" if issue.severity == "blocked" else "amber"},
                    {"label": "Próby", "value": str(issue.retry_count), "tone": "neutral"},
                ],
                context=[{"label": "Przewoźnik", "value": issue.carrier or "Nieznany", "tone": "neutral"}],
                actions=[
                    {"label": "Otwórz zamówienie", "action_type": "navigate", "target_path": f"/wms/packing/order/{issue.order_id}" if issue.order_id else "/wms/packing/orders", "tone": "primary"},
                    {"label": "Zobacz problemy", "action_type": "switch_tab", "target_tab": "carrier-issues", "tone": "secondary"},
                ],
                related_entities=[
                    {"kind": "order", "label": f"#{issue.order_id}", "id": str(issue.order_id)} if issue.order_id else {"kind": "carrier", "label": issue.carrier or "Nieznany"}
                ],
                manager_focus=issue.severity in {"critical", "blocked"},
            )
        )

    for base in base_alerts:
        if base.id.startswith("idle-"):
            alerts.append(
                _alert(
                    alert_id=base.id,
                    level=base.level,
                    title="Operator nieaktywny zbyt długo",
                    category="Operatorzy",
                    priority_group="requires_action" if base.level == "warning" else "critical_now",
                    description=base.message,
                    responsible_area=base.area or "Kierownik zmiany",
                    recommended_action="Sprawdź, czy operator zakończył zadanie albo wymaga przełączenia na inną kolejkę.",
                    now=now,
                    impact=[{"label": "Bezczynność", "value": _minutes_label(base.minutes_ago), "tone": "amber" if base.level == "warning" else "red"}],
                    actions=[{"label": "Zobacz operatorów", "action_type": "switch_tab", "target_tab": "operators", "tone": "secondary"}],
                    manager_focus=base.level == "critical",
                )
            )

    severity_order = {"critical_now": 0, "requires_action": 1, "informational": 2}
    level_order = {"critical": 0, "warning": 1, "info": 2}
    alerts = sorted(alerts, key=lambda a: (severity_order.get(a.priority_group, 9), level_order.get(a.level, 9), not a.manager_focus))
    focus_count = 0
    for alert in alerts:
        if alert.manager_focus:
            focus_count += 1
            alert.manager_focus = focus_count <= 5
    return alerts[:40]
