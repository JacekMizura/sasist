"""Tests for picking_config „Wszystkie zamówienia” (all_mode / all_order_sort)."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.order_ui_status import OrderUiStatus
from backend.models.picking_config import PickingConfig
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.picking_config import PickingConfigCreate
from backend.schemas.wms_picking_flow import WmsPickingConfigReplaceItem
from backend.services.picking_config_service import (
    ALL_MODE_RUNTIME_DEFAULT,
    create_picking_config,
    effective_all_mode,
    effective_all_order_sort,
    picking_config_to_read,
    replace_all_picking_configs_for_warehouse,
)


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, OrderUiStatus, PickingConfig):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=2))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.add(
        OrderUiStatus(
            id=10,
            tenant_id=1,
            warehouse_id=2,
            name="Do zbierania",
            color="#000",
            main_group="NEW",
        )
    )
    db.add(
        OrderUiStatus(
            id=11,
            tenant_id=1,
            warehouse_id=2,
            name="Zebrane",
            color="#0f0",
            main_group="IN_PROGRESS",
        )
    )
    db.commit()
    return db


def test_legacy_row_without_all_uses_runtime_defaults_not_copy():
    db = _make_db()
    row = PickingConfig(
        tenant_id=1,
        warehouse_id=2,
        source_status_id=10,
        target_status_id=11,
        strategy="locations",
        pick_unit="products",
        order_sort="courier",
        single_mode="scanned",
        multi_mode="baskets",
        all_mode=None,
        all_order_sort=None,
    )
    db.add(row)
    db.commit()

    assert effective_all_mode(row) == ALL_MODE_RUNTIME_DEFAULT
    assert effective_all_mode(row) != "scanned"
    assert effective_all_mode(row) != "baskets"
    assert effective_all_order_sort(row) == "courier"  # fallback na wspólny order_sort
    read = picking_config_to_read(row)
    assert read.all_mode is None
    assert read.all_order_sort is None


def test_replace_all_persists_all_settings():
    db = _make_db()
    items = [
        WmsPickingConfigReplaceItem(
            source_status_id=10,
            target_status_id=11,
            single_mode="bulk",
            multi_mode="scanned",
            all_mode="baskets",
            pick_unit="products",
            order_sort="date",
            all_order_sort="location",
            max_single_orders=20,
            max_multi_orders=None,
            max_all_orders=None,
        )
    ]
    rows = replace_all_picking_configs_for_warehouse(
        db, tenant_id=1, warehouse_id=2, items=items
    )
    db.commit()
    assert len(rows) == 1
    row = rows[0]
    assert str(row.all_mode) == "baskets"
    assert str(row.all_order_sort) == "location"
    assert str(row.single_mode) == "bulk"
    assert str(row.multi_mode) == "scanned"
    assert effective_all_mode(row) == "baskets"
    assert effective_all_order_sort(row) == "location"


def test_replace_all_rejects_incompatible_all_mode():
    db = _make_db()
    item = WmsPickingConfigReplaceItem(
        source_status_id=10,
        target_status_id=11,
        single_mode="bulk",
        multi_mode="bulk",
        all_mode="mobile",
        pick_unit="products",
        order_sort="date",
        all_order_sort="date",
    )
    with pytest.raises(ValueError, match="Wszystkie zamówienia"):
        replace_all_picking_configs_for_warehouse(db, tenant_id=1, warehouse_id=2, items=[item])


def test_replace_all_requires_all_mode():
    db = _make_db()
    item = WmsPickingConfigReplaceItem(
        source_status_id=10,
        target_status_id=11,
        single_mode="bulk",
        multi_mode="bulk",
        pick_unit="products",
        order_sort="date",
    )
    with pytest.raises(ValueError, match="Wszystkie zamówienia"):
        replace_all_picking_configs_for_warehouse(db, tenant_id=1, warehouse_id=2, items=[item])


def test_create_without_all_leaves_null():
    db = _make_db()
    row = create_picking_config(
        db,
        PickingConfigCreate(
            tenant_id=1,
            warehouse_id=2,
            source_status_id=10,
            target_status_id=11,
            strategy="locations",
            pick_unit="products",
            single_mode="bulk",
            multi_mode="bulk",
        ),
    )
    db.commit()
    assert row.all_mode is None
    assert row.all_order_sort is None
    assert effective_all_mode(row) == ALL_MODE_RUNTIME_DEFAULT
