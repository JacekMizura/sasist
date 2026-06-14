"""RMZ bundle component return — snapshot-linked partial returns (P4.15)."""

from __future__ import annotations

from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class ReturnLineBundleComponent(Base):
    __tablename__ = "return_line_bundle_components"

    id = Column(Integer, primary_key=True, autoincrement=True)
    return_line_id = Column(
        Integer,
        ForeignKey("rmz_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_line_bundle_component_id = Column(
        Integer,
        ForeignKey("order_line_bundle_components.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    component_product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    returned_qty = Column(Integer, nullable=False, default=0)
    accepted_qty = Column(Integer, nullable=False, default=0)
    refund_amount = Column(Float, nullable=True)
    #: OK | PARTIAL | REJECTED | INCOMPLETE | DAMAGED — operator decision per component
    decision = Column(String(24), nullable=True)
    #: Extensibility for lot snapshot (P4.16) — nullable JSON pointer
    lot_trace_json = Column(String(512), nullable=True)

    return_line = relationship("RMZLine", back_populates="bundle_component_returns")
    snapshot_row = relationship("OrderLineBundleComponent", foreign_keys=[order_line_bundle_component_id])
    product = relationship("Product", foreign_keys=[component_product_id])
