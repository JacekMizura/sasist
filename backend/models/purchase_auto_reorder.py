"""Reguły i historia uruchomień automatycznego uzupełniania (szkice PO — bez wysyłki)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class PurchaseAutoRule(Base):
    """Reguła harmonogramu i filtrów dla silnika auto-reorder."""

    __tablename__ = "purchase_auto_rules"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=True)
    run_time = Column(String(8), nullable=False, default="07:00")
    weekdays_json = Column(Text, nullable=False, default="[1,2,3,4,5]")
    config_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="purchase_auto_rules", foreign_keys=[tenant_id])


class PurchaseAutoRun(Base):
    """Pojedyncze uruchomienie silnika (log + liczniki)."""

    __tablename__ = "purchase_auto_runs"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String(32), nullable=False, default="running", index=True)
    created_orders_count = Column(Integer, nullable=False, default=0)
    skipped_products_count = Column(Integer, nullable=False, default=0)
    log_json = Column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="purchase_auto_runs", foreign_keys=[tenant_id])
