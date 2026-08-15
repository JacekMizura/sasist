"""
UAT Phase 3 fixes: own MO reservation, SALES_ORDER overbook, allocate guard.

  python -m pytest backend/tests/test_wms_reservation_uat_phase3_fixes.py -q
"""

from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED,
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderSourceItem,
)
from backend.models.stock_reservation import StockReservation
from backend.models.warehouse import Warehouse
from backend.services.order_item_pick_allocation_service import consume_inventory_fifo_slices
from backend.services.production_execution.material_consume_service import (
    consume_production_material_slices,
)
from backend.services.production_execution.orders_fg_fulfillment_service import (
    allocate_produced_delta_to_order_sources,
)
from backend.services.reservations.constants import (
    RESERVATION_KIND_PRODUCTION_ORDER,
    RESERVATION_KIND_SALES_ORDER,
    RESERVATION_STATUS_RESERVED,
)
from backend.services.sales_order_fg_reservation_service import (
    SalesOrderReservationError,
    reserve_sales_order_fg,
)
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_picking_atp import (
    pickable_available_qty,
    pickable_free_capacity_by_location,
    pickable_free_capacity_qty,
)


def _mk_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))
    for model in (
        Warehouse,
        Location,
        Product,
        Inventory,
        StockReservation,
        Order,
        OrderItem,
        ProductionOrder,
        ProductionOrderSourceItem,
    ):
        model.__table__.create(engine, checkfirst=True)
    return engine


def _seed_wh(db):
    db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True))
    db.add(
        Location(
            id=1,
            warehouse_id=1,
            name="A1",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
    )
    db.add(
        Location(
            id=2,
            warehouse_id=1,
            name="B1",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
    )
    db.add(Product(id=100, tenant_id=1, name="FG", sku="FG"))
    db.add(Product(id=200, tenant_id=1, name="COMP", sku="ST-003"))
    db.flush()


def _inv(db, *, pid: int, qty: float, loc_id: int, iid: int):
    db.add(
        Inventory(
            id=iid,
            tenant_id=1,
            warehouse_id=1,
            product_id=pid,
            location_id=loc_id,
            quantity=float(qty),
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )


class OwnProductionReservationCollectTests(unittest.TestCase):
    def setUp(self):
        self.engine = _mk_engine()
        self.db = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)()
        _seed_wh(self.db)
        _inv(self.db, pid=200, qty=10, loc_id=1, iid=1)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_01_own_mo_reservation_does_not_block_consume(self):
        self.db.add(
            StockReservation(
                tenant_id=1,
                warehouse_id=1,
                product_id=200,
                location_id=1,
                quantity=10,
                status=RESERVATION_STATUS_RESERVED,
                reservation_kind=RESERVATION_KIND_PRODUCTION_ORDER,
                production_order_id=4,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
        self.db.flush()
        atp = pickable_available_qty(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            product_id=200,
            exclude_production_order_id=4,
        )
        self.assertAlmostEqual(atp, 10.0, places=4)
        slices = consume_production_material_slices(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            product_id=200,
            location_id=1,
            quantity=10,
            exclude_production_order_id=4,
        )
        self.assertAlmostEqual(sum(s.quantity for s in slices), 10.0, places=4)
        inv = self.db.query(Inventory).filter(Inventory.id == 1).one()
        self.assertAlmostEqual(float(inv.quantity), 0.0, places=4)

    def test_02_foreign_mo_reservation_blocks(self):
        self.db.add(
            StockReservation(
                tenant_id=1,
                warehouse_id=1,
                product_id=200,
                location_id=1,
                quantity=4,
                status=RESERVATION_STATUS_RESERVED,
                reservation_kind=RESERVATION_KIND_PRODUCTION_ORDER,
                production_order_id=99,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
        self.db.add(
            StockReservation(
                tenant_id=1,
                warehouse_id=1,
                product_id=200,
                location_id=1,
                quantity=6,
                status=RESERVATION_STATUS_RESERVED,
                reservation_kind=RESERVATION_KIND_PRODUCTION_ORDER,
                production_order_id=4,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
        self.db.flush()
        atp = pickable_available_qty(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            product_id=200,
            exclude_production_order_id=4,
        )
        self.assertAlmostEqual(atp, 6.0, places=4)
        with self.assertRaises(ValueError):
            consume_inventory_fifo_slices(
                self.db,
                tenant_id=1,
                warehouse_id=1,
                product_id=200,
                location_id=1,
                quantity=7,
                exclude_production_order_id=4,
            )
        slices = consume_inventory_fifo_slices(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            product_id=200,
            location_id=1,
            quantity=6,
            exclude_production_order_id=4,
        )
        self.assertAlmostEqual(sum(s.quantity for s in slices), 6.0, places=4)


class SalesOrderOverbookTests(unittest.TestCase):
    def setUp(self):
        self.engine = _mk_engine()
        self.db = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)()
        _seed_wh(self.db)
        self.db.add(Order(id=1, tenant_id=1, warehouse_id=1, number="1", status="NEW"))
        self.db.add(Order(id=2, tenant_id=1, warehouse_id=1, number="2", status="NEW"))
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_05_own_reservation_blocks_same_location_again(self):
        _inv(self.db, pid=100, qty=1, loc_id=1, iid=1)
        self.db.flush()
        reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=1, product_id=100, quantity=1
        )
        self.db.flush()
        free = pickable_free_capacity_qty(
            self.db, tenant_id=1, warehouse_id=1, product_id=100
        )
        self.assertAlmostEqual(free, 0.0, places=4)
        with self.assertRaises(SalesOrderReservationError):
            reserve_sales_order_fg(
                self.db, tenant_id=1, warehouse_id=1, order_id=1, product_id=100, quantity=1
            )

    def test_06_allocator_spills_to_next_location(self):
        _inv(self.db, pid=100, qty=1, loc_id=1, iid=1)
        _inv(self.db, pid=100, qty=1, loc_id=2, iid=2)
        self.db.flush()
        reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=1, product_id=100, quantity=1
        )
        self.db.flush()
        rows = reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=1, product_id=100, quantity=1
        )
        self.db.flush()
        self.assertEqual(len(rows), 1)
        self.assertEqual(int(rows[0].location_id), 2)
        locs = {
            int(r.location_id): float(r.quantity)
            for r in self.db.query(StockReservation)
            .filter(StockReservation.status == RESERVATION_STATUS_RESERVED)
            .all()
        }
        self.assertAlmostEqual(locs.get(1, 0), 1.0, places=4)
        self.assertAlmostEqual(locs.get(2, 0), 1.0, places=4)

    def test_07_multi_order_no_overbook(self):
        _inv(self.db, pid=100, qty=3, loc_id=1, iid=1)
        self.db.flush()
        reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=1, product_id=100, quantity=1
        )
        # Availability event +1 already in stock; order1 needs +1 more, order2 needs 1.
        reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=1, product_id=100, quantity=1
        )
        reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=2, product_id=100, quantity=1
        )
        self.db.flush()
        total = sum(
            float(r.quantity or 0)
            for r in self.db.query(StockReservation)
            .filter(
                StockReservation.status == RESERVATION_STATUS_RESERVED,
                StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
            )
            .all()
        )
        self.assertAlmostEqual(total, 3.0, places=4)
        free_rows = pickable_free_capacity_by_location(
            self.db, tenant_id=1, warehouse_id=1, product_id=100
        )
        self.assertEqual(free_rows, [])


class AllocateProducedGuardTests(unittest.TestCase):
    def setUp(self):
        self.engine = _mk_engine()
        self.db = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)()
        _seed_wh(self.db)
        self.db.add(Order(id=10, tenant_id=1, warehouse_id=1, number="10", status="NEW"))
        self.db.add(
            OrderItem(id=100, order_id=10, product_id=100, quantity=1.0)
        )
        self.db.add(
            ProductionOrder(
                id=4,
                tenant_id=1,
                warehouse_id=1,
                product_id=100,
                number="MO/4",
                status="in_progress",
                planned_quantity=5.0,
                produced_quantity=0.0,
                source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
                picking_config_id=1,
            )
        )
        self.db.add(
            ProductionOrderSourceItem(
                id=1,
                tenant_id=1,
                production_order_id=4,
                order_id=10,
                order_item_id=100,
                product_id=100,
                requested_quantity=1.0,
                fulfilled_quantity=0.0,
                status=PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
            )
        )
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_11_covered_order_does_not_get_production_fulfillment(self):
        # External SALES_ORDER covers the line; source still reserved (pre-detach race).
        self.db.add(
            StockReservation(
                tenant_id=1,
                warehouse_id=1,
                order_id=10,
                product_id=100,
                location_id=1,
                quantity=1,
                status=RESERVATION_STATUS_RESERVED,
                reservation_kind=RESERVATION_KIND_SALES_ORDER,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
        _inv(self.db, pid=100, qty=1, loc_id=1, iid=50)
        self.db.flush()

        with patch(
            "backend.services.production_execution.orders_fg_fulfillment_service.resolve_status_after_production_id",
            return_value=99,
        ):
            out = allocate_produced_delta_to_order_sources(
                self.db, mo=self.db.query(ProductionOrder).one(), delta_qty=1.0
            )
        self.assertAlmostEqual(float(out.get("delta_allocated") or 0), 0.0, places=4)
        self.assertEqual(len(out.get("allocations") or []), 0)
        self.assertTrue(out.get("skipped_covered"))
        src = self.db.query(ProductionOrderSourceItem).one()
        self.assertAlmostEqual(float(src.fulfilled_quantity or 0), 0.0, places=4)
        self.assertEqual(str(src.status), PRODUCTION_ORDER_SOURCE_ITEM_RESERVED)

    def test_12_cancelled_source_ignored(self):
        src = self.db.query(ProductionOrderSourceItem).one()
        src.status = PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED
        self.db.flush()
        with patch(
            "backend.services.production_execution.orders_fg_fulfillment_service.resolve_status_after_production_id",
            return_value=99,
        ):
            out = allocate_produced_delta_to_order_sources(
                self.db, mo=self.db.query(ProductionOrder).one(), delta_qty=1.0
            )
        self.assertAlmostEqual(float(out.get("delta_allocated") or 0), 0.0, places=4)


if __name__ == "__main__":
    unittest.main()
