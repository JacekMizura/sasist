"""Finished-good header for WMS production collecting (single-screen job context)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_composition import ProductionBatch
from ...models.production import ProductionOrder
from ...schemas.production_batch import CollectionJobHeaderRead, CollectionOutputProductRead


def _product_output(db: Session, *, product_id: int, planned_quantity: float) -> CollectionOutputProductRead:
    p = db.query(Product).filter(Product.id == int(product_id)).first()
    return CollectionOutputProductRead(
        product_id=int(product_id),
        product_name=(p.name if p else f"Produkt #{product_id}"),
        product_sku=((p.sku or p.symbol) if p else None),
        product_image_url=((p.image_url or "").strip() or None if p else None),
        planned_quantity=float(planned_quantity),
    )


def build_batch_collection_header(db: Session, batch: ProductionBatch) -> CollectionJobHeaderRead:
    outputs = [
        _product_output(db, product_id=int(line.product_id), planned_quantity=float(line.planned_quantity))
        for line in (batch.lines or [])
    ]
    return CollectionJobHeaderRead(
        job_number=str(batch.number),
        job_kind="batch",
        outputs=outputs,
    )


def build_order_collection_header(db: Session, order: ProductionOrder) -> CollectionJobHeaderRead:
    planned = float(order.planned_quantity or 0)
    outputs = [_product_output(db, product_id=int(order.product_id), planned_quantity=planned)]
    return CollectionJobHeaderRead(
        job_number=str(order.number),
        job_kind="order",
        outputs=outputs,
    )
