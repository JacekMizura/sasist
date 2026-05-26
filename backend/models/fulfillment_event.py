"""
FulfillmentEvent — ledger of quantities affecting order line fulfillment (OMS/WMS).

Single source of truth for picked / shortage / OMS decisions; API fields such as
``picked_quantity`` / ``missing_quantity`` are derived from these events.
"""

from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin

# Event types (stored uppercase in DB)
FE_PICK = "PICK"
FE_MISSING = "MISSING"
FE_REPLACED = "REPLACED"
FE_REMOVED = "REMOVED"
FE_WAITING = "WAITING"

FE_TYPES = (FE_PICK, FE_MISSING, FE_REPLACED, FE_REMOVED, FE_WAITING)


class FulfillmentEvent(Base, BaseModelMixin):
    __tablename__ = "fulfillment_events"

    order_item_id = Column(
        Integer,
        ForeignKey("order_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = Column(String(32), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    metadata_json = Column(Text, nullable=True)

    order_item = relationship("OrderItem", back_populates="fulfillment_events")
