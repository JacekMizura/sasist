"""Close production batch / MO when PW putaway documents are finished."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ...models.product_composition import ProductionBatch
from ...models.production import ProductionOrder
from ...models.stock_document import StockDocument


def _pw_putaway_done(doc: StockDocument) -> bool:
    ps = str(getattr(doc, "putaway_status", "") or "").strip().upper()
    rs = str(getattr(doc, "relocation_status", "") or "").strip().upper()
    return ps == "DONE" or rs == "DONE"


def try_complete_production_execution_from_pw_document(db: Session, doc: StockDocument) -> bool:
    """Batch + MO share the same awaiting_putaway → completed transition."""
    if try_complete_production_batch_from_pw_document(db, doc):
        return True
    return try_complete_production_order_from_pw_document(db, doc)


def try_complete_production_batch_from_pw_document(db: Session, doc: StockDocument) -> bool:
    """
    When production PW putaway finishes, mark batch completed if:
    - every FG line reached planned quantity, and
    - every PRODUCTION PW for this batch is putaway DONE.
    """
    if str(getattr(doc, "document_type", "") or "").strip().upper() != "PW":
        return False
    if str(getattr(doc, "creation_source", "") or "").strip().upper() != "PRODUCTION":
        return False
    batch_id = getattr(doc, "production_batch_id", None)
    if batch_id is None:
        return False

    batch = db.query(ProductionBatch).filter(ProductionBatch.id == int(batch_id)).first()
    if batch is None:
        return False
    if str(batch.status) not in ("in_progress", "awaiting_putaway", "putaway"):
        return False

    lines = list(batch.lines or [])
    if not lines:
        return False
    if not all(
        float(ln.completed_quantity or 0) >= float(ln.planned_quantity) - 1e-6 for ln in lines
    ):
        return False

    from .fg_output_register_service import production_pw_documents_for_batch

    pw_docs = production_pw_documents_for_batch(db, batch_id=int(batch_id))
    if not pw_docs:
        # Legacy: fall back to line-linked PW ids.
        pw_ids = sorted(
            {
                int(ln.pw_stock_document_id)
                for ln in lines
                if getattr(ln, "pw_stock_document_id", None)
            }
        )
        if not pw_ids:
            return False
        pw_docs = db.query(StockDocument).filter(StockDocument.id.in_(pw_ids)).all()
        if len(pw_docs) != len(pw_ids):
            return False

    if not all(_pw_putaway_done(d) for d in pw_docs):
        return False

    batch.status = "completed"
    if batch.production_completed_at is None:
        batch.production_completed_at = datetime.utcnow()
    batch.completed_at = datetime.utcnow()
    batch.updated_at = datetime.utcnow()
    db.flush()
    return True


def try_complete_production_order_from_pw_document(db: Session, doc: StockDocument) -> bool:
    """When MO PW putaway finishes, mark order completed (same lifecycle as batch)."""
    if str(getattr(doc, "document_type", "") or "").strip().upper() != "PW":
        return False
    if str(getattr(doc, "creation_source", "") or "").strip().upper() != "PRODUCTION":
        return False
    order_id = getattr(doc, "production_order_id", None)
    if order_id is None:
        return False

    order = db.query(ProductionOrder).filter(ProductionOrder.id == int(order_id)).first()
    if order is None:
        return False
    if str(order.status) not in ("in_progress", "awaiting_putaway", "putaway"):
        return False
    if float(order.produced_quantity or 0) < float(order.planned_quantity or 0) - 1e-6:
        return False

    from .fg_output_register_service import production_pw_documents_for_order

    pw_docs = production_pw_documents_for_order(db, order_id=int(order_id))
    if not pw_docs:
        pw_id = getattr(order, "pw_stock_document_id", None)
        if pw_id is None:
            return False
        pw_doc = db.query(StockDocument).filter(StockDocument.id == int(pw_id)).first()
        pw_docs = [pw_doc] if pw_doc is not None else []
    if not pw_docs or not all(_pw_putaway_done(d) for d in pw_docs):
        return False

    order.status = "completed"
    if order.production_completed_at is None:
        order.production_completed_at = datetime.utcnow()
    order.completed_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    db.flush()
    return True
