"""P5.6 — picking config integration for consolidation rack mode."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from backend.models.order import Order
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.picking_config import PickingConfig
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.picking_config import PickingConfigCreate
from backend.services.order_consolidation.consolidation_context import (
    CONSOLIDATION_RACK_PICKING_MODE,
    consolidation_rack_picking_active,
    consolidation_shelf_labels_by_product,
)
from backend.services.order_consolidation.constants import (
    ITEM_STATUS_TO_PICK,
    PLAN_STATUS_STAGING,
)
from backend.services.picking_config_service import (
    assert_consolidation_rack_modes_valid,
    create_picking_config,
    replace_all_picking_configs_for_warehouse,
)
from backend.schemas.wms_picking_flow import WmsPickingConfigReplaceItem


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        OrderUiStatus,
        PickingConfig,
        Order,
        OrderConsolidationPlan,
        OrderConsolidationPlanItem,
        ConsolidationRack,
        ConsolidationRackLevel,
        RackSegment,
    ):
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


def _add_rack(db) -> None:
    rack = ConsolidationRack(tenant_id=1, warehouse_id=2, name="RK-01")
    db.add(rack)
    db.flush()
    level = ConsolidationRackLevel(rack_id=int(rack.id), level_index=0, name="A", is_segmented=True)
    db.add(level)
    db.flush()
    db.add(RackSegment(level_id=int(level.id), segment_index=0, order_id=None, fill_percent=0.0))
    db.commit()


def _picking_config(db, *, multi_mode: str = CONSOLIDATION_RACK_PICKING_MODE) -> PickingConfig:
    row = PickingConfig(
        tenant_id=1,
        warehouse_id=2,
        source_status_id=10,
        target_status_id=11,
        strategy="locations",
        pick_unit="products",
        order_sort="date",
        single_mode="bulk",
        multi_mode=multi_mode,
    )
    db.add(row)
    db.commit()
    return row


def test_config_save_blocked_without_racks():
    db = _make_db()
    with pytest.raises(ValueError, match="Brak skonfigurowanych regałów"):
        assert_consolidation_rack_modes_valid(
            db,
            tenant_id=1,
            warehouse_id=2,
            single_mode="bulk",
            multi_mode="consolidation_rack",
        )


def test_config_save_ok_with_racks():
    db = _make_db()
    _add_rack(db)
    assert_consolidation_rack_modes_valid(
        db,
        tenant_id=1,
        warehouse_id=2,
        single_mode="bulk",
        multi_mode="consolidation_rack",
    )
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
            multi_mode="consolidation_rack",
        ),
    )
    assert str(row.multi_mode) == "consolidation_rack"


def test_consolidation_rack_active_only_with_config_and_staging():
    db = _make_db()
    _add_rack(db)
    order = Order(tenant_id=1, warehouse_id=2, number="O-1", status="NEW", order_ui_status_id=10)
    db.add(order)
    db.flush()
    plan = OrderConsolidationPlan(order_id=int(order.id), target_warehouse_id=2, status=PLAN_STATUS_STAGING)
    db.add(plan)
    db.flush()
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan.id),
            product_id=101,
            quantity=1.0,
            source_warehouse_id=2,
            target_warehouse_id=2,
            status=ITEM_STATUS_TO_PICK,
        )
    )
    rack = db.query(ConsolidationRack).first()
    level = db.query(ConsolidationRackLevel).first()
    seg = RackSegment(level_id=int(level.id), segment_index=0, order_id=int(order.id), fill_percent=0.0)
    db.add(seg)
    db.commit()

    assert consolidation_rack_picking_active(db, tenant_id=1, warehouse_id=2, source_status_id=10, order_id=int(order.id)) is False

    _picking_config(db)
    assert consolidation_rack_picking_active(db, tenant_id=1, warehouse_id=2, source_status_id=10, order_id=int(order.id)) is True


def test_product_line_shelf_label_projection():
    db = _make_db()
    _add_rack(db)
    _picking_config(db)
    order = Order(tenant_id=1, warehouse_id=2, number="O-2", status="NEW", order_ui_status_id=10)
    db.add(order)
    db.flush()
    plan = OrderConsolidationPlan(order_id=int(order.id), target_warehouse_id=2, status=PLAN_STATUS_STAGING)
    db.add(plan)
    db.flush()
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan.id),
            product_id=202,
            quantity=1.0,
            source_warehouse_id=2,
            target_warehouse_id=2,
            status=ITEM_STATUS_TO_PICK,
        )
    )
    level = db.query(ConsolidationRackLevel).first()
    db.add(RackSegment(level_id=int(level.id), segment_index=0, order_id=int(order.id), fill_percent=0.0))
    db.commit()

    labels = consolidation_shelf_labels_by_product(
        db,
        order_ids=[int(order.id)],
        tenant_id=1,
        warehouse_id=2,
        source_status_id=10,
    )
    assert labels[202].startswith("RK-01/")


def test_replace_all_validates_racks():
    db = _make_db()
    item = WmsPickingConfigReplaceItem(
        source_status_id=10,
        target_status_id=11,
        single_mode="bulk",
        multi_mode="consolidation_rack",
        pick_unit="products",
        order_sort="date",
    )
    with pytest.raises(ValueError, match="Brak skonfigurowanych regałów"):
        replace_all_picking_configs_for_warehouse(db, tenant_id=1, warehouse_id=2, items=[item])
