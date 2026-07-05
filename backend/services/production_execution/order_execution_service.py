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
from .execution_interface import ERP_INTERFACE, WMS_INTERFACE, is_erp_interface, normalized_execution_interface
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
    if is_erp_interface(order):
        raise ProductionOrderError(
            "Zlecenie jest w interfejsie ERP. Użyj realizacji w ERP.",
            code="erp_interface",
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
    if not is_erp_interface(order) and getattr(order, "released_to_wms_at", None) is None:
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
    tasks = [CollectionTaskRead(**t) for t in tasks_raw]
    done = sum(1 for t in tasks if t.collected_qty >= t.required_qty - 1e-6)
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
    found = False
    for t in data.get("tasks") or []:
        if str(t.get("task_key")) == str(body.task_key) or str(t.get("component_product_id")) == str(body.task_key):
            t["collected_qty"] = round(float(body.collected_qty), 4)
            if body.location_id is not None and int(body.location_id) > 0:
                t["selected_location_id"] = int(body.location_id)
                t["location_id"] = int(body.location_id)
            if body.batch_number is not None:
                t["selected_batch_number"] = str(body.batch_number).strip()
            if body.lot is not None:
                t["selected_lot"] = str(body.lot).strip()
            if body.serial_number is not None:
                t["selected_serial_number"] = str(body.serial_number).strip()
            found = True
            break
    if not found:
        raise ProductionOrderError("Zadanie zbierania nie istnieje.", code="task_not_found")
    order.collection_state_json = json.dumps(data, ensure_ascii=False)
    order.updated_at = datetime.utcnow()
    if getattr(order, "materials_reserved", False) and is_erp_interface(order):
        from ..reservations.reservation_service import sync_production_reservation_from_collection_task

        task_pid = int(body.task_key) if str(body.task_key).isdigit() else 0
        for t in data.get("tasks") or []:
            if str(t.get("task_key")) == str(body.task_key) or str(t.get("component_product_id")) == str(body.task_key):
                task_pid = int(t.get("component_product_id") or task_pid)
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
                break
    db.flush()
    return get_order_collection_state(db, tenant_id=tenant_id, order_id=order_id)


def _consume_order_materials(
    db: Session,
    order: ProductionOrder,
    *,
    component_allocations: list[ComponentAllocationWrite],
    performed_by_user_id: int | None,
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
        for loc_id, qty in allocs:
            meta = alloc_meta.get((snap_id, int(loc_id)))
            slices = consume_production_material_slices(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=int(snap.component_product_id),
                location_id=int(loc_id),
                quantity=float(qty),
                batch_number=(meta.batch_number or meta.lot) if meta else None,
                lot=meta.lot if meta else None,
                serial_number=meta.serial_number if meta else None,
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
                    product_id=int(snap.component_product_id),
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
    snap_by_product = {int(s.component_product_id): int(s.id) for s in order.line_snapshots or []}
    allocs: list[ComponentAllocationWrite] = []
    for t in state.tasks:
        loc_id = int(t.selected_location_id or t.location_id or 0)
        if loc_id > 0 and t.collected_qty > 0:
            snap_id = snap_by_product.get(int(t.component_product_id))
            if snap_id is None:
                continue
            allocs.append(
                ComponentAllocationWrite(
                    line_snapshot_id=snap_id,
                    location_id=loc_id,
                    quantity=float(t.collected_qty),
                    batch_number=getattr(t, "selected_batch_number", None),
                    lot=getattr(t, "selected_lot", None),
                    serial_number=getattr(t, "selected_serial_number", None),
                )
            )
    _consume_order_materials(db, order, component_allocations=allocs, performed_by_user_id=performed_by_user_id)
    from ..reservations.reservation_service import consume_production_reservations

    consume_production_reservations(db, tenant_id=int(tenant_id), production_order_id=int(order_id))
    order.status = "in_progress"
    order.collecting_completed_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    db.flush()
    return serialize_order(db, order, with_availability=False)


def update_order_production_progress(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    body: OrderProductionProgressBody,
):
    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) != "in_progress":
        raise ProductionOrderError("Zlecenie nie jest w produkcji.", code="invalid_status")
    new_qty = float(order.produced_quantity or 0) + float(body.add_quantity)
    if new_qty > float(order.planned_quantity) + 1e-6:
        raise ProductionOrderError("Przekroczono planowaną ilość.", code="over_production")
    order.produced_quantity = round(new_qty, 4)
    order.updated_at = datetime.utcnow()
    db.flush()
    return serialize_order(db, order, with_availability=False)


def finish_order_production(db: Session, *, tenant_id: int, order_id: int):
    from .pw_putaway_handoff import create_order_pw_document_for_putaway

    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) != "in_progress":
        raise ProductionOrderError("Zlecenie nie jest w produkcji.", code="invalid_status")
    if float(order.produced_quantity or 0) < float(order.planned_quantity) - 1e-6:
        raise ProductionOrderError("Nie wyprodukowano planowanej ilości.", code="production_incomplete")
    create_order_pw_document_for_putaway(db, order=order, performed_by_user_id=None)
    order.status = "awaiting_putaway"
    order.production_completed_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    db.flush()
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
