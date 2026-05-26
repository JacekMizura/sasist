"""WMS operational tasks — product-centric, event-driven work queue (source of truth)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

from ..database import Base

# Task types (business)
TASK_SHORTAGE_DECISION = "SHORTAGE_DECISION"
TASK_SHORTAGE_RECOLLECT = "SHORTAGE_RECOLLECT"
TASK_WAITING_SUPPLY = "WAITING_SUPPLY"
TASK_RELOCATION = "RELOCATION"

TASK_TYPES = (
    TASK_SHORTAGE_DECISION,
    TASK_SHORTAGE_RECOLLECT,
    TASK_WAITING_SUPPLY,
    TASK_RELOCATION,
)

# Status lifecycle
STATUS_OPEN = "open"
STATUS_IN_PROGRESS = "in_progress"
STATUS_DONE = "done"
STATUS_CANCELLED = "cancelled"

ACTIVE_STATUSES = (STATUS_OPEN, STATUS_IN_PROGRESS)

# UI queue projection only — not business logic
QUEUE_DO_DECYZJI = "DO_DECYZJI"
QUEUE_DO_DOGRYWKI = "DO_DOGRYWKI"
QUEUE_OCZEKUJE_NA_DOSTAWE = "OCZEKUJE_NA_DOSTAWE"
QUEUE_DO_ROZLOKOWANIA = "DO_ROZLOKOWANIA"
QUEUE_ZAKONCZONE = "ZAKONCZONE"


def queue_projection_for_task_type(task_type: str) -> str:
    """Map task_type → UI queue tab (projection only)."""
    mapping = {
        TASK_SHORTAGE_DECISION: QUEUE_DO_DECYZJI,
        TASK_SHORTAGE_RECOLLECT: QUEUE_DO_DOGRYWKI,
        TASK_WAITING_SUPPLY: QUEUE_OCZEKUJE_NA_DOSTAWE,
        TASK_RELOCATION: QUEUE_DO_ROZLOKOWANIA,
    }
    return mapping.get((task_type or "").strip().upper(), QUEUE_DO_DECYZJI)


class WmsOperationalTask(Base):
    __tablename__ = "wms_operational_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    task_type = Column(String(32), nullable=False, index=True)
    status = Column(String(16), nullable=False, default=STATUS_OPEN, index=True)
    queue = Column(String(32), nullable=False, index=True)

    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=True, index=True)

    quantity_required = Column(Float, nullable=False, default=0.0)
    quantity_done = Column(Float, nullable=False, default=0.0)

    location_hint = Column(String(128), nullable=True)
    substitute_product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)

    group_key = Column(String(191), nullable=False, index=True)
    source_event_id = Column(String(191), nullable=True, index=True)
    priority = Column(Integer, nullable=False, default=0)

    payload_json = Column(Text, nullable=False, default="{}")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
