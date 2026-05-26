"""
RMZ line (return line) stored as normalized rows.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Float, UniqueConstraint

from ..database import Base


class RMZLine(Base):
    __tablename__ = "rmz_lines"
    __table_args__ = (
        UniqueConstraint("rmz_id", "order_item_id", name="uq_rmz_lines_rmz_order_item"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)

    rmz_id = Column(Integer, ForeignKey("wms_order_returns.id", ondelete="CASCADE"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=0)
    accepted_qty = Column(Integer, nullable=True)
    damaged_b_qty = Column(Integer, nullable=True)
    damaged_c_qty = Column(Integer, nullable=True)
    rejected_qty = Column(Integer, nullable=True)

    decision = Column(String(24), nullable=True)  # OK | DAMAGED | REJECTED
    condition = Column(String(4), nullable=True)  # A | B | C
    photo_urls = Column(Text, nullable=True)  # JSON array/string; optional

    processed_at = Column(DateTime, nullable=True)
    damage_type = Column(String(32), nullable=True)  # optional snapshot from UI
    final_disposition = Column(String(32), nullable=True)

    """JSON array of independent damage chunks: [{id, qty, condition, damage_type, photo_urls, note, ...}]."""
    damage_entries_json = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

