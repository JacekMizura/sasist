"""
Per-tenant + warehouse WMS packing automation (queue statuses, post-pack pipeline).
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base


class WmsPackingSettings(Base):
    __tablename__ = "wms_packing_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", name="uq_wms_packing_settings_tenant_wh"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    start_status_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True)
    packed_status_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True)
    missing_status_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True)

    auto_actions_json = Column(Text, nullable=False, default="{}")
    document_settings_json = Column(Text, nullable=False, default="{}")
    fallback_label_json = Column(Text, nullable=False, default="{}")
    #: UI ekranu pakowania (checkboxy: stan, EAN, symbol, nr kat.) — JSON obiekt.
    interface_display_json = Column(Text, nullable=False, default="{}")

    #: Po zakończeniu pakowania: ``STAY`` (ekran zamówienia) | ``GO_TO_LIST`` (lista kolejki).
    packing_after_finish_action = Column(String(24), nullable=False, default="STAY")

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
