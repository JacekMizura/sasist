"""
Smart Matching history-events v2 + broken_by_observation_id (Phase 5A).

  python -m pytest backend/tests/test_wms_smart_matching_history_events_v2.py -q
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
    learning_series_for_product_carton,
    list_history_events_v2,
)
from backend.services.packaging_engine.smart_matching_history_series import list_history_series
from backend.services.packaging_engine.smart_matching_store import save_settings
from backend.services.packaging_engine.smart_matching_v2.constants import (
    SOURCE_MANUAL,
    STATUS_ACTIVE,
    STATUS_AMBIGUOUS,
    STATUS_BROKEN,
)
from backend.services.packaging_engine.smart_matching_v2.observations import record_v2_observation_and_learn
from backend.services.packaging_engine.smart_matching_v2.product_rules import upsert_manual_rule


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
    session.add(Product(id=1, tenant_id=1, name="Sznurówka CAT 100 cm", sku="CAT"))
    session.add(Product(id=2, tenant_id=1, name="Inny", sku="X"))
    session.add(
        Carton(
            id="carton-a",
            tenant_id=1,
            warehouse_id=1,
            name="Gabaryt A",
            length_cm=30,
            width_cm=20,
            height_cm=10,
            is_active=True,
        )
    )
    session.add(
        Carton(
            id="carton-b",
            tenant_id=1,
            warehouse_id=1,
            name="Gabaryt B",
            length_cm=40,
            width_cm=30,
            height_cm=20,
            is_active=True,
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


def _order(db, oid: int, *, product_id: int, qty: int, carton_id: str = "carton-a", warehouse_id: int = 1, tenant_id: int = 1):
    o = Order(
        id=oid,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
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


def test_a_b_c_d_e_qty_rows_and_decisive(db):
    _set_threshold(db, 3)
    for oid, qty in ((1, 3), (2, 5), (3, 7)):
        o = _order(db, oid, product_id=1, qty=qty)
        record_v2_observation_and_learn(db, order=o, carton_id="carton-a")
        db.commit()

    page = list_history_events_v2(db, tenant_id=1, warehouse_id=1, page=1, limit=50)
    assert page["total"] == 3
    assert "composition_key" not in str(page)
    qtys = sorted(i["quantity"] for i in page["items"])
    assert qtys == [3, 5, 7]

    created = [i for i in page["items"] if i["is_rule_created"]]
    assert len(created) == 1
    assert created[0]["is_decisive"] is True
    assert created[0]["quantity"] == 7

    rule = db.query(WmsSmartMatchingRuleV2).one()
    assert int(rule.created_from_observation_id) == int(created[0]["observation_id"])

    series = learning_series_for_product_carton(
        db, tenant_id=1, warehouse_id=1, product_id=1, carton_id="carton-a"
    )
    indexes = sorted(h["hit_index"] for h in series["hits"])
    assert indexes == [1, 2, 3]
    by_idx = {h["hit_index"]: h for h in series["hits"]}
    assert by_idx[1]["quantity"] == 3
    assert by_idx[2]["quantity"] == 5
    assert by_idx[3]["quantity"] == 7
    assert by_idx[3]["is_decisive"] is True
    assert series["rule"]["label"].startswith("od 3 szt.")


def test_f_override(db):
    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=2, carton_id="carton-a")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-a")
        db.commit()
    o = _order(db, 3, product_id=1, qty=2, carton_id="carton-b")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-b")
    db.commit()
    page = list_history_events_v2(db, tenant_id=1, warehouse_id=1, event_type="override")
    assert page["total"] >= 1
    assert any(i["is_override"] for i in page["items"])
    ov = next(i for i in page["items"] if i["is_override"])
    assert ov["suggested_carton"]["id"] == "carton-a"
    assert ov["carton"]["id"] == "carton-b"


def test_g_h_break_linkage(db):
    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=2, carton_id="carton-a")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-a")
        db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.carton_id == "carton-a").one()

    o = _order(db, 3, product_id=1, qty=2, carton_id="carton-b")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-b")
    db.commit()
    db.refresh(rule)
    assert str(rule.status) == STATUS_ACTIVE
    assert int(rule.override_streak) == 1

    db.add(
        Carton(
            id="carton-z",
            tenant_id=1,
            warehouse_id=1,
            name="Z",
            length_cm=10,
            width_cm=10,
            height_cm=10,
            is_active=True,
        )
    )
    db.commit()
    o = _order(db, 4, product_id=1, qty=2, carton_id="carton-z")
    obs = record_v2_observation_and_learn(db, order=o, carton_id="carton-z")
    db.commit()
    db.refresh(rule)
    assert str(rule.status) == STATUS_BROKEN
    assert rule.broken_by_observation_id is not None
    assert int(rule.broken_by_observation_id) == int(obs.id)

    page = list_history_events_v2(db, tenant_id=1, warehouse_id=1, event_type="rule_broken")
    assert page["total"] == 1
    assert page["items"][0]["observation_id"] == int(obs.id)
    assert page["items"][0]["is_rule_broken"] is True

    # Only one broken event
    all_page = list_history_events_v2(db, tenant_id=1, warehouse_id=1)
    broken_flags = [i for i in all_page["items"] if i["is_rule_broken"]]
    assert len(broken_flags) == 1


def test_i_j_manual_locked(db):
    upsert_manual_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        product_id=1,
        min_qty=1,
        carton_id="carton-a",
        is_locked=True,
    )
    db.commit()
    o = _order(db, 1, product_id=1, qty=2, carton_id="carton-a")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-a")
    db.commit()
    page = list_history_events_v2(db, tenant_id=1, warehouse_id=1, event_type="manual")
    assert page["total"] >= 1
    linked = page["items"][0]["linked_rule"]
    assert linked is not None
    assert linked["source"] == SOURCE_MANUAL
    assert linked["is_locked"] is True


def test_k_conflict(db):
    """Conflict badge only when linked rule is really AMBIGUOUS (learning path)."""
    from backend.services.packaging_engine.smart_matching_v2.constants import STATUS_AMBIGUOUS

    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=3, carton_id="carton-a")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-a")
        db.commit()
    for oid in (3, 4):
        o = _order(db, oid, product_id=1, qty=3, carton_id="carton-b")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-b")
        db.commit()
    statuses = {str(r.carton_id): str(r.status) for r in db.query(WmsSmartMatchingRuleV2).all()}
    assert statuses.get("carton-a") == STATUS_AMBIGUOUS
    assert statuses.get("carton-b") == STATUS_AMBIGUOUS

    page = list_history_events_v2(db, tenant_id=1, warehouse_id=1, event_type="conflict")
    assert page["total"] >= 1
    assert all(i["linked_rule"]["status"] == STATUS_AMBIGUOUS for i in page["items"])


def test_l_m_n_o_p_pagination_and_filters(db):
    _set_threshold(db, 2)
    for oid in range(1, 6):
        o = _order(db, oid, product_id=1, qty=1, carton_id="carton-a")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-a", operator_user_id=7)
        db.commit()
    o = _order(db, 10, product_id=2, qty=1, carton_id="carton-b")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-b", operator_user_id=9)
    db.commit()

    p1 = list_history_events_v2(db, tenant_id=1, warehouse_id=1, page=1, limit=3)
    assert p1["total"] == 6
    assert len(p1["items"]) == 3
    p2 = list_history_events_v2(db, tenant_id=1, warehouse_id=1, page=2, limit=3)
    assert len(p2["items"]) == 3

    by_prod = list_history_events_v2(db, tenant_id=1, warehouse_id=1, product_id=2)
    assert by_prod["total"] == 1
    by_carton = list_history_events_v2(db, tenant_id=1, warehouse_id=1, carton_id="carton-b")
    assert by_carton["total"] == 1
    by_user = list_history_events_v2(db, tenant_id=1, warehouse_id=1, user_id=9)
    assert by_user["total"] == 1
    created = list_history_events_v2(db, tenant_id=1, warehouse_id=1, event_type="rule_created")
    assert created["total"] >= 1
    assert all(i["is_rule_created"] for i in created["items"])


def test_u_concurrent_break_no_heuristic_event(db):
    """Second break attempt on already-BROKEN rule must not invent another broken event."""
    from backend.services.packaging_engine.smart_matching_v2.break_relearn import (
        apply_override_streak_after_choice,
    )
    from backend.services.packaging_engine.smart_matching_v2.resolver import resolve_breakpoint_rule

    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=2, carton_id="carton-a")
        record_v2_observation_and_learn(db, order=o, carton_id="carton-a")
        db.commit()
    rule = db.query(WmsSmartMatchingRuleV2).filter(WmsSmartMatchingRuleV2.carton_id == "carton-a").one()

    o = _order(db, 3, product_id=1, qty=2, carton_id="carton-b")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-b")
    db.commit()
    db.add(
        Carton(
            id="carton-z",
            tenant_id=1,
            warehouse_id=1,
            name="Z",
            length_cm=10,
            width_cm=10,
            height_cm=10,
            is_active=True,
        )
    )
    db.commit()
    o = _order(db, 4, product_id=1, qty=2, carton_id="carton-z")
    obs_break = record_v2_observation_and_learn(db, order=o, carton_id="carton-z")
    db.commit()
    db.refresh(rule)
    assert str(rule.status) == STATUS_BROKEN
    assert int(rule.broken_by_observation_id) == int(obs_break.id)

    # Simulate concurrent re-entry: streak must not re-link a new observation id.
    resolved = resolve_breakpoint_rule(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=2)
    settings = db.query(WmsSmartMatchingSettings).filter_by(tenant_id=1, warehouse_id=1).one()
    fake_obs_id = int(obs_break.id) + 999
    apply_override_streak_after_choice(
        db,
        resolved=resolved,
        chosen_carton_id="carton-b",
        order_quantity=2,
        settings_row=settings,
        breaking_observation_id=fake_obs_id,
    )
    db.commit()
    db.refresh(rule)
    assert int(rule.broken_by_observation_id) == int(obs_break.id)

    page = list_history_events_v2(db, tenant_id=1, warehouse_id=1, event_type="rule_broken")
    assert page["total"] == 1
    assert page["items"][0]["observation_id"] == int(obs_break.id)


def test_q_r_tenant_warehouse_isolation(db):
    _set_threshold(db, 2)
    o = _order(db, 1, product_id=1, qty=1, carton_id="carton-a")
    record_v2_observation_and_learn(db, order=o, carton_id="carton-a")
    db.commit()
    other = list_history_events_v2(db, tenant_id=2, warehouse_id=2)
    assert other["total"] == 0


def test_s_no_composition_key_in_payload(db):
    _set_threshold(db, 2)
    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=1)
        record_v2_observation_and_learn(db, order=o, carton_id="carton-a")
        db.commit()
    page = list_history_events_v2(db, tenant_id=1, warehouse_id=1)
    blob = str(page)
    assert "composition_key" not in blob
    assert "fingerprint" not in blob
    assert "sha1" not in blob.lower()


def test_t_legacy_history_series_still_works(db):
    _set_threshold(db, 2)
    from backend.services.packaging_engine.smart_matching_store import record_packing_carton_choice

    for oid in (1, 2):
        o = _order(db, oid, product_id=1, qty=1)
        record_packing_carton_choice(db, order=o, carton_id="carton-a")
        db.commit()
    legacy = list_history_series(db, tenant_id=1, warehouse_id=1, page=1, limit=50)
    assert legacy["total"] >= 1
    assert "composition_key" in legacy["items"][0]
