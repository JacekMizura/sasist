"""Smart Matching — settings, learned rules, packing-choice history, interrupted series."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from ..database import Base


class WmsSmartMatchingSettings(Base):
    __tablename__ = "wms_smart_matching_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", name="uq_wms_smart_matching_settings_tenant_wh"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    #: Włącz propozycje opakowań do zamówień (Smart + wspólny przełącznik silników).
    enabled = Column(Boolean, nullable=False, default=True)
    #: Tryb / próg uczenia: 2 | 3 | 5 identycznych spakowanych zamówień.
    identical_orders_threshold = Column(Integer, nullable=False, default=3)
    #: Status inicjujący propozycję opakowania (jeden).
    proposal_init_status_id = Column(
        Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: Automatyczne generowanie etykiet (listów) po dopasowaniu opakowania.
    auto_label_enabled = Column(Boolean, nullable=False, default=False)
    #: JSON array of order_ui_status ids.
    auto_label_status_ids_json = Column(Text, nullable=False, default="[]")

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)


class WmsSmartMatchingRule(Base):
    """
    Automatycznie utworzone powiązanie composition → carton.

    Reset usuwa wyłącznie te reguły (is_auto=True). Historia pakowania zostaje.
    """

    __tablename__ = "wms_smart_matching_rules"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "composition_key",
            "carton_id",
            name="uq_wms_sm_rule_comp_carton",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    composition_key = Column(String(64), nullable=False, index=True)
    composition_label = Column(String(512), nullable=False, default="")
    carton_id = Column(String(36), ForeignKey("cartons.id", ondelete="CASCADE"), nullable=False, index=True)
    hit_count = Column(Integer, nullable=False, default=0)
    is_auto = Column(Boolean, nullable=False, default=True)
    last_order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)


class WmsSmartMatchingHistory(Base):
    """Rzeczywisty wybór opakowania przy pakowaniu (nauka + audyt)."""

    __tablename__ = "wms_smart_matching_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    composition_key = Column(String(64), nullable=False, index=True)
    composition_label = Column(String(512), nullable=False, default="")
    carton_id = Column(String(36), ForeignKey("cartons.id", ondelete="SET NULL"), nullable=True, index=True)
    carton_name = Column(String(255), nullable=True)
    suggested_carton_id = Column(String(36), nullable=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_display = Column(String(255), nullable=True)
    quantity_units = Column(Float, nullable=True)
    broke_series = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow, index=True)


class WmsSmartMatchingBreak(Base):
    """Przerwana seria — wybór innego opakowania niż sugerowana reguła Smart Matching."""

    __tablename__ = "wms_smart_matching_breaks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("wms_smart_matching_rules.id", ondelete="CASCADE"), nullable=True, index=True)
    history_id = Column(
        Integer, ForeignKey("wms_smart_matching_history.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    composition_key = Column(String(64), nullable=False, index=True)
    suggested_carton_id = Column(String(36), nullable=True)
    chosen_carton_id = Column(String(36), nullable=True)
    chosen_carton_name = Column(String(255), nullable=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    user_display = Column(String(255), nullable=True)
    quantity_units = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow, index=True)
