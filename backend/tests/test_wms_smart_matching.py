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
    WmsSmartMatchingRule,
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
        WmsSmartMatchingRule,
        WmsSmartMatchingHistory,
        WmsSmartMatchingBreak,
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
    db.commit()
    assert db.query(WmsSmartMatchingRule).count() == 0
    record_packing_carton_choice(db, order=o2, carton_id="carton-m", operator_user_id=None)
    db.commit()
    rules = db.query(WmsSmartMatchingRule).all()
    assert len(rules) == 1
    assert rules[0].carton_id == "carton-m"
    assert rules[0].is_auto is True
    assert rules[0].hit_count >= 2


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
        db.commit()

    o3 = _make_order(db, 3)
    cartons = db.query(Carton).options(noload("*")).all()
    smart = suggest_smart_matching(db, order=o3, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert smart
    assert smart[0].suggested_package_id == "carton-m"
    assert "HISTORICAL_MATCH" in (smart[0].reason or "")

    record_packing_carton_choice(db, order=o3, carton_id="carton-l")
    db.commit()
    hist = (
        db.query(WmsSmartMatchingHistory)
        .filter(WmsSmartMatchingHistory.order_id == 3)
        .one()
    )
    assert hist.broke_series is True
    assert db.query(WmsSmartMatchingBreak).count() == 1


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
        db.commit()
    assert db.query(WmsSmartMatchingRule).count() == 1
    assert db.query(WmsSmartMatchingHistory).count() == 2
    n = reset_auto_rules(db, tenant_id=1, warehouse_id=1)
    db.commit()
    assert n == 1
    assert db.query(WmsSmartMatchingRule).count() == 0
    assert db.query(WmsSmartMatchingHistory).count() == 2


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
