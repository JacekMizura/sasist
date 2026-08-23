"""Documentary WZ ↔ product warehouse history link (no duplicate movements)."""

from __future__ import annotations

import unittest
import uuid
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.api.product import list_product_inventory_movements
from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AppUser
from backend.models.document_series import DocumentSeries
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_movement import StockMovement
from backend.models.stock_operation import StockOperation
from backend.models.inventory_movement import InventoryMovement
from backend.models.warehouse import Warehouse
from backend.models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.warehouse_wz.constants import FULFILLMENT_KIND_CART, FULFILLMENT_KIND_RECOVERY
from backend.services.warehouse_wz.pick_movement_link import link_documentary_wz_to_pick_movements
from backend.services.warehouse_wz.post_pick_settlement import ensure_documentary_wz_for_pick_settlement


def _mk_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))
        conn.execute(text("INSERT INTO tenants VALUES (2)"))
    for model in (
        Warehouse,
        Location,
        Product,
        Inventory,
        Order,
        AppUser,
        DocumentSeries,
        StockDocument,
        StockDocumentItem,
        StockOperation,
        StockMovement,
        InventoryMovement,
        Pick,
        WmsProductWarehouseOperation,
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


class WzProductHistoryLinkTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _mk_engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, name="WH", tenant_id=1, requires_putaway=True))
        self.db.add(Product(id=10, tenant_id=1, name="Produkt A", sku="SKU-A"))
        self.db.add(
            Location(
                id=100,
                warehouse_id=1,
                name="B1-A-1",
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
        self.db.add(Order(id=100, tenant_id=1, warehouse_id=1, number="1276", currency="PLN"))
        self.db.add(AppUser(id=1, login="op", password_hash="hash", first_name="Jan", last_name="Kowalski"))
        self.wz_series_id = str(uuid.uuid4())
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
                numbering_start=1,
                is_default=True,
                is_active=True,
                warehouse_effect=True,
            )
        )
        self.db.commit()
        self.user = self.db.query(AppUser).filter(AppUser.id == 1).one()

    def tearDown(self) -> None:
        self.db.close()

    def _record_picking_op(self, pick_id: int, qty: float, *, tenant_id: int = 1) -> WmsProductWarehouseOperation:
        self.db.add(
            Pick(
                id=pick_id,
                tenant_id=tenant_id,
                warehouse_id=1,
                order_id=100,
                product_id=10,
                location_id=100,
                quantity=qty,
                status="done",
                cart_id=5,
            )
        )
        self.db.flush()
        op = WmsProductWarehouseOperation(
            tenant_id=tenant_id,
            warehouse_id=1,
            product_id=10,
            movement_type="PICKING",
            source_location_id=100,
            target_location_id=None,
            quantity=qty,
            admin_id=1,
            admin_login="op",
            admin_first_name="Jan",
            admin_last_name="Kowalski",
            reference_document="ORDER-100",
            stock_document_id=None,
            pick_id=pick_id,
        )
        self.db.add(op)
        self.db.flush()
        return op

    def test_link_sets_stock_document_id_on_pick_movement(self):
        self._record_picking_op(1, 2.0)
        wz = StockDocument(
            tenant_id=1,
            warehouse_id=1,
            document_type="WZ",
            document_number="WZ/31/08/2026",
            status="completed",
        )
        self.db.add(wz)
        self.db.flush()
        linked = link_documentary_wz_to_pick_movements(
            self.db,
            tenant_id=1,
            pick_ids=[1],
            stock_document_id=int(wz.id),
        )
        self.db.commit()
        self.assertEqual(linked, 1)
        op = self.db.query(WmsProductWarehouseOperation).filter(WmsProductWarehouseOperation.pick_id == 1).one()
        self.assertEqual(int(op.stock_document_id), int(wz.id))
        self.assertEqual(self.db.query(WmsProductWarehouseOperation).count(), 1)

    def test_ensure_documentary_wz_links_cart_movement(self):
        self._record_picking_op(2, 3.0)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).one()
        result = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[2],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=9,
        )
        self.db.commit()
        assert result is not None
        op = self.db.query(WmsProductWarehouseOperation).filter(WmsProductWarehouseOperation.pick_id == 2).one()
        self.assertEqual(int(op.stock_document_id), int(result.stock_document_id))

    def test_partial_fulfillment_links_different_wz_per_settlement(self):
        self._record_picking_op(3, 2.0)
        self._record_picking_op(4, 1.0)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).one()
        first = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[3],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=1,
        )
        second = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[4],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=2,
        )
        self.db.commit()
        assert first is not None and second is not None
        self.assertNotEqual(first.stock_document_id, second.stock_document_id)
        op3 = self.db.query(WmsProductWarehouseOperation).filter(WmsProductWarehouseOperation.pick_id == 3).one()
        op4 = self.db.query(WmsProductWarehouseOperation).filter(WmsProductWarehouseOperation.pick_id == 4).one()
        self.assertEqual(int(op3.stock_document_id), int(first.stock_document_id))
        self.assertEqual(int(op4.stock_document_id), int(second.stock_document_id))

    def test_recovery_fulfillment_links_recovery_wz(self):
        self._record_picking_op(5, 1.0)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).one()
        result = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[5],
            fulfillment_kind=FULFILLMENT_KIND_RECOVERY,
            fulfillment_session_id=9001,
        )
        self.db.commit()
        assert result is not None
        op = self.db.query(WmsProductWarehouseOperation).filter(WmsProductWarehouseOperation.pick_id == 5).one()
        self.assertEqual(int(op.stock_document_id), int(result.stock_document_id))

    def test_retry_wz_does_not_duplicate_movements(self):
        self._record_picking_op(6, 1.0)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).one()
        first = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[6],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=11,
        )
        second = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[6],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=11,
        )
        self.db.commit()
        assert first is not None and second is not None
        self.assertEqual(self.db.query(WmsProductWarehouseOperation).count(), 1)
        self.assertEqual(self.db.query(StockDocument).filter(StockDocument.document_type == "WZ").count(), 1)

    def test_tenant_isolation_on_link(self):
        self.db.add(Warehouse(id=2, name="WH2", tenant_id=2, requires_putaway=True))
        self.db.add(Product(id=20, tenant_id=2, name="B", sku="B"))
        self.db.commit()
        self._record_picking_op(7, 1.0, tenant_id=2)
        wz = StockDocument(tenant_id=1, warehouse_id=1, document_type="WZ", document_number="WZ/1", status="completed")
        self.db.add(wz)
        self.db.flush()
        linked = link_documentary_wz_to_pick_movements(
            self.db,
            tenant_id=1,
            pick_ids=[7],
            stock_document_id=int(wz.id),
        )
        self.db.commit()
        self.assertEqual(linked, 0)
        op = self.db.query(WmsProductWarehouseOperation).filter(WmsProductWarehouseOperation.pick_id == 7).one()
        self.assertIsNone(op.stock_document_id)

    def test_api_shows_wz_and_order_after_link(self):
        self._record_picking_op(8, 1.0)
        self.db.commit()
        order = self.db.query(Order).filter(Order.id == 100).one()
        result = ensure_documentary_wz_for_pick_settlement(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            pick_ids=[8],
            fulfillment_kind=FULFILLMENT_KIND_CART,
            fulfillment_session_id=20,
        )
        self.db.commit()
        assert result is not None
        out = list_product_inventory_movements(
            product_id=10,
            db=self.db,
            tenant_id=1,
            limit=25,
            offset=0,
        )
        items = out.get("items") or []
        pick_events = [i for i in items if i.get("pick_id") == 8]
        self.assertEqual(len(pick_events), 1)
        evt = pick_events[0]
        self.assertEqual(evt.get("document_id"), int(result.stock_document_id))
        self.assertEqual(evt.get("document_number"), result.document_number)
        self.assertEqual(evt.get("order_id"), 100)
        self.assertEqual(evt.get("order_number"), "1276")

    def test_api_without_wz_hides_fake_document_number(self):
        self._record_picking_op(9, 1.0)
        self.db.commit()
        out = list_product_inventory_movements(
            product_id=10,
            db=self.db,
            tenant_id=1,
            limit=25,
            offset=0,
        )
        evt = next(i for i in out.get("items") or [] if i.get("pick_id") == 9)
        self.assertIsNone(evt.get("document_id"))
        self.assertIsNone(evt.get("document_number"))
        self.assertEqual(evt.get("order_id"), 100)


if __name__ == "__main__":
    unittest.main()
