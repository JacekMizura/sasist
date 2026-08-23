"""Structural performance guards for WMS picking list/detail.

  python -m pytest backend/tests/test_wms_picking_load_performance.py -q
"""

from __future__ import annotations

import inspect
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.app_user import AppUser
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.pick import Pick
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE
from backend.services.picking_routing_service import PickingRoutingService
from backend.services.wms_cartless_picking.membership_service import (
    revalidate_cartless_session_membership,
)
from backend.services.wms_picking_product_list_service import (
    build_wms_picking_product_detail,
    build_wms_picking_product_lines,
    resolve_wms_picking_order_ids,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, AppUser, OrderUiStatus, Order, Pick, WmsOperationSession):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        AppUser(
            id=1,
            login="op",
            email="o@x",
            password_hash="x",
            first_name="Op",
            last_name="A",
            is_active=True,
        )
    )
    session.add(
        OrderUiStatus(
            id=10,
            tenant_id=1,
            warehouse_id=1,
            name="Do zbierania",
            main_group="PICKING",
            is_active=True,
        )
    )
    session.add(
        WmsOperationSession(
            id=50,
            tenant_id=1,
            warehouse_id=1,
            cart_id=None,
            order_id=None,
            session_kind=SESSION_KIND_PICKING_ACTIVE,
            operator_user_id=1,
            started_at=datetime.utcnow(),
            last_activity_at=datetime.utcnow(),
            completed_at=None,
            metadata_json='{"source_status_id":10}',
        )
    )
    for oid in (100, 101, 102):
        session.add(
            Order(
                id=oid,
                tenant_id=1,
                warehouse_id=1,
                number=f"O-{oid}",
                status="PICKING",
                order_ui_status_id=10,
                picking_session_id=50,
            )
        )
    session.commit()
    yield session
    session.close()


def test_product_list_uses_batched_bundle_breakdown():
    src = inspect.getsource(build_wms_picking_product_lines)
    assert "_bundle_breakdowns_by_product" in src
    # Per-product helper must not be called inside the product loop path.
    assert "_bundle_breakdown_for_product(" not in src


def test_detail_scopes_lines_to_product_and_skips_revalidate(db):
    fake_resp = MagicMock()
    fake_resp.products = []  # early return None after lines call
    with patch(
        "backend.services.wms_picking_product_list_service.build_wms_picking_product_lines",
        return_value=fake_resp,
    ) as lines:
        out = build_wms_picking_product_detail(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=10,
            order_type="all",
            product_id=7,
            picking_session_id=50,
        )
        assert out is None
        assert lines.call_count == 1
        assert lines.call_args.kwargs.get("only_product_id") == 7
        assert lines.call_args.kwargs.get("revalidate_membership") is False


def test_resolve_revalidate_once_when_enabled(db):
    with patch(
        "backend.services.wms_cartless_picking.membership_service.revalidate_cartless_session_membership",
        wraps=revalidate_cartless_session_membership,
    ) as rev:
        resolve_wms_picking_order_ids(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=10,
            order_type="all",
            picking_session_id=50,
            revalidate_membership=False,
        )
        assert rev.call_count == 0
        ids = resolve_wms_picking_order_ids(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=10,
            order_type="all",
            picking_session_id=50,
            revalidate_membership=True,
        )
        assert rev.call_count == 1
        assert set(ids) == {100, 101, 102}


def test_routing_supports_product_ids_filter():
    assert "product_ids" in PickingRoutingService.build_location_pick_list.__code__.co_varnames
