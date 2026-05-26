"""Per PZ line: putaway quantity split by storage location (accumulates per item + location)."""

from sqlalchemy import Column, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class StockItemLocation(Base, BaseModelMixin):
    __tablename__ = "stock_item_locations"

    stock_document_item_id = Column(
        Integer,
        ForeignKey("stock_document_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(Float, nullable=False, default=0)

    document_item = relationship("StockDocumentItem", back_populates="putaway_locations")
    location = relationship("Location")

    __table_args__ = (
        UniqueConstraint(
            "stock_document_item_id",
            "location_id",
            name="uq_stock_item_locations_item_location",
        ),
    )
