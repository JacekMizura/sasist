"""
MODEL: TenantWarehouse

Join table for many-to-many: Tenant <-> Warehouse.
Supports roles (owner | client | operator) and is_default per tenant.
"""

from sqlalchemy import Column, String, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class TenantWarehouse(Base, BaseModelMixin):
    __tablename__ = "tenant_warehouses"

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(20), nullable=False, default="operator")  # owner | client | operator
    is_default = Column(Integer, nullable=False, default=0)  # 1 = default warehouse for this tenant

    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", name="uq_tenant_warehouse"),)

    tenant = relationship("Tenant", back_populates="tenant_warehouses")
    warehouse = relationship("Warehouse", back_populates="tenant_warehouses")
