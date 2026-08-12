"""Production mode on picking_config — save + validation."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.db.schema_upgrade import ensure_picking_config_production_mode_columns
from backend.models.location import Location
from backend.models.order_ui_status import OrderUiStatus
from backend.models.picking_config import PickingConfig
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.wms_picking_flow import WmsPickingConfigReplaceItem
from backend.services.picking_config_service import (
    picking_config_to_read,
    replace_all_picking_configs_for_warehouse,
)


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, OrderUiStatus, Location, PickingConfig):
        model.__table__.create(engine, checkfirst=True)
    ensure_picking_config_production_mode_columns(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=2))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    for sid, name, group in (
        (10, "Do produkcji", "NEW"),
        (11, "Po produkcji", "IN_PROGRESS"),
        (12, "Brak komponentów", "IN_PROGRESS"),
        (13, "Do zbierania", "NEW"),
        (14, "Zebrane", "IN_PROGRESS"),
    ):
        db.add(
            OrderUiStatus(
                id=sid,
                tenant_id=1,
                warehouse_id=2,
                name=name,
                color="#000",
                main_group=group,
            )
        )
    db.add(Location(id=100, warehouse_id=2, name="BUF-FG", is_active=True))
    db.add(Location(id=101, warehouse_id=2, name="INACTIVE", is_active=False))
    db.add(Location(id=200, warehouse_id=99, name="OTHER-WH", is_active=True))
    db.commit()
    return db


def _prod_item(**overrides):
    base = dict(
        source_status_id=10,
        target_status_id=11,
        single_mode="bulk",
        multi_mode="bulk",
        all_mode="bulk",
        pick_unit="products",
        order_sort="date",
        all_order_sort="date",
        is_production_mode=True,
        status_after_production_id=11,
        status_on_component_shortage_id=12,
        finished_goods_buffer_location_id=100,
        production_order_trigger_scope="SINGLE_ELEMENT",
        after_production_action="STATUS_ONLY",
    )
    base.update(overrides)
    return WmsPickingConfigReplaceItem(**base)


def _std_item(**overrides):
    base = dict(
        source_status_id=13,
        target_status_id=14,
        single_mode="bulk",
        multi_mode="scanned",
        all_mode="baskets",
        pick_unit="products",
        order_sort="date",
        all_order_sort="date",
        is_production_mode=False,
    )
    base.update(overrides)
    return WmsPickingConfigReplaceItem(**base)


def test_production_mode_persists_fields():
    db = _make_db()
    rows = replace_all_picking_configs_for_warehouse(
        db, tenant_id=1, warehouse_id=2, items=[_prod_item()]
    )
    db.commit()
    assert len(rows) == 1
    read = picking_config_to_read(rows[0])
    assert read.is_production_mode is True
    assert read.status_after_production_id == 11
    assert read.status_on_component_shortage_id == 12
    assert read.finished_goods_buffer_location_id == 100
    assert read.production_order_trigger_scope == "SINGLE_ELEMENT"
    assert read.source_status_id == 10
    assert read.after_production_action == "STATUS_ONLY"


def test_after_production_action_open_packing_persists():
    db = _make_db()
    rows = replace_all_picking_configs_for_warehouse(
        db,
        tenant_id=1,
        warehouse_id=2,
        items=[_prod_item(after_production_action="OPEN_PACKING")],
    )
    db.commit()
    read = picking_config_to_read(rows[0])
    assert read.after_production_action == "OPEN_PACKING"


def test_duplicate_production_entry_status_rejected():
    db = _make_db()
    with pytest.raises(ValueError, match="tylko raz|wejściowy produkcji|status"):
        replace_all_picking_configs_for_warehouse(
            db,
            tenant_id=1,
            warehouse_id=2,
            items=[
                _prod_item(source_status_id=10, status_after_production_id=11),
                _prod_item(
                    source_status_id=10,
                    status_after_production_id=12,
                    status_on_component_shortage_id=11,
                    target_status_id=12,
                ),
            ],
        )


def test_standard_and_production_same_source_rejected():
    db = _make_db()
    with pytest.raises(ValueError, match="standardowego zbierania|tylko raz"):
        replace_all_picking_configs_for_warehouse(
            db,
            tenant_id=1,
            warehouse_id=2,
            items=[
                _prod_item(source_status_id=10),
                _std_item(source_status_id=10, target_status_id=14),
            ],
        )


def test_after_production_cannot_be_standard_picking_entry():
    db = _make_db()
    with pytest.raises(ValueError, match="po wyprodukowaniu"):
        replace_all_picking_configs_for_warehouse(
            db,
            tenant_id=1,
            warehouse_id=2,
            items=[
                _prod_item(source_status_id=10, status_after_production_id=13, target_status_id=13),
                _std_item(source_status_id=13, target_status_id=14),
            ],
        )


def test_invalid_buffer_location_rejected():
    db = _make_db()
    with pytest.raises(ValueError, match="buforowa"):
        replace_all_picking_configs_for_warehouse(
            db,
            tenant_id=1,
            warehouse_id=2,
            items=[_prod_item(finished_goods_buffer_location_id=101)],
        )
    with pytest.raises(ValueError, match="buforowa"):
        replace_all_picking_configs_for_warehouse(
            db,
            tenant_id=1,
            warehouse_id=2,
            items=[_prod_item(finished_goods_buffer_location_id=200)],
        )
    with pytest.raises(ValueError, match="buforowa"):
        replace_all_picking_configs_for_warehouse(
            db,
            tenant_id=1,
            warehouse_id=2,
            items=[_prod_item(finished_goods_buffer_location_id=999)],
        )
