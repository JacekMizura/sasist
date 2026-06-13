"""User ↔ warehouse assignments (operational scope)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, UniqueConstraint

from ..database import Base


class UserWarehouseAssignment(Base):
    __tablename__ = "user_warehouse_assignments"
    __table_args__ = (UniqueConstraint("user_id", "warehouse_id", name="uq_user_warehouse_assignment"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    is_default = Column(Boolean, nullable=False, default=False)
    can_operate = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
