"""
Smart Matching: settings, learning, interrupted series, reset, auto-label gate.

  python -m pytest backend/tests/test_wms_smart_matching.py -q
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import noload, sessionmaker

from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_smart_matching import (
    WmsSmartMatchingBreak,
    WmsSmartMatchingHistory,
    WmsSmartMatchingObservationV2,
    WmsSmartMatchingProductSettings,
    WmsSmartMatchingRule,
    WmsSmartMatchingRuleV2,
    WmsSmartMatchingSettings,
)
from backend.services.packaging_engine.smart_matching import suggest_smart_matching
from backend.services.packaging_engine.smart_matching_store import (
    get_or_create_settings,
    record_packing_carton_choice,
    reset_auto_rules,
    save_settings,
    settings_to_out,
)
from backend.services.packaging_engine.smart_matching_triggers import on_order_status_changed_smart_matching
from backend.services.packaging_engine.smart_matching_v2.observations import record_v2_observation_and_learn


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        OrderUiStatus,
        Product,
        ShippingMethod,
        Carton,
        Order,
        OrderItem,
        WmsSmartMatchingSettings,
        WmsSmartMatchingHistory,
        WmsSmartMatchingRule,
        WmsSmartMatchingBreak,
        WmsSmartMatchingObservationV2,
        WmsSmartMatchingRuleV2,
        WmsSmartMatchingProductSettings,
    ):
        model.__table__.create(engine, checkfirst=True)
    carton_shipping_method_links.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        OrderUiStatus(
            id=10, tenant_id=1, warehouse_id=1, main_group="NEW", name="Nowe", color="#00f", sort_order=1
        )
    )
    session.add(
        OrderUiStatus(
            id=20, tenant_id=1, warehouse_id=1, main_group="IN_PROGRESS", name="Pakowanie", color="#0a0", sort_order=2
        )
    )
    session.add(
        OrderUiStatus(
            id=30, tenant_id=1, warehouse_id=1, main_group="DONE", name="Wysłane", color="#111", sort_order=3
        )
    )
    session.add(Product(id=1, tenant_id=1, name="Produkt A", sku="A"))
    session.add(
        Carton(
            id="carton-m",
            tenant_id=1,
            warehouse_id=1,
            name="Karton M",
            is_active=True,
            length_cm=30,
            width_cm=20,
            height_cm=15,
        )
    )
    session.add(
        Carton(
            id="carton-l",
            tenant_id=1,
            warehouse_id=1,
            name="Karton L",
            is_active=True,
            length_cm=40,
            width_cm=30,
            height_cm=20,
        )
    )
    session.commit()
    yield session
    session.close()


def _make_order(db, order_id: int, carton_id: str | None = None) -> Order:
    o = Order(
        id=order_id,
        tenant_id=1,
        warehouse_id=1,
        number=f"ORD-{order_id}",
        selected_carton_id=carton_id,
        order_ui_status_id=10,
        created_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(id=order_id * 10, order_id=order_id, product_id=1, quantity=2))
    db.commit()
    return o


def test_settings_enable_disable_and_statuses(db):
    row = save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=False,
        identical_orders_threshold=5,
        proposal_init_status_id=20,
        auto_label_enabled=True,
        auto_label_status_ids=[20, 30],
    )
    db.commit()
    out = settings_to_out(row)
    assert out.enabled is False
    assert out.identical_orders_threshold == 5
    assert out.proposal_init_status_id == 20
    assert out.auto_label_enabled is True
    assert out.auto_label_status_ids == [20, 30]


def test_disabled_smart_matching_returns_no_suggestions(db):
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=False,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    order = _make_order(db, 1)
    cartons = db.query(Carton).options(noload("*")).all()
    assert suggest_smart_matching(db, order=order, tenant_id=1, warehouse_id=1, cartons=cartons) == []


def test_learning_creates_rule_after_threshold(db):
    """v2 cutover: packing record no longer creates v1 rules; v2 learns min_qty rules."""
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    o1 = _make_order(db, 1)
    o2 = _make_order(db, 2)
    record_packing_carton_choice(db, order=o1, carton_id="carton-m", operator_user_id=None)
    record_v2_observation_and_learn(db, order=o1, carton_id="carton-m")
    db.commit()
    assert db.query(WmsSmartMatchingRule).count() == 0
    assert db.query(WmsSmartMatchingRuleV2).count() == 0
    record_packing_carton_choice(db, order=o2, carton_id="carton-m", operator_user_id=None)
    record_v2_observation_and_learn(db, order=o2, carton_id="carton-m")
    db.commit()
    assert db.query(WmsSmartMatchingRule).count() == 0
    rules = db.query(WmsSmartMatchingRuleV2).all()
    assert len(rules) == 1
    assert rules[0].carton_id == "carton-m"
    assert rules[0].source == "AUTO"
    assert rules[0].hit_count >= 2
    assert int(rules[0].min_qty) == 2


def _seed_v1_rule(db, *, composition_key: str, carton_id: str, hit_count: int = 2, history_id=None, threshold=2):
    now = datetime.utcnow()
    rule = WmsSmartMatchingRule(
        tenant_id=1,
        warehouse_id=1,
        composition_key=composition_key,
        composition_label="seed",
        carton_id=carton_id,
        hit_count=hit_count,
        is_auto=True,
        created_from_history_id=history_id,
        created_threshold=threshold,
        created_at=now,
        updated_at=now,
    )
    db.add(rule)
    db.flush()
    return rule


def test_created_from_history_stable_after_extra_hits(db):
    """Legacy v1 field stability — seed existing v1 rule (no new v1 creates)."""
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    for oid in (1, 2, 3):
        o = _make_order(db, oid)
        record_packing_carton_choice(db, order=o, carton_id="carton-m")
        db.commit()
    h3 = db.query(WmsSmartMatchingHistory).filter(WmsSmartMatchingHistory.order_id == 3).one()
    key = h3.composition_key
    rule = _seed_v1_rule(db, composition_key=key, carton_id="carton-m", hit_count=3, history_id=int(h3.id), threshold=3)
    db.commit()
    decisive = int(rule.created_from_history_id)
    record_packing_carton_choice(db, order=_make_order(db, 4), carton_id="carton-m")
    db.commit()
    db.refresh(rule)
    assert int(rule.created_from_history_id) == decisive
    assert int(rule.hit_count) == 4
    assert int(rule.created_threshold) == 3


def test_reset_recreate_sets_new_created_from(db):
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    for oid in (1, 2):
        o = _make_order(db, oid)
        record_packing_carton_choice(db, order=o, carton_id="carton-m")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-m")
        db.commit()
    first = db.query(WmsSmartMatchingRuleV2).one()
    first_decisive = first.created_from_observation_id
    reset_auto_rules(db, tenant_id=1, warehouse_id=1)
    db.commit()
    assert db.query(WmsSmartMatchingRuleV2).count() == 0
    assert db.query(WmsSmartMatchingHistory).count() == 2
    assert db.query(WmsSmartMatchingObservationV2).count() == 2
    o = _make_order(db, 10)
    record_packing_carton_choice(db, order=o, carton_id="carton-m")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-m")
    db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).one()
    new_obs = db.query(WmsSmartMatchingObservationV2).filter(WmsSmartMatchingObservationV2.order_id == 10).one()
    assert int(rule.created_from_observation_id) == int(new_obs.id)
    assert int(rule.created_from_observation_id) != int(first_decisive)


def test_legacy_rule_null_created_from_no_decisive(db):
    from backend.services.packaging_engine.smart_matching_history_series import list_history_series

    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    for oid in (1, 2):
        o = _make_order(db, oid)
        record_packing_carton_choice(db, order=o, carton_id="carton-m")
        db.commit()
    h = db.query(WmsSmartMatchingHistory).first()
    rule = _seed_v1_rule(
        db, composition_key=h.composition_key, carton_id="carton-m", hit_count=2, history_id=None, threshold=2
    )
    rule.created_from_history_id = None
    rule.created_threshold = None
    db.add(rule)
    db.commit()
    page = list_history_series(db, tenant_id=1, warehouse_id=1, page=1, limit=50)
    assert page["total"] == 1
    assert all(not h["is_decisive"] for h in page["items"][0]["hits"])
    assert page["items"][0]["created_from_history_id"] is None


def test_history_series_grouping_and_two_cartons(db):
    from backend.services.packaging_engine.smart_matching_history_series import list_history_series

    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    record_packing_carton_choice(db, order=_make_order(db, 1), carton_id="carton-m")
    db.commit()
    record_packing_carton_choice(db, order=_make_order(db, 2), carton_id="carton-l")
    db.commit()
    page = list_history_series(db, tenant_id=1, warehouse_id=1, page=1, limit=50)
    assert page["total"] == 2
    cartons = {s["carton_id"] for s in page["items"]}
    assert cartons == {"carton-m", "carton-l"}


def test_history_series_override_and_composition_items(db):
    from backend.services.packaging_engine.smart_matching_history_series import list_history_series

    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    for oid in (1, 2):
        record_packing_carton_choice(db, order=_make_order(db, oid), carton_id="carton-m")
        db.commit()
    h = db.query(WmsSmartMatchingHistory).filter(WmsSmartMatchingHistory.order_id == 2).one()
    _seed_v1_rule(
        db,
        composition_key=h.composition_key,
        carton_id="carton-m",
        hit_count=2,
        history_id=int(h.id),
        threshold=2,
    )
    db.commit()
    record_packing_carton_choice(db, order=_make_order(db, 3), carton_id="carton-l")
    db.commit()
    page = list_history_series(db, tenant_id=1, warehouse_id=1, page=1, limit=50)
    series_l = next(s for s in page["items"] if s["carton_id"] == "carton-l")
    assert series_l["has_overrides"] or any(h["is_override"] for h in series_l["hits"])
    ov = next(h for h in series_l["hits"] if h["is_override"])
    assert ov["suggested_carton_id"] == "carton-m"
    assert ov["carton_id"] == "carton-l"
    series_m = next(s for s in page["items"] if s["carton_id"] == "carton-m")
    assert series_m["has_active_rule"] is True
    assert any(h["is_decisive"] for h in series_m["hits"])
    assert series_m["composition_items"]
    assert series_m["composition_items"][0]["product_id"] == 1


def test_created_threshold_survives_settings_change(db):
    from backend.services.packaging_engine.smart_matching_history_series import list_history_series

    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    for oid in (1, 2, 3):
        record_packing_carton_choice(db, order=_make_order(db, oid), carton_id="carton-m")
        db.commit()
    h = db.query(WmsSmartMatchingHistory).filter(WmsSmartMatchingHistory.order_id == 3).one()
    _seed_v1_rule(
        db,
        composition_key=h.composition_key,
        carton_id="carton-m",
        hit_count=3,
        history_id=int(h.id),
        threshold=3,
    )
    db.commit()
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=5,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    page = list_history_series(db, tenant_id=1, warehouse_id=1)
    s = page["items"][0]
    assert s["created_threshold"] == 3
    assert s["threshold"] == 3
    assert s["current_threshold"] == 5


def test_historical_suggestion_and_manual_override_break(db):
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    for oid in (1, 2):
        o = _make_order(db, oid)
        record_packing_carton_choice(db, order=o, carton_id="carton-m")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-m")
        db.commit()

    o3 = _make_order(db, 3)
    cartons = db.query(Carton).options(noload("*")).all()
    smart = suggest_smart_matching(db, order=o3, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert smart
    assert smart[0].suggested_package_id == "carton-m"
    assert "v2" in (smart[0].reason or "").lower()

    record_packing_carton_choice(db, order=o3, carton_id="carton-l")
    db.commit()
    hist = (
        db.query(WmsSmartMatchingHistory)
        .filter(WmsSmartMatchingHistory.order_id == 3)
        .one()
    )
    # Without active v1 rule, break detection uses v1 active_rule only — seed not required for v2 Phase 1.
    # Override vs v2 suggestion is Phase 2; here ensure history wrote chosen carton.
    assert hist.carton_id == "carton-l"


def test_reset_deletes_only_auto_rules_keeps_history(db):
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    for oid in (1, 2):
        o = _make_order(db, oid)
        record_packing_carton_choice(db, order=o, carton_id="carton-m")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-m")
        db.commit()
    assert db.query(WmsSmartMatchingRuleV2).count() == 1
    assert db.query(WmsSmartMatchingHistory).count() == 2
    n = reset_auto_rules(db, tenant_id=1, warehouse_id=1)
    db.commit()
    assert n >= 1
    assert db.query(WmsSmartMatchingRuleV2).count() == 0
    assert db.query(WmsSmartMatchingHistory).count() == 2
    assert db.query(WmsSmartMatchingObservationV2).count() == 2


def test_auto_label_skipped_without_packaging(db):
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=True,
        auto_label_status_ids=[30],
    )
    db.commit()
    order = _make_order(db, 1, carton_id=None)
    order.order_ui_status_id = 30
    db.commit()
    result = on_order_status_changed_smart_matching(db, order=order, new_status_id=30)
    assert result["auto_label"] is not None
    assert result["auto_label"]["ok"] is False
    assert result["auto_label"]["message"] == "no_packaging"


def test_proposal_init_assigns_when_no_carton(db):
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=20,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    order = _make_order(db, 50, carton_id=None)
    from backend.schemas.packaging_intelligence import PackagingSuggestionOut

    fake_primary = PackagingSuggestionOut(
        order_id=50,
        source_engine="SMART_MATCHING",
        suggested_package_id="carton-m",
        package_name="Karton M",
        confidence_score=0.9,
        reason="HISTORICAL_MATCH",
    )
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=([fake_primary], fake_primary, [], None),
    ):
        result = on_order_status_changed_smart_matching(db, order=order, new_status_id=20)
        db.commit()

    assert result["proposal"] is not None
    assert result["proposal"]["ok"] is True
    assert result["proposal"]["assigned"] is True
    db.refresh(order)
    assert order.selected_carton_id == "carton-m"


def test_get_or_create_settings_defaults(db):
    row = get_or_create_settings(db, tenant_id=1, warehouse_id=1)
    db.commit()
    assert row.enabled is True
    assert int(row.identical_orders_threshold) == 3


def test_disabled_still_writes_history_but_no_new_rules(db):
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=False,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    for oid in (1, 2):
        o = _make_order(db, oid)
        record_packing_carton_choice(db, order=o, carton_id="carton-m")
        db.commit()
    assert db.query(WmsSmartMatchingHistory).count() == 2
    assert db.query(WmsSmartMatchingRule).count() == 0


def test_dashboard_stats_has_no_fake_atrapa_fields(db):
    from backend.services.packaging_engine.smart_matching_store import dashboard_stats

    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=2,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()
    o = _make_order(db, 1)
    record_packing_carton_choice(db, order=o, carton_id="carton-m")
    db.commit()
    stats = dashboard_stats(db, tenant_id=1, warehouse_id=1, period_days=7)
    assert "avg_confidence" not in stats
    assert "avg_fill_pct" not in stats
    assert "products_missing_dimensions" not in stats
    assert "failed_suggestions" not in stats
    assert "suggestions_total" in stats
    assert "override_rate_pct" in stats
    assert "top_packages" in stats
