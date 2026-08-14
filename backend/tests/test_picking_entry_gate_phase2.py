"""
Phase 2: active picking-entry gate — FG reserve + MO missing + awaiting status.

  python -m pytest backend/tests/test_picking_entry_gate_phase2.py -q
"""

from __future__ import annotations

import os
import unittest
from datetime import date
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.models.production import (
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_reservation import StockReservation
from backend.models.warehouse import Warehouse
from backend.services.picking_entry_gate_service import (
    MODE_ACTIVE,
    MODE_DRY_RUN,
    cleanup_picking_entry_on_order_cancel,
    run_picking_entry_gate,
    sync_picking_entry_on_qty_decrease,
)
from backend.services.picking_entry_readiness_service import (
    LINE_MANUFACTURING_PARTIAL,
    LINE_READY,
    LINE_REGULAR_SHORTAGE,
    ORDER_BLOCKED_CONFIG,
    ORDER_BLOCKED_MIXED,
    ORDER_BLOCKED_REGULAR_SHORTAGE,
    ORDER_READY_FOR_PICKING,
)
from backend.services.reservations.constants import (
    RESERVATION_KIND_SALES_ORDER,
    RESERVATION_STATUS_RESERVED,
)
from backend.services.sales_order_fg_reservation_service import reserved_qty_for_order_product
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


def _engine():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))
    for m in (
        Warehouse,
        Location,
        OrderUiStatus,
        Product,
        Inventory,
        StockReservation,
        Order,
        OrderItem,
        PickingConfig,
        ProductComposition,
        ProductCompositionLine,
        ProductionOrder,
        ProductionOrderSourceItem,
        ProductionOrderLineSnapshot,
    ):
        m.__table__.create(eng, checkfirst=True)
    return eng


class PickingEntryGatePhase2Tests(unittest.TestCase):
    def setUp(self):
        self.engine = _engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True))
        for sid, name in (
            (1, "Do zbierania"),
            (2, "Oczekuje na produkcję"),
            (3, "Produkcja"),
            (4, "Po produkcji"),
            (5, "Brak komponentów"),
        ):
            self.db.add(
                OrderUiStatus(
                    id=sid,
                    tenant_id=1,
                    warehouse_id=1,
                    name=name,
                    color="#000",
                    main_group="NEW",
                )
            )
        self.db.add(
            Location(
                id=1,
                warehouse_id=1,
                name="A1",
                type="pick",
                location_type="NORMAL",
                is_active=True,
            )
        )
        self.db.add(
            Location(
                id=2,
                warehouse_id=1,
                name="DOCK-IN",
                type="dock",
                location_type="DOCK",
                is_active=True,
            )
        )
        self.db.add(Product(id=100, tenant_id=1, name="A-mfg", sku="A"))
        self.db.add(Product(id=200, tenant_id=1, name="B-reg", sku="B"))
        self.db.add(Product(id=300, tenant_id=1, name="Comp", sku="C"))
        # Picking entry config
        self.db.add(
            PickingConfig(
                id=1,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                target_status_id=1,
                strategy="locations",
                pick_unit="products",
                order_sort="date",
                single_mode="bulk",
                multi_mode="bulk",
                is_production_mode=False,
                is_active=True,
            )
        )
        # Production config with awaiting
        self.db.add(
            PickingConfig(
                id=2,
                tenant_id=1,
                warehouse_id=1,
                name="Prod",
                source_status_id=3,
                target_status_id=4,
                strategy="locations",
                pick_unit="products",
                order_sort="date",
                single_mode="bulk",
                multi_mode="bulk",
                is_production_mode=True,
                is_active=True,
                status_after_production_id=4,
                status_on_component_shortage_id=5,
                status_awaiting_production_id=2,
                finished_goods_buffer_location_id=2,
                production_order_trigger_scope="SINGLE_ELEMENT",
                production_execution_method="WMS",
                after_production_action="STATUS_ONLY",
            )
        )
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _bom(self, fg_id: int = 100):
        c = ProductComposition(
            id=fg_id,
            tenant_id=1,
            product_id=fg_id,
            composition_mode="manufacturing",
            is_active=True,
            name="BOM",
        )
        self.db.add(c)
        self.db.flush()
        self.db.add(
            ProductCompositionLine(
                id=fg_id * 10,
                composition_id=int(c.id),
                component_product_id=300,
                quantity=1.0,
            )
        )

    def _inv(self, pid: int, qty: float, iid: int):
        self.db.add(
            Inventory(
                id=iid,
                tenant_id=1,
                warehouse_id=1,
                product_id=pid,
                location_id=1,
                quantity=float(qty),
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )

    def _order(self, oid: int, lines: list[tuple[int, float]], status_id: int = 1):
        o = Order(
            id=oid,
            tenant_id=1,
            warehouse_id=1,
            number=str(oid),
            status="NEW",
            order_ui_status_id=status_id,
        )
        self.db.add(o)
        self.db.flush()
        for i, (pid, qty) in enumerate(lines):
            self.db.add(
                OrderItem(id=oid * 100 + i, order_id=oid, product_id=pid, quantity=float(qty))
            )
        self.db.flush()
        return self.db.query(Order).filter(Order.id == oid).one()

    def _run_active(self, order: Order, prev=None, new=1):
        with patch.dict(os.environ, {"FEATURE_PICKING_ENTRY_READINESS_MODE": MODE_ACTIVE}):
            with patch(
                "backend.services.picking_entry_gate_service.record_domain_activity",
                return_value=None,
            ), patch(
                "backend.services.production_order_trigger.material_validation_service.apply_material_validation_to_orders_mo",
                return_value={},
            ), patch(
                "backend.services.production_order_trigger.trigger_service._snapshot_composition_lines",
                return_value=None,
            ), patch(
                "backend.services.production_order_trigger.trigger_service._next_order_number",
                return_value="MO/TEST/1",
            ):
                return run_picking_entry_gate(
                    self.db,
                    order=order,
                    previous_status_id=prev,
                    new_status_id=new,
                    force_mode=MODE_ACTIVE,
                )

    def test_01_full_ready_reserves_no_mo(self):
        self._bom(100)
        self._inv(100, 10, 1)
        self._inv(200, 5, 2)
        order = self._order(10, [(100, 7), (200, 2)])
        self.db.commit()
        res = self._run_active(order)
        self.assertIsNotNone(res)
        self.assertEqual(res.readiness.code, ORDER_READY_FOR_PICKING)
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=10, product_id=100),
            7.0,
            places=4,
        )
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=10, product_id=200),
            2.0,
            places=4,
        )
        self.assertEqual(self.db.query(ProductionOrder).count(), 0)
        self.assertEqual(int(order.order_ui_status_id), 1)

    def test_02_partial_manufacturing_reserve_and_mo(self):
        self._bom(100)
        self._inv(100, 5, 1)
        order = self._order(11, [(100, 7)])
        self.db.commit()
        res = self._run_active(order)
        self.assertEqual(res.readiness.code, "BLOCKED_MANUFACTURING")
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=11, product_id=100),
            5.0,
            places=4,
        )
        src = self.db.query(ProductionOrderSourceItem).one()
        self.assertAlmostEqual(float(src.requested_quantity), 2.0, places=4)
        mo = self.db.query(ProductionOrder).one()
        self.assertAlmostEqual(float(mo.planned_quantity), 2.0, places=4)
        self.assertEqual(int(order.order_ui_status_id), 2)  # awaiting

    def test_03_zero_stock_mo_full(self):
        self._bom(100)
        order = self._order(12, [(100, 1)])
        self.db.commit()
        res = self._run_active(order)
        src = self.db.query(ProductionOrderSourceItem).one()
        self.assertAlmostEqual(float(src.requested_quantity), 1.0, places=4)
        self.assertEqual(int(order.order_ui_status_id), 2)

    def test_04_mixed(self):
        self._bom(100)
        self._inv(100, 5, 1)
        self._inv(200, 6, 2)
        order = self._order(13, [(100, 7), (200, 10)])
        self.db.commit()
        res = self._run_active(order)
        self.assertEqual(res.readiness.code, ORDER_BLOCKED_MIXED)
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=13, product_id=100),
            5.0,
            places=4,
        )
        self.assertAlmostEqual(
            float(self.db.query(ProductionOrderSourceItem).one().requested_quantity),
            2.0,
            places=4,
        )
        self.assertEqual(int(order.order_ui_status_id), 2)
        # B not reserved beyond available free? regular shortage — we still may reserve 6
        # Gate reserves target_from_stock for regular lines too when to_reserve > 0
        b_res = reserved_qty_for_order_product(self.db, tenant_id=1, order_id=13, product_id=200)
        self.assertAlmostEqual(b_res, 6.0, places=4)

    def test_05_regular_only_no_mo_no_awaiting(self):
        self._inv(200, 6, 1)
        order = self._order(14, [(200, 10)])
        self.db.commit()
        res = self._run_active(order)
        self.assertEqual(res.readiness.code, ORDER_BLOCKED_REGULAR_SHORTAGE)
        self.assertEqual(self.db.query(ProductionOrder).count(), 0)
        self.assertEqual(int(order.order_ui_status_id), 1)

    def test_06_full_fg_with_bom_no_mo(self):
        self._bom(100)
        self._inv(100, 10, 1)
        order = self._order(15, [(100, 2)])
        self.db.commit()
        res = self._run_active(order)
        self.assertEqual(res.readiness.code, ORDER_READY_FOR_PICKING)
        self.assertEqual(self.db.query(ProductionOrder).count(), 0)
        self.assertTrue(all(ln.readiness.code == LINE_READY for ln in res.lines))

    def test_07_two_manufacturing_skus(self):
        self._bom(100)
        self.db.add(
            ProductComposition(
                id=200,
                tenant_id=1,
                product_id=200,
                composition_mode="manufacturing",
                is_active=True,
                name="BOM-B",
            )
        )
        self.db.flush()
        self.db.add(
            ProductCompositionLine(
                id=2000,
                composition_id=200,
                component_product_id=300,
                quantity=1.0,
            )
        )
        self._inv(100, 0, 1)
        self._inv(200, 1, 2)
        order = self._order(16, [(100, 2), (200, 3)])
        self.db.commit()
        res = self._run_active(order)
        self.assertIn(res.readiness.code, ("BLOCKED_MANUFACTURING", ORDER_BLOCKED_MIXED))
        srcs = self.db.query(ProductionOrderSourceItem).all()
        self.assertEqual(len(srcs), 2)
        by_pid = {int(s.product_id): float(s.requested_quantity) for s in srcs}
        self.assertAlmostEqual(by_pid[100], 2.0, places=4)
        self.assertAlmostEqual(by_pid[200], 2.0, places=4)  # 3-1 reserved

    def test_08_aggregate_mo_across_orders(self):
        self._bom(100)
        o1 = self._order(17, [(100, 1)])
        o2 = self._order(18, [(100, 2)])
        o3 = self._order(19, [(100, 4)])
        self.db.commit()
        self._run_active(o1)
        self._run_active(o2)
        self._run_active(o3)
        mos = self.db.query(ProductionOrder).all()
        self.assertEqual(len(mos), 1)
        self.assertAlmostEqual(float(mos[0].planned_quantity), 7.0, places=4)

    def test_09_gate_retry_idempotent(self):
        self._bom(100)
        self._inv(100, 5, 1)
        order = self._order(20, [(100, 7)])
        self.db.commit()
        r1 = self._run_active(order)
        r2 = self._run_active(order)
        self.assertEqual(self.db.query(ProductionOrderSourceItem).count(), 1)
        self.assertAlmostEqual(
            float(self.db.query(ProductionOrder).one().planned_quantity), 2.0, places=4
        )
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=20, product_id=100),
            5.0,
            places=4,
        )
        self.assertTrue(r2.noop or r2.readiness.code == r1.readiness.code)

    def test_10_cancel_releases_and_withdraws(self):
        self._bom(100)
        self._inv(100, 5, 1)
        order = self._order(21, [(100, 7)])
        self.db.commit()
        self._run_active(order)
        with patch(
            "backend.services.production_order_service.cancel_production_order",
            return_value=None,
        ), patch(
            "backend.services.production_order_trigger.material_validation_service.refresh_orders_mo_material_reservations",
            return_value=None,
        ), patch(
            "backend.services.production_order_trigger.trigger_service._log_order",
            return_value=None,
        ):
            out = cleanup_picking_entry_on_order_cancel(self.db, order=order)
        self.db.flush()
        active = (
            self.db.query(StockReservation)
            .filter(StockReservation.status == RESERVATION_STATUS_RESERVED)
            .count()
        )
        self.assertEqual(active, 0)
        self.assertGreaterEqual(out["released_reservations"], 1)

    def test_11_qty_decrease_partial(self):
        self._bom(100)
        self._inv(100, 5, 1)
        order = self._order(22, [(100, 7)])
        self.db.commit()
        self._run_active(order)
        oi = order.items[0]
        oi.quantity = 5
        out = sync_picking_entry_on_qty_decrease(
            self.db, order=order, order_item=oi, new_qty=5.0
        )
        self.db.flush()
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=22, product_id=100),
            5.0,
            places=4,
        )
        self.assertGreaterEqual(out.get("reservation_released", 0) + out.get("production_reduced", 0), 0)

    def test_13_invalid_config_blocked(self):
        self._bom(100)
        # Remove awaiting from production config
        pc = self.db.query(PickingConfig).filter(PickingConfig.id == 2).one()
        pc.status_awaiting_production_id = None
        self.db.flush()
        self._inv(100, 0, 1)
        order = self._order(23, [(100, 2)])
        self.db.commit()
        res = self._run_active(order)
        self.assertEqual(res.readiness.code, ORDER_BLOCKED_CONFIG)
        self.assertEqual(self.db.query(ProductionOrder).count(), 0)

    def test_15_dry_run_no_side_effects(self):
        self._bom(100)
        self._inv(100, 5, 1)
        order = self._order(24, [(100, 7)])
        self.db.commit()
        with patch.dict(os.environ, {"FEATURE_PICKING_ENTRY_READINESS_MODE": MODE_DRY_RUN}):
            res = run_picking_entry_gate(
                self.db,
                order=order,
                previous_status_id=None,
                new_status_id=1,
                force_mode=MODE_DRY_RUN,
            )
        self.assertEqual(res.mode, MODE_DRY_RUN)
        self.assertEqual(self.db.query(StockReservation).count(), 0)
        self.assertEqual(self.db.query(ProductionOrder).count(), 0)
        self.assertEqual(int(order.order_ui_status_id), 1)


if __name__ == "__main__":
    unittest.main()
