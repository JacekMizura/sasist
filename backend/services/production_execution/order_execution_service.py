"""MO (production order) WMS phased execution — mirror of batch terminal flow."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.production import ProductionOrder
from ...models.stock_document import StockDocument, StockDocumentItem
from ...schemas.production import ComponentAllocationWrite
from ...schemas.production_batch import BatchCollectionUpdateBody, CollectionTaskRead
from ...schemas.production_execution import OrderCollectionStateRead, OrderProductionProgressBody, OrderPutawayBody
from ..inventory_carrier_ops import upsert_dock_inventory_for_loose_receipt
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL
from ..order_item_pick_allocation_service import consume_inventory_fifo_slices
from .execution_interface import WMS_INTERFACE, is_non_wms_execution
from .material_consume_service import consume_production_material_slices
from ..product_cost_service import get_product_current_cost
from ..production_order_service import (
    ProductionOrderError,
    _create_production_stock_document,
    _document_number,
    _resolve_component_allocations,
    serialize_order,
    validate_stock_shortages,
)
from ..production_pick_service import build_production_pick_plan
from ..stock_disposition import STOCK_DISPOSITION_SALEABLE
from ..stock_operation_issue_service import append_issue_operation
from ..stock_operation_receipt_service import append_receipt_operation
from .constants import TERMINAL_EXECUTION_STATUSES

logger = logging.getLogger(__name__)


def _mo_activity_label(order: ProductionOrder) -> str:
    num = getattr(order, "number", None) or getattr(order, "document_number", None)
    return str(num).strip() if num else f"MO-{int(order.id)}"


def _load_order(db: Session, *, tenant_id: int, order_id: int) -> ProductionOrder:
    order = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise ProductionOrderError("Zlecenie produkcyjne nie istnieje.", code="not_found")
    return order


def _order_component_totals(order: ProductionOrder) -> dict[int, float]:
    totals: dict[int, float] = {}
    for snap in order.line_snapshots or []:
        pid = int(snap.component_product_id)
        totals[pid] = totals.get(pid, 0.0) + float(snap.total_required_quantity or 0)
    return totals


def _init_order_collection_tasks(db: Session, order: ProductionOrder) -> dict[str, Any]:
    from ...services.production_execution.collection_task_builder import build_collection_task_row

    plan = build_production_pick_plan(db, tenant_id=int(order.tenant_id), order_id=int(order.id))
    if plan.has_shortages:
        raise ProductionOrderError(
            "Niewystarczający stan magazynowy składników.",
            code="insufficient_stock",
            shortages=[s.model_dump() for s in plan.shortages],
        )
    pids = {int(ln.component_product_id) for ln in plan.lines}
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()} if pids else {}
    tasks: list[dict[str, Any]] = []
    for line in plan.lines:
        pid = int(line.component_product_id)
        p = products.get(pid)
        tasks.append(
            build_collection_task_row(
                component_product_id=pid,
                product_name=str(line.product_name),
                product_sku=line.product_sku,
                product=p,
                required_qty=float(line.required),
            )
        )
    return {"tasks": tasks}


def release_order_to_wms(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    released_by_user_id: int | None = None,
):
    from ...schemas.production import ProductionOrderRead

    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) not in ("draft", "planned"):
        raise ProductionOrderError(
            "Wydanie do WMS możliwe tylko dla zleceń zaplanowanych.",
            code="invalid_status",
        )
    if getattr(order, "released_to_wms_at", None) is not None:
        return serialize_order(db, order, with_availability=True)
    if is_non_wms_execution(order):
        raise ProductionOrderError(
            "Zlecenie jest w interfejsie poza terminalem WMS.",
            code="non_wms_interface",
        )
    shortages = validate_stock_shortages(db, order)
    if shortages:
        raise ProductionOrderError(
            "Nie można wydać do WMS — braki materiałów.",
            code="insufficient_stock",
            shortages=[s.model_dump() for s in shortages],
        )
    order.released_to_wms_at = datetime.utcnow()
    order.execution_interface = WMS_INTERFACE
    order.released_by_user_id = int(released_by_user_id) if released_by_user_id else None
    order.updated_at = datetime.utcnow()
    db.flush()
    try:
        from .production_domain_activity import emit_production_released

        emit_production_released(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
            production_order_id=int(order.id),
            actor_user_id=int(released_by_user_id) if released_by_user_id else None,
            label=_mo_activity_label(order),
        )
    except Exception:
        logger.exception("production activity RELEASED failed order_id=%s", order.id)
    logger.info("[production.release_wms] order_id=%s released_by=%s", order.id, released_by_user_id)
    return serialize_order(db, order, with_availability=True)


def start_order_collecting(db: Session, *, tenant_id: int, order_id: int):
    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) in TERMINAL_EXECUTION_STATUSES:
        raise ProductionOrderError("Zlecenie jest zamknięte.", code="terminal_status")
    if str(order.status) == "collecting":
        return serialize_order(db, order, with_availability=True)
    if str(order.status) not in ("draft", "planned"):
        raise ProductionOrderError("Nie można rozpocząć zbierania w tym statusie.", code="invalid_status")
    if not is_non_wms_execution(order) and getattr(order, "released_to_wms_at", None) is None:
        raise ProductionOrderError(
            "Zlecenie nie zostało wydane do WMS. Użyj akcji „Wydaj do WMS” w ERP.",
            code="not_released",
        )
    state = _init_order_collection_tasks(db, order)
    order.collection_state_json = json.dumps(state, ensure_ascii=False)
    order.status = "collecting"
    order.started_at = order.started_at or datetime.utcnow()
    from ..reservations.reservation_service import lock_production_reservations

    lock_production_reservations(db, tenant_id=int(order.tenant_id), production_order_id=int(order.id))
    order.updated_at = datetime.utcnow()
    db.flush()
    try:
        from .production_domain_activity import emit_production_collection_started

        emit_production_collection_started(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
            production_order_id=int(order.id),
            label=_mo_activity_label(order),
        )
    except Exception:
        logger.exception("production activity COLLECTION_STARTED failed order_id=%s", order.id)
    return serialize_order(db, order, with_availability=True)


def get_order_collection_state(db: Session, *, tenant_id: int, order_id: int) -> OrderCollectionStateRead:
    from .collection_location_service import preferred_location_ids_from_plan_rows
    from .collection_task_builder import hydrate_collection_tasks

    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    raw = getattr(order, "collection_state_json", None)
    tasks_raw: list[dict[str, Any]] = []
    if raw:
        try:
            tasks_raw = json.loads(str(raw)).get("tasks") or []
        except json.JSONDecodeError:
            tasks_raw = []
    plan = build_production_pick_plan(db, tenant_id=int(order.tenant_id), order_id=int(order.id))
    pref_by_product = {
        int(ln.component_product_id): preferred_location_ids_from_plan_rows([ln]) for ln in plan.lines
    }
    tasks_raw = hydrate_collection_tasks(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        tasks_raw=tasks_raw,
        preferred_by_product=pref_by_product,
        exclude_production_order_id=int(order.id),
    )
    if getattr(order, "materials_reserved", False):
        from ..reservations.reservation_service import reservations_to_collection_hints

        hints = reservations_to_collection_hints(
            db, tenant_id=int(order.tenant_id), production_order_id=int(order.id)
        )
        for t in tasks_raw:
            pid = int(t.get("component_product_id") or 0)
            rows = hints.get(pid) or []
            if not rows:
                continue
            if not t.get("selected_location_id"):
                first = rows[0]
                t["selected_location_id"] = int(first["location_id"])
                t["location_id"] = int(first["location_id"])
                t["location_code"] = str(first.get("location_code") or "")
                t["selected_batch_number"] = first.get("batch_number")
                t["selected_lot"] = first.get("lot")
                t["selected_serial_number"] = first.get("serial_number")
            pref = pref_by_product.setdefault(pid, set())
            for r in rows:
                pref.add(int(r["location_id"]))
    from .collection_pick_commit_service import sync_collected_from_events, task_is_collection_complete

    safe_tasks: list[dict[str, Any]] = []
    for t in tasks_raw:
        sync_collected_from_events(t)
        req = float(t.get("required_qty") or 0)
        t["remaining_qty"] = round(max(0.0, req - float(t.get("collected_qty") or 0)), 4)
        row = dict(t)
        events = []
        for ev in row.get("pick_events") or []:
            if not isinstance(ev, dict):
                continue
            events.append(
                {
                    "event_id": str(ev.get("event_id") or ""),
                    "location_id": int(ev.get("location_id") or 0),
                    "location_code": str(ev.get("location_code") or ""),
                    "quantity": float(ev.get("quantity") or 0),
                    "system_available_qty": ev.get("system_available_qty"),
                    "suggested_qty": ev.get("suggested_qty"),
                    "discrepancy": float(ev.get("discrepancy") or 0),
                    "picked_at": ev.get("picked_at"),
                }
            )
        row["pick_events"] = events
        row.pop("picked_slices", None)
        safe_tasks.append(row)
    tasks = [CollectionTaskRead(**t) for t in safe_tasks]
    done = sum(1 for t in tasks if task_is_collection_complete(t))
    total = len(tasks)
    pct = round(100.0 * done / total, 1) if total else 0.0
    from .collection_job_header import build_order_collection_header

    return OrderCollectionStateRead(
        order_id=int(order.id),
        status=str(order.status),
        header=build_order_collection_header(db, order),
        tasks=tasks,
        collected_count=done,
        total_count=total,
        progress_percent=pct,
    )


def update_order_collection_task(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    body: BatchCollectionUpdateBody,
) -> OrderCollectionStateRead:
    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) != "collecting":
        raise ProductionOrderError("Zlecenie nie jest w fazie zbierania.", code="invalid_status")
    raw = getattr(order, "collection_state_json", None) or "{}"
    try:
        data = json.loads(str(raw))
    except json.JSONDecodeError:
        data = {"tasks": []}
    target_task: dict[str, Any] | None = None
    for t in data.get("tasks") or []:
        if str(t.get("task_key")) == str(body.task_key) or str(t.get("component_product_id")) == str(body.task_key):
            target_task = t
            break
    if target_task is None:
        raise ProductionOrderError("Zadanie zbierania nie istnieje.", code="task_not_found")

    action = str(getattr(body, "action", None) or "confirm_pick").strip().lower()
    if action == "report_shortage":
        from .collection_pick_commit_service import report_collection_shortage

        report_collection_shortage(target_task)
        order.collection_state_json = json.dumps(data, ensure_ascii=False)
        order.updated_at = datetime.utcnow()
        db.flush()
        return get_order_collection_state(db, tenant_id=tenant_id, order_id=order_id)

    if not is_non_wms_execution(order):
        from .collection_pick_commit_service import commit_collection_task_pick

        try:
            commit_collection_task_pick(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(order.warehouse_id),
                task=target_task,
                collected_qty=float(body.collected_qty),
                location_id=int(body.location_id) if body.location_id else None,
                batch_number=body.batch_number,
                lot=body.lot,
                serial_number=body.serial_number,
                exclude_production_order_id=int(order.id),
            )
        except ValueError as exc:
            raise ProductionOrderError(str(exc), code="insufficient_stock") from exc
    else:
        target_task["collected_qty"] = round(float(body.collected_qty), 4)
        if body.location_id is not None and int(body.location_id) > 0:
            target_task["selected_location_id"] = int(body.location_id)
            target_task["location_id"] = int(body.location_id)
        if body.batch_number is not None:
            target_task["selected_batch_number"] = str(body.batch_number).strip()
        if body.lot is not None:
            target_task["selected_lot"] = str(body.lot).strip()
        if body.serial_number is not None:
            target_task["selected_serial_number"] = str(body.serial_number).strip()

    order.collection_state_json = json.dumps(data, ensure_ascii=False)
    order.updated_at = datetime.utcnow()
    if getattr(order, "materials_reserved", False) and is_non_wms_execution(order):
        from ..reservations.reservation_service import (
            ReservationError,
            sync_production_reservation_from_collection_task,
        )

        task_pid = int(body.task_key) if str(body.task_key).isdigit() else 0
        task_pid = int(target_task.get("component_product_id") or task_pid)
        try:
            sync_production_reservation_from_collection_task(
                db,
                tenant_id=tenant_id,
                production_order_id=int(order_id),
                component_product_id=task_pid,
                location_id=int(body.location_id) if body.location_id else None,
                batch_number=body.batch_number,
                serial_number=body.serial_number,
                quantity=float(body.collected_qty),
                ignore_locked=True,
            )
        except ReservationError as exc:
            raise ProductionOrderError(str(exc), code=getattr(exc, "code", "reservation_error")) from exc
    db.flush()
    return get_order_collection_state(db, tenant_id=tenant_id, order_id=order_id)


def _consume_order_materials(
    db: Session,
    order: ProductionOrder,
    *,
    component_allocations: list[ComponentAllocationWrite],
    performed_by_user_id: int | None,
    committed_slices_by_product: dict[int, list[dict[str, Any]]] | None = None,
) -> StockDocument:
    if order.rw_stock_document_id:
        doc = db.query(StockDocument).filter(StockDocument.id == int(order.rw_stock_document_id)).first()
        if doc is not None:
            return doc
    alloc_map = _resolve_component_allocations(db, order, component_allocations=component_allocations)
    rw_doc = _create_production_stock_document(
        db,
        order=order,
        document_type="RW",
        location_id=None,
        created_by_user_id=performed_by_user_id,
    )
    for snap in order.line_snapshots or []:
        snap_id = int(snap.id)
        allocs = alloc_map.get(snap_id, [])
        if not allocs:
            continue
        line = StockDocumentItem(
            document_id=int(rw_doc.id),
            product_id=int(snap.component_product_id),
            ordered_quantity=sum(q for _, q in allocs),
            received_quantity=sum(q for _, q in allocs),
            quantity=sum(q for _, q in allocs),
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
        db.add(line)
        db.flush()
        unit_net = float(get_product_current_cost(db, int(order.tenant_id), int(snap.component_product_id)).get("purchase_net") or 0)
        line.purchase_price_net = unit_net
        consumed_total = 0.0
        alloc_meta = {(int(a.line_snapshot_id), int(a.location_id)): a for a in component_allocations}
        pid = int(snap.component_product_id)
        committed = (committed_slices_by_product or {}).get(pid)
        if committed:
            # Inventory already decremented at WMS confirm — post RW lines only.
            qty_sum = sum(q for _, q in allocs)
            committed_total = sum(float(s.get("quantity") or 0) for s in committed)
            if abs(committed_total - float(qty_sum)) > 1e-2:
                raise ProductionOrderError(
                    f"Zatwierdzone pobranie składnika #{pid} ({committed_total}) ≠ wymagane ({qty_sum}).",
                    code="allocation_mismatch",
                )
            for s in committed:
                loc_id = int(s.get("location_id") or 0)
                if loc_id <= 0:
                    continue
                exp_raw = s.get("expiry_date")
                try:
                    exp = date.fromisoformat(str(exp_raw)) if exp_raw else date(9999, 12, 31)
                except ValueError:
                    exp = date(9999, 12, 31)
                append_issue_operation(
                    db,
                    rw_doc,
                    line,
                    float(s.get("quantity") or 0),
                    from_location_id=loc_id,
                    batch_number=str(s.get("batch_number") or ""),
                    expiry_date=exp if exp < NO_EXPIRY_SENTINEL else None,
                    operator_admin_id=performed_by_user_id,
                    metadata={"production_order_id": int(order.id), "source_document_type": "RW"},
                )
                from .production_warehouse_audit import record_production_rw_issue_audit

                record_production_rw_issue_audit(
                    db,
                    rw_doc=rw_doc,
                    product_id=pid,
                    quantity=float(s.get("quantity") or 0),
                    from_location_id=loc_id,
                    performed_by_user_id=performed_by_user_id,
                )
                consumed_total += float(s.get("quantity") or 0)
            snap.consumed_quantity = float(consumed_total)
            continue
        for loc_id, qty in allocs:
            meta = alloc_meta.get((snap_id, int(loc_id)))
            slices = consume_production_material_slices(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=pid,
                location_id=int(loc_id),
                quantity=float(qty),
                batch_number=(meta.batch_number or meta.lot) if meta else None,
                lot=meta.lot if meta else None,
                serial_number=meta.serial_number if meta else None,
                exclude_production_order_id=int(order.id),
            )
            for sl in slices:
                append_issue_operation(
                    db,
                    rw_doc,
                    line,
                    float(sl.quantity),
                    from_location_id=int(loc_id),
                    batch_number=sl.batch_number or "",
                    expiry_date=sl.expiry_date if sl.expiry_date < NO_EXPIRY_SENTINEL else None,
                    operator_admin_id=performed_by_user_id,
                    metadata={"production_order_id": int(order.id), "source_document_type": "RW"},
                )
                from .production_warehouse_audit import record_production_rw_issue_audit

                record_production_rw_issue_audit(
                    db,
                    rw_doc=rw_doc,
                    product_id=pid,
                    quantity=float(sl.quantity),
                    from_location_id=int(loc_id),
                    performed_by_user_id=performed_by_user_id,
                )
                consumed_total += float(sl.quantity)
        snap.consumed_quantity = float(consumed_total)
    order.rw_stock_document_id = int(rw_doc.id)
    return rw_doc


def finish_order_collecting(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    performed_by_user_id: int | None = None,
):
    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) != "collecting":
        raise ProductionOrderError("Zlecenie nie jest w fazie zbierania.", code="invalid_status")
    state = get_order_collection_state(db, tenant_id=tenant_id, order_id=order_id)
    if state.collected_count < state.total_count:
        raise ProductionOrderError("Nie zebrano wszystkich materiałów.", code="collection_incomplete")

    raw = getattr(order, "collection_state_json", None) or "{}"
    try:
        raw_data = json.loads(str(raw))
    except json.JSONDecodeError:
        raw_data = {"tasks": []}
    raw_tasks = list(raw_data.get("tasks") or [])
    from .collection_pick_commit_service import (
        collection_tasks_have_committed_picks,
        parse_pick_events,
        slices_from_committed_tasks,
        sync_collected_from_events,
        task_is_collection_complete,
    )

    for t in raw_tasks:
        sync_collected_from_events(t)

    snap_by_product = {int(s.component_product_id): int(s.id) for s in order.line_snapshots or []}
    allocs: list[ComponentAllocationWrite] = []
    for t in raw_tasks:
        if not task_is_collection_complete(t):
            continue
        pid = int(t.get("component_product_id") or 0)
        snap_id = snap_by_product.get(pid)
        if snap_id is None:
            continue
        events = parse_pick_events(t.get("pick_events"))
        by_loc: dict[int, float] = {}
        if events:
            for ev in events:
                loc_id = int(ev.get("location_id") or 0)
                qty = float(ev.get("quantity") or 0)
                if loc_id > 0 and qty > 1e-9:
                    by_loc[loc_id] = by_loc.get(loc_id, 0.0) + qty
        else:
            loc_id = int(t.get("selected_location_id") or t.get("location_id") or 0)
            qty = float(t.get("collected_qty") or 0)
            if loc_id > 0 and qty > 1e-9:
                by_loc[loc_id] = qty
        for loc_id, qty in by_loc.items():
            allocs.append(
                ComponentAllocationWrite(
                    line_snapshot_id=snap_id,
                    location_id=int(loc_id),
                    quantity=float(qty),
                    batch_number=t.get("selected_batch_number"),
                    lot=t.get("selected_lot"),
                    serial_number=t.get("selected_serial_number"),
                )
            )
    use_committed = collection_tasks_have_committed_picks(raw_tasks)
    _consume_order_materials(
        db,
        order,
        component_allocations=allocs,
        performed_by_user_id=performed_by_user_id,
        committed_slices_by_product=(
            slices_from_committed_tasks(raw_tasks) if use_committed else None
        ),
    )
    from ..reservations.reservation_service import consume_production_reservations

    consume_production_reservations(db, tenant_id=int(tenant_id), production_order_id=int(order_id))
    order.status = "in_progress"
    order.collecting_completed_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    db.flush()
    try:
        from .production_domain_activity import (
            emit_production_collection_completed,
            emit_production_rw_created,
            emit_production_started,
        )

        lbl = _mo_activity_label(order)
        emit_production_collection_completed(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
            production_order_id=int(order.id),
            actor_user_id=performed_by_user_id,
            label=lbl,
        )
        if order.rw_stock_document_id:
            rw = db.query(StockDocument).filter(StockDocument.id == int(order.rw_stock_document_id)).first()
            emit_production_rw_created(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
                stock_document_id=int(order.rw_stock_document_id),
                document_number=str(getattr(rw, "document_number", None) or "") or None,
                production_order_id=int(order.id),
                product_id=int(order.product_id) if order.product_id else None,
                actor_user_id=performed_by_user_id,
                label=lbl,
            )
        emit_production_started(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
            production_order_id=int(order.id),
            actor_user_id=performed_by_user_id,
            label=lbl,
        )
    except Exception:
        logger.exception("production activity after collecting failed order_id=%s", order.id)
    return serialize_order(db, order, with_availability=False)


def update_order_production_progress(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    body: OrderProductionProgressBody,
    performed_by_user_id: int | None = None,
):
    from ...models.production import PRODUCTION_ORDER_SOURCE_ORDERS
    from .orders_fg_fulfillment_service import (
        allocate_produced_delta_to_order_sources,
        receive_orders_mo_fg_to_buffer,
        resolve_orders_mo_buffer_location_id,
    )

    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) != "in_progress":
        raise ProductionOrderError("Zlecenie nie jest w produkcji.", code="invalid_status")
    add_qty = float(body.add_quantity)
    new_qty = float(order.produced_quantity or 0) + add_qty
    if new_qty > float(order.planned_quantity) + 1e-6:
        raise ProductionOrderError("Przekroczono planowaną ilość.", code="over_production")
    order.produced_quantity = round(new_qty, 4)
    order.updated_at = datetime.utcnow()
    db.flush()
    try:
        from .production_domain_activity import emit_production_progress_reported

        emit_production_progress_reported(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
            production_order_id=int(order.id),
            product_id=int(order.product_id) if order.product_id else None,
            qty=add_qty,
            actor_user_id=performed_by_user_id,
            label=_mo_activity_label(order),
            correlation_suffix=f"produced:{round(new_qty, 4)}",
        )
    except Exception:
        logger.exception("production activity PROGRESS failed order_id=%s", order.id)

    if str(getattr(order, "source_type", "") or "") == PRODUCTION_ORDER_SOURCE_ORDERS:
        buffer_id = resolve_orders_mo_buffer_location_id(db, order)
        receive_orders_mo_fg_to_buffer(
            db,
            mo=order,
            add_quantity=add_qty,
            performed_by_user_id=performed_by_user_id,
        )
        alloc = allocate_produced_delta_to_order_sources(
            db,
            mo=order,
            delta_qty=add_qty,
            operator_user_id=performed_by_user_id,
            buffer_location_id=buffer_id,
        )
        from .production_packing_handoff_service import resolve_after_production_action
        from ...schemas.production import ProductionPackingHandoffHint, ProductionPackingHandoffOrder

        after_action = resolve_after_production_action(db, order)
        moves = list(alloc.get("status_moves") or [])
        out = serialize_order(db, order, with_availability=False, with_order_sources=True)
        hint = ProductionPackingHandoffHint(
            after_production_action=after_action,  # type: ignore[arg-type]
            newly_ready_orders=[
                ProductionPackingHandoffOrder(
                    order_id=int(m["order_id"]),
                    order_number=str(m.get("order_number") or m["order_id"]),
                )
                for m in moves
            ],
        )
        if hasattr(out, "model_copy"):
            return out.model_copy(update={"packing_handoff": hint})
        # Lean tests may stub serialize_order → ORM entity; packing_handoff is FE-only.
        return out

    return serialize_order(db, order, with_availability=False, with_order_sources=True)


def finish_order_production(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    performed_by_user_id: int | None = None,
):
    from ...models.production import PRODUCTION_ORDER_SOURCE_ORDERS
    from .orders_fg_fulfillment_service import complete_orders_mo_without_putaway
    from .pw_putaway_handoff import create_order_pw_document_for_putaway

    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) != "in_progress":
        raise ProductionOrderError("Zlecenie nie jest w produkcji.", code="invalid_status")
    if float(order.produced_quantity or 0) < float(order.planned_quantity) - 1e-6:
        raise ProductionOrderError("Nie wyprodukowano planowanej ilości.", code="production_incomplete")

    if str(getattr(order, "source_type", "") or "") == PRODUCTION_ORDER_SOURCE_ORDERS:
        # Progressive buffer PW already created on progress — ensure present, then complete.
        if not getattr(order, "pw_stock_document_id", None):
            from .orders_fg_fulfillment_service import receive_orders_mo_fg_to_buffer

            receive_orders_mo_fg_to_buffer(
                db,
                mo=order,
                add_quantity=float(order.produced_quantity or 0),
                performed_by_user_id=performed_by_user_id,
            )
        complete_orders_mo_without_putaway(db, mo=order)
        try:
            from .production_domain_activity import emit_production_completed

            emit_production_completed(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
                production_order_id=int(order.id),
                actor_user_id=performed_by_user_id,
                label=_mo_activity_label(order),
            )
        except Exception:
            logger.exception("production activity COMPLETED (orders) failed order_id=%s", order.id)
        return serialize_order(db, order, with_availability=False, with_order_sources=True)

    create_order_pw_document_for_putaway(db, order=order, performed_by_user_id=performed_by_user_id)
    order.status = "awaiting_putaway"
    order.production_completed_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    db.flush()
    try:
        from .production_domain_activity import emit_production_pw_created

        pw = (
            db.query(StockDocument).filter(StockDocument.id == int(order.pw_stock_document_id)).first()
            if order.pw_stock_document_id
            else None
        )
        if order.pw_stock_document_id:
            emit_production_pw_created(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
                stock_document_id=int(order.pw_stock_document_id),
                document_number=str(getattr(pw, "document_number", None) or "") or None,
                production_order_id=int(order.id),
                product_id=int(order.product_id) if order.product_id else None,
                actor_user_id=performed_by_user_id,
                label=_mo_activity_label(order),
            )
    except Exception:
        logger.exception("production activity PW_CREATED failed order_id=%s", order.id)
    return serialize_order(db, order, with_availability=False)


def finish_order_putaway(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    body: OrderPutawayBody,
    performed_by_user_id: int | None = None,
):
    del db, tenant_id, order_id, body, performed_by_user_id
    raise ProductionOrderError(
        "Użyj modułu Rozlokowanie (WMS) dla dokumentów PW.",
        code="deprecated_path",
    )
