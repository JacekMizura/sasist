"""3D Matching attempt audit — immutable history of solver runs (not learning)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

from ..database import Base


class WmsThreeDMatchingEvent(Base):
    """One row = one real invocation of the 3D Matching engine for an order."""

    __tablename__ = "wms_three_d_matching_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)

    #: MANUAL | STATUS | STRATEGY_FALLBACK | STRATEGY_OVERRIDE | SYSTEM
    trigger = Column(String(32), nullable=False, default="SYSTEM", index=True)
    #: Snapshot of packaging_strategy at attempt time
    strategy = Column(String(32), nullable=False, default="SMART_THEN_3D")
    three_d_enabled_snapshot = Column(Integer, nullable=False, default=1)  # 0/1 portable bool
    filler_percent_snapshot = Column(Float, nullable=False, default=0.0)

    shipping_method_id = Column(String(36), nullable=True)
    shipping_method_name_snapshot = Column(String(255), nullable=True)

    #: MATCHED | NO_FIT | MISSING_PRODUCT_DATA | NO_COMPATIBLE_CARTON | ERROR
    result_status = Column(String(32), nullable=False, index=True)

    suggested_carton_id = Column(String(36), nullable=True, index=True)
    suggested_carton_name_snapshot = Column(String(255), nullable=True)
    selected_carton_id = Column(String(36), nullable=True, index=True)
    selected_carton_name_snapshot = Column(String(255), nullable=True)

    fill_percent = Column(Float, nullable=True)
    candidate_count = Column(Integer, nullable=False, default=0)
    compatible_candidate_count = Column(Integer, nullable=False, default=0)

    error_code = Column(String(64), nullable=True)
    error_message = Column(String(2000), nullable=True)

    #: Compact JSON: [{product_id, product_name, quantity}, ...]
    composition_snapshot_json = Column(Text, nullable=True)

    triggered_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    triggered_by_display_snapshot = Column(String(255), nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow, index=True)
    #: Optional later assignment of selected carton (only selected_* fields mutate).
    selected_at = Column(DateTime, nullable=True)
