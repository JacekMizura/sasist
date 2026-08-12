"""Order-driven MO: allocate produced units to sources, buffer PW, status_after.

Phase 4 — progressive source fulfillment + FG buffer receipt (skip Rozlokowanie).
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.fulfillment_event import FE_PICK
from ...models.location import Location
from ...models.order import Order
from ...models.order_item_pick_allocation import OrderItemPickAllocation
from ...models.picking_config import PickingConfig
from ...models.product import Product
from ...models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED,
    PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED,
    PRODUCTION_ORDER_SOURCE_ITEM_OPEN,
    PRODUCTION_ORDER_SOURCE_ITEM_PARTIAL,
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderSourceItem,
)
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.warehouse import Warehouse
from ..document_number_service import assign_series_number_to_stock_document, require_warehouse_series
from ..fulfillment_event_service import append_event
from ..inventory_carrier_ops import upsert_dock_inventory_for_loose_receipt
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL
from ..order_panel_ui_status_service import apply_order_panel_ui_status
from ..production_order_service import ProductionOrderError
from ..production_order_trigger.material_validation_service import (
    sort_source_items_for_material_allocation,
)
from ..stock_disposition import STOCK_DISPOSITION_SALEABLE
from ..stock_operation_receipt_service import append_receipt_operation
from ..wms_audit_service import append_order_activity_for_wms

logger = logging.getLogger(__name__)

_FULFILLABLE_SOURCE_STATUSES = frozenset(
    {
        PRODUCTION_ORDER_SOURCE_ITEM_OPEN,
        PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
        PRODUCTION_ORDER_SOURCE_ITEM_PARTIAL,
        PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED,
    }
)


def _log_order(
    db: Session,
    *,
    order: Order,
    event_type: str,
    message: str,
    operator_user_id: Optional[int],
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    wid = int(getattr(order, "warehouse_id", 0) or 0)
    if wid <= 0:
        return
    try:
        nested = db.begin_nested()
        try:
            append_order_activity_for_wms(
                db,
                order_id=int(order.id),
                tenant_id=int(order.tenant_id),
                warehouse_id=wid,
                event_type=event_type,
                message=message,
                operator_user_id=operator_user_id,
                metadata=metadata,
            )
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        logger.exception("orders FG fulfillment log failed order_id=%s", getattr(order, "id", None))


def resolve_orders_mo_buffer_location_id(db: Session, mo: ProductionOrder) -> int:
    """Buffer from MO snapshot (location_id) or linked picking_config — MO context is SSOT."""
    if getattr(mo, "location_id", None):
        lid = int(mo.location_id)
        loc = db.query(Location).filter(Location.id == lid).first()
        if loc is None:
            raise ProductionOrderError(
                "Lokalizacja buforowa zlecenia nie istnieje.",
                code="missing_buffer_location",
            )
        return lid

    pc_id = getattr(mo, "picking_config_id", None)
    if pc_id is None:
        raise ProductionOrderError(
            "Brak lokalizacji buforowej produktu gotowego dla zlecenia z zamówień.",
            code="missing_buffer_location",
        )
    pc = db.query(PickingConfig).filter(PickingConfig.id == int(pc_id)).first()
    if pc is None or getattr(pc, "finished_goods_buffer_location_id", None) is None:
        raise ProductionOrderError(
            "Brak lokalizacji buforowej produktu gotowego w konfiguracji produkcji.",
            code="missing_buffer_location",
        )
    lid = int(pc.finished_goods_buffer_location_id)
    loc = db.query(Location).filter(Location.id == lid).first()
    if loc is None:
        raise ProductionOrderError(
            "Lokalizacja buforowa z konfiguracji nie istnieje.",
            code="missing_buffer_location",
        )
    return lid


def resolve_status_after_production_id(db: Session, mo: ProductionOrder) -> int:
    pc_id = getattr(mo, "picking_config_id", None)
    if pc_id is None:
        raise ProductionOrderError(
            "Brak konfiguracji produkcyjnej na zleceniu.",
            code="missing_picking_config",
        )
    pc = db.query(PickingConfig).filter(PickingConfig.id == int(pc_id)).first()
    if pc is None:
        raise ProductionOrderError(
            "Konfiguracja produkcyjna zlecenia nie istnieje.",
            code="missing_picking_config",
        )
    after_id = getattr(pc, "status_after_production_id", None)
    if after_id is None:
        raise ProductionOrderError(
            "Brak statusu po produkcji w konfiguracji.",
            code="missing_status_after_production",
        )
    after_id = int(after_id)
    entry_id = getattr(mo, "production_source_status_id", None)
    if entry_id is not None and int(entry_id) == after_id:
        raise ProductionOrderError(
            "Status po produkcji nie może być tym samym statusem wejściowym produkcji.",
            code="invalid_status_after_production",
        )
    source_status = getattr(pc, "source_status_id", None)
    if source_status is not None and int(source_status) == after_id:
        raise ProductionOrderError(
            "Status po produkcji nie może ponownie uruchamiać trybu produkcji.",
            code="invalid_status_after_production",
        )
    return after_id


def sum_source_fulfilled_quantity(sources: list[ProductionOrderSourceItem]) -> float:
    return sum(
        float(s.fulfilled_quantity or 0)
        for s in sources
        if str(s.status or "") != PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
        and str(s.status or "") != PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED
    )


def assert_fulfilled_vs_produced_invariant(mo: ProductionOrder, sources: list[ProductionOrderSourceItem]) -> None:
    ful = sum_source_fulfilled_quantity(sources)
    produced = float(mo.produced_quantity or 0)
    if ful > produced + 1e-6:
        raise ProductionOrderError(
            f"Niespójność: fulfilled ({ful:g}) > produced ({produced:g}).",
            code="fulfilled_exceeds_produced",
        )


def _credit_packing_artifacts(
    db: Session,
    *,
    mo: ProductionOrder,
    src: ProductionOrderSourceItem,
    buffer_location_id: int,
    credit_qty: float,
) -> None:
    """Make packing see produced qty on buffer (FE_PICK finalized + pick allocation)."""
    if credit_qty <= 1e-9:
        return
    append_event(
        db,
        order_item_id=int(src.order_item_id),
        event_type=FE_PICK,
        quantity=float(credit_qty),
        metadata={
            "finalized": True,
            "source": "production_order",
            "production_order_id": int(mo.id),
            "production_order_source_item_id": int(src.id),
            "location_id": int(buffer_location_id),
        },
    )
    db.add(
        OrderItemPickAllocation(
            tenant_id=int(mo.tenant_id),
            warehouse_id=int(mo.warehouse_id),
            order_id=int(src.order_id),
            order_item_id=int(src.order_item_id),
            product_id=int(src.product_id),
            pick_id=None,
            location_id=int(buffer_location_id),
            batch_number="",
            expiry_date=date(9999, 12, 31),
            serial_number="",
            warehouse_carrier_id=None,
            quantity=float(credit_qty),
            picked_by=None,
            picked_at=datetime.utcnow(),
        )
    )


def allocate_produced_delta_to_order_sources(
    db: Session,
    *,
    mo: ProductionOrder,
    delta_qty: float,
    operator_user_id: Optional[int] = None,
    buffer_location_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Assign newly produced units to sources (priority / oldest). Whole units per source step.
    Moves fully fulfilled sales orders to status_after_production_id (skip production trigger).
    """
    if str(getattr(mo, "source_type", "") or "") != PRODUCTION_ORDER_SOURCE_ORDERS:
        return {"result": "SKIPPED", "reason": "not_orders"}
    delta = float(delta_qty or 0)
    if delta <= 1e-9:
        return {"result": "SKIPPED", "reason": "zero_delta"}

    sources = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.production_order_id == int(mo.id))
        .order_by(ProductionOrderSourceItem.id.asc())
        .all()
    )
    candidates = [s for s in sources if str(s.status or "") in _FULFILLABLE_SOURCE_STATUSES]
    order_ids = {int(s.order_id) for s in candidates}
    orders_by_id = {
        int(o.id): o for o in db.query(Order).filter(Order.id.in_(order_ids)).all()
    } if order_ids else {}

    ordered = sort_source_items_for_material_allocation(candidates, orders_by_id)
    remaining = delta
    newly_fulfilled_order_ids: list[int] = []
    allocations: list[dict[str, Any]] = []
    now = datetime.utcnow()

    # Resolve once — required before any full fulfillment can move orders.
    after_status_id = resolve_status_after_production_id(db, mo)

    for src in ordered:
        if remaining <= 1e-9:
            break
        requested = float(src.requested_quantity or 0)
        fulfilled = float(src.fulfilled_quantity or 0)
        need = max(0.0, requested - fulfilled)
        if need <= 1e-9:
            continue
        take = min(need, remaining)
        # Whole-unit assignment: do not split a fractional remainder across sources when
        # reporting integer production steps — floor take when both sides are whole-ish.
        if abs(take - round(take)) < 1e-9 and abs(remaining - round(remaining)) < 1e-9:
            take = float(int(round(take)))
        if take <= 1e-9:
            continue

        src.fulfilled_quantity = round(fulfilled + take, 4)
        remaining = round(remaining - take, 4)
        if src.fulfilled_quantity + 1e-9 >= requested:
            src.status = PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED
            newly_fulfilled_order_ids.append(int(src.order_id))
        else:
            src.status = PRODUCTION_ORDER_SOURCE_ITEM_PARTIAL
        src.updated_at = now
        db.add(src)
        allocations.append(
            {
                "source_item_id": int(src.id),
                "order_id": int(src.order_id),
                "added": take,
                "fulfilled": float(src.fulfilled_quantity),
                "requested": requested,
                "status": str(src.status),
            }
        )

        if (
            str(src.status) == PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED
            and buffer_location_id is not None
        ):
            # Credit full requested once when source completes (not partial increments).
            _credit_packing_artifacts(
                db,
                mo=mo,
                src=src,
                buffer_location_id=int(buffer_location_id),
                credit_qty=requested,
            )

    db.flush()
    assert_fulfilled_vs_produced_invariant(mo, sources)

    status_moves: list[dict[str, Any]] = []
    for oid in newly_fulfilled_order_ids:
        order = orders_by_id.get(oid)
        if order is None:
            continue
        if int(getattr(order, "order_ui_status_id", 0) or 0) == int(after_status_id):
            continue
        apply_order_panel_ui_status(
            db,
            order=order,
            sub_status_id=int(after_status_id),
            operator_user_id=operator_user_id,
            skip_production_trigger=True,
        )
        msg = (
            f"Produkt został wyprodukowany w zleceniu {mo.number}. "
            "Zamówienie przekazano do pakowania."
        )
        _log_order(
            db,
            order=order,
            event_type="PRODUCTION_ORDER_FULFILLED",
            message=msg,
            operator_user_id=operator_user_id,
            metadata={
                "production_order_id": int(mo.id),
                "production_order_number": str(mo.number),
                "status_after_production_id": int(after_status_id),
            },
        )
        status_moves.append({"order_id": oid, "status_id": int(after_status_id)})

    return {
        "result": "OK",
        "delta_allocated": float(delta - remaining),
        "delta_remaining": float(remaining),
        "allocations": allocations,
        "status_moves": status_moves,
    }


def _create_orders_buffer_pw_document(
    db: Session,
    *,
    mo: ProductionOrder,
    buffer_location_id: int,
    quantity: float,
    unit_cost: float,
    created_by_user_id: Optional[int],
) -> StockDocument:
    doc = StockDocument(
        tenant_id=int(mo.tenant_id),
        warehouse_id=int(mo.warehouse_id),
        location_id=int(buffer_location_id),
        document_type="PW",
        creation_source="PRODUCTION",
        production_order_id=int(mo.id),
        status="draft",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
        created_by_user_id=created_by_user_id,
    )
    db.add(doc)
    db.flush()
    try:
        pw_series = require_warehouse_series(
            db, tenant_id=int(mo.tenant_id), warehouse_id=int(mo.warehouse_id), subtype="PW"
        )
    except Exception:
        pw_series = None
    if pw_series is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == int(mo.warehouse_id)).first()
        assign_series_number_to_stock_document(
            db, doc, pw_series, warehouse_code=str(getattr(wh, "code", None) or "") or None
        )
    line = StockDocumentItem(
        document_id=int(doc.id),
        product_id=int(mo.product_id),
        ordered_quantity=float(quantity),
        received_quantity=float(quantity),
        quantity=float(quantity),
        purchase_price_net=float(unit_cost),
        batch_number="",
        expiry_date=date(9999, 12, 31),
    )
    db.add(line)
    db.flush()
    upsert_dock_inventory_for_loose_receipt(
        db,
        tenant_id=int(mo.tenant_id),
        warehouse_id=int(mo.warehouse_id),
        location_id=int(buffer_location_id),
        product_id=int(mo.product_id),
        add_qty=float(quantity),
        batch_number="",
        expiry_date=NO_EXPIRY_SENTINEL,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    append_receipt_operation(db, doc, line, float(quantity))
    try:
        from .production_warehouse_audit import record_production_pw_receipt_audit

        record_production_pw_receipt_audit(
            db,
            pw_doc=doc,
            product_id=int(mo.product_id),
            quantity=float(quantity),
            staging_location_id=int(buffer_location_id),
            performed_by_user_id=created_by_user_id,
        )
    except Exception:
        logger.exception("buffer PW audit failed mo_id=%s", mo.id)
    doc.updated_at = datetime.utcnow()
    db.flush()
    return doc


def receive_orders_mo_fg_to_buffer(
    db: Session,
    *,
    mo: ProductionOrder,
    add_quantity: float,
    performed_by_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """Create/extend ORDERS PW on finished-goods buffer; inventory lands immediately (no putaway queue)."""
    add_qty = float(add_quantity or 0)
    if add_qty <= 1e-9:
        return {"result": "SKIPPED", "reason": "zero_qty"}

    buffer_id = resolve_orders_mo_buffer_location_id(db, mo)

    rw_doc = (
        db.query(StockDocument).filter(StockDocument.id == int(mo.rw_stock_document_id)).first()
        if mo.rw_stock_document_id
        else None
    )
    from .cost_service import compute_order_unit_cost

    produced_total = float(mo.produced_quantity or 0)
    unit_cost = compute_order_unit_cost(rw_doc, produced_quantity=max(produced_total, add_qty))

    if mo.pw_stock_document_id:
        doc = db.query(StockDocument).filter(StockDocument.id == int(mo.pw_stock_document_id)).first()
        if doc is None:
            raise ProductionOrderError("Dokument PW zlecenia nie istnieje.", code="pw_missing")
        line = (
            db.query(StockDocumentItem)
            .filter(StockDocumentItem.document_id == int(doc.id))
            .order_by(StockDocumentItem.id.asc())
            .first()
        )
        if line is None:
            raise ProductionOrderError("Pozycja PW zlecenia nie istnieje.", code="pw_line_missing")
        line.ordered_quantity = float(line.ordered_quantity or 0) + add_qty
        line.received_quantity = float(line.received_quantity or 0) + add_qty
        line.quantity = float(line.quantity or 0) + add_qty
        line.purchase_price_net = float(unit_cost)
        db.add(line)
        upsert_dock_inventory_for_loose_receipt(
            db,
            tenant_id=int(mo.tenant_id),
            warehouse_id=int(mo.warehouse_id),
            location_id=int(buffer_id),
            product_id=int(mo.product_id),
            add_qty=add_qty,
            batch_number="",
            expiry_date=NO_EXPIRY_SENTINEL,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
        append_receipt_operation(db, doc, line, add_qty)
        doc.putaway_status = "DONE"
        doc.relocation_status = "DONE"
        doc.receiving_status = "DONE"
        doc.location_id = int(buffer_id)
        doc.updated_at = datetime.utcnow()
        db.add(doc)
        db.flush()
        pw_id = int(doc.id)
    else:
        doc = _create_orders_buffer_pw_document(
            db,
            mo=mo,
            buffer_location_id=buffer_id,
            quantity=add_qty,
            unit_cost=unit_cost,
            created_by_user_id=performed_by_user_id,
        )
        mo.pw_stock_document_id = int(doc.id)
        pw_id = int(doc.id)

    mo.calculated_unit_cost = round(unit_cost, 4)
    mo.location_id = int(buffer_id)
    prod = db.query(Product).filter(Product.id == int(mo.product_id)).first()
    if prod is not None and unit_cost > 0:
        prod.purchase_price = float(unit_cost)
        prod.updated_at = datetime.utcnow()
        db.add(prod)
    mo.updated_at = datetime.utcnow()
    db.add(mo)
    db.flush()
    return {
        "result": "OK",
        "pw_stock_document_id": pw_id,
        "buffer_location_id": int(buffer_id),
        "quantity": add_qty,
        "unit_cost": unit_cost,
    }


def complete_orders_mo_without_putaway(db: Session, *, mo: ProductionOrder) -> None:
    """ORDERS MO finishes into completed — buffer PW already putaway=DONE."""
    mo.status = "completed"
    now = datetime.utcnow()
    if mo.production_completed_at is None:
        mo.production_completed_at = now
    mo.completed_at = now
    mo.updated_at = now
    db.add(mo)
    db.flush()


def production_fulfilled_qty_for_order_item(db: Session, order_item_id: int) -> float:
    """Sum of fulfilled qty from ORDERS sources for packing expectancy."""
    row = (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.order_item_id == int(order_item_id),
            ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED,
        )
        .all()
    )
    return sum(float(s.fulfilled_quantity or 0) for s in row)
