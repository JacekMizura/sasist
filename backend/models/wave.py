"""
MODEL: Wave

Fala kompletacji (wave picking). Grupuje zamówienia przed clusteringiem i przypisaniem do koszyków.
"""

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class Wave(Base):
    __tablename__ = "waves"

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20), nullable=False, default="created")  # created | assigned | picking | completed
    orders_count = Column(Integer, nullable=False, default=0)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    pick_wave = relationship(
        "PickWave",
        back_populates="wave",
        uselist=False,
        foreign_keys="PickWave.wave_id",
    )
    orders = relationship(
        "Order",
        back_populates="wave",
        foreign_keys="Order.wave_id",
    )
