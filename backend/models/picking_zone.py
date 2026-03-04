"""
PickingZone – strefa gabarytowa (obszar na hali dla dużych produktów).
Jedno zamówienie może być w wielu strefach; jedna strefa może mieć wiele zamówień.
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Table
from sqlalchemy.orm import relationship
from ..database import Base

# Many-to-many: Order <-> PickingZone
order_zone_association = Table(
    "order_zone",
    Base.metadata,
    Column("order_id", Integer, ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True),
    Column("zone_id", Integer, ForeignKey("picking_zones.id", ondelete="CASCADE"), primary_key=True),
)


class PickingZone(Base):
    __tablename__ = "picking_zones"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    name = Column(String, nullable=False)
    capacity_volume = Column(Float, default=0)  # dm³ (can be set manually or from L×W×H)
    used_volume = Column(Float, default=0)  # dm³
    length_cm = Column(Float, nullable=True)
    width_cm = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    max_weight_kg = Column(Float, nullable=True)

    orders = relationship(
        "Order",
        secondary=order_zone_association,
        back_populates="picking_zones",
    )
