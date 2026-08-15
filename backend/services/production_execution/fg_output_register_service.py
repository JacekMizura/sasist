"""Canonical domain: register_produced_quantity — one semantics for MO + BAT."""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterable

from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_composition import ProductionBatch, ProductionBatchLine
from ...models.production import PRODUCTION_ORDER_SOURCE_ORDERS, ProductionOrder
from ...models.production_fg_output import ProductionFgOutput
from ...models.stock_document import StockDocument
from .production_fg_traceability import (
    commit_fg_output_delta_identity,
    prepare_fg_output_delta_identity,
    snapshot_lot_values,
)

logger = logging.getLogger(__name__)


@dataclass
class RegisterProducedResult:
    produced_quantity_after: float
    stock_document_id: int | None
    stock_document_item_id: int | None
    output_id: int
    idempotent_replay: bool
    production_complete: bool
    auto_finished: bool


def _stable_idempotency_key(
    *,
    kind: str,
    entity_id: int,
    line_id: int | None,
    produced_before: float,
    add_qty: float,
    batch_number: str,
    expiry: str | None,
    serials: list[str],
    client_key: str | None,
) -> str:
    if client_key and str(client_key).strip():
        return str(client_key).strip()[:191]
    payload = "|".join(
        [
            kind,
            str(entity_id),
            str(line_id or 0),
            f"{produced_before:.4f}",
            f"{add_qty:.4f}",
            batch_number or "",
            expiry or "",
            ",".join(serials),
        ]
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:40]
    return f"fgreg:{digest}"[:191]


def list_fg_outputs_for_batch(db: Session, *, batch_id: int) -> list[ProductionFgOutput]:
    return (
        db.query(ProductionFgOutput)
        .filter(ProductionFgOutput.production_batch_id == int(batch_id))
        .order_by(ProductionFgOutput.id.asc())
        .all()
    )


def list_fg_outputs_for_order(db: Session, *, order_id: int) -> list[ProductionFgOutput]:
    return (
        db.query(ProductionFgOutput)
        .filter(ProductionFgOutput.production_order_id == int(order_id))
        .order_by(ProductionFgOutput.id.asc())
        .all()
    )


def sum_output_qty_for_line(db: Session, *, batch_line_id: int) -> float:
    rows = (
        db.query(ProductionFgOutput)
        .filter(ProductionFgOutput.production_batch_line_id == int(batch_line_id))
        .all()
    )
    return round(sum(float(r.quantity or 0) for r in rows), 4)


def production_pw_documents_for_batch(db: Session, *, batch_id: int) -> list[StockDocument]:
    return (
        db.query(StockDocument)
        .filter(
            StockDocument.production_batch_id == int(batch_id),
            StockDocument.document_type == "PW",
            StockDocument.creation_source == "PRODUCTION",
        )
        .order_by(StockDocument.id.asc())
        .all()
    )


def production_pw_documents_for_order(db: Session, *, order_id: int) -> list[StockDocument]:
    return (
        db.query(StockDocument)
        .filter(
            StockDocument.production_order_id == int(order_id),
            StockDocument.document_type == "PW",
            StockDocument.creation_source == "PRODUCTION",
        )
        .order_by(StockDocument.id.asc())
        .all()
    )


def pw_putaway_done(doc: StockDocument) -> bool:
    ps = str(getattr(doc, "putaway_status", "") or "").strip().upper()
    rs = str(getattr(doc, "relocation_status", "") or "").strip().upper()
    return ps == "DONE" or rs == "DONE"


def _pw_putaway_done(doc: StockDocument) -> bool:
    return pw_putaway_done(doc)


def _insert_output_row(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    produced_after: float,
    delta_snapshot: dict[str, Any],
    idempotency_key: str,
    actor_user_id: int | None,
    production_order_id: int | None = None,
    production_batch_id: int | None = None,
    production_batch_line_id: int | None = None,
    stock_document_id: int | None = None,
    stock_document_item_id: int | None = None,
) -> ProductionFgOutput:
    batch_number, expiry = snapshot_lot_values(delta_snapshot)
    expiry_val: date | None = None if expiry.year >= 9999 else expiry
    row = ProductionFgOutput(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        production_order_id=production_order_id,
        production_batch_id=production_batch_id,
        production_batch_line_id=production_batch_line_id,
        product_id=int(product_id),
        quantity=float(quantity),
        produced_quantity_after=float(produced_after),
        batch_number=batch_number or "",
        expiry_date=expiry_val,
        serial_numbers_json=json.dumps(
            list(delta_snapshot.get("serial_numbers") or []),
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        stock_document_id=stock_document_id,
        stock_document_item_id=stock_document_item_id,
        idempotency_key=idempotency_key,
        actor_user_id=actor_user_id,
    )
    db.add(row)
    db.flush()
    return row


def register_produced_quantity_for_batch_line(
    db: Session,
    *,
    batch: ProductionBatch,
    line: ProductionBatchLine,
    add_quantity: float,
    fg_batch_number: str | None = None,
    fg_expiry_date: date | str | None = None,
    fg_serial_numbers: Iterable[str] | None = None,
    idempotency_key: str | None = None,
    performed_by_user_id: int | None = None,
    auto_finish: bool = True,
) -> RegisterProducedResult:
    add_qty = float(add_quantity)
    if add_qty <= 1e-9:
        raise ValueError("Ilość rejestracji musi być większa od zera.")
    produced_before = float(line.completed_quantity or 0)
    new_qty = produced_before + add_qty
    if new_qty > float(line.planned_quantity) + 1e-6:
        raise ValueError("Przekroczono planowaną ilość.")

    product = db.query(Product).filter(Product.id == int(line.product_id)).first()
    if product is None:
        raise ValueError("Produkt wyrobu gotowego nie istnieje.")

    delta_snapshot = prepare_fg_output_delta_identity(
        db,
        entity=line,
        tenant_id=int(batch.tenant_id),
        warehouse_id=int(batch.warehouse_id),
        product=product,
        delta_quantity=add_qty,
        batch_number=fg_batch_number,
        expiry_date=fg_expiry_date,
        serial_numbers=fg_serial_numbers,
    )
    serials = [str(x) for x in (delta_snapshot.get("serial_numbers") or [])]
    idem = _stable_idempotency_key(
        kind="batch_line",
        entity_id=int(batch.id),
        line_id=int(line.id),
        produced_before=produced_before,
        add_qty=add_qty,
        batch_number=str(delta_snapshot.get("batch_number") or ""),
        expiry=delta_snapshot.get("expiry_date"),
        serials=serials,
        client_key=idempotency_key,
    )
    existing = (
        db.query(ProductionFgOutput)
        .filter(
            ProductionFgOutput.tenant_id == int(batch.tenant_id),
            ProductionFgOutput.idempotency_key == idem,
        )
        .first()
    )
    if existing is not None:
        return RegisterProducedResult(
            produced_quantity_after=float(existing.produced_quantity_after),
            stock_document_id=int(existing.stock_document_id) if existing.stock_document_id else None,
            stock_document_item_id=(
                int(existing.stock_document_item_id) if existing.stock_document_item_id else None
            ),
            output_id=int(existing.id),
            idempotent_replay=True,
            production_complete=float(line.completed_quantity or 0)
            >= float(line.planned_quantity) - 1e-6,
            auto_finished=False,
        )

    from .pw_putaway_handoff import create_batch_line_delta_pw_for_putaway

    pw_doc, pw_item = create_batch_line_delta_pw_for_putaway(
        db,
        batch=batch,
        line=line,
        quantity=add_qty,
        delta_snapshot=delta_snapshot,
        performed_by_user_id=performed_by_user_id,
    )

    line.completed_quantity = round(new_qty, 4)
    line.status = "in_progress" if new_qty < float(line.planned_quantity) - 1e-6 else "produced"
    line.pw_stock_document_id = int(pw_doc.id)
    batch.updated_at = datetime.utcnow()
    db.flush()

    commit_fg_output_delta_identity(db, entity=line, delta_snapshot=delta_snapshot)
    row = _insert_output_row(
        db,
        tenant_id=int(batch.tenant_id),
        warehouse_id=int(batch.warehouse_id),
        product_id=int(line.product_id),
        quantity=add_qty,
        produced_after=float(line.completed_quantity),
        delta_snapshot=delta_snapshot,
        idempotency_key=idem,
        actor_user_id=performed_by_user_id,
        production_batch_id=int(batch.id),
        production_batch_line_id=int(line.id),
        stock_document_id=int(pw_doc.id),
        stock_document_item_id=int(pw_item.id),
    )

    production_complete = all(
        float(ln.completed_quantity or 0) >= float(ln.planned_quantity) - 1e-6
        for ln in (batch.lines or [])
    )
    auto_finished = False
    if auto_finish and production_complete:
        auto_finished = _auto_finish_batch_after_full_production(db, batch=batch)
    try:
        from .production_domain_activity import (
            emit_production_output_registered,
            emit_production_pw_created,
            emit_production_sent_to_putaway,
        )

        pw_no = str(getattr(pw_doc, "document_number", None) or "") or None
        serials = [str(x) for x in (delta_snapshot.get("serial_numbers") or []) if str(x).strip()]
        lot = str(delta_snapshot.get("batch_number") or "").strip() or None
        emit_production_output_registered(
            db,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
            output_id=int(row.id),
            quantity=float(add_qty),
            produced_total=float(line.completed_quantity or 0),
            planned_quantity=float(line.planned_quantity or 0),
            batch_id=int(batch.id),
            product_id=int(line.product_id),
            stock_document_id=int(pw_doc.id),
            document_number=pw_no,
            actor_user_id=performed_by_user_id,
            label=str(getattr(batch, "number", None) or "") or None,
            batch_number=lot,
            serial_numbers=serials or None,
        )
        emit_production_pw_created(
            db,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
            stock_document_id=int(pw_doc.id),
            document_number=pw_no,
            batch_id=int(batch.id),
            product_id=int(line.product_id),
            actor_user_id=performed_by_user_id,
            label=str(getattr(batch, "number", None) or "") or None,
            quantity=float(add_qty),
        )
        if str(batch.status) == "awaiting_putaway":
            emit_production_sent_to_putaway(
                db,
                tenant_id=int(batch.tenant_id),
                warehouse_id=int(batch.warehouse_id) if batch.warehouse_id else None,
                batch_id=int(batch.id),
                product_id=int(line.product_id),
                quantity=float(add_qty),
                stock_document_id=int(pw_doc.id),
                document_number=pw_no,
                actor_user_id=performed_by_user_id,
                label=str(getattr(batch, "number", None) or "") or None,
            )
    except Exception:
        pass
    return RegisterProducedResult(
        produced_quantity_after=float(line.completed_quantity),
        stock_document_id=int(pw_doc.id),
        stock_document_item_id=int(pw_item.id),
        output_id=int(row.id),
        idempotent_replay=False,
        production_complete=production_complete,
        auto_finished=auto_finished,
    )


def register_produced_quantity_for_order(
    db: Session,
    *,
    order: ProductionOrder,
    add_quantity: float,
    fg_batch_number: str | None = None,
    fg_expiry_date: date | str | None = None,
    fg_serial_numbers: Iterable[str] | None = None,
    idempotency_key: str | None = None,
    performed_by_user_id: int | None = None,
    auto_finish: bool = True,
) -> RegisterProducedResult:
    add_qty = float(add_quantity)
    if add_qty <= 1e-9:
        raise ValueError("Ilość rejestracji musi być większa od zera.")
    produced_before = float(order.produced_quantity or 0)
    new_qty = produced_before + add_qty
    if new_qty > float(order.planned_quantity) + 1e-6:
        raise ValueError("Przekroczono planowaną ilość.")

    product = db.query(Product).filter(Product.id == int(order.product_id)).first()
    if product is None:
        raise ValueError("Produkt wyrobu gotowego nie istnieje.")

    delta_snapshot = prepare_fg_output_delta_identity(
        db,
        entity=order,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        product=product,
        delta_quantity=add_qty,
        batch_number=fg_batch_number,
        expiry_date=fg_expiry_date,
        serial_numbers=fg_serial_numbers,
    )
    serials = [str(x) for x in (delta_snapshot.get("serial_numbers") or [])]
    idem = _stable_idempotency_key(
        kind="order",
        entity_id=int(order.id),
        line_id=None,
        produced_before=produced_before,
        add_qty=add_qty,
        batch_number=str(delta_snapshot.get("batch_number") or ""),
        expiry=delta_snapshot.get("expiry_date"),
        serials=serials,
        client_key=idempotency_key,
    )
    existing = (
        db.query(ProductionFgOutput)
        .filter(
            ProductionFgOutput.tenant_id == int(order.tenant_id),
            ProductionFgOutput.idempotency_key == idem,
        )
        .first()
    )
    if existing is not None:
        return RegisterProducedResult(
            produced_quantity_after=float(existing.produced_quantity_after),
            stock_document_id=int(existing.stock_document_id) if existing.stock_document_id else None,
            stock_document_item_id=(
                int(existing.stock_document_item_id) if existing.stock_document_item_id else None
            ),
            output_id=int(existing.id),
            idempotent_replay=True,
            production_complete=float(order.produced_quantity or 0)
            >= float(order.planned_quantity) - 1e-6,
            auto_finished=False,
        )

    order.produced_quantity = round(new_qty, 4)
    order.updated_at = datetime.utcnow()
    db.flush()

    is_orders = str(getattr(order, "source_type", "") or "") == PRODUCTION_ORDER_SOURCE_ORDERS
    pw_id: int | None = None
    item_id: int | None = None

    if is_orders:
        from .orders_fg_fulfillment_service import receive_orders_mo_fg_to_buffer

        recv = receive_orders_mo_fg_to_buffer(
            db,
            mo=order,
            add_quantity=add_qty,
            performed_by_user_id=performed_by_user_id,
            delta_snapshot=delta_snapshot,
        )
        pw_id = int(recv.get("pw_stock_document_id") or order.pw_stock_document_id or 0) or None
        item_id = int(recv.get("stock_document_item_id") or 0) or None
    else:
        from .pw_putaway_handoff import create_order_delta_pw_for_putaway

        pw_doc, pw_item = create_order_delta_pw_for_putaway(
            db,
            order=order,
            quantity=add_qty,
            delta_snapshot=delta_snapshot,
            performed_by_user_id=performed_by_user_id,
        )
        pw_id = int(pw_doc.id)
        item_id = int(pw_item.id)
        order.pw_stock_document_id = pw_id

    commit_fg_output_delta_identity(db, entity=order, delta_snapshot=delta_snapshot)
    row = _insert_output_row(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        product_id=int(order.product_id),
        quantity=add_qty,
        produced_after=float(order.produced_quantity),
        delta_snapshot=delta_snapshot,
        idempotency_key=idem,
        actor_user_id=performed_by_user_id,
        production_order_id=int(order.id),
        stock_document_id=pw_id,
        stock_document_item_id=item_id,
    )

    production_complete = float(order.produced_quantity or 0) >= float(order.planned_quantity) - 1e-6
    auto_finished = False
    if auto_finish and production_complete:
        auto_finished = _auto_finish_order_after_full_production(
            db, order=order, performed_by_user_id=performed_by_user_id
        )
    try:
        from .production_domain_activity import (
            emit_production_output_registered,
            emit_production_pw_created,
            emit_production_sent_to_putaway,
        )

        pw_no = None
        if pw_id:
            pw = db.query(StockDocument).filter(StockDocument.id == int(pw_id)).first()
            pw_no = str(getattr(pw, "document_number", None) or "") or None
        order_link = None
        try:
            srcs = list(getattr(order, "order_sources", None) or [])
            if srcs:
                order_link = int(srcs[0].order_id)
        except Exception:
            order_link = None
        lot = str(delta_snapshot.get("batch_number") or "").strip() or None
        emit_production_output_registered(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
            output_id=int(row.id),
            quantity=float(add_qty),
            produced_total=float(order.produced_quantity or 0),
            planned_quantity=float(order.planned_quantity or 0),
            production_order_id=int(order.id),
            product_id=int(order.product_id) if order.product_id else None,
            order_id=order_link,
            stock_document_id=pw_id,
            document_number=pw_no,
            actor_user_id=performed_by_user_id,
            label=str(getattr(order, "number", None) or "") or None,
            batch_number=lot,
            serial_numbers=serials or None,
        )
        if pw_id:
            emit_production_pw_created(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
                stock_document_id=int(pw_id),
                document_number=pw_no,
                production_order_id=int(order.id),
                product_id=int(order.product_id) if order.product_id else None,
                actor_user_id=performed_by_user_id,
                label=str(getattr(order, "number", None) or "") or None,
                quantity=float(add_qty),
                order_id=order_link,
            )
        if str(order.status) == "awaiting_putaway":
            emit_production_sent_to_putaway(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id) if order.warehouse_id else None,
                production_order_id=int(order.id),
                product_id=int(order.product_id) if order.product_id else None,
                quantity=float(add_qty),
                stock_document_id=pw_id,
                document_number=pw_no,
                actor_user_id=performed_by_user_id,
                label=str(getattr(order, "number", None) or "") or None,
            )
    except Exception:
        logger.exception("production output activity failed order_id=%s", order.id)
    return RegisterProducedResult(
        produced_quantity_after=float(order.produced_quantity),
        stock_document_id=pw_id,
        stock_document_item_id=item_id,
        output_id=int(row.id),
        idempotent_replay=False,
        production_complete=production_complete,
        auto_finished=auto_finished,
    )


def _auto_finish_batch_after_full_production(db: Session, *, batch: ProductionBatch) -> bool:
    if str(batch.status) not in ("in_progress",):
        return False
    pw_docs = production_pw_documents_for_batch(db, batch_id=int(batch.id))
    if not pw_docs:
        return False
    batch.production_completed_at = batch.production_completed_at or datetime.utcnow()
    if all(_pw_putaway_done(d) for d in pw_docs):
        batch.status = "completed"
        batch.completed_at = datetime.utcnow()
    else:
        batch.status = "awaiting_putaway"
    batch.updated_at = datetime.utcnow()
    db.flush()
    return True


def _auto_finish_order_after_full_production(
    db: Session, *, order: ProductionOrder, performed_by_user_id: int | None
) -> bool:
    del performed_by_user_id
    if str(order.status) != "in_progress":
        return False
    if str(getattr(order, "source_type", "") or "") == PRODUCTION_ORDER_SOURCE_ORDERS:
        from .orders_fg_fulfillment_service import complete_orders_mo_without_putaway

        complete_orders_mo_without_putaway(db, mo=order)
        return True

    pw_docs = production_pw_documents_for_order(db, order_id=int(order.id))
    if not pw_docs and order.pw_stock_document_id:
        doc = db.query(StockDocument).filter(StockDocument.id == int(order.pw_stock_document_id)).first()
        pw_docs = [doc] if doc is not None else []
    if not pw_docs:
        return False
    order.production_completed_at = order.production_completed_at or datetime.utcnow()
    if all(_pw_putaway_done(d) for d in pw_docs):
        order.status = "completed"
        order.completed_at = datetime.utcnow()
    else:
        order.status = "awaiting_putaway"
    order.updated_at = datetime.utcnow()
    db.flush()
    return True


def transition_batch_after_full_production_idempotent(db: Session, *, batch: ProductionBatch) -> None:
    """finish_production helper: do not rematerialize if outputs/PWs already cover plan."""
    if str(batch.status) in ("awaiting_putaway", "putaway", "completed"):
        return
    for ln in batch.lines or []:
        if float(ln.completed_quantity or 0) < float(ln.planned_quantity) - 1e-6:
            raise ValueError("Nie wszystkie produkty są wyprodukowane.")
    pw_docs = production_pw_documents_for_batch(db, batch_id=int(batch.id))
    covered = True
    for ln in batch.lines or []:
        if sum_output_qty_for_line(db, batch_line_id=int(ln.id)) + 1e-6 < float(ln.completed_quantity or 0):
            covered = False
            break
    if covered and pw_docs:
        _auto_finish_batch_after_full_production(db, batch=batch)
        return
    from .pw_putaway_handoff import create_batch_pw_documents_for_putaway

    create_batch_pw_documents_for_putaway(db, batch=batch, performed_by_user_id=None)
    batch.status = "awaiting_putaway"
    batch.production_completed_at = datetime.utcnow()
    batch.updated_at = datetime.utcnow()
    db.flush()
