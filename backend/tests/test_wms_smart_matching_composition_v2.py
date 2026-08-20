"""
Smart Matching v2 COMPOSITION (multi-SKU exact) — EXTEND matrix.

  python -m pytest backend/tests/test_wms_smart_matching_composition_v2.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
from backend.services.packaging_engine.smart_matching_history_events_v2 import (
    learning_series_for_composition,
    list_history_events_v2,
)
from backend.services.packaging_engine.smart_matching_store import (
    composition_from_order,
    get_or_create_settings,
    record_packing_carton_choice,
    save_settings,
)
from backend.services.packaging_engine.smart_matching_v2 import evaluate_smart_matching_v2
from backend.services.packaging_engine.smart_matching_v2.composition import pattern_from_order
from backend.services.packaging_engine.smart_matching_v2.constants import (
    PATTERN_COMPOSITION,
    PATTERN_SINGLE,
    STATUS_ACTIVE,
    STATUS_AMBIGUOUS,
    STATUS_BROKEN,
)
from backend.services.packaging_engine.smart_matching_v2.observations import record_v2_observation_and_learn
from backend.services.packaging_engine.smart_matching_v2.product_rules import set_product_smart_matching_enabled
from backend.services.packaging_engine.strategy_resolver import (
    ThreeDResult,
    resolve_packaging_strategy,
    smart_result_from_drafts,
)


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
    session.add(Tenant(id=2, name="T2", default_warehouse_id=2))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Warehouse(id=2, tenant_id=2, name="WH2"))
    session.add(Product(id=1, tenant_id=1, name="Produkt A", sku="A"))
    session.add(Product(id=2, tenant_id=1, name="Produkt B", sku="B"))
    session.add(Product(id=3, tenant_id=1, name="Produkt C", sku="C"))
    session.add(Product(id=10, tenant_id=1, name="Zestaw sales SKU", sku="SET"))
    session.add(
        ShippingMethod(id="sm-1", tenant_id=1, warehouse_id=1, name="Kurier", code="K", is_active=True)
    )
    for cid, name in (("carton-c", "Gabaryt C"), ("carton-d", "Gabaryt D"), ("carton-x", "X"), ("carton-z", "Z")):
        session.add(
            Carton(
                id=cid,
                tenant_id=1,
                warehouse_id=1,
                name=name,
                length_cm=30,
                width_cm=20,
                height_cm=10,
                is_active=True,
            )
        )
    session.commit()
    # Link C/X/Z to shipping; D intentionally unlinked for incompatible test
    session.execute(
        carton_shipping_method_links.insert().values(
            carton_id="carton-c", shipping_method_id="sm-1"
        )
    )
    session.execute(
        carton_shipping_method_links.insert().values(
            carton_id="carton-x", shipping_method_id="sm-1"
        )
    )
    session.execute(
        carton_shipping_method_links.insert().values(
            carton_id="carton-z", shipping_method_id="sm-1"
        )
    )
    session.commit()
    yield session
    session.close()


def _set_threshold(db, th: int):
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=th,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    db.commit()


def _multi_order(db, oid: int, lines: list[tuple[int, int]], *, carton_id="carton-c", shipping="sm-1"):
    o = Order(
        id=oid,
        tenant_id=1,
        warehouse_id=1,
        number=f"M-{oid}",
        status="new",
        selected_carton_id=carton_id,
        shipping_method_id=shipping,
        created_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    for pid, qty in lines:
        db.add(OrderItem(order_id=oid, product_id=pid, quantity=qty, unit_price=1))
    db.commit()
    return o


def test_a_single_still_learns(db):
    _set_threshold(db, 2)
    for oid, qty in ((1, 3), (2, 3)):
        o = Order(
            id=oid,
            tenant_id=1,
            warehouse_id=1,
            number=f"S-{oid}",
            status="new",
            selected_carton_id="carton-x",
            created_at=datetime.utcnow(),
        )
        db.add(o)
        db.flush()
        db.add(OrderItem(order_id=oid, product_id=1, quantity=qty, unit_price=1))
        db.commit()
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    rules = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.pattern_type == PATTERN_SINGLE).all()
    assert len(rules) == 1
    assert int(rules[0].min_qty) == 3


def test_b_c_d_e_f_g_h_composition_learning_and_identity(db):
    _set_threshold(db, 3)
    # Order of lines reversed — same identity (D)
    o1 = _multi_order(db, 1, [(2, 1), (1, 2)])
    o2 = _multi_order(db, 2, [(1, 2), (2, 1)])
    # Duplicate PID lines aggregated (E)
    o3 = Order(
        id=3,
        tenant_id=1,
        warehouse_id=1,
        number="M-3",
        status="new",
        selected_carton_id="carton-c",
        shipping_method_id=1,
        created_at=datetime.utcnow(),
    )
    db.add(o3)
    db.flush()
    db.add(OrderItem(order_id=3, product_id=1, quantity=1, unit_price=1))
    db.add(OrderItem(order_id=3, product_id=1, quantity=1, unit_price=1))
    db.add(OrderItem(order_id=3, product_id=2, quantity=1, unit_price=1))
    db.commit()

    h1 = pattern_from_order(db, o1).identity_hash
    h2 = pattern_from_order(db, o2).identity_hash
    h3 = pattern_from_order(db, o3).identity_hash
    assert h1 == h2 == h3

    for o in (o1, o2, o3):
        obs = record_v2_observation_and_learn(db, order=o, carton_id="carton-c")
        db.commit()
        assert obs is not None
        assert str(obs.pattern_type) == PATTERN_COMPOSITION

    assert db.query(WmsSmartMatchingObservationV2).count() == 3
    assert db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.pattern_type == PATTERN_SINGLE).count() == 0
    rules = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.pattern_type == PATTERN_COMPOSITION).all()
    assert len(rules) == 1
    assert str(rules[0].carton_id) == "carton-c"

    # F: different qty = different hash
    o_diff = _multi_order(db, 10, [(1, 3), (2, 1)])
    assert pattern_from_order(db, o_diff).identity_hash != h1

    # H: fourth identical gets Smart suggestion
    o4 = _multi_order(db, 4, [(1, 2), (2, 1)])
    from sqlalchemy.orm import noload

    cartons = db.query(Carton).options(noload("*")).all()
    r = evaluate_smart_matching_v2(db, order=o4, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert r.draft is not None
    assert r.draft.suggested_package_id == "carton-c"
    assert r.reason == "V2"


def test_i_shipping_incompatible(db):
    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _multi_order(db, oid, [(1, 2), (2, 1)], carton_id="carton-d", shipping="sm-1")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-d")
        db.commit()
    o3 = _multi_order(db, 3, [(1, 2), (2, 1)], carton_id="carton-d", shipping="sm-1")
    from sqlalchemy.orm import noload

    cartons = db.query(Carton).options(noload("*")).all()
    r = evaluate_smart_matching_v2(db, order=o3, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert r.draft is None


def test_j_k_strategy_fallback(db):
    _set_threshold(db, 2)
    o = _multi_order(db, 1, [(1, 2), (2, 1)])
    from sqlalchemy.orm import noload

    cartons = db.query(Carton).options(noload("*")).all()
    smart = evaluate_smart_matching_v2(db, order=o, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert smart.draft is None
    from backend.services.packaging_engine.suggestions import PackagingSuggestionDraft

    draft = PackagingSuggestionDraft(
        order_id=1,
        source_engine="THREE_D_MATCHING",
        suggested_package_id="carton-c",
        package_name="C",
        package_dimensions="",
        image_url=None,
        confidence_score=0.8,
        fill_percentage=50.0,
        reason="3D",
        sort_key=0.8,
    )
    three_d = ThreeDResult(primary=draft, alternatives=[], fits=True)
    out = resolve_packaging_strategy("SMART_THEN_3D", smart=smart, three_d=three_d)
    assert out.source == "THREE_D"

    for oid in (2, 3):
        ox = _multi_order(db, oid, [(1, 2), (2, 1)])
        record_v2_observation_and_learn(db, order=ox, carton_id="carton-c")
        db.commit()
    o4 = _multi_order(db, 4, [(1, 2), (2, 1)])
    cartons = db.query(Carton).options(noload("*")).all()
    smart2 = evaluate_smart_matching_v2(db, order=o4, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert smart2.draft is not None
    out2 = resolve_packaging_strategy("THREE_D_ONLY", smart=smart2, three_d=three_d)
    assert out2.source == "THREE_D"


def test_l_m_n_break_and_reset(db):
    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _multi_order(db, oid, [(1, 2), (2, 1)])
        record_v2_observation_and_learn(db, order=o, carton_id="carton-c")
        db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.pattern_type == PATTERN_COMPOSITION).one()
    assert str(rule.status) == STATUS_ACTIVE

    # L: one override keeps rule
    o3 = _multi_order(db, 3, [(1, 2), (2, 1)], carton_id="carton-d")
    record_v2_observation_and_learn(db, order=o3, carton_id="carton-d")
    db.commit()
    db.refresh(rule)
    assert str(rule.status) == STATUS_ACTIVE
    assert int(rule.override_streak) == 1

    # Matching C resets streak (N)
    o4 = _multi_order(db, 4, [(1, 2), (2, 1)])
    record_v2_observation_and_learn(db, order=o4, carton_id="carton-c")
    db.commit()
    db.refresh(rule)
    assert int(rule.override_streak) == 0

    # M: two overrides to *different* cartons (no competing series at threshold) → BROKEN
    o5 = _multi_order(db, 5, [(1, 2), (2, 1)], carton_id="carton-x")
    record_v2_observation_and_learn(db, order=o5, carton_id="carton-x")
    db.commit()
    o6 = _multi_order(db, 6, [(1, 2), (2, 1)], carton_id="carton-z")
    obs = record_v2_observation_and_learn(db, order=o6, carton_id="carton-z")
    db.commit()
    db.refresh(rule)
    assert str(rule.status) == STATUS_BROKEN
    assert int(rule.broken_by_observation_id) == int(obs.id)


def test_o_ambiguous_composition(db):
    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _multi_order(db, oid, [(1, 2), (2, 1)])
        record_v2_observation_and_learn(db, order=o, carton_id="carton-c")
        db.commit()
    for oid in (3, 4):
        o = _multi_order(db, oid, [(1, 2), (2, 1)], carton_id="carton-d")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-d")
        db.commit()
    statuses = {
        str(r.carton_id): str(r.status)
        for r in db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.pattern_type == PATTERN_COMPOSITION)
    }
    assert statuses.get("carton-c") == STATUS_AMBIGUOUS
    assert statuses.get("carton-d") == STATUS_AMBIGUOUS
    o5 = _multi_order(db, 5, [(1, 2), (2, 1)])
    from sqlalchemy.orm import noload

    cartons = db.query(Carton).options(noload("*")).all()
    r = evaluate_smart_matching_v2(db, order=o5, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert r.draft is None
    assert r.ambiguous is True or r.reason in ("AMBIGUOUS", "NO_SMART", "V1_LEGACY")


def test_p_product_disable(db):
    _set_threshold(db, 2)
    set_product_smart_matching_enabled(db, tenant_id=1, warehouse_id=1, product_id=2, enabled=False)
    db.commit()
    for oid in (1, 2):
        o = _multi_order(db, oid, [(1, 2), (2, 1)])
        obs = record_v2_observation_and_learn(db, order=o, carton_id="carton-c")
        db.commit()
        assert obs is not None
    assert db.query(WmsSmartMatchingRuleV2).count() == 0
    o3 = _multi_order(db, 3, [(1, 2), (2, 1)])
    from sqlalchemy.orm import noload

    cartons = db.query(Carton).options(noload("*")).all()
    r = evaluate_smart_matching_v2(db, order=o3, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert r.reason == "PRODUCT_DISABLED"


def test_q_r_isolation(db):
    _set_threshold(db, 2)
    o = _multi_order(db, 1, [(1, 2), (2, 1)])
    record_v2_observation_and_learn(db, order=o, carton_id="carton-c")
    db.commit()
    page = list_history_events_v2(db, tenant_id=2, warehouse_id=2)
    assert page["total"] == 0


def test_s_bundle_single_sales_sku(db):
    _set_threshold(db, 2)
    o = Order(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        number="SET",
        status="new",
        selected_carton_id="carton-x",
        created_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=1, product_id=10, quantity=2, unit_price=1))
    db.commit()
    snap = pattern_from_order(db, o)
    assert snap.pattern_type == PATTERN_SINGLE
    obs = record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
    db.commit()
    assert str(obs.pattern_type) == PATTERN_SINGLE


def test_t_u_v_w_history_and_series(db):
    _set_threshold(db, 3)
    for oid in (1, 2, 3):
        o = _multi_order(db, oid, [(1, 2), (2, 1), (3, 4)])
        record_v2_observation_and_learn(db, order=o, carton_id="carton-c")
        db.commit()
    page = list_history_events_v2(db, tenant_id=1, warehouse_id=1)
    assert page["total"] == 3
    blob = str(page)
    assert "composition_key" not in blob
    assert "fingerprint" not in blob
    # SHA may exist as opaque hash field — must not be the primary display; items present
    ev = page["items"][0]
    assert ev["pattern_type"] == PATTERN_COMPOSITION
    assert len(ev["composition_items"]) == 3
    assert "sha1" not in (ev.get("product") or {}).get("name", "").lower()

    hid = ev["composition_identity_hash"]
    series = learning_series_for_composition(
        db, tenant_id=1, warehouse_id=1, identity_hash=hid, carton_id="carton-c"
    )
    idxs = sorted(h["hit_index"] for h in series["hits"])
    assert idxs == [1, 2, 3]
    decisive = [h for h in series["hits"] if h["is_decisive"]]
    assert len(decisive) == 1
    assert series["rule"] is not None
    assert series["rule"]["label"]
    assert "min_qty=" not in series["rule"]["label"]


def test_x_y_legacy_v1(db):
    _set_threshold(db, 2)
    o = _multi_order(db, 1, [(1, 1), (2, 1)])
    record_packing_carton_choice(db, order=o, carton_id="carton-c")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-c")
    db.commit()
    o2 = _multi_order(db, 2, [(1, 1), (2, 1)])
    record_packing_carton_choice(db, order=o2, carton_id="carton-c")
    record_v2_observation_and_learn(db, order=o2, carton_id="carton-c")
    db.commit()
    # No new v1 AUTO rules
    assert db.query(WmsSmartMatchingRule).count() == 0
    # Seed legacy rule → fallback still works when no v2 composition yet broken path
    key, label, _ = composition_from_order(db, o)
    # Clear v2 rules to force legacy
    db.query(WmsSmartMatchingRuleV2).delete()
    db.commit()
    db.add(
        WmsSmartMatchingRule(
            tenant_id=1,
            warehouse_id=1,
            composition_key=key,
            composition_label=label,
            carton_id="carton-c",
            hit_count=5,
            is_auto=True,
        )
    )
    settings = get_or_create_settings(db, tenant_id=1, warehouse_id=1)
    settings.legacy_v1_fallback_enabled = True
    db.commit()
    o3 = _multi_order(db, 3, [(1, 1), (2, 1)])
    from sqlalchemy.orm import noload

    cartons = db.query(Carton).options(noload("*")).all()
    r = evaluate_smart_matching_v2(db, order=o3, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert r.reason == "V1_LEGACY"
