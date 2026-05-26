"""WMS operation sessions — wall-clock / active duration tracking per cart or order."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class WmsOperationSession(Base):
    """
    Session aggregate e.g. picking cart finalize or packing run.
    paused_duration_seconds reserved for future pause/resume; active_duration_seconds computed at close.
    """

    __tablename__ = "wms_operation_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="SET NULL"), nullable=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)

    session_kind = Column(String(32), nullable=False, index=True)  # picking_finalize | packing | ...
    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    started_at = Column(DateTime, nullable=False)
    last_activity_at = Column(DateTime, nullable=True, index=True)
    completed_at = Column(DateTime, nullable=True)
    completed_reason = Column(String(32), nullable=True)
    paused_duration_seconds = Column(Integer, nullable=False, default=0)
    active_duration_seconds = Column(Integer, nullable=True)

    metadata_json = Column(Text, nullable=True)
