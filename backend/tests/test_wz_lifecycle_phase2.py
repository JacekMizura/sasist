"""Phase 2 — WZ lifecycle: documentary vs issue, idempotency, OWR/RZ."""

from __future__ import annotations

import unittest
import uuid
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.document_series import DocumentSeries
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_warehouse_reservation import OrderWarehouseReservation
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.warehouse import Warehouse
from backend.services.order_reservations.constants import (
    OWR_STATUS_PARTIALLY_CONSUMED,
    OWR_STATUS_RESERVED,
    STOCK_DOC_TYPE_RESERVATION,
)
from backend.services.order_reservations.reservation_service import (
    consume_order_warehouse_reservation,
    ensure_order_warehouse_reservation,
)
from backend.services.order_reservations.rz_document_service import ensure_rz_document_for_order
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.stock_operation_issue_service import append_issue_operation
from backend.services.warehouse_wz.constants import SETTLEMENT_WMS_PICK, SETTLEMENT_WZ_ISSUE
from backend.services.warehouse_wz.documentary_service import (
    count_issue_operations_for_wz,
    create_documentary_wz_for_wms_pick_finalize,
    load_wz_by_idempotency_key,
)
from backend.services.warehouse_wz.guards import WzDocumentaryMovementError, assert_wz_may_issue_inventory


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
        Order,
        DocumentSeries,
        StockDocument,
        StockDocumentItem,
        StockOperation,
        OrderWarehouseReservation,
        Pick,
    ):
        model.__table__.create(engine, checkfirst=True)
    return engine


class WzLifecyclePhase2Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _mk_engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, name="Magazyn główny", tenant_id=1, requires_putaway=True))
        self.db.add(Product(id=10, tenant_id=1, name="Produkt A", sku="SKU-A"))
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
            Inventory(
                id=1,
                tenant_id=1,
                warehouse_id=1,
                product_id=10,
                location_id=100,
                quantity=10,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
        self.db.add(Order(id=100, tenant_id=1, warehouse_id=1, currency="PLN"))
        self.wz_series_id = str(uuid.uuid4())
        self.db.add(
            DocumentSeries(
                id=self.wz_series_id,
                tenant_id=1,
                warehouse_id=1,
                name="WZ — wydania",
                prefix="WZ",
                series_type="WAREHOUSE",
                subtype="WZ",
                numbering_format="{PREFIX}/{NUMBER}",
                numbering_start=1,
                is_default=True,
                is_active=True,
                warehouse_effect=True,
            )
        )
        self.rz_series_id = str(uuid.uuid4())
        self.db.add(
            DocumentSeries(
                id=self.rz_series_id,
                tenant_id=1,
                warehouse_id=1,
                name="RZ — Rezerwacja",
                prefix="RZ",
                series_type="WAREHOUSE",
                subtype="RESERVATION",
                numbering_format="{PREFIX}/{NUMBER}",
                numbering_start=1,
                is_default=True,
                is_active=True,
                warehouse_effect=False,
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def _physical_qty(self) -> float:
        row = self.db.query(Inventory).filter(Inventory.id == 1).first()
        return float(row.quantity or 0)

    def test_a_documentary_wz_does_not_decrement_inventory(self):
        """Pick already decremented → documentary WZ must not touch inventory."""
        self.db.add(
            Pick(
                id=1,
                tenant_id=1,
                warehouse_id=1,
                order_id=100,
                product_id=10,
                location_id=100,
                quantity=3,
                status="done",
            )
        )
        self.db.query(Inventory).filter(Inventory.id == 1).update({Inventory.quantity: 7})
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None

        result = create_documentary_wz_for_wms_pick_finalize(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[1],
            session_key="cart-55",
        )
        self.db.commit()
        assert result is not None
        self.assertTrue(result.created)
        self.assertEqual(self._physical_qty(), 7.0)
        wz = self.db.query(StockDocument).filter(StockDocument.id == result.stock_document_id).first()
        assert wz is not None
        self.assertEqual(str(wz.settlement_mode), SETTLEMENT_WMS_PICK)
        self.assertEqual(count_issue_operations_for_wz(self.db, int(wz.id)), 0)

    def test_b_documentary_wz_idempotent_on_retry(self):
        self.db.add(
            Pick(
                id=2,
                tenant_id=1,
                warehouse_id=1,
                order_id=100,
                product_id=10,
                location_id=100,
                quantity=2,
                status="done",
            )
        )
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        first = create_documentary_wz_for_wms_pick_finalize(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[2],
            session_key="cart-99",
        )
        second = create_documentary_wz_for_wms_pick_finalize(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[2],
            session_key="cart-99",
        )
        self.db.commit()
        assert first is not None and second is not None
        self.assertTrue(first.created)
        self.assertFalse(second.created)
        self.assertEqual(first.stock_document_id, second.stock_document_id)
        count = self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count()
        self.assertEqual(count, 1)

    def test_guard_blocks_issue_on_documentary_wz(self):
        wz = StockDocument(
            tenant_id=1,
            warehouse_id=1,
            document_type="WZ",
            settlement_mode=SETTLEMENT_WMS_PICK,
            status="completed",
        )
        self.db.add(wz)
        self.db.flush()
        line = StockDocumentItem(
            document_id=int(wz.id),
            product_id=10,
            ordered_quantity=1,
            received_quantity=1,
            quantity=1,
        )
        self.db.add(line)
        self.db.flush()
        with self.assertRaises(WzDocumentaryMovementError):
            assert_wz_may_issue_inventory(wz)
        with self.assertRaises(WzDocumentaryMovementError):
            append_issue_operation(self.db, wz, line, 1.0, from_location_id=100)

    def test_d_rz_create_does_not_change_physical(self):
        before = self._physical_qty()
        ensure_order_warehouse_reservation(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            product_id=10,
            quantity=3,
        )
        ensure_rz_document_for_order(self.db, tenant_id=1, warehouse_id=1, order_id=100)
        self.db.commit()
        self.assertEqual(self._physical_qty(), before)
        rz = (
            self.db.query(StockDocument)
            .filter(
                StockDocument.order_id == 100,
                StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION,
            )
            .first()
        )
        self.assertIsNotNone(rz)

    def test_e_partial_pick_wz_qty_and_owr_remaining(self):
        ensure_order_warehouse_reservation(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            product_id=10,
            quantity=3,
        )
        self.db.commit()
        consumed = consume_order_warehouse_reservation(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            product_id=10,
            quantity=2,
        )
        self.assertEqual(consumed, 2.0)
        row = (
            self.db.query(OrderWarehouseReservation)
            .filter(OrderWarehouseReservation.order_id == 100)
            .first()
        )
        assert row is not None
        self.assertEqual(str(row.status), OWR_STATUS_PARTIALLY_CONSUMED)
        self.assertAlmostEqual(float(row.quantity), 1.0)

        self.db.add(
            Pick(
                id=3,
                tenant_id=1,
                warehouse_id=1,
                order_id=100,
                product_id=10,
                location_id=100,
                quantity=2,
                status="done",
            )
        )
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        result = create_documentary_wz_for_wms_pick_finalize(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[3],
            session_key="partial-1",
        )
        self.db.commit()
        assert result is not None
        items = (
            self.db.query(StockDocumentItem)
            .filter(StockDocumentItem.document_id == result.stock_document_id)
            .all()
        )
        self.assertEqual(len(items), 1)
        self.assertAlmostEqual(float(items[0].quantity), 2.0)
        rz = (
            self.db.query(StockDocument)
            .filter(
                StockDocument.order_id == 100,
                StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION,
            )
            .first()
        )
        assert rz is not None
        self.assertEqual(str(rz.status), "partial")

    def test_f_full_consume_closes_rz_after_second_wz_session(self):
        ensure_order_warehouse_reservation(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            product_id=10,
            quantity=3,
        )
        ensure_rz_document_for_order(self.db, tenant_id=1, warehouse_id=1, order_id=100)
        consume_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=2
        )
        self.db.add(
            Pick(
                id=4,
                tenant_id=1,
                warehouse_id=1,
                order_id=100,
                product_id=10,
                location_id=100,
                quantity=2,
                status="done",
            )
        )
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        create_documentary_wz_for_wms_pick_finalize(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[4],
            session_key="sess-1",
        )
        consume_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=1
        )
        self.db.add(
            Pick(
                id=5,
                tenant_id=1,
                warehouse_id=1,
                order_id=100,
                product_id=10,
                location_id=100,
                quantity=1,
                status="done",
            )
        )
        self.db.commit()
        create_documentary_wz_for_wms_pick_finalize(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[5],
            session_key="sess-2",
        )
        self.db.commit()
        wz_count = self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count()
        self.assertEqual(wz_count, 2)
        row = (
            self.db.query(OrderWarehouseReservation)
            .filter(OrderWarehouseReservation.order_id == 100)
            .first()
        )
        assert row is not None
        self.assertEqual(str(row.status), "CONSUMED")
        rz = (
            self.db.query(StockDocument)
            .filter(
                StockDocument.order_id == 100,
                StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION,
            )
            .first()
        )
        assert rz is not None
        self.assertEqual(str(rz.status), "completed")

    def test_wz_issue_mode_allows_inventory_operations(self):
        wz = StockDocument(
            tenant_id=1,
            warehouse_id=1,
            document_type="WZ",
            settlement_mode=SETTLEMENT_WZ_ISSUE,
            status="completed",
        )
        self.db.add(wz)
        self.db.flush()
        assert_wz_may_issue_inventory(wz)  # no raise

    def test_load_wz_by_idempotency_key(self):
        key = "warehouse-wz:wms-pick:1:1:cart-1:100"
        wz = StockDocument(
            tenant_id=1,
            warehouse_id=1,
            document_type="WZ",
            idempotency_key=key,
            settlement_mode=SETTLEMENT_WMS_PICK,
            status="completed",
        )
        self.db.add(wz)
        self.db.commit()
        hit = load_wz_by_idempotency_key(self.db, tenant_id=1, idempotency_key=key)
        self.assertIsNotNone(hit)
