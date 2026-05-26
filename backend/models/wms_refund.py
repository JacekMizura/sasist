"""
Refund decision for an RMZ document.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class WmsRefund(Base):
    __tablename__ = "wms_refunds"
    __table_args__ = (
        UniqueConstraint("rmz_id", name="uq_wms_refunds_rmz_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)

    rmz_id = Column(Integer, ForeignKey("wms_order_returns.id", ondelete="CASCADE"), nullable=False, index=True)

    # FULL | PARTIAL | NONE
    refund_type = Column(String(16), nullable=False, default="NONE")
    refund_amount = Column(Float, nullable=True)
    refund_shipping = Column(Boolean, nullable=False, default=False)
    # Optional explicit amount for shipping refund (separate from item refund_amount).
    refund_shipping_amount = Column(Float, nullable=True)

    decided_by = Column(String(128), nullable=True)
    decided_at = Column(DateTime, nullable=True, default=datetime.utcnow)

