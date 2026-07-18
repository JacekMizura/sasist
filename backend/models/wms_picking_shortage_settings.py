"""Magazynowe ustawienia obsługi braków przy zbieraniu (stan operacyjny WMS ≠ status OMS)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class WmsPickingShortageSettings(Base):
    __tablename__ = "wms_picking_shortage_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", name="uq_wms_pick_shortage_tenant_wh"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    #: Status panelu OMS po zgłoszeniu braku w trakcie zbierania (NULL = bez zmiany statusu przy zgłoszeniu).
    shortage_reported_order_ui_status_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True)
    auto_enqueue_braki = Column(Boolean, nullable=False, default=True)
    allow_continue_other_lines_after_shortage = Column(Boolean, nullable=False, default=True)
    #: normal | high | immediate_picking
    priority_after_shortage_resolved = Column(String(32), nullable=False, default="high")
    auto_reopen_picking_after_shortage_resolved = Column(Boolean, nullable=False, default=True)
    #: Status OMS po domknięciu dogrywki zbierki (NULL = użyj start_status_id z ustawień pakowania, jeśli jest).
    recovery_completed_order_ui_status_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True)

    #: Status panelu po nieudanej Walidacji WMS (pre-Capacity). NULL = gate bez zmiany statusu.
    wms_validation_failed_order_ui_status_id = Column(
        Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True
    )

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
