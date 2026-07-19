"""
POST /orders create — diagnostics stages + rollback safety.

  python -m pytest backend/tests/test_order_create_diagnostics.py -q
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.order import create_order, _order_create_payload_fingerprint
from backend.models.order import Order
from backend.models.order_fulfillment_assignment_audit import OrderFulfillmentAssignmentAudit
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wm_price_tier import WmPriceTier
from backend.schemas.order import OrderCreateBody, OrderCreateLine
from backend.services.bundle_explosion import OrderCreateLinesResult, ResolvedOrderLine
from backend.services.stock_disposition import DEFAULT_STOCK_DISPOSITION


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for m in (
        Tenant,
        Warehouse,
        Order,
        OrderItem,
        Product,
        OrderUiStatus,
        OrderFulfillmentAssignmentAudit,
        WmPriceTier,
    ):
        m.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        Product(
            id=10,
            tenant_id=1,
            sku="SKU-10",
            name="P10",
            ean="5900000000010",
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _body(**over) -> OrderCreateBody:
    base = dict(
        tenant_id=1,
        warehouse_id=1,
        shipping_cost=0,
        items=[OrderCreateLine(product_id=10, quantity=1, unit_price=12.5)],
        check_bundle_stock=False,
    )
    base.update(over)
    return OrderCreateBody(**base)


def _resolved_lines() -> OrderCreateLinesResult:
    return OrderCreateLinesResult(
        lines=[
            ResolvedOrderLine(
                product_id=10,
                quantity=1,
                unit_price=12.5,
                total_price=12.5,
                list_price=12.5,
                line_volume=0.001,
                source_bundle_id=None,
                bundle_instance_id=None,
                metadata_json=None,
                required_stock_disposition=DEFAULT_STOCK_DISPOSITION,
                product_sales_offer_id=None,
            )
        ],
        bundle_snapshots_by_instance={},
    )


@pytest.fixture(autouse=True)
def _stub_resolve(monkeypatch):
    monkeypatch.setattr(
        "backend.api.order.resolve_order_create_lines",
        lambda *a, **k: _resolved_lines(),
    )
    monkeypatch.setattr("backend.api.order.ensure_orders_create_schema", lambda eng: None)
    monkeypatch.setattr("backend.api.order.next_order_barcode", lambda db, tid: f"ORD-T-{tid}")
    monkeypatch.setattr(
        "backend.api.order.next_internal_order_number",
        lambda db, tid, wid: "MAN-TEST",
    )
    monkeypatch.setattr("backend.api.order.assign_order_scan_code", lambda order: None)
    monkeypatch.setattr(
        "backend.api.order.assign_default_new_panel_status_to_order",
        lambda db, order: None,
    )
    monkeypatch.setattr(
        "backend.services.order_fulfillment_lifecycle_service.apply_initial_fulfillment_assignment",
        lambda db, order, **kw: None,
    )


def test_fingerprint_has_no_address_fields():
    body = _body(
        billing_street="Ul. Test 1",
        first_name="Jan",
        email="a@b.c",
    )
    fp = _order_create_payload_fingerprint(body)
    assert fp["tenant_id"] == 1
    assert fp["items_count"] == 1
    assert fp["line_kinds"] == ["product"]
    assert "billing_street" not in fp
    assert "email" not in fp
    assert "first_name" not in fp


def test_case1_minimal_create_201(db, monkeypatch):
    monkeypatch.setattr(
        "backend.api.order.next_internal_order_number",
        lambda db, tid, wid: "MAN-1",
    )
    out = create_order(_body(), db)
    assert out.id >= 1
    assert out.number == "MAN-1"
    row = db.query(Order).filter(Order.id == out.id).first()
    assert row is not None
    items = db.query(OrderItem).filter(OrderItem.order_id == out.id).all()
    assert len(items) == 1
    assert int(items[0].product_id) == 10


def test_case5_error_before_commit_rolls_back(db):
    before = db.query(Order).count()

    def _boom(*a, **k):
        raise RuntimeError("simulated_item_failure")

    with patch("backend.api.order.persist_resolved_bundle_lines", _boom):
        with pytest.raises(HTTPException) as ei:
            create_order(_body(), db)
    assert ei.value.status_code == 500
    assert db.query(Order).count() == before


def test_case6_post_commit_failure_keeps_order_and_logs_committed(db, monkeypatch, capsys):
    monkeypatch.setattr(
        "backend.api.order.next_internal_order_number",
        lambda db, tid, wid: "MAN-3",
    )

    real_refresh = db.refresh

    def _refresh_fail(obj):
        if isinstance(obj, Order):
            raise RuntimeError("simulated_refresh_failure")
        return real_refresh(obj)

    monkeypatch.setattr(db, "refresh", _refresh_fail)
    with pytest.raises(HTTPException) as ei:
        create_order(_body(), db)
    assert ei.value.status_code == 500
    assert db.query(Order).filter(Order.number == "MAN-3").count() == 1
    err = capsys.readouterr().err
    assert "ORDER_CREATE_ERROR" in err
    assert "committed=True" in err
    assert "stage=REFRESH" in err
