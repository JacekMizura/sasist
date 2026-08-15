"""Immutable FG output deltas produced by register_produced_quantity."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base


class ProductionFgOutput(Base):
    """One materialized FG registration (delta) for an MO or batch line.

    Stock truth remains StockDocument / StockDocumentItem / StockOperation.
    This row is the production-side index: MO/BAT → delta → LOT → PW.
    """

    __tablename__ = "production_fg_outputs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_production_fg_outputs_idem"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    production_order_id = Column(
        Integer, ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    production_batch_id = Column(
        Integer, ForeignKey("production_batches.id", ondelete="CASCADE"), nullable=True, index=True
    )
    production_batch_line_id = Column(
        Integer, ForeignKey("production_batch_lines.id", ondelete="CASCADE"), nullable=True, index=True
    )

    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    produced_quantity_after = Column(Float, nullable=False)

    batch_number = Column(String(128), nullable=False, default="")
    expiry_date = Column(Date, nullable=True)
    serial_numbers_json = Column(Text, nullable=True)

    stock_document_id = Column(
        Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    stock_document_item_id = Column(
        Integer, ForeignKey("stock_document_items.id", ondelete="SET NULL"), nullable=True
    )

    idempotency_key = Column(String(191), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
