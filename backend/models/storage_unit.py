"""
MODEL: StorageUnit

Jednostka magazynowa (na przyszłość).
Na razie uproszczona wersja.
"""

from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class StorageUnit(Base):
    __tablename__ = "storage_units"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)

    tenant = relationship("Tenant", back_populates="storage_units")
    warehouse = relationship("Warehouse", back_populates="storage_units")