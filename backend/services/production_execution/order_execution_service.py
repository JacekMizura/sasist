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
        allocs = list(line.auto_allocation or [])
        if not allocs and line.suggested_locations:
            for s in line.suggested_locations[:3]:
                qty = float(s.auto_pick_qty or s.available or line.required)
                if qty <= 0:
                    continue
                allocs.append(
                    type("_A", (), {"location_id": int(s.location_id), "location_code": str(s.code), "quantity": qty})()
                )
        if not allocs:
            allocs = [
                type("_A", (), {"location_id": 0, "location_code": "MAG", "quantity": float(line.required)})()
            ]
        for alloc in allocs:
            tasks.append(
                build_collection_task_row(
                    component_product_id=pid,
                    product_name=str(line.product_name),
                    product_sku=line.product_sku,
                    product=p,
                    location_id=int(alloc.location_id),
                    location_code=str(alloc.location_code),
                    required_qty=float(alloc.quantity),
                    suggested_locations=list(line.suggested_locations or []),
                    warehouse_available=float(line.available),
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
    shortages = validate_stock_shortages(db, order)
    if shortages:
        raise ProductionOrderError(
            "Nie można wydać do WMS — braki materiałów.",
            code="insufficient_stock",
            shortages=[s.model_dump() for s in shortages],
        )
    order.released_to_wms_at = datetime.utcnow()
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
    if getattr(order, "released_to_wms_at", None) is None:
        raise ProductionOrderError(
            "Zlecenie nie zostało wydane do WMS. Użyj akcji „Wydaj do WMS” w ERP.",
            code="not_released",
        )
    state = _init_order_collection_tasks(db, order)
    order.collection_state_json = json.dumps(state, ensure_ascii=False)
    order.status = "collecting"
    order.started_at = order.started_at or datetime.utcnow()
    order.updated_at = datetime.utcnow()
    db.flush()
    return serialize_order(db, order, with_availability=True)


def get_order_collection_state(db: Session, *, tenant_id: int, order_id: int) -> OrderCollectionStateRead:
    from .collection_task_builder import enrich_collection_tasks

    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    raw = getattr(order, "collection_state_json", None)
    tasks_raw: list[dict[str, Any]] = []
    if raw:
        try:
            tasks_raw = json.loads(str(raw)).get("tasks") or []
        except json.JSONDecodeError:
            tasks_raw = []
    tasks_raw = enrich_collection_tasks(db, tasks_raw)
    tasks = [CollectionTaskRead(**t) for t in tasks_raw]
    done = sum(1 for t in tasks if t.collected_qty >= t.required_qty - 1e-6)
    total = len(tasks)
    pct = round(100.0 * done / total, 1) if total else 0.0
    return OrderCollectionStateRead(
        order_id=int(order.id),
        status=str(order.status),
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
        if str(t.get("task_key")) == str(body.task_key):
            t["collected_qty"] = round(float(body.collected_qty), 4)
            found = True
            break
    if not found:
        raise ProductionOrderError("Zadanie zbierania nie istnieje.", code="task_not_found")
    order.collection_state_json = json.dumps(data, ensure_ascii=False)
    order.updated_at = datetime.utcnow()
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
        for loc_id, qty in allocs:
            slices = consume_inventory_fifo_slices(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=int(snap.component_product_id),
                location_id=int(loc_id),
                quantity=float(qty),
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
        if t.location_id > 0 and t.collected_qty > 0:
            snap_id = snap_by_product.get(int(t.component_product_id))
            if snap_id is None:
                continue
            allocs.append(
                ComponentAllocationWrite(
                    line_snapshot_id=snap_id,
                    location_id=int(t.location_id),
                    quantity=float(t.collected_qty),
                )
            )
    _consume_order_materials(db, order, component_allocations=allocs, performed_by_user_id=performed_by_user_id)
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
    order.status = "completed"
    order.production_completed_at = datetime.utcnow()
    order.completed_at = datetime.utcnow()
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
    from ...schemas.production import ProductionCompleteResultRead

    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) != "putaway":
        raise ProductionOrderError("Zlecenie nie jest w fazie odkładania.", code="invalid_status")
    target_loc = int(body.target_location_id)
    order.location_id = target_loc
    produced = float(order.produced_quantity or order.planned_quantity)
    rw_doc = (
        db.query(StockDocument).filter(StockDocument.id == int(order.rw_stock_document_id)).first()
        if order.rw_stock_document_id
        else None
    )
    total_component_cost = 0.0
    if rw_doc is not None:
        for item in rw_doc.items or []:
            total_component_cost += float(item.purchase_price_net or 0) * float(item.quantity or 0)
    unit_cost = total_component_cost / produced if produced > 1e-9 else 0.0
    pw_doc = _create_production_stock_document(
        db,
        order=order,
        document_type="PW",
        location_id=target_loc,
        created_by_user_id=performed_by_user_id,
    )
    fg_line = StockDocumentItem(
        document_id=int(pw_doc.id),
        product_id=int(order.product_id),
        ordered_quantity=produced,
        received_quantity=produced,
        quantity=produced,
        purchase_price_net=unit_cost,
        batch_number="",
        expiry_date=date(9999, 12, 31),
    )
    db.add(fg_line)
    db.flush()
    upsert_dock_inventory_for_loose_receipt(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        location_id=target_loc,
        product_id=int(order.product_id),
        add_qty=float(produced),
        batch_number="",
        expiry_date=NO_EXPIRY_SENTINEL,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    append_receipt_operation(db, pw_doc, fg_line, float(produced))
    order.calculated_unit_cost = round(unit_cost, 4)
    order.pw_stock_document_id = int(pw_doc.id)
    order.status = "completed"
    order.completed_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    prod = db.query(Product).filter(Product.id == int(order.product_id)).first()
    if prod is not None and unit_cost > 0:
        prod.purchase_price = float(unit_cost)
        prod.updated_at = datetime.utcnow()
    db.flush()
    comp_total = round(total_component_cost, 4)
    return ProductionCompleteResultRead(
        order=serialize_order(db, order, with_availability=False),
        rw_stock_document_id=order.rw_stock_document_id,
        pw_stock_document_id=int(pw_doc.id),
        rw_document_number=_document_number(db, order.rw_stock_document_id),
        pw_document_number=_document_number(db, int(pw_doc.id)),
        calculated_unit_cost=round(unit_cost, 4),
        component_total_cost=comp_total,
    )
