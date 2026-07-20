"""Canonical WMS audit events per order (event-sourced operational trail)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class WmsOrderEvent(Base):
    """
    Structured warehouse action — NOT free-text logs.
    Every scan/pick/finalize should create a row when operator identity is known (optional legacy: null operator).
    """

    __tablename__ = "wms_order_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)

    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    event_type = Column(String(64), nullable=False, index=True)

    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="SET NULL"), nullable=True, index=True)
    source_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    target_cart_id = Column(Integer, ForeignKey("carts.id", ondelete="SET NULL"), nullable=True, index=True)

    quantity = Column(Float, nullable=True)

    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    order = relationship("Order", back_populates="wms_order_events")


# Event type constants (stored uppercase)
EVT_PICKING_STARTED = "PICKING_STARTED"
EVT_PICKED_ITEM = "PICKED_ITEM"
EVT_PICKING_FINISHED = "PICKING_FINISHED"
EVT_PICKING_CANCELLED = "PICKING_CANCELLED"
EVT_PACKING_STARTED = "PACKING_STARTED"
EVT_PACKED_ITEM = "PACKED_ITEM"
EVT_PACKING_PAUSED = "PACKING_PAUSED"
EVT_PACKING_RESUMED = "PACKING_RESUMED"
EVT_PACKING_FINISHED = "PACKING_FINISHED"
EVT_PACKING_AUTOMATION_FINISHED = "PACKING_AUTOMATION_FINISHED"
EVT_CARTON_SELECTED = "CARTON_SELECTED"
EVT_CARTON_CHANGED = "CARTON_CHANGED"
EVT_LABEL_GENERATED = "LABEL_GENERATED"
EVT_LABEL_REPRINTED = "LABEL_REPRINTED"
EVT_PACKAGE_WEIGHT_CONFIRMED = "PACKAGE_WEIGHT_CONFIRMED"
EVT_SHORTAGE_REPORTED = "SHORTAGE_REPORTED"
EVT_ORDER_LINE_SHORTAGE_REPORTED = "ORDER_LINE_SHORTAGE_REPORTED"
EVT_REPLACEMENT_SHORTAGE_REPORTED = "REPLACEMENT_SHORTAGE_REPORTED"
EVT_RECOVERY_SHORTAGE_REPORTED = "RECOVERY_SHORTAGE_REPORTED"
EVT_PICK_UNDONE = "PICK_UNDONE"
EVT_LOCATION_EMPTIED = "LOCATION_EMPTIED"
EVT_ORDER_LINE_REMOVED = "ORDER_LINE_REMOVED"
EVT_ORDER_ITEM_REMOVED = "ORDER_ITEM_REMOVED"
EVT_REPLACEMENT_ITEM_REMOVED = "REPLACEMENT_ITEM_REMOVED"
EVT_ORDER_LINE_REPLACED = "ORDER_LINE_REPLACED"
EVT_OMS_DECISION_WAIT = "OMS_DECISION_WAIT"
EVT_OMS_DECISION_ACCEPTED = "OMS_DECISION_ACCEPTED"
EVT_RECOVERY_STARTED = "RECOVERY_STARTED"
EVT_RECOVERY_FINISHED = "RECOVERY_FINISHED"
EVT_LOCATION_CHANGED = "LOCATION_CHANGED"
EVT_RESERVATION_CREATED = "RESERVATION_CREATED"
EVT_RESERVATION_RELEASED = "RESERVATION_RELEASED"
EVT_WMS_VALIDATION_FAILED = "WMS_VALIDATION_FAILED"
EVT_WMS_VALIDATION_PASSED = "WMS_VALIDATION_PASSED"
