"""Append-only stock movements tied to document lines (single source of truth for processed quantities)."""

from datetime import date

from sqlalchemy import Column, Date, Float, ForeignKey, Integer, String, text
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


# Operation types (stored uppercase)
STOCK_OP_RECEIPT = "RECEIPT"
STOCK_OP_PUTAWAY = "PUTAWAY"
STOCK_OP_ISSUE = "ISSUE"
STOCK_OP_MOVE = "MOVE"
STOCK_OP_MOVE_OUT = "MOVE_OUT"
STOCK_OP_MOVE_IN = "MOVE_IN"
STOCK_OP_ADJUSTMENT = "ADJUSTMENT"


class StockOperation(Base, BaseModelMixin):
    """
    Each row is one immutable quantity event. processed_qty = SUM(qty) filtered by type/line;
    per-location = GROUP BY location_id.
    """

    __tablename__ = "stock_operations"

    document_id = Column(
        Integer,
        ForeignKey("stock_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_line_id = Column(
        Integer,
        ForeignKey("stock_document_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True, index=True)
    qty = Column(Float, nullable=False)
    type = Column(String(32), nullable=False, index=True)
    batch = Column(String(128), nullable=True)
    expiry_date = Column(Date, nullable=True)
    # Parallel to StockDocumentItem / Inventory bucket — survives RECEIPT, PUTAWAY, MM moves.
    stock_disposition = Column(
        String(32),
        nullable=False,
        default="SALEABLE",
        server_default=text("'SALEABLE'"),
        index=True,
    )
    # Unit net price for RECEIPT (weighted average source); optional for other types.
    unit_price_net = Column(Float, nullable=True)
    serial_number = Column(String(128), nullable=True, index=True)

    document = relationship("StockDocument", foreign_keys=[document_id])
    document_line = relationship("StockDocumentItem", back_populates="stock_operations", foreign_keys=[document_line_id])
    product = relationship("Product", foreign_keys=[product_id])
    location = relationship("Location", foreign_keys=[location_id])
