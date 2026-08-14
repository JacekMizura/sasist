"""Production mode moved off picking replace — legacy validation helpers still work."""

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
from backend.schemas.production_config import ProductionConfigCreate
from backend.schemas.wms_picking_flow import WmsPickingConfigReplaceItem
from backend.services.picking_config_service import (
    replace_all_picking_configs_for_warehouse,
    validate_production_mode_batch,
)
from backend.services.production_config_service import (
    create_production_config,
    production_config_to_read,
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


def _std_item(**overrides):
    base = dict(
        source_status_id=13,
        target_status_id=14,
        single_mode="bulk",
        multi_mode="bulk",
        all_mode="bulk",
        pick_unit="orders",
        order_sort="date",
        all_order_sort="date",
        is_production_mode=False,
    )
    base.update(overrides)
    return WmsPickingConfigReplaceItem(**base)


def test_production_config_create_persists_fields():
    db = _make_db()
    row = create_production_config(
        db,
        ProductionConfigCreate(
            tenant_id=1,
            warehouse_id=2,
            name="Produkcja test",
            source_status_id=10,
            status_after_production_id=11,
            status_on_component_shortage_id=12,
            finished_goods_buffer_location_id=100,
            production_order_trigger_scope="SINGLE_ELEMENT",
            after_production_action="STATUS_ONLY",
            production_execution_method="WMS",
        ),
    )
    db.commit()
    read = production_config_to_read(row)
    assert read.is_active is True
    assert read.status_on_component_shortage_id == 12
    assert read.finished_goods_buffer_location_id == 100
    assert read.production_order_trigger_scope == "SINGLE_ELEMENT"
    assert read.after_production_action == "STATUS_ONLY"
    assert read.production_execution_method == "WMS"


def test_after_production_action_open_packing_persists():
    db = _make_db()
    row = create_production_config(
        db,
        ProductionConfigCreate(
            tenant_id=1,
            warehouse_id=2,
            name="Open packing",
            source_status_id=10,
            status_after_production_id=11,
            status_on_component_shortage_id=12,
            finished_goods_buffer_location_id=100,
            after_production_action="OPEN_PACKING",
        ),
    )
    db.commit()
    assert production_config_to_read(row).after_production_action == "OPEN_PACKING"


def test_picking_replace_rejects_production_flag():
    db = _make_db()
    with pytest.raises(ValueError, match="Produkcja"):
        replace_all_picking_configs_for_warehouse(
            db,
            tenant_id=1,
            warehouse_id=2,
            items=[
                WmsPickingConfigReplaceItem(
                    source_status_id=10,
                    target_status_id=11,
                    single_mode="bulk",
                    multi_mode="bulk",
                    all_mode="bulk",
                    pick_unit="orders",
                    order_sort="date",
                    all_order_sort="date",
                    is_production_mode=True,
                    status_after_production_id=11,
                    status_on_component_shortage_id=12,
                    finished_goods_buffer_location_id=100,
                )
            ],
        )


def test_validate_batch_rejects_shared_entry_status():
    with pytest.raises(ValueError, match="standardowego zbierania"):
        validate_production_mode_batch(
            [
                type("C", (), {"is_production_mode": True, "source_status_id": 10, "status_after_production_id": 11})(),
                type("C", (), {"is_production_mode": False, "source_status_id": 10, "status_after_production_id": None})(),
            ]
        )


def test_validate_batch_rejects_after_as_picking_entry():
    with pytest.raises(ValueError, match="standardowego zbierania"):
        validate_production_mode_batch(
            [
                type("C", (), {"is_production_mode": True, "source_status_id": 10, "status_after_production_id": 13})(),
                type("C", (), {"is_production_mode": False, "source_status_id": 13, "status_after_production_id": None})(),
            ]
        )


def test_buffer_location_must_belong_to_warehouse():
    db = _make_db()
    with pytest.raises(ValueError, match="aktywna|nie istnieje"):
        create_production_config(
            db,
            ProductionConfigCreate(
                tenant_id=1,
                warehouse_id=2,
                name="Inactive buf",
                source_status_id=10,
                status_after_production_id=11,
                status_on_component_shortage_id=12,
                finished_goods_buffer_location_id=101,
            ),
        )
    with pytest.raises(ValueError, match="magazynu|nie istnieje"):
        create_production_config(
            db,
            ProductionConfigCreate(
                tenant_id=1,
                warehouse_id=2,
                name="Other WH",
                source_status_id=10,
                status_after_production_id=11,
                status_on_component_shortage_id=12,
                finished_goods_buffer_location_id=200,
            ),
        )


def test_standard_picking_replace_still_works():
    db = _make_db()
    rows = replace_all_picking_configs_for_warehouse(
        db, tenant_id=1, warehouse_id=2, items=[_std_item()]
    )
    assert len(rows) == 1
    assert rows[0].is_production_mode is False
