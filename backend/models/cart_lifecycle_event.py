"""Event Log wózka — dziennik zdarzeń biznesowych.

event_code  = kod systemowy (logika)
description = opis PL dla użytkownika
severity    = INFO | SUCCESS | WARNING | ERROR | AUDIT

Zapis wyłącznie przez CartLifecycleService.
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Index
from sqlalchemy.sql import func

from ..database import Base


class CartLifecycleEvent(Base):
    __tablename__ = "cart_lifecycle_events"
    __table_args__ = (
        Index("ix_cart_lifecycle_events_cart_occurred", "cart_id", "occurred_at"),
        Index("ix_cart_lifecycle_events_tenant_wh", "tenant_id", "warehouse_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True)

    #: Kod systemowy (np. picking_started) — jedyne pole do logiki / filtrów.
    event_code = Column(String(64), nullable=False, index=True)
    #: Opis po polsku — wyłącznie prezentacja UI.
    description = Column(String(512), nullable=False)
    #: INFO | SUCCESS | WARNING | ERROR | AUDIT
    severity = Column(String(16), nullable=False, default="INFO", index=True)

    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    occurred_at = Column(DateTime, nullable=False, server_default=func.now())

    session_id = Column(Integer, nullable=True)
    batch_id = Column(Integer, nullable=True)
    order_id = Column(Integer, nullable=True)
    metadata_json = Column(Text, nullable=True)
