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

    #: Packaging strategy SSOT (Phase 3 uses fully; default SMART_THEN_3D).
    packaging_strategy = Column(String(32), nullable=False, default="SMART_THEN_3D")
    #: When True, Smart suggest may fall back to legacy exact composition rules (v1 readonly).
    legacy_v1_fallback_enabled = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)


class WmsSmartMatchingObservationV2(Base):
    """Per-product packing observation for Smart Matching engine v2 (min-qty learning)."""

    __tablename__ = "wms_smart_matching_observations_v2"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    carton_id = Column(String(36), ForeignKey("cartons.id", ondelete="SET NULL"), nullable=True, index=True)
    suggested_carton_id = Column(String(36), nullable=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    engine_version = Column(Integer, nullable=False, default=2)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow, index=True)


class WmsSmartMatchingRuleV2(Base):
    """
    Smart Matching v2 rule: product_id + min_qty → carton_id.

    Breakpoint semantics: for order qty Q pick ACTIVE rules with min_qty <= Q, then MAX(min_qty).
    """

    __tablename__ = "wms_smart_matching_rules_v2"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "product_id",
            "min_qty",
            "carton_id",
            "source",
            name="uq_wms_sm_v2_rule_breakpoint",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    min_qty = Column(Integer, nullable=False)
    carton_id = Column(String(36), ForeignKey("cartons.id", ondelete="CASCADE"), nullable=False, index=True)
    #: AUTO | MANUAL
    source = Column(String(16), nullable=False, default="AUTO")
    #: ACTIVE | BROKEN | AMBIGUOUS
    status = Column(String(16), nullable=False, default="ACTIVE", index=True)
    is_locked = Column(Boolean, nullable=False, default=False)
    hit_count = Column(Integer, nullable=False, default=0)
    override_streak = Column(Integer, nullable=False, default=0)
    created_from_observation_id = Column(
        Integer,
        ForeignKey("wms_smart_matching_observations_v2.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_threshold = Column(Integer, nullable=True)
    last_order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    engine_version = Column(Integer, nullable=False, default=2)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)


class WmsSmartMatchingProductSettings(Base):
    """Per-product Smart Matching enable (warehouse-scoped). Phase 4 wires UI; Phase 1 schema ready."""

    __tablename__ = "wms_smart_matching_product_settings"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "product_id",
            name="uq_wms_sm_product_settings",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    smart_matching_enabled = Column(Boolean, nullable=False, default=True)
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
    #: History row that INSERT-ed this rule (deterministic DECYDUJĄCY). Legacy = NULL.
    created_from_history_id = Column(
        Integer,
        ForeignKey("wms_smart_matching_history.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: Threshold (2|3|5) at rule INSERT time. Legacy = NULL.
    created_threshold = Column(Integer, nullable=True)
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
