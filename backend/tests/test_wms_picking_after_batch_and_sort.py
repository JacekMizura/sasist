"""after_batch_complete_action SSOT + resolve_order_sort_for_flow runtime import."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.picking_config import PickingConfig
from backend.models.tenant import Tenant
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.models.wms_picking_terminal_settings import WmsPickingTerminalSettings
from backend.services.picking_config_service import resolve_order_sort_for_flow
from backend.services.wms_picking_terminal_settings_service import (
    get_or_create_wms_picking_terminal_settings,
    normalize_after_batch_complete_action,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, TenantWarehouse, WmsPickingTerminalSettings, PickingConfig):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=2))
    db.add(Warehouse(id=2, tenant_id=1, name="A"))
    db.add(Warehouse(id=3, tenant_id=1, name="B"))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=2, role="owner", is_default=1))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=3, role="owner", is_default=0))
    db.commit()
    return db


def test_normalize_after_batch_defaults_to_back_to_list():
    assert normalize_after_batch_complete_action(None) == "back_to_list"
    assert normalize_after_batch_complete_action("") == "back_to_list"
    assert normalize_after_batch_complete_action("stay_here") == "stay_here"
    assert normalize_after_batch_complete_action("assign_new_batch") == "assign_new_batch"
    assert normalize_after_batch_complete_action("nope") == "back_to_list"


def test_new_terminal_row_defaults_after_batch_to_back_to_list():
    db = _session()
    row = get_or_create_wms_picking_terminal_settings(db, tenant_id=1, warehouse_id=2)
    db.commit()
    assert normalize_after_batch_complete_action(row.after_batch_complete_action) == "back_to_list"


def test_after_batch_isolated_per_warehouse():
    db = _session()
    a = get_or_create_wms_picking_terminal_settings(db, tenant_id=1, warehouse_id=2)
    b = get_or_create_wms_picking_terminal_settings(db, tenant_id=1, warehouse_id=3)
    a.after_batch_complete_action = "stay_here"
    b.after_batch_complete_action = "assign_new_batch"
    db.commit()
    a2 = get_or_create_wms_picking_terminal_settings(db, tenant_id=1, warehouse_id=2)
    b2 = get_or_create_wms_picking_terminal_settings(db, tenant_id=1, warehouse_id=3)
    assert a2.after_batch_complete_action == "stay_here"
    assert b2.after_batch_complete_action == "assign_new_batch"


def test_resolve_order_sort_for_flow_all_vs_single():
    pc = PickingConfig(
        tenant_id=1,
        warehouse_id=2,
        source_status_id=10,
        target_status_id=11,
        strategy="orders",
        pick_unit="products",
        order_sort="courier",
        single_mode="bulk",
        multi_mode="bulk",
        all_mode="bulk",
        all_order_sort="location",
    )
    assert resolve_order_sort_for_flow(pc, "single") == "courier"
    assert resolve_order_sort_for_flow(pc, "multi") == "courier"
    assert resolve_order_sort_for_flow(pc, "all") == "location"
    assert resolve_order_sort_for_flow(None, "all") == "date"


def test_cartless_and_scanned_call_sites_import_resolve_order_sort_for_flow():
    class _Order:
        id = 1
        priority_color = None
        order_date = None
        created_at = None

    from backend.services.wms_cartless_picking.start_service import _sort_orders_for_picking_config

    out = _sort_orders_for_picking_config([_Order()], None, order_type="single")
    assert out[0].id == 1

    import inspect

    from backend.services import cart_picking_lifecycle_service as lifecycle
    from backend.services import wms_picking_product_list_service as product_list
    from backend.services.wms_cartless_picking import start_service as cartless_start

    assert "resolve_order_sort_for_flow" in inspect.getsource(lifecycle)
    assert "resolve_order_sort_for_flow" in inspect.getsource(product_list)
    assert "resolve_order_sort_for_flow" in inspect.getsource(cartless_start)
    assert "resolve_order_sort_for_tour" not in inspect.getsource(lifecycle)
    assert "resolve_order_sort_for_tour" not in inspect.getsource(product_list)
    assert "resolve_order_sort_for_tour" not in inspect.getsource(cartless_start)
