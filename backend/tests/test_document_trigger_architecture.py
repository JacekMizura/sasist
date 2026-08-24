"""Document architecture correction: no auto WZ/RZ; automation generate_document."""

from __future__ import annotations

import inspect
import unittest
import uuid
from datetime import date, datetime

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
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
from backend.models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from backend.services.documents.create_from_series_service import (
    DocumentCreationError,
    DocumentTriggerContext,
    create_document_from_series,
)
from backend.services.order_reservations.constants import STOCK_DOC_TYPE_RESERVATION
from backend.services.order_reservations.reservation_service import ensure_order_warehouse_reservation
from backend.services.sales_order_fg_reservation_service import reserve_sales_order_fg
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.warehouse_wz.constants import (
    FULFILLMENT_KIND_CART,
    SETTLEMENT_WMS_PICK,
    build_fulfillment_key,
)
from backend.services.warehouse_wz.settlement_resolution import stamp_fulfillment_key_on_pick_movements
from backend.services.wms_cartless_picking.finalize_service import finalize_cartless_picking_session
from backend.services.wms_picking_product_list_service import (
    finalize_wms_picking_cart,
    finalize_wms_recovery_picking_cart,
)


def _mk_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1), (2)"))
        conn.execute(text("CREATE TABLE app_users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO app_users VALUES (1)"))
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
        ActivityEvent,
        ActivityEventLink,
        WmsProductWarehouseOperation,
    ):
        model.__table__.create(engine, checkfirst=True)
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_documents_tenant_idempotency_key "
                "ON stock_documents(tenant_id, idempotency_key) "
                "WHERE idempotency_key IS NOT NULL"
            )
        )
    return engine


class DocumentTriggerArchitectureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _mk_engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, name="Magazyn 1", tenant_id=1, requires_putaway=True))
        self.db.add(Warehouse(id=2, name="Magazyn T2", tenant_id=2, requires_putaway=True))
        self.db.add(Product(id=10, tenant_id=1, name="Produkt A", sku="SKU-A"))
        self.db.add(Product(id=20, tenant_id=2, name="Produkt T2", sku="SKU-T2"))
        self.db.add(
            Location(
                id=100,
                warehouse_id=1,
                name="A1",
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
                quantity=100,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
        self.db.add(
            Order(
                id=100,
                tenant_id=1,
                warehouse_id=1,
                number="ORD-100",
                status="picking",
            )
        )
        self.rz_series_id = str(uuid.uuid4())
        self.wz_series_id = str(uuid.uuid4())
        self.db.add(
            DocumentSeries(
                id=self.rz_series_id,
                tenant_id=1,
                warehouse_id=1,
                name="RZ",
                prefix="RZ",
                series_type="WAREHOUSE",
                subtype="RESERVATION",
                numbering_format="{PREFIX}/{NUMBER}",
                monthly_reset=False,
                numbering_start=1,
                is_default=True,
                is_active=True,
                warehouse_effect=False,
            )
        )
        self.db.add(
            DocumentSeries(
                id=self.wz_series_id,
                tenant_id=1,
                warehouse_id=1,
                name="WZ",
                prefix="WZ",
                series_type="WAREHOUSE",
                subtype="WZ",
                numbering_format="{PREFIX}/{NUMBER}",
                monthly_reset=False,
                numbering_start=1,
                is_default=True,
                is_active=True,
                warehouse_effect=True,
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _add_done_pick(self, pick_id: int, qty: float, *, cart_id: int | None = 7) -> Pick:
        p = Pick(
            id=pick_id,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            product_id=10,
            location_id=100,
            cart_id=cart_id,
            quantity=qty,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            status="done",
            picked_at=datetime.utcnow(),
        )
        self.db.add(p)
        self.db.flush()
        self.db.add(
            WmsProductWarehouseOperation(
                tenant_id=1,
                warehouse_id=1,
                product_id=10,
                movement_type="PICKING",
                source_location_id=100,
                quantity=qty,
                packaging_type="UNIT",
                packaging_quantity=qty,
                admin_id=1,
                admin_login="op",
                pick_id=pick_id,
                created_at=datetime.utcnow(),
            )
        )
        self.db.flush()
        return p

    def test_01_owr_without_trigger_no_rz(self):
        reserve_sales_order_fg(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            product_id=10,
            quantity=3,
        )
        self.db.commit()
        owr = (
            self.db.query(OrderWarehouseReservation)
            .filter(OrderWarehouseReservation.order_id == 100)
            .one()
        )
        self.assertAlmostEqual(float(owr.quantity), 3.0)
        self.assertIsNone(owr.stock_document_id)
        self.assertEqual(
            self.db.query(StockDocument)
            .filter(StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION)
            .count(),
            0,
        )

    def test_02_finalize_paths_source_no_auto_wz(self):
        for fn in (
            finalize_wms_picking_cart,
            finalize_cartless_picking_session,
            finalize_wms_recovery_picking_cart,
        ):
            src = inspect.getsource(fn)
            self.assertNotIn("ensure_documentary_wz_for_pick_settlement", src)
            self.assertNotIn("wz_documentary_create_failed", src)
            self.assertIn("stamp_fulfillment_key_on_pick_movements", src)

    def test_03_stamped_settlement_without_wz(self):
        self._add_done_pick(1, 2.0, cart_id=5)
        stamp_fulfillment_key_on_pick_movements(
            self.db,
            tenant_id=1,
            pick_ids=[1],
            fulfillment_key=build_fulfillment_key(kind=FULFILLMENT_KIND_CART, session_id=5),
        )
        self.db.commit()
        self.assertEqual(self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(), 0)
        op = self.db.query(WmsProductWarehouseOperation).filter(WmsProductWarehouseOperation.pick_id == 1).one()
        self.assertTrue(str(op.wms_mode or "").startswith("fulfillment:cart:5"))

    def test_05_automation_rz_over_owr(self):
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=4
        )
        self.db.commit()
        ctx = DocumentTriggerContext(source="AUTOMATION", automation_execution_id=501)
        result = create_document_from_series(
            self.db,
            tenant_id=1,
            series_id=self.rz_series_id,
            order_id=100,
            trigger_context=ctx,
        )
        self.db.commit()
        self.assertTrue(result.created)
        self.assertEqual(result.document_type, STOCK_DOC_TYPE_RESERVATION)
        self.assertEqual(
            self.db.query(StockDocument)
            .filter(StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION)
            .count(),
            1,
        )
        self.assertEqual(self.db.query(StockOperation).count(), 0)

    def test_06_automation_rz_retry_idempotent(self):
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=2
        )
        self.db.commit()
        ctx = DocumentTriggerContext(source="AUTOMATION", automation_execution_id=502)
        first = create_document_from_series(
            self.db, tenant_id=1, series_id=self.rz_series_id, order_id=100, trigger_context=ctx
        )
        self.db.commit()
        second = create_document_from_series(
            self.db, tenant_id=1, series_id=self.rz_series_id, order_id=100, trigger_context=ctx
        )
        self.db.commit()
        self.assertEqual(first.stock_document_id, second.stock_document_id)
        self.assertEqual(
            self.db.query(StockDocument)
            .filter(StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION)
            .count(),
            1,
        )

    def test_07_automation_wz_documentary_after_settlement(self):
        before = float(
            self.db.query(Inventory).filter(Inventory.id == 1).one().quantity
        )
        self._add_done_pick(10, 2.0, cart_id=9)
        stamp_fulfillment_key_on_pick_movements(
            self.db,
            tenant_id=1,
            pick_ids=[10],
            fulfillment_key=build_fulfillment_key(kind=FULFILLMENT_KIND_CART, session_id=9),
        )
        self.db.commit()
        ctx = DocumentTriggerContext(source="AUTOMATION", automation_execution_id=601)
        result = create_document_from_series(
            self.db,
            tenant_id=1,
            series_id=self.wz_series_id,
            order_id=100,
            trigger_context=ctx,
        )
        self.db.commit()
        self.assertTrue(result.created)
        self.assertEqual(result.settlement_mode, SETTLEMENT_WMS_PICK)
        self.assertEqual(self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(), 1)
        after = float(self.db.query(Inventory).filter(Inventory.id == 1).one().quantity)
        self.assertAlmostEqual(before, after)
        op = self.db.query(WmsProductWarehouseOperation).filter(WmsProductWarehouseOperation.pick_id == 10).one()
        self.assertEqual(int(op.stock_document_id), int(result.stock_document_id))

    def test_08_automation_wz_retry_idempotent(self):
        self._add_done_pick(11, 1.0, cart_id=11)
        stamp_fulfillment_key_on_pick_movements(
            self.db,
            tenant_id=1,
            pick_ids=[11],
            fulfillment_key=build_fulfillment_key(kind=FULFILLMENT_KIND_CART, session_id=11),
        )
        self.db.commit()
        ctx = DocumentTriggerContext(source="AUTOMATION", automation_execution_id=602)
        first = create_document_from_series(
            self.db, tenant_id=1, series_id=self.wz_series_id, order_id=100, trigger_context=ctx
        )
        self.db.commit()
        second = create_document_from_series(
            self.db, tenant_id=1, series_id=self.wz_series_id, order_id=100, trigger_context=ctx
        )
        self.db.commit()
        self.assertEqual(first.stock_document_id, second.stock_document_id)
        self.assertFalse(second.created)
        self.assertEqual(self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(), 1)

    def test_09_automation_wz_without_settlement_errors(self):
        ctx = DocumentTriggerContext(source="AUTOMATION", automation_execution_id=603)
        with self.assertRaises(DocumentCreationError) as cm:
            create_document_from_series(
                self.db,
                tenant_id=1,
                series_id=self.wz_series_id,
                order_id=100,
                trigger_context=ctx,
            )
        self.assertEqual(cm.exception.code, "wz_no_settlement_context")
        self.assertEqual(self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(), 0)
        self.assertAlmostEqual(
            float(self.db.query(Inventory).filter(Inventory.id == 1).one().quantity),
            100.0,
        )

    def test_10_tenant_isolation(self):
        other_series = str(uuid.uuid4())
        self.db.add(
            DocumentSeries(
                id=other_series,
                tenant_id=2,
                warehouse_id=2,
                name="WZ T2",
                prefix="WZ",
                series_type="WAREHOUSE",
                subtype="WZ",
                numbering_format="{PREFIX}/{NUMBER}",
                is_default=True,
                is_active=True,
            )
        )
        self.db.commit()
        with self.assertRaises(DocumentCreationError) as cm:
            create_document_from_series(
                self.db,
                tenant_id=1,
                series_id=other_series,
                order_id=100,
                trigger_context=DocumentTriggerContext(),
            )
        self.assertEqual(cm.exception.code, "series_not_found")

    def test_11_rz_without_owr_errors(self):
        with self.assertRaises(DocumentCreationError) as cm:
            create_document_from_series(
                self.db,
                tenant_id=1,
                series_id=self.rz_series_id,
                order_id=100,
                trigger_context=DocumentTriggerContext(source="AUTOMATION"),
            )
        self.assertEqual(cm.exception.code, "owr_missing")

    def test_12_partial_settlements_two_wz(self):
        self._add_done_pick(20, 2.0, cart_id=20)
        stamp_fulfillment_key_on_pick_movements(
            self.db,
            tenant_id=1,
            pick_ids=[20],
            fulfillment_key=build_fulfillment_key(kind=FULFILLMENT_KIND_CART, session_id=20),
        )
        self._add_done_pick(21, 1.0, cart_id=21)
        stamp_fulfillment_key_on_pick_movements(
            self.db,
            tenant_id=1,
            pick_ids=[21],
            fulfillment_key=build_fulfillment_key(kind=FULFILLMENT_KIND_CART, session_id=21),
        )
        self.db.commit()
        r1 = create_document_from_series(
            self.db,
            tenant_id=1,
            series_id=self.wz_series_id,
            order_id=100,
            trigger_context=DocumentTriggerContext(source="AUTOMATION", automation_execution_id=701),
        )
        self.db.commit()
        r2 = create_document_from_series(
            self.db,
            tenant_id=1,
            series_id=self.wz_series_id,
            order_id=100,
            trigger_context=DocumentTriggerContext(source="AUTOMATION", automation_execution_id=702),
        )
        self.db.commit()
        self.assertNotEqual(r1.stock_document_id, r2.stock_document_id)
        self.assertEqual(self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(), 2)


if __name__ == "__main__":
    unittest.main()
