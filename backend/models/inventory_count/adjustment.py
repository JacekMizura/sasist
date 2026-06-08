"""Post-approval stock adjustments generated from inventory differences."""

from __future__ import annotations

from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text

from ...database import Base
from ..base import BaseModelMixin
from .constants import ADJ_STATUS_DRAFT


class InventoryAdjustment(Base, BaseModelMixin):
    __tablename__ = "inventory_adjustments"

    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_document_line_id = Column(
        Integer,
        ForeignKey("inventory_document_lines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)

    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False)
    adjustment_quantity = Column(Float, nullable=False)
    direction = Column(String(8), nullable=False)  # RW | PW

    stock_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(32), nullable=False, default=ADJ_STATUS_DRAFT, index=True)
    metadata_json = Column(Text, nullable=True)
