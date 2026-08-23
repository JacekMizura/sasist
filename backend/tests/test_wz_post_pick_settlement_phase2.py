"""Phase 2 closure — canonical post-pick settlement across finalize paths."""

from __future__ import annotations

import inspect
import unittest
import uuid
from datetime import date
from unittest.mock import patch

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
from backend.services.activity_log.domain_event_codes import ORDER_WZ_DOCUMENTARY_CREATED
from backend.services.document_number_service import DocumentSeriesOperationalError
from backend.services.order_reservations.constants import STOCK_DOC_TYPE_RESERVATION
from backend.services.order_reservations.reservation_service import (
    consume_order_warehouse_reservation,
    ensure_order_warehouse_reservation,
)
from backend.services.order_reservations.rz_document_service import ensure_rz_document_for_order
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.warehouse_wz.constants import (
    FULFILLMENT_KIND_CART,
    FULFILLMENT_KIND_CARTLESS,
    FULFILLMENT_KIND_RECOVERY,
    SETTLEMENT_WMS_PICK,
    SETTLEMENT_WZ_ISSUE,
    build_fulfillment_key,
    wms_pick_idempotency_key,
)
from backend.services.warehouse_wz.post_pick_settlement import (
    ensure_documentary_wz_for_pick_settlement,
    ensure_documentary_wz_for_pick_settlement_batch,
)
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
        ActivityEvent,
        ActivityEventLink,
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


class WzPostPickSettlementPhase2Tests(unittest.TestCase):
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

    def _add_done_pick(self, pick_id: int, qty: float, *, cart_id: int | None = None) -> None:
        self.db.add(
            Pick(
                id=pick_id,
                tenant_id=1,
                warehouse_id=1,
                order_id=100,
                product_id=10,
                location_id=100,
                quantity=qty,
                status="done",
                cart_id=cart_id,
            )
        )

    def test_fulfillment_key_unified_across_modes(self):
        self.assertEqual(build_fulfillment_key(kind=FULFILLMENT_KIND_CART, session_id=55), "cart:55")
        self.assertEqual(
            build_fulfillment_key(kind=FULFILLMENT_KIND_CARTLESS, session_id=123), "cartless:123"
        )
        self.assertEqual(build_fulfillment_key(kind=FULFILLMENT_KIND_RECOVERY, session_id=7), "recovery:7")
        key_cart = wms_pick_idempotency_key(
            tenant_id=1, warehouse_id=1, fulfillment_key="cart:55", order_id=100
        )
        key_cartless = wms_pick_idempotency_key(
            tenant_id=1, warehouse_id=1, fulfillment_key="cartless:123", order_id=100
        )
        self.assertNotEqual(key_cart, key_cartless)

    def test_b_cartless_kind_creates_documentary_wz(self):
        self._add_done_pick(20, 3.0, cart_id=None)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        result = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[20],
            fulfillment_kind=FULFILLMENT_KIND_CARTLESS,
            fulfillment_session_id=501,
        )
        self.db.commit()
        assert result is not None
        self.assertTrue(result.created)
        wz = self.db.query(StockDocument).filter(StockDocument.id == result.stock_document_id).first()
        assert wz is not None
        self.assertEqual(str(wz.settlement_mode), SETTLEMENT_WMS_PICK)
        self.assertIn("cartless:501", str(wz.idempotency_key))

    def test_c_partial_cartless_wz_qty_and_rz_partial(self):
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=3
        )
        ensure_rz_document_for_order(self.db, tenant_id=1, warehouse_id=1, order_id=100)
        consume_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=2
        )
        self._add_done_pick(21, 2.0, cart_id=None)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        result = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[21],
            fulfillment_kind=FULFILLMENT_KIND_CARTLESS,
            fulfillment_session_id=777,
        )
        self.db.commit()
        assert result is not None
        line = (
            self.db.query(StockDocumentItem)
            .filter(StockDocumentItem.document_id == result.stock_document_id)
            .one()
        )
        self.assertAlmostEqual(float(line.quantity), 2.0)
        rz = (
            self.db.query(StockDocument)
            .filter(
                StockDocument.order_id == 100,
                StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION,
            )
            .one()
        )
        self.assertEqual(str(rz.status), "partial")

    def test_d_second_cartless_session_closes_rz(self):
        ensure_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=3
        )
        ensure_rz_document_for_order(self.db, tenant_id=1, warehouse_id=1, order_id=100)
        consume_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=2
        )
        self._add_done_pick(22, 2.0, cart_id=None)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[22],
            fulfillment_kind=FULFILLMENT_KIND_CARTLESS,
            fulfillment_session_id=1,
        )
        consume_order_warehouse_reservation(
            self.db, tenant_id=1, warehouse_id=1, order_id=100, product_id=10, quantity=1
        )
        self._add_done_pick(23, 1.0, cart_id=None)
        self.db.commit()
        ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[23],
            fulfillment_kind=FULFILLMENT_KIND_CARTLESS,
            fulfillment_session_id=2,
        )
        self.db.commit()
        wz_count = self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count()
        self.assertEqual(wz_count, 2)
        row = (
            self.db.query(OrderWarehouseReservation)
            .filter(OrderWarehouseReservation.order_id == 100)
            .one()
        )
        self.assertEqual(str(row.status), "CONSUMED")
        rz = (
            self.db.query(StockDocument)
            .filter(
                StockDocument.order_id == 100,
                StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION,
            )
            .one()
        )
        self.assertEqual(str(rz.status), "completed")

    def test_e_retry_still_one_wz(self):
        self._add_done_pick(30, 2.0, cart_id=9)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        first = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[30],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=9,
        )
        second = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[30],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=9,
        )
        self.db.commit()
        assert first is not None and second is not None
        self.assertTrue(first.created)
        self.assertFalse(second.created)
        self.assertEqual(first.stock_document_id, second.stock_document_id)
        self.assertEqual(
            self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(),
            1,
        )

    def test_f_integrity_error_duplicate_key_is_idempotent(self):
        """Simulates parallel retry: both pass pre-check, second hits DB unique constraint."""
        from backend.services.warehouse_wz.post_pick_settlement import load_wz_by_idempotency_key

        self._add_done_pick(31, 1.0, cart_id=11)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        first = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[31],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=11,
        )
        self.db.commit()
        assert first is not None

        real_load = load_wz_by_idempotency_key
        calls = 0

        def fake_load(db, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                return None
            return real_load(db, **kwargs)

        with patch(
            "backend.services.warehouse_wz.post_pick_settlement.load_wz_by_idempotency_key",
            side_effect=fake_load,
        ):
            second = ensure_documentary_wz_for_pick_settlement(
                self.db,
                tenant_id=1,
                warehouse_id=1,
                order=order,
                pick_ids=[31],
                fulfillment_kind=FULFILLMENT_KIND_CART,
                fulfillment_session_id=11,
            )
        self.db.commit()
        assert second is not None
        self.assertTrue(first.created)
        self.assertFalse(second.created)
        self.assertEqual(first.stock_document_id, second.stock_document_id)
        self.assertEqual(
            self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(),
            1,
        )
        self.assertEqual(
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == ORDER_WZ_DOCUMENTARY_CREATED)
            .count(),
            1,
        )

    def test_h_wz_failure_rolls_back_physical_decrement(self):
        before = self._physical_qty()
        self.db.query(Inventory).filter(Inventory.id == 1).update({Inventory.quantity: before - 2})
        self._add_done_pick(40, 2.0, cart_id=99)
        self.db.flush()
        order = self.db.query(Order).filter(Order.id == 100).one()
        try:
            with patch(
                "backend.services.warehouse_wz.post_pick_settlement.require_warehouse_series",
                side_effect=DocumentSeriesOperationalError(document_type="WZ", message="brak serii"),
            ):
                ensure_documentary_wz_for_pick_settlement(
                    self.db,
                    tenant_id=1,
                    warehouse_id=1,
                    order=order,
                    pick_ids=[40],
                    fulfillment_kind=FULFILLMENT_KIND_CART,
                    fulfillment_session_id=99,
                )
            self.db.commit()
        except DocumentSeriesOperationalError:
            self.db.rollback()
        self.assertAlmostEqual(self._physical_qty(), before)

    def test_j_classic_finalize_paths_use_post_pick_settlement_not_issue(self):
        cart_src = inspect.getsource(finalize_wms_picking_cart)
        cartless_src = inspect.getsource(finalize_cartless_picking_session)
        recovery_src = inspect.getsource(finalize_wms_recovery_picking_cart)
        for label, src in (
            ("cart", cart_src),
            ("cartless", cartless_src),
            ("recovery", recovery_src),
        ):
            with self.subTest(path=label):
                self.assertIn("ensure_documentary_wz_for_pick_settlement", src)
                self.assertNotIn("SETTLEMENT_WZ_ISSUE", src)
                self.assertNotIn("append_issue_operation", src)

    def test_recovery_kind_separate_fulfillment_key(self):
        self._add_done_pick(50, 1.0, cart_id=3)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).first()
        assert order is not None
        cart_result = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[50],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=3,
        )
        recovery_result = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[50],
            fulfillment_kind=FULFILLMENT_KIND_RECOVERY,
            fulfillment_session_id=9001,
        )
        self.db.commit()
        assert cart_result is not None and recovery_result is not None
        self.assertNotEqual(cart_result.stock_document_id, recovery_result.stock_document_id)
        self.assertEqual(
            self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(),
            2,
        )

    def test_batch_cart_uses_same_hook(self):
        self._add_done_pick(60, 1.0, cart_id=7)
        self._add_done_pick(61, 2.0, cart_id=7)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).one()
        out = ensure_documentary_wz_for_pick_settlement_batch(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            orders_by_id={100: order},
            finalized_by_order={100: [60, 61]},
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=7,
        )
        self.db.commit()
        self.assertIn(100, out)
        items = (
            self.db.query(StockDocumentItem)
            .filter(StockDocumentItem.document_id == out[100].stock_document_id)
            .all()
        )
        self.assertEqual(len(items), 1)
        self.assertAlmostEqual(float(items[0].quantity), 3.0)

    def test_direct_sale_issue_mode_distinct_from_documentary(self):
        issue = StockDocument(
            tenant_id=1,
            warehouse_id=1,
            document_type="WZ",
            settlement_mode=SETTLEMENT_WZ_ISSUE,
            status="completed",
        )
        doc = StockDocument(
            tenant_id=1,
            warehouse_id=1,
            document_type="WZ",
            settlement_mode=SETTLEMENT_WMS_PICK,
            status="completed",
        )
        self.assertEqual(str(issue.settlement_mode), SETTLEMENT_WZ_ISSUE)
        self.assertEqual(str(doc.settlement_mode), SETTLEMENT_WMS_PICK)


if __name__ == "__main__":
    unittest.main()
