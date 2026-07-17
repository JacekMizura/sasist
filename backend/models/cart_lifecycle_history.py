"""Historia przejść statusu wózka — zapis wyłącznie przez CartLifecycleService."""

from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Index
from sqlalchemy.sql import func

from ..database import Base


class CartLifecycleHistory(Base):
    __tablename__ = "cart_lifecycle_history"
    __table_args__ = (
        Index("ix_cart_lifecycle_history_cart_changed", "cart_id", "changed_at"),
        Index("ix_cart_lifecycle_history_tenant_wh", "tenant_id", "warehouse_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True)

    from_status = Column(String(32), nullable=True)
    to_status = Column(String(32), nullable=False)
    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    changed_at = Column(DateTime, nullable=False, server_default=func.now())
    reason = Column(String(64), nullable=False, default="transition")

    #: Typ zadania roboczego w momencie zmiany (PICKING / PACKING / CLAIM / …).
    task_type = Column(String(32), nullable=True)
    #: Id sesji / zadania (np. wms_operation_sessions.id).
    task_id = Column(Integer, nullable=True)
    batch_id = Column(Integer, nullable=True)
    metadata_json = Column(Text, nullable=True)
