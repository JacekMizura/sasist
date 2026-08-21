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

    #: Legacy mirror of ``smart_enabled`` (pre–independent-flags). Prefer smart_enabled / three_d_enabled.
    enabled = Column(Boolean, nullable=False, default=True)
    #: Independent Smart Matching engine enable (learning + Smart suggest).
    smart_enabled = Column(Boolean, nullable=False, default=True)
    #: Independent 3D Matching engine enable (geometry fit).
    three_d_enabled = Column(Boolean, nullable=False, default=True)
    #: Tryb / próg uczenia: 2 | 3 | 5 identycznych spakowanych zamówień.
    identical_orders_threshold = Column(Integer, nullable=False, default=3)
    #: Status inicjujący propozycję opakowania (jeden) — legacy shared; prefer smart_/three_d_ columns.
    proposal_init_status_id = Column(
        Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: Automatyczne generowanie etykiet (listów) po dopasowaniu opakowania — legacy shared.
    auto_label_enabled = Column(Boolean, nullable=False, default=False)
    #: JSON array of order_ui_status ids — legacy shared.
    auto_label_status_ids_json = Column(Text, nullable=False, default="[]")

    #: Independent Smart proposal-init status (NULL → fallback to proposal_init_status_id).
    smart_proposal_init_status_id = Column(
        Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    smart_auto_label_enabled = Column(Boolean, nullable=True)
    smart_auto_label_status_ids_json = Column(Text, nullable=True)

    #: Independent 3D proposal-init status (NULL → fallback to proposal_init_status_id).
    three_d_proposal_init_status_id = Column(
        Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    three_d_auto_label_enabled = Column(Boolean, nullable=True)
    three_d_auto_label_status_ids_json = Column(Text, nullable=True)

    #: Packaging strategy SSOT (Phase 3 uses fully; default SMART_THEN_3D).
    packaging_strategy = Column(String(32), nullable=False, default="SMART_THEN_3D")
    #: When True, Smart suggest may fall back to legacy exact composition rules (v1 readonly).
    legacy_v1_fallback_enabled = Column(Boolean, nullable=False, default=True)
    #: Volume reserved for filler materials (0–99). Shrinks usable carton dims by cbrt(1 - pct/100).
    three_d_filler_percent = Column(Float, nullable=False, default=0.0)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)


class WmsSmartMatchingObservationV2(Base):
    """One packing decision observation (SINGLE_PRODUCT or COMPOSITION)."""

    __tablename__ = "wms_smart_matching_observations_v2"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    #: SINGLE = the product; COMPOSITION = min(product_id) anchor for NOT NULL FK (not learning key).
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    carton_id = Column(String(36), ForeignKey("cartons.id", ondelete="SET NULL"), nullable=True, index=True)
    suggested_carton_id = Column(String(36), nullable=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    engine_version = Column(Integer, nullable=False, default=2)
    #: SINGLE_PRODUCT | COMPOSITION (legacy rows treated as SINGLE_PRODUCT).
    pattern_type = Column(String(32), nullable=False, default="SINGLE_PRODUCT", index=True)
    #: Structural SSOT for COMPOSITION (and SINGLE snapshot). JSON list of {product_id, quantity}.
    composition_items_json = Column(Text, nullable=True)
    #: Deterministic index hash only — not UI/domain SSOT.
    composition_identity_hash = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow, index=True)


class WmsSmartMatchingRuleV2(Base):
    """
    Smart Matching v2 rule.

    SINGLE_PRODUCT: product_id + min_qty → carton_id (breakpoint semantics).
    COMPOSITION: exact normalized items → carton_id (min_qty sentinel 0; key = composition_identity_hash).
    """

    __tablename__ = "wms_smart_matching_rules_v2"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "pattern_type",
            "product_id",
            "min_qty",
            "carton_id",
            "source",
            "composition_identity_hash",
            name="uq_wms_sm_v2_rule_pattern",
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
    #: Observation that tipped AUTO ACTIVE → BROKEN (deterministic). Legacy / never-broken = NULL.
    broken_by_observation_id = Column(
        Integer,
        ForeignKey("wms_smart_matching_observations_v2.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_threshold = Column(Integer, nullable=True)
    last_order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    engine_version = Column(Integer, nullable=False, default=2)
    pattern_type = Column(String(32), nullable=False, default="SINGLE_PRODUCT", index=True)
    composition_items_json = Column(Text, nullable=True)
    #: Empty string for SINGLE; sha1 for COMPOSITION. Part of unique key.
    composition_identity_hash = Column(String(64), nullable=False, default="", index=True)
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
