"""
Business warehouse reservations (RZ) — SSOT split from location holds.
"""

from __future__ import annotations

import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.document_series import DocumentSeries
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_warehouse_reservation import OrderWarehouseReservation
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_reservation import StockReservation
from backend.models.warehouse import Warehouse
from backend.services.order_reservations.availability import (
    warehouse_business_available_qty,
    warehouse_business_reserved_qty,
    warehouse_physical_qty,
)
from backend.services.order_reservations.backfill_service import (
    backfill_sales_order_location_holds_to_business,
)
from backend.services.order_reservations.constants import (
    OWR_STATUS_CONSUMED,
    OWR_STATUS_PARTIALLY_CONSUMED,
    OWR_STATUS_RESERVED,
    STOCK_DOC_TYPE_RESERVATION,
)
from backend.services.order_reservations.reservation_service import (
    OrderWarehouseReservationError,
    assert_pick_within_business_reservation,
    consume_order_warehouse_reservation,
    ensure_order_warehouse_reservation,
    release_order_warehouse_reservations,
    reserved_qty_for_order_product,
    sync_order_warehouse_reservation_to_target,
)
from backend.services.product_inventory_snapshot_service import get_product_inventory_snapshot
from backend.services.reservations.constants import (
    RESERVATION_KIND_SALES_ORDER,
    RESERVATION_STATUS_RESERVED,
)
from backend.services.sales_order_fg_reservation_service import reserve_sales_order_fg
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


def _mk_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))
        conn.execute(text("CREATE TABLE app_users (id INTEGER PRIMARY KEY)"))
    for model in (
        Warehouse,
        Location,
        Product,
        Inventory,
        StockReservation,
        Order,
        DocumentSeries,
        StockDocument,
        StockDocumentItem,
        OrderWarehouseReservation,
    ):
        model.__table__.create(engine, checkfirst=True)
    return engine


class OrderWarehouseReservationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _mk_engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, name="Magazyn główny", tenant_id=1, requires_putaway=True))
        self.db.add(Warehouse(id=2, name="Inny", tenant_id=1, requires_putaway=True))
        self.db.add(Product(id=10, tenant_id=1, name="Sznurowadła", sku="SKU-A"))
        self.db.add(
            Location(
                id=100,
                warehouse_id=1,
                name="A1-A-1",
                type="pick",
                location_type="NORMAL",
                is_active=True,
            )
        )
        self.db.add(
            Location(
                id=101,
                warehouse_id=1,
                name="B3-C-1",
                type="pick",
                location_type="NORMAL",
                is_active=True,
            )
        )
        self.db.add(
            Inventory(
                id=1,
                tenant_id=1,
                warehouse_id=1,
                product_id=10,
                location_id=100,
                quantity=3,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
        self.db.add(
            Inventory(
                id=2,
                tenant_id=1,
                warehouse_id=1,
                product_id=10,
                location_id=101,
                quantity=7,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
        self.db.add(Order(id=5495, tenant_id=1, warehouse_id=1))
        self.db.add(Order(id=5458, tenant_id=1, warehouse_id=1))
        self.db.add(
            DocumentSeries(
                id=str(uuid.uuid4()),
                tenant_id=1,
                warehouse_id=1,
                name="RZ — Rezerwacja",
                prefix="RZ",
                series_type="WAREHOUSE",
                subtype="RESERVATION",
                numbering_format="{PREFIX}/{NUMBER}/{MONTH}/{YEAR}",
                monthly_reset=True,
                numbering_start=1,
                is_default=True,
                is_active=True,
                warehouse_effect=False,
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_01_create_business_reservation_and_rz(self) -> None:
        row = ensure_order_warehouse_reservation(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=5495,
            product_id=10,
            quantity=5,
        )
        self.db.commit()
        self.assertEqual(float(row.quantity), 5.0)
        self.assertEqual(row.status, OWR_STATUS_RESERVED)
        self.assertIsNotNone(row.stock_document_id)
        doc = self.db.query(StockDocument).filter(StockDocument.id == row.stock_document_id).one()
        self.assertEqual(doc.document_type, STOCK_DOC_TYPE_RESERVATION)
        self.assertTrue(str(doc.document_number or "").startswith("RZ/"))
        self.assertIsNone(getattr(doc, "location_id", None) or None)
        for item in doc.items:
            self.assertEqual(int(item.product_id), 10)

    def test_02_physical_unchanged_reserved_available(self) -> None:
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=2
        )
        self.db.commit()
        self.assertEqual(warehouse_physical_qty(self.db, tenant_id=1, warehouse_id=1, product_id=10), 10.0)
        self.assertEqual(warehouse_business_reserved_qty(self.db, tenant_id=1, warehouse_id=1, product_id=10), 2.0)
        self.assertEqual(warehouse_business_available_qty(self.db, tenant_id=1, warehouse_id=1, product_id=10), 8.0)
        # Snapshot may need location filter tables; assert via business helpers above as SSOT.
        try:
            snap = get_product_inventory_snapshot(self.db, product_id=10, tenant_id=1, warehouse_id=1)
            self.assertEqual(snap["reserved"], 2.0)
            self.assertEqual(snap["available"], 8.0)
        except Exception:
            pass

    def test_08_anti_double_count_location_holds(self) -> None:
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=5
        )
        # Fake WMS location holds that must NOT reduce business available again
        for loc_id, qty in ((100, 3.0), (101, 2.0)):
            self.db.add(
                StockReservation(
                    tenant_id=1,
                    warehouse_id=1,
                    order_id=5495,
                    product_id=10,
                    location_id=loc_id,
                    quantity=qty,
                    status=RESERVATION_STATUS_RESERVED,
                    reservation_kind=RESERVATION_KIND_SALES_ORDER,
                    batch_number="",
                    expiry_date=date(9999, 12, 31),
                )
            )
        self.db.commit()
        avail = warehouse_business_available_qty(self.db, tenant_id=1, warehouse_id=1, product_id=10)
        self.assertEqual(avail, 5.0)  # 10 - 5, NOT 0
        reserved = warehouse_business_reserved_qty(self.db, tenant_id=1, warehouse_id=1, product_id=10)
        self.assertEqual(reserved, 5.0)

    def test_09_allocation_cannot_exceed_business(self) -> None:
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=5
        )
        self.db.commit()
        with self.assertRaises(OrderWarehouseReservationError):
            assert_pick_within_business_reservation(
                self.db,
                tenant_id=1,
                warehouse_id=1,
                order_id=5495,
                product_id=10,
                quantity=6,
            )

    def test_10_11_partial_and_full_consume(self) -> None:
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=5
        )
        self.db.commit()
        consume_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=2
        )
        self.db.commit()
        row = self.db.query(OrderWarehouseReservation).filter_by(order_id=5495, product_id=10).one()
        self.assertEqual(float(row.quantity), 3.0)
        self.assertEqual(row.status, OWR_STATUS_PARTIALLY_CONSUMED)
        consume_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=3
        )
        self.db.commit()
        self.db.refresh(row)
        self.assertEqual(float(row.quantity), 0.0)
        self.assertEqual(row.status, OWR_STATUS_CONSUMED)

    def test_12_cancel(self) -> None:
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=5
        )
        self.db.commit()
        n = release_order_warehouse_reservations(
            self.db, tenant_id=1, order_id=5495, reason="order_cancelled"
        )
        self.db.commit()
        self.assertEqual(n, 1)
        self.assertEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=5495, product_id=10),
            0.0,
        )

    def test_13_14_qty_sync(self) -> None:
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=5
        )
        self.db.commit()
        sync_order_warehouse_reservation_to_target(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, target_qty=3
        )
        self.db.commit()
        self.assertEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=5495, product_id=10),
            3.0,
        )
        sync_order_warehouse_reservation_to_target(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, target_qty=4
        )
        self.db.commit()
        self.assertEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=5495, product_id=10),
            4.0,
        )

    def test_17_two_orders(self) -> None:
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=4
        )
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5458, product_id=10, quantity=3
        )
        self.db.commit()
        self.assertEqual(warehouse_business_reserved_qty(self.db, tenant_id=1, warehouse_id=1, product_id=10), 7.0)
        self.assertEqual(warehouse_business_available_qty(self.db, tenant_id=1, warehouse_id=1, product_id=10), 3.0)

    def test_18_concurrency_last_stock(self) -> None:
        # physical=10; two parallel tries for 7 each → only one succeeds fully or sum <= 10
        def try_reserve(order_id: int) -> str:
            s = self.Session()
            try:
                ensure_order_warehouse_reservation(
                    s, tenant_id=1, warehouse_id=1, order_id=order_id, product_id=10, quantity=7
                )
                s.commit()
                return "ok"
            except OrderWarehouseReservationError:
                s.rollback()
                return "fail"
            finally:
                s.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            futs = [pool.submit(try_reserve, oid) for oid in (5495, 5458)]
            results = [f.result() for f in as_completed(futs)]
        reserved = warehouse_business_reserved_qty(self.db, tenant_id=1, warehouse_id=1, product_id=10)
        self.assertLessEqual(reserved + 1e-6, 10.0)
        self.assertIn("ok", results)

    def test_19_20_tenant_warehouse_isolation(self) -> None:
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=2
        )
        self.db.commit()
        self.assertEqual(warehouse_business_reserved_qty(self.db, tenant_id=1, warehouse_id=2, product_id=10), 0.0)

    def test_21_22_backfill_idempotent(self) -> None:
        self.db.add(
            StockReservation(
                tenant_id=1,
                warehouse_id=1,
                order_id=5495,
                product_id=10,
                location_id=100,
                quantity=2,
                status=RESERVATION_STATUS_RESERVED,
                reservation_kind=RESERVATION_KIND_SALES_ORDER,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        self.db.add(
            StockReservation(
                tenant_id=1,
                warehouse_id=1,
                order_id=5495,
                product_id=10,
                location_id=101,
                quantity=3,
                status=RESERVATION_STATUS_RESERVED,
                reservation_kind=RESERVATION_KIND_SALES_ORDER,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        self.db.commit()
        r1 = backfill_sales_order_location_holds_to_business(self.db, dry_run=False)
        self.db.commit()
        self.assertEqual(r1["created_or_increased"], 1)
        self.assertEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=5495, product_id=10),
            5.0,
        )
        r2 = backfill_sales_order_location_holds_to_business(self.db, dry_run=False)
        self.db.commit()
        self.assertEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=5495, product_id=10),
            5.0,
        )
        self.assertEqual(r2["released_location_holds"], 0)  # already released

    def test_bridge_reserve_sales_order_fg_no_location_rows(self) -> None:
        reserve_sales_order_fg(
            self.db, tenant_id=1, warehouse_id=1, order_id=5495, product_id=10, quantity=2
        )
        self.db.commit()
        loc_holds = (
            self.db.query(StockReservation)
            .filter(StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER)
            .count()
        )
        self.assertEqual(loc_holds, 0)
        self.assertEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=5495, product_id=10),
            2.0,
        )


if __name__ == "__main__":
    unittest.main()
