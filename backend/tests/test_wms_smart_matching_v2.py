"""
Smart Matching engine v2 — Phase 1: observations, min_qty rules, breakpoint resolver.

  python -m pytest backend/tests/test_wms_smart_matching_v2.py -q
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
from backend.services.packaging_engine.smart_matching import suggest_smart_matching
from backend.services.packaging_engine.smart_matching_store import save_settings
from backend.services.packaging_engine.smart_matching_v2.constants import SOURCE_AUTO, STATUS_ACTIVE
from backend.services.packaging_engine.smart_matching_v2.eligibility import single_product_qty_from_order
from backend.services.packaging_engine.smart_matching_v2.observations import record_v2_observation_and_learn
from backend.services.packaging_engine.smart_matching_v2.resolver import resolve_breakpoint_rule


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
    session.add(Product(id=1, tenant_id=1, name="Produkt A", sku="A"))
    session.add(Product(id=2, tenant_id=1, name="Produkt B", sku="B"))
    session.add(Product(id=10, tenant_id=1, name="Zestaw Z", sku="SET-Z"))
    session.add(Product(id=11, tenant_id=1, name="Wariant A1", sku="A-V1"))
    session.add(
        Carton(
            id="carton-x",
            tenant_id=1,
            warehouse_id=1,
            name="Karton X",
            length_cm=30,
            width_cm=20,
            height_cm=10,
            is_active=True,
        )
    )
    session.add(
        Carton(
            id="carton-y",
            tenant_id=1,
            warehouse_id=1,
            name="Karton Y",
            length_cm=40,
            width_cm=30,
            height_cm=20,
            is_active=True,
        )
    )
    session.commit()
    yield session
    session.close()


def _order(db, oid: int, *, product_id: int, qty: int, carton_id: str = "carton-x") -> Order:
    o = Order(
        id=oid,
        tenant_id=1,
        warehouse_id=1,
        number=f"O-{oid}",
        status="new",
        selected_carton_id=carton_id,
        created_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=oid, product_id=product_id, quantity=qty, unit_price=1))
    db.commit()
    return o


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


def test_a_qty_3_5_7_creates_one_min_qty_3_rule(db):
    _set_threshold(db, 3)
    for oid, qty in ((1, 3), (2, 5), (3, 7)):
        o = _order(db, oid, product_id=1, qty=qty, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    rules = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.status == STATUS_ACTIVE).all()
    assert len(rules) == 1
    assert int(rules[0].min_qty) == 3
    assert rules[0].carton_id == "carton-x"
    assert int(rules[0].hit_count) == 3
    assert rules[0].created_from_observation_id is not None
    assert int(rules[0].created_threshold) == 3


def test_b_threshold_2(db):
    _set_threshold(db, 2)
    for oid, qty in ((1, 4), (2, 8)):
        o = _order(db, oid, product_id=1, qty=qty)
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).one()
    assert int(rule.min_qty) == 4
    assert int(rule.created_threshold) == 2


def test_c_threshold_3(db):
    _set_threshold(db, 3)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=2)
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    assert db.query(WmsSmartMatchingRuleV2).count() == 0
    o = _order(db, 3, product_id=1, qty=2)
    record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
    db.commit()
    assert db.query(WmsSmartMatchingRuleV2).count() == 1


def test_d_threshold_5(db):
    _set_threshold(db, 5)
    for oid in range(1, 5):
        o = _order(db, oid, product_id=1, qty=1)
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    assert db.query(WmsSmartMatchingRuleV2).count() == 0
    o = _order(db, 5, product_id=1, qty=1)
    record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
    db.commit()
    assert db.query(WmsSmartMatchingRuleV2).count() == 1


def test_e_variant_separation(db):
    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=1)
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    for oid in (3, 4):
        o = _order(db, oid, product_id=11, qty=1)
        record_v2_observation_and_learn(db, order=o, carton_id="carton-y")
        db.commit()
    rules = db.query(WmsSmartMatchingRuleV2).all()
    assert len(rules) == 2
    by_pid = {int(r.product_id): r for r in rules}
    assert by_pid[1].carton_id == "carton-x"
    assert by_pid[11].carton_id == "carton-y"


def test_f_set_product_as_single_sku(db):
    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=10, qty=1)
        assert single_product_qty_from_order(db, o) is not None
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).one()
    assert int(rule.product_id) == 10


def test_g_multi_sku_does_not_create_v2_rule(db):
    _set_threshold(db, 2)
    o = Order(
        id=99,
        tenant_id=1,
        warehouse_id=1,
        number="MULTI",
        status="new",
        selected_carton_id="carton-x",
        created_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=99, product_id=1, quantity=3, unit_price=1))
    db.add(OrderItem(order_id=99, product_id=2, quantity=1, unit_price=1))
    db.commit()
    assert single_product_qty_from_order(db, o) is None
    obs = record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
    db.commit()
    assert obs is None
    assert db.query(WmsSmartMatchingObservationV2).count() == 0
    assert db.query(WmsSmartMatchingRuleV2).count() == 0


def test_h_i_breakpoint_highest_min_qty_wins(db):
    _set_threshold(db, 2)
    for oid, qty in ((1, 3), (2, 3)):
        o = _order(db, oid, product_id=1, qty=qty, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    for oid, qty in ((3, 5), (4, 5)):
        o = _order(db, oid, product_id=1, qty=qty, carton_id="carton-y")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-y")
        db.commit()
    rules = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.status == STATUS_ACTIVE).all()
    assert len(rules) == 2
    r3 = resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=3)
    r4 = resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=4)
    r5 = resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=5)
    r20 = resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=20)
    assert r3 and not r3.ambiguous and r3.rule.carton_id == "carton-x"
    assert r4 and r4.rule.carton_id == "carton-x"
    assert r5 and r5.rule.carton_id == "carton-y"
    assert r20 and r20.rule.carton_id == "carton-y"


def test_suggest_uses_v2_rule(db):
    from sqlalchemy.orm import noload

    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=3, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    order = _order(db, 50, product_id=1, qty=4, carton_id=None)
    cartons = db.query(Carton).options(noload("*")).all()
    drafts = suggest_smart_matching(db, order=order, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert drafts
    assert drafts[0].suggested_package_id == "carton-x"
    assert "v2" in (drafts[0].reason or "").lower()


def test_no_new_v1_rules_on_record_packing(db):
    from backend.services.packaging_engine.smart_matching_store import record_packing_carton_choice

    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=1)
        record_packing_carton_choice(db, order=o, carton_id="carton-x")
        db.commit()
    assert db.query(WmsSmartMatchingRule).count() == 0
    assert db.query(WmsSmartMatchingHistory).count() == 2


def test_j_same_breakpoint_conflict_no_auto(db):
    """Same min_qty competing cartons → AMBIGUOUS, zero suggestion."""
    from datetime import datetime as dt

    from backend.services.packaging_engine.smart_matching_v2.conflicts import (
        reconcile_product_breakpoint_conflicts,
    )
    from backend.services.packaging_engine.smart_matching_v2.constants import (
        SOURCE_AUTO,
        STATUS_AMBIGUOUS,
    )
    from sqlalchemy.orm import noload

    _set_threshold(db, 2)
    now = dt.utcnow()
    for cid in ("carton-x", "carton-y"):
        db.add(
            WmsSmartMatchingRuleV2(
                tenant_id=1,
                warehouse_id=1,
                product_id=1,
                min_qty=3,
                carton_id=cid,
                source=SOURCE_AUTO,
                status=STATUS_ACTIVE,
                is_locked=False,
                hit_count=2,
                override_streak=0,
                created_threshold=2,
                engine_version=2,
                created_at=now,
                updated_at=now,
            )
        )
    db.commit()
    flipped = reconcile_product_breakpoint_conflicts(db, tenant_id=1, warehouse_id=1, product_id=1)
    db.commit()
    assert flipped == 2
    statuses = {str(r.carton_id): str(r.status) for r in db.query(WmsSmartMatchingRuleV2).all()}
    assert statuses.get("carton-x") == STATUS_AMBIGUOUS
    assert statuses.get("carton-y") == STATUS_AMBIGUOUS
    resolved = resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=3)
    assert resolved is None
    order = _order(db, 50, product_id=1, qty=3, carton_id=None)
    cartons = db.query(Carton).options(noload("*")).all()
    drafts = suggest_smart_matching(db, order=order, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert drafts == []


def test_j2_learning_same_min_qty_marks_ambiguous(db):
    """Learning a second carton at the same min_qty marks conflict (no max(hit) tie-break)."""
    from backend.services.packaging_engine.smart_matching_v2.constants import STATUS_AMBIGUOUS

    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=3, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    for oid in (3, 4):
        o = _order(db, oid, product_id=1, qty=3, carton_id="carton-y")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-y")
        db.commit()
    statuses = {str(r.carton_id): str(r.status) for r in db.query(WmsSmartMatchingRuleV2).all()}
    assert statuses.get("carton-x") == STATUS_AMBIGUOUS
    assert statuses.get("carton-y") == STATUS_AMBIGUOUS
    assert resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=3) is None


def test_n_override_streak_below_threshold_keeps_rule(db):
    _set_threshold(db, 3)
    for oid in (1, 2, 3):
        o = _order(db, oid, product_id=1, qty=2, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).one()
    assert str(rule.status) == STATUS_ACTIVE
    # Two overrides — below threshold 3
    for oid in (4, 5):
        o = _order(db, oid, product_id=1, qty=2, carton_id="carton-y")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-y")
        db.commit()
    db.refresh(rule)
    assert str(rule.status) == STATUS_ACTIVE
    assert int(rule.override_streak) == 2


def test_o_override_threshold_breaks_auto_rule(db):
    from backend.services.packaging_engine.smart_matching_v2.constants import STATUS_BROKEN

    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=2, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.carton_id == "carton-x").one()
    # Two overrides to *different* cartons — no competing series reaches threshold → BROKEN.
    o = _order(db, 3, product_id=1, qty=2, carton_id="carton-y")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-y")
    db.commit()
    # Need a third carton for non-competing second override
    db.add(
        Carton(
            id="carton-z",
            tenant_id=1,
            warehouse_id=1,
            name="Karton Z",
            length_cm=25,
            width_cm=15,
            height_cm=10,
            is_active=True,
        )
    )
    db.commit()
    o = _order(db, 4, product_id=1, qty=2, carton_id="carton-z")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-z")
    db.commit()
    db.refresh(rule)
    assert str(rule.status) == STATUS_BROKEN
    assert int(rule.override_streak) >= 2
    resolved = resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=2)
    assert resolved is None or str(resolved.rule.carton_id) != "carton-x"


def test_p_matching_choice_resets_override_streak(db):
    _set_threshold(db, 3)
    for oid in (1, 2, 3):
        o = _order(db, oid, product_id=1, qty=2, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    # One override then match again
    o = _order(db, 4, product_id=1, qty=2, carton_id="carton-y")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-y")
    db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.carton_id == "carton-x").one()
    assert int(rule.override_streak) == 1
    o = _order(db, 5, product_id=1, qty=2, carton_id="carton-x")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
    db.commit()
    db.refresh(rule)
    assert int(rule.override_streak) == 0
    assert str(rule.status) == STATUS_ACTIVE


def test_q_shipping_incompatible_smart_rejected(db):
    from sqlalchemy.orm import noload

    _set_threshold(db, 2)
    db.add(ShippingMethod(id="ship-a", tenant_id=1, warehouse_id=1, name="Kurier A", is_active=True))
    db.execute(
        carton_shipping_method_links.insert().values(carton_id="carton-y", shipping_method_id="ship-a")
    )
    db.commit()
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=3, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    order = _order(db, 50, product_id=1, qty=3, carton_id=None)
    order.shipping_method_id = "ship-a"
    db.add(order)
    db.commit()
    cartons = db.query(Carton).options(noload("*")).all()
    drafts = suggest_smart_matching(db, order=order, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert drafts == []


def test_k_manual_rule_precedence(db):
    from backend.services.packaging_engine.smart_matching_v2.constants import SOURCE_MANUAL
    from backend.services.packaging_engine.smart_matching_v2.product_rules import upsert_manual_rule

    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=3, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    upsert_manual_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        product_id=1,
        min_qty=3,
        carton_id="carton-y",
        is_locked=False,
    )
    db.commit()
    r = resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=4)
    assert r and not r.ambiguous
    assert r.rule.carton_id == "carton-y"
    assert str(r.rule.source) == SOURCE_MANUAL


def test_l_locked_manual_survives_overrides(db):
    from backend.services.packaging_engine.smart_matching_v2.constants import SOURCE_MANUAL, STATUS_ACTIVE
    from backend.services.packaging_engine.smart_matching_v2.product_rules import (
        delete_manual_rule,
        upsert_manual_rule,
    )

    rule = upsert_manual_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        product_id=1,
        min_qty=1,
        carton_id="carton-x",
        is_locked=True,
    )
    db.commit()
    for oid in (1, 2, 3):
        o = _order(db, oid, product_id=1, qty=1, carton_id="carton-y")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-y")
        db.commit()
    db.refresh(rule)
    assert str(rule.status) == STATUS_ACTIVE
    assert str(rule.source) == SOURCE_MANUAL
    assert bool(rule.is_locked) is True
    try:
        delete_manual_rule(db, tenant_id=1, warehouse_id=1, rule_id=int(rule.id))
        assert False, "expected locked delete to fail"
    except ValueError:
        pass


def test_m_disabled_product_logs_but_no_learning_suggest(db):
    from sqlalchemy.orm import noload

    from backend.services.packaging_engine.smart_matching_v2.product_rules import (
        set_product_smart_matching_enabled,
    )

    _set_threshold(db, 2)
    set_product_smart_matching_enabled(
        db, tenant_id=1, warehouse_id=1, product_id=1, enabled=False
    )
    db.commit()
    for oid in (1, 2, 3):
        o = _order(db, oid, product_id=1, qty=2, carton_id="carton-x")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-x")
        db.commit()
    assert db.query(WmsSmartMatchingObservationV2).count() == 3
    assert db.query(WmsSmartMatchingRuleV2).count() == 0
    order = _order(db, 50, product_id=1, qty=2, carton_id=None)
    cartons = db.query(Carton).options(noload("*")).all()
    drafts = suggest_smart_matching(db, order=order, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert drafts == []
