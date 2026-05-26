"""Purchasing alert rules, events, and optional auto-draft audit rows."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.orm import relationship

from ..database import Base


class PurchasingAlertRule(Base):
    __tablename__ = "purchasing_alert_rules"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    type = Column(String(64), nullable=False, index=True)
    is_enabled = Column(Boolean, nullable=False, default=True)
    severity = Column(String(32), nullable=False, default="warning")
    config_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="purchasing_alert_rules", foreign_keys=[tenant_id])
    events = relationship(
        "PurchasingAlertEvent",
        back_populates="rule",
        cascade="all, delete-orphan",
        foreign_keys="PurchasingAlertEvent.rule_id",
    )


class PurchasingAlertEvent(Base):
    __tablename__ = "purchasing_alert_events"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("purchasing_alert_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="open", index=True)
    severity = Column(String(32), nullable=False, index=True)
    title = Column(String(512), nullable=False)
    message = Column(Text, nullable=True)
    payload_json = Column(Text, nullable=True)
    dedupe_key = Column(String(256), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="purchasing_alert_events", foreign_keys=[tenant_id])
    rule = relationship("PurchasingAlertRule", back_populates="events", foreign_keys=[rule_id])
    product = relationship("Product", foreign_keys=[product_id])
    supplier = relationship("Supplier", foreign_keys=[supplier_id])


class PurchasingAutoDraft(Base):
    __tablename__ = "purchasing_auto_drafts"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    purchase_order_ids_json = Column(Text, nullable=False)
    summary_json = Column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="purchasing_auto_drafts", foreign_keys=[tenant_id])
