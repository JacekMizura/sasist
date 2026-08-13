"""RMZ line manufactured-component recovery snapshot (disassembly of FG returns)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class RmzLineComponentRecovery(Base):
    __tablename__ = "rmz_line_component_recoveries"
    __table_args__ = (
        UniqueConstraint(
            "rmz_line_id",
            "composition_line_id",
            name="uq_rmz_line_comp_recovery_line_comp",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    rmz_line_id = Column(
        Integer,
        ForeignKey("rmz_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    composition_id = Column(
        Integer,
        ForeignKey("product_compositions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    composition_line_id = Column(
        Integer,
        ForeignKey("product_composition_lines.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    component_product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    expected_qty = Column(Float, nullable=False, default=0)
    accepted_qty = Column(Float, nullable=False, default=0)
    scrap_qty = Column(Float, nullable=False, default=0)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
    posted_at = Column(DateTime, nullable=True)
    stock_document_item_id = Column(
        Integer,
        ForeignKey("stock_document_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    rmz_line = relationship("RMZLine", back_populates="component_recoveries")
