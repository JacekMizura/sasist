"""
Phase 1: SALES_ORDER ↔ picking ATP bridge + picking-entry readiness dry-run.

  python -m pytest backend/tests/test_picking_entry_readiness_phase1.py -q
"""

from __future__ import annotations

import os
import threading
import unittest
import unittest.mock
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.models.stock_reservation import StockReservation
from backend.models.warehouse import Warehouse
from backend.services.order_item_pick_allocation_service import consume_inventory_fifo_slices
from backend.services.picking_entry_readiness_service import (
    LINE_MANUFACTURING_PARTIAL,
    LINE_NO_BOM,
    LINE_READY,
    LINE_REGULAR_SHORTAGE,
    ORDER_BLOCKED_MIXED,
    ORDER_BLOCKED_REGULAR_SHORTAGE,
    ORDER_READY_FOR_PICKING,
    evaluate_order_picking_entry_readiness,
)
from backend.services.picking_routing_service import PickingRoutingService
from backend.services.reservations.constants import (
    RESERVATION_KIND_SALES_ORDER,
    RESERVATION_STATUS_PICKED,
    RESERVATION_STATUS_RELEASED,
    RESERVATION_STATUS_RESERVED,
)
from backend.services.sales_order_fg_reservation_service import (
    SalesOrderReservationError,
    consume_sales_order_reservations_for_pick,
    partial_release_sales_order_qty,
    release_sales_order_reservations_for_order,
    reserve_sales_order_fg,
)
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_picking_atp import pickable_available_qty
from backend.services.wms_order_validation.service import validate_orders_for_picking


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
        ProductComposition,
        ProductCompositionLine,
    ):
        model.__table__.create(engine, checkfirst=True)
    return engine


def _seed_base(db, *, stock_qty: float = 10.0):
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
    db.add(Product(id=100, tenant_id=1, name="A", sku="A"))
    db.add(Product(id=200, tenant_id=1, name="B", sku="B"))
    db.add(
        Inventory(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            product_id=100,
            location_id=1,
            quantity=float(stock_qty),
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.flush()


def _add_order(db, *, oid: int, product_id: int, qty: float, number: str | None = None):
    db.add(
        Order(
            id=oid,
            tenant_id=1,
            warehouse_id=1,
            number=number or str(oid),
            status="NEW",
        )
    )
    db.flush()
    db.add(
        OrderItem(
            id=oid * 10,
            order_id=oid,
            product_id=product_id,
            quantity=float(qty),
        )
    )
    db.flush()


class SalesOrderAtpBridgeTests(unittest.TestCase):
    def setUp(self):
        self.engine = _mk_engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        _seed_base(self.db, stock_qty=10.0)
        _add_order(self.db, oid=1, product_id=100, qty=7)
        _add_order(self.db, oid=2, product_id=100, qty=3)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_01_foreign_reservation_reduces_atp(self):
        reserve_sales_order_fg(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            product_id=100,
            quantity=7,
        )
        self.db.flush()
        atp_other = pickable_available_qty(
            self.db, tenant_id=1, warehouse_id=1, product_id=100, exclude_order_id=2
        )
        self.assertAlmostEqual(atp_other, 3.0, places=4)

    def test_02_own_reservation_does_not_block_self(self):
        reserve_sales_order_fg(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            product_id=100,
            quantity=7,
        )
        self.db.flush()
        atp_own = pickable_available_qty(
            self.db, tenant_id=1, warehouse_id=1, product_id=100, exclude_order_id=1
        )
        self.assertAlmostEqual(atp_own, 10.0, places=4)

    def test_03_routing_respects_foreign_sales_order(self):
        reserve_sales_order_fg(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            product_id=100,
            quantity=7,
        )
        self.db.commit()
        with unittest.mock.patch(
            "backend.services.picking_routing_service.visit_index_map",
            create=True,
        ), unittest.mock.patch(
            "backend.services.warehouse_routing.runtime_graph_reader.visit_index_map",
            return_value={},
        ):
            routing = PickingRoutingService(self.db).build_location_pick_list([2], tenant_id=1)
        self.assertEqual(routing.shortfalls, [])
        total = sum(r.total_quantity for r in routing.pick_list)
        self.assertAlmostEqual(total, 3.0, places=4)
        _add_order(self.db, oid=3, product_id=100, qty=4)
        self.db.commit()
        with unittest.mock.patch(
            "backend.services.warehouse_routing.runtime_graph_reader.visit_index_map",
            return_value={},
        ):
            routing3 = PickingRoutingService(self.db).build_location_pick_list([3], tenant_id=1)
        self.assertTrue(routing3.shortfalls)
        self.assertAlmostEqual(routing3.shortfalls[0].allocated, 3.0, places=4)

    def test_04_validate_orders_respects_foreign_sales_order(self):
        reserve_sales_order_fg(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            product_id=100,
            quantity=8,
        )
        self.db.commit()
        with unittest.mock.patch(
            "backend.services.warehouse_routing.runtime_graph_reader.visit_index_map",
            return_value={},
        ):
            results = validate_orders_for_picking(self.db, order_ids=[2], tenant_id=1)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].validation_status, "FAIL")

    def test_05_pick_consume_no_double_decrement(self):
        reserve_sales_order_fg(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            product_id=100,
            quantity=7,
        )
        self.db.flush()
        inv_before = float(self.db.query(Inventory).filter(Inventory.id == 1).one().quantity)
        slices = consume_inventory_fifo_slices(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            product_id=100,
            location_id=1,
            quantity=7,
            exclude_order_id=1,
        )
        consumed = consume_sales_order_reservations_for_pick(
            self.db,
            tenant_id=1,
            order_id=1,
            product_id=100,
            location_id=1,
            quantity=7,
        )
        self.db.flush()
        inv_after = float(self.db.query(Inventory).filter(Inventory.id == 1).one().quantity)
        self.assertAlmostEqual(sum(s.quantity for s in slices), 7.0, places=4)
        self.assertAlmostEqual(consumed, 7.0, places=4)
        self.assertAlmostEqual(inv_after, inv_before - 7.0, places=4)
        # Reservation marked picked — not a second stock decrement
        rows = (
            self.db.query(StockReservation)
            .filter(StockReservation.order_id == 1, StockReservation.product_id == 100)
            .all()
        )
        self.assertTrue(rows)
        self.assertTrue(all(str(r.status) == RESERVATION_STATUS_PICKED for r in rows))
        self.assertAlmostEqual(inv_after, 3.0, places=4)

    def test_06_cancel_releases(self):
        reserve_sales_order_fg(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            product_id=100,
            quantity=7,
        )
        self.db.flush()
        n = release_sales_order_reservations_for_order(
            self.db, tenant_id=1, order_id=1, reason="order_cancelled"
        )
        self.db.flush()
        self.assertGreaterEqual(n, 1)
        active = (
            self.db.query(StockReservation)
            .filter(
                StockReservation.order_id == 1,
                StockReservation.status == RESERVATION_STATUS_RESERVED,
            )
            .count()
        )
        self.assertEqual(active, 0)
        atp = pickable_available_qty(
            self.db, tenant_id=1, warehouse_id=1, product_id=100, exclude_order_id=2
        )
        self.assertAlmostEqual(atp, 10.0, places=4)

    def test_07_qty_down_partial_release(self):
        reserve_sales_order_fg(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            product_id=100,
            quantity=7,
        )
        self.db.flush()
        released = partial_release_sales_order_qty(
            self.db,
            tenant_id=1,
            order_id=1,
            product_id=100,
            release_qty=2,
        )
        self.db.flush()
        self.assertAlmostEqual(released, 2.0, places=4)
        remaining = sum(
            float(r.quantity or 0)
            for r in self.db.query(StockReservation)
            .filter(
                StockReservation.order_id == 1,
                StockReservation.status == RESERVATION_STATUS_RESERVED,
                StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
            )
            .all()
        )
        self.assertAlmostEqual(remaining, 5.0, places=4)


class ReadinessDryRunTests(unittest.TestCase):
    def setUp(self):
        self.engine = _mk_engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True))
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
        self.db.add(Product(id=100, tenant_id=1, name="A-mfg", sku="A"))
        self.db.add(Product(id=200, tenant_id=1, name="B-reg", sku="B"))
        self.db.add(Product(id=300, tenant_id=1, name="C-comp", sku="C"))
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

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

    def _bom(self, fg_id: int, component_id: int = 300):
        comp = ProductComposition(
            id=fg_id,
            tenant_id=1,
            product_id=fg_id,
            composition_mode="manufacturing",
            is_active=True,
            name="BOM",
        )
        self.db.add(comp)
        self.db.flush()
        self.db.add(
            ProductCompositionLine(
                id=fg_id * 10,
                composition_id=int(comp.id),
                component_product_id=component_id,
                quantity=1.0,
            )
        )

    def _order_with_lines(self, oid: int, lines: list[tuple[int, float]]):
        self.db.add(Order(id=oid, tenant_id=1, warehouse_id=1, number=str(oid), status="NEW"))
        self.db.flush()
        for i, (pid, qty) in enumerate(lines):
            self.db.add(
                OrderItem(id=oid * 100 + i, order_id=oid, product_id=pid, quantity=float(qty))
            )
        self.db.flush()
        return self.db.query(Order).filter(Order.id == oid).one()

    def test_09_full_ready(self):
        self._bom(100)
        self._inv(100, 10, 1)
        self._inv(200, 5, 2)
        order = self._order_with_lines(10, [(100, 7), (200, 2)])
        self.db.commit()
        res = evaluate_order_picking_entry_readiness(self.db, order=order, dry_run=True)
        self.assertEqual(res.code, ORDER_READY_FOR_PICKING)
        self.assertTrue(all(ln.code == LINE_READY for ln in res.lines))
        # dry-run must not create reservations
        self.assertEqual(self.db.query(StockReservation).count(), 0)

    def test_10_manufacturing_partial(self):
        self._bom(100)
        self._inv(100, 5, 1)
        order = self._order_with_lines(11, [(100, 7)])
        self.db.commit()
        res = evaluate_order_picking_entry_readiness(self.db, order=order, dry_run=True)
        ln = res.lines[0]
        self.assertEqual(ln.code, LINE_MANUFACTURING_PARTIAL)
        self.assertAlmostEqual(ln.required, 7.0)
        self.assertAlmostEqual(ln.available, 5.0)
        self.assertAlmostEqual(ln.would_allocate, 5.0)
        self.assertAlmostEqual(ln.production_required, 2.0)
        self.assertEqual(self.db.query(StockReservation).count(), 0)

    def test_11_regular_shortage(self):
        self._inv(200, 6, 1)
        order = self._order_with_lines(12, [(200, 10)])
        self.db.commit()
        res = evaluate_order_picking_entry_readiness(self.db, order=order, dry_run=True)
        self.assertEqual(res.code, ORDER_BLOCKED_REGULAR_SHORTAGE)
        ln = res.lines[0]
        self.assertEqual(ln.code, LINE_REGULAR_SHORTAGE)
        self.assertAlmostEqual(ln.missing, 4.0)

    def test_12_blocked_mixed(self):
        self._bom(100)
        self._inv(100, 5, 1)
        self._inv(200, 6, 2)
        order = self._order_with_lines(13, [(100, 7), (200, 10)])
        self.db.commit()
        res = evaluate_order_picking_entry_readiness(self.db, order=order, dry_run=True)
        self.assertEqual(res.code, ORDER_BLOCKED_MIXED)
        by_pid = {ln.product_id: ln for ln in res.lines}
        self.assertEqual(by_pid[100].code, LINE_MANUFACTURING_PARTIAL)
        self.assertAlmostEqual(by_pid[100].production_required, 2.0)
        self.assertEqual(by_pid[200].code, LINE_REGULAR_SHORTAGE)
        self.assertAlmostEqual(by_pid[200].missing, 4.0)
        self.assertEqual(self.db.query(StockReservation).count(), 0)

    def test_13_no_bom_inactive_composition(self):
        self.db.add(
            ProductComposition(
                id=50,
                tenant_id=1,
                product_id=100,
                composition_mode="manufacturing",
                is_active=False,
                name="inactive",
            )
        )
        self._inv(100, 1, 1)
        order = self._order_with_lines(14, [(100, 5)])
        self.db.commit()
        res = evaluate_order_picking_entry_readiness(self.db, order=order, dry_run=True)
        self.assertEqual(res.lines[0].code, LINE_NO_BOM)

    def test_14_idempotent_retry_no_side_effect(self):
        self._bom(100)
        self._inv(100, 5, 1)
        self._inv(200, 6, 2)
        order = self._order_with_lines(15, [(100, 7), (200, 10)])
        self.db.commit()
        r1 = evaluate_order_picking_entry_readiness(self.db, order=order, dry_run=True)
        r2 = evaluate_order_picking_entry_readiness(self.db, order=order, dry_run=True)
        self.assertEqual(r1.code, r2.code)
        self.assertEqual(r1.to_dict()["lines"], r2.to_dict()["lines"])
        self.assertEqual(self.db.query(StockReservation).count(), 0)
        self.assertEqual(self.db.query(Inventory).filter(Inventory.product_id == 100).one().quantity, 5)


class ConcurrentSalesOrderReserveTests(unittest.TestCase):
    """Serial invariant 7+3+1 on stock 10; threaded stress uses PostgreSQL when available."""

    def setUp(self):
        self.engine = _mk_engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        _seed_base(self.db, stock_qty=10.0)
        _add_order(self.db, oid=1, product_id=100, qty=7)
        _add_order(self.db, oid=2, product_id=100, qty=3)
        _add_order(self.db, oid=3, product_id=100, qty=1)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_08_concurrency_7_3_1(self):
        reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=1, product_id=100, quantity=7
        )
        reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=2, product_id=100, quantity=3
        )
        with self.assertRaises(SalesOrderReservationError):
            reserve_sales_order_fg(
                self.db, tenant_id=1, warehouse_id=1, order_id=3, product_id=100, quantity=1
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
        self.assertAlmostEqual(total, 10.0, places=4)


_PG_URL = (os.getenv("SHORTAGE_PG_URL") or os.getenv("TEST_DATABASE_URL") or "").strip()


@unittest.skipUnless(_PG_URL.startswith("postgresql"), "PostgreSQL URL required for true concurrency")
class ConcurrentSalesOrderReservePostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(_PG_URL, isolation_level="READ COMMITTED", pool_size=4, max_overflow=0)
        tables = (
            Warehouse.__table__,
            Location.__table__,
            Product.__table__,
            Inventory.__table__,
            StockReservation.__table__,
            Order.__table__,
            OrderItem.__table__,
        )
        with cls.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1) ON CONFLICT DO NOTHING"))
            for t in reversed(tables):
                conn.execute(text(f"DROP TABLE IF EXISTS {t.name} CASCADE"))
            for t in tables:
                t.create(conn, checkfirst=True)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def setUp(self):
        db = self.Session()
        try:
            db.execute(
                text(
                    "TRUNCATE stock_reservations, order_items, orders, inventory, locations, "
                    "products, warehouses RESTART IDENTITY CASCADE"
                )
            )
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
            db.add(Product(id=100, tenant_id=1, name="A", sku="A"))
            db.flush()
            db.add(
                Inventory(
                    id=1,
                    tenant_id=1,
                    warehouse_id=1,
                    product_id=100,
                    location_id=1,
                    quantity=10.0,
                    batch_number="",
                    expiry_date=date(9999, 12, 31),
                    stock_disposition=STOCK_DISPOSITION_SALEABLE,
                )
            )
            for oid, qty in ((1, 7), (2, 3), (3, 1)):
                db.add(Order(id=oid, tenant_id=1, warehouse_id=1, number=str(oid), status="NEW"))
                db.flush()
                db.add(OrderItem(id=oid * 10, order_id=oid, product_id=100, quantity=float(qty)))
            db.commit()
        finally:
            db.close()

    def test_pg_concurrency_7_3_1(self):
        barrier = threading.Barrier(3)
        results: dict[int, str] = {}
        lock = threading.Lock()

        def worker(oid: int, qty: float):
            db = self.Session()
            try:
                barrier.wait(timeout=15)
                try:
                    reserve_sales_order_fg(
                        db,
                        tenant_id=1,
                        warehouse_id=1,
                        order_id=oid,
                        product_id=100,
                        quantity=qty,
                    )
                    db.commit()
                    with lock:
                        results[oid] = "ok"
                except SalesOrderReservationError:
                    db.rollback()
                    with lock:
                        results[oid] = "fail"
            finally:
                db.close()

        threads = [
            threading.Thread(target=worker, args=(1, 7.0)),
            threading.Thread(target=worker, args=(2, 3.0)),
            threading.Thread(target=worker, args=(3, 1.0)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)
        db = self.Session()
        try:
            total = sum(
                float(r.quantity or 0)
                for r in db.query(StockReservation)
                .filter(StockReservation.status == RESERVATION_STATUS_RESERVED)
                .all()
            )
            self.assertLessEqual(total + 1e-6, 10.0)
            self.assertEqual(results.get(3), "fail")
            self.assertAlmostEqual(total, 10.0, places=4)
            self.assertEqual(results.get(1), "ok")
            self.assertEqual(results.get(2), "ok")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
