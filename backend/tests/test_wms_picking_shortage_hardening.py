"""
Hardening SHORTAGE: flush-before-aggregate SSOT, legacy raw vs effective, concurrent PG.

  python -m pytest backend/tests/test_wms_picking_shortage_hardening.py -q
  SHORTAGE_PG_URL=postgresql+psycopg2://postgres@localhost:55432/shortage_conc \\
    python -m pytest backend/tests/test_wms_picking_shortage_hardening.py -k postgres -q
"""

from __future__ import annotations

import os
import threading
import traceback
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.fulfillment_event import FE_MISSING, FulfillmentEvent
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.fulfillment_event_service import append_event, sum_line_events
from backend.services.order_fulfillment_recompute import compute_line_missing_qty, recompute_order_fulfillment
from backend.services.wms_picking_product_list_service import (
    _line_shortage_report_quantities,
    _picking_line_resolution_status,
    report_wms_picking_product_shortage,
)
from backend.scripts.audit_fe_missing_duplicates import audit_fe_missing_overcount

_PG_URL = (os.environ.get("SHORTAGE_PG_URL") or os.environ.get("TEST_DATABASE_URL") or "").strip()


class FlushBeforeAggregateSsotTests(unittest.TestCase):
    """SSOT: sum_line_events flushes — pending FE_MISSING widoczne bez flush w append_event."""

    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        for model in (Tenant, Warehouse, Order, OrderItem, Product, FulfillmentEvent):
            model.__table__.create(engine, checkfirst=True)
        Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        self.db = Session()
        self.db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        self.db.add(Product(id=10, tenant_id=1, name="P", ean="5905108775698"))
        self.db.flush()
        self.db.add(Order(id=1214, tenant_id=1, warehouse_id=1, number="1214", status="NEW", cart_id=3))
        self.db.flush()
        self.db.add(
            OrderItem(
                id=9001,
                order_id=1214,
                product_id=10,
                quantity=1.0,
                wms_picking_line_missing_qty=0.0,
                wms_shortage_declared_qty=0.0,
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_append_without_flush_visible_via_sum(self):
        append_event(
            self.db,
            order_item_id=9001,
            event_type=FE_MISSING,
            quantity=1.0,
            metadata={"cart_id": 3, "source": "test"},
        )
        # Brak db.flush() po append — sum_* jest SSOT widoczności.
        self.assertAlmostEqual(sum_line_events(self.db, 9001, FE_MISSING), 1.0)
        oi = self.db.query(OrderItem).filter(OrderItem.id == 9001).one()
        oi.wms_shortage_declared_qty = 1.0
        oi.wms_picking_line_missing_qty = 1.0
        recompute_order_fulfillment(self.db, 1214, commit=False, session_cart_id=3)
        self.db.commit()
        oi2 = self.db.query(OrderItem).filter(OrderItem.id == 9001).one()
        self.assertAlmostEqual(float(oi2.wms_picking_line_missing_qty or 0), 1.0)
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=0, picked_quantity=0, missing_quantity=1),
            "SHORTAGE",
        )


class LegacyRawVsEffectiveTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        for model in (Tenant, Warehouse, Order, OrderItem, Product, FulfillmentEvent):
            model.__table__.create(engine, checkfirst=True)
        Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        self.db = Session()
        self.db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        self.db.add(Product(id=10, tenant_id=1, name="Sznurówki", ean="5905108775698"))
        self.db.flush()
        self.db.add(Order(id=1214, tenant_id=1, warehouse_id=1, number="1214", status="NEW", cart_id=3))
        self.db.flush()
        self.db.add(
            OrderItem(
                id=9001,
                order_id=1214,
                product_id=10,
                quantity=1.0,
                wms_picking_line_missing_qty=2.0,
                wms_shortage_declared_qty=2.0,
            )
        )
        self.db.commit()
        for _ in range(2):
            append_event(
                self.db,
                order_item_id=9001,
                event_type=FE_MISSING,
                quantity=1.0,
                metadata={"cart_id": 3, "source": "legacy_dup"},
            )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_compute_line_missing_caps_at_gap(self):
        order = self.db.query(Order).filter(Order.id == 1214).one()
        oi = self.db.query(OrderItem).filter(OrderItem.id == 9001).one()
        mq = compute_line_missing_qty(self.db, order, oi, session_cart_id=3)
        self.assertAlmostEqual(mq, 1.0)
        self.assertAlmostEqual(sum_line_events(self.db, 9001, FE_MISSING), 2.0)

    def test_report_quantities_effective_not_raw_2_of_1(self):
        oi = self.db.query(OrderItem).filter(OrderItem.id == 9001).one()
        with patch(
            "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
            return_value=0.0,
        ):
            q = _line_shortage_report_quantities(self.db, oi, 3)
        self.assertAlmostEqual(q["missing_qty_line"], 1.0)
        self.assertAlmostEqual(q["remaining_qty"], 0.0)
        self.assertAlmostEqual(q["declarable_qty"], 0.0)

    def test_audit_preserves_raw_and_marks_corrupted(self):
        report = audit_fe_missing_overcount(self.db, tenant_id=1, warehouse_id=1, order_number="1214")
        self.assertGreaterEqual(report["overcount_lines"], 1)
        row = report["rows"][0]
        self.assertEqual(row["order_number"], "1214")
        self.assertEqual(row["ean"], "5905108775698")
        self.assertAlmostEqual(row["raw_missing"], 2.0)
        self.assertAlmostEqual(row["effective_missing"], 1.0)
        self.assertAlmostEqual(row["allowed_missing"], 1.0)
        self.assertAlmostEqual(row["overcount"], 1.0)
        self.assertTrue(row["corrupted"])
        self.assertFalse(report["mutated"])


class ConcurrentShortageIdempotencySequentialTests(unittest.TestCase):
    """Sekwencyjny NO-OP po pełnym shortage (nie zastępuje testu Postgres)."""

    def test_second_submit_after_first_is_already_resolved(self):
        oi = SimpleNamespace(
            id=501,
            order_id=1214,
            product_id=77,
            quantity=1.0,
            replaced_from_order_item_id=None,
            oms_line_status=None,
            wms_shortage_declared_qty=1.0,
            wms_picking_line_missing_qty=1.0,
            wms_picking_line_status="missing",
            parent_bundle_order_item_id=None,
            product=SimpleNamespace(name="P", ean="5905108775698", sku=None),
        )
        order = SimpleNamespace(id=1214, number="1214", items=[oi], tenant_id=1, cart_id=9, warehouse_id=1)
        cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, code="CART-0001", current_session_id=1)
        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            q.options.return_value = q
            q.order_by.return_value = q
            q.with_for_update.return_value = q
            from backend.models.cart import Cart as CartModel
            from backend.models.order import Order as OrderModel
            from backend.models.order_item import OrderItem as OrderItemModel

            if model is CartModel:
                q.first.return_value = cart
            elif model is OrderItemModel:
                q.first.return_value = oi
                q.all.return_value = [oi]
            elif model is OrderModel:
                q.all.return_value = [order]
                q.first.return_value = order
            else:
                q.first.return_value = None
                q.all.return_value = []
            return q

        db.query.side_effect = query_side
        db.flush = MagicMock()
        emit = MagicMock()
        with (
            patch(
                "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
                return_value=(
                    None,
                    {"workflow_scoped": True, "workflow_type": "line_scoped", "resolved_source_status_id": 7},
                ),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
                return_value=0.0,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sum_line_events",
                return_value=1.0,
            ),
            patch(
                "backend.services.wms_picking_product_list_service._allowed_pick_location_ids_for_product",
                return_value=set(),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
                return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
            ),
            patch("backend.services.wms_audit_service.emit_line_shortage_reported", emit),
            patch(
                "backend.services.wms_picking_product_list_service.upsert_order_issue_tasks_from_shortage",
                return_value=[],
            ),
        ):
            out = report_wms_picking_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=77,
                location_id=None,
                missing_qty=1.0,
                cart_id=9,
                order_item_id=501,
                operator_user_id=1,
            )
        self.assertTrue(out.get("already_resolved"))
        emit.assert_not_called()
        self.assertAlmostEqual(float(oi.wms_picking_line_missing_qty), 1.0)


def _pg_type_for(col) -> str:
    from sqlalchemy import Boolean, DateTime, Float, Integer, Numeric, String, Text
    from sqlalchemy import Enum as SAEnum

    t = col.type
    if isinstance(t, Integer):
        return "INTEGER"
    if isinstance(t, (Float, Numeric)):
        return "DOUBLE PRECISION"
    if isinstance(t, Boolean):
        return "BOOLEAN"
    if isinstance(t, DateTime):
        return "TIMESTAMP"
    if isinstance(t, (String, Text, SAEnum)):
        return "TEXT"
    return "TEXT"


def _create_table_no_fk(conn, table) -> None:
    from sqlalchemy import Integer

    serial_tables = {"fulfillment_events", "wms_picking_shortage_reports"}
    parts: list[str] = []
    for col in table.columns:
        if col.primary_key and isinstance(col.type, Integer) and col.name == "id":
            if table.name in serial_tables:
                parts.append("id SERIAL PRIMARY KEY")
            else:
                parts.append("id INTEGER PRIMARY KEY")
            continue
        parts.append(f"{col.name} {_pg_type_for(col)}")
    conn.execute(text(f"CREATE TABLE {table.name} ({', '.join(parts)})"))


@unittest.skipUnless(_PG_URL.startswith("postgresql"), "SHORTAGE_PG_URL / TEST_DATABASE_URL PostgreSQL required")
class ConcurrentShortagePostgresTests(unittest.TestCase):
    """
    Prawdziwa współbieżność na PostgreSQL: dwa sesje, ten sam OrderItem, FOR UPDATE.

    EXPECTED: logical missing=1, remaining=0, dokładnie 1 FE_MISSING + 1 emit Activity.
    """

    @classmethod
    def setUpClass(cls):
        from backend.models.cart import Cart
        from backend.models.wms_picking_shortage_report import WmsPickingShortageReport

        cls.engine = create_engine(_PG_URL, isolation_level="READ COMMITTED", pool_size=4, max_overflow=0)
        tables = (
            Tenant.__table__,
            Warehouse.__table__,
            Product.__table__,
            Cart.__table__,
            Order.__table__,
            OrderItem.__table__,
            FulfillmentEvent.__table__,
            WmsPickingShortageReport.__table__,
        )
        with cls.engine.begin() as conn:
            conn.execute(text("SELECT 1"))
            for t in reversed(tables):
                conn.execute(text(f"DROP TABLE IF EXISTS {t.name} CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS tenant_warehouses CASCADE"))
            for t in tables:
                _create_table_no_fk(conn, t)
            conn.execute(
                text(
                    "CREATE TABLE tenant_warehouses ("
                    "tenant_id INTEGER NOT NULL, warehouse_id INTEGER NOT NULL, "
                    "PRIMARY KEY (tenant_id, warehouse_id))"
                )
            )
            conn.execute(text("INSERT INTO tenant_warehouses (tenant_id, warehouse_id) VALUES (1, 1)"))
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def setUp(self):
        from backend.models.cart import Cart
        from backend.models.enums import CartType

        db = self.Session()
        try:
            db.execute(
                text(
                    "TRUNCATE fulfillment_events, wms_picking_shortage_reports, order_items, orders, "
                    "carts, products, warehouses, tenants RESTART IDENTITY CASCADE"
                )
            )
            db.add(Tenant(id=1, name="T", default_warehouse_id=1))
            db.add(Warehouse(id=1, tenant_id=1, name="WH"))
            db.add(Product(id=10, tenant_id=1, name="Sznurówki", ean="5905108775698"))
            db.flush()
            db.add(
                Cart(
                    id=9,
                    tenant_id=1,
                    warehouse_id=1,
                    name="Cart",
                    code="CART-0001",
                    type=CartType.MULTI,
                    status="AVAILABLE",
                    capacity_strategy="LIMIT_VOLUME",
                )
            )
            db.flush()
            db.add(Order(id=1214, tenant_id=1, warehouse_id=1, number="1214", status="NEW", cart_id=9))
            db.flush()
            db.add(
                OrderItem(
                    id=9001,
                    order_id=1214,
                    product_id=10,
                    quantity=1,
                    wms_picking_line_missing_qty=0.0,
                    wms_shortage_declared_qty=0.0,
                )
            )
            db.commit()
        finally:
            db.close()

    def test_two_parallel_shortage_1_of_1(self):
        barrier = threading.Barrier(2)
        results: list[dict] = []
        errors: list[BaseException] = []
        lock = threading.Lock()
        emit = MagicMock()

        def worker():
            db = self.Session()
            try:
                barrier.wait(timeout=10)
                out = report_wms_picking_product_shortage(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    source_status_id=1,
                    order_type="all",
                    product_id=10,
                    location_id=None,
                    missing_qty=1.0,
                    cart_id=9,
                    order_item_id=9001,
                    operator_user_id=42,
                )
                db.commit()
                with lock:
                    results.append({"out": out, "emit_calls": emit.call_count})
            except BaseException as exc:
                db.rollback()
                with lock:
                    errors.append((type(exc).__name__, str(exc), traceback.format_exc()))
            finally:
                db.close()

        with (
            patch(
                "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
                return_value=(
                    None,
                    {
                        "workflow_scoped": True,
                        "workflow_type": "line_scoped",
                        "resolved_source_status_id": 7,
                        "order_id": 1214,
                    },
                ),
            ),
            patch(
                "backend.services.wms_picking_product_list_service._allowed_pick_location_ids_for_product",
                return_value=set(),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
                return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.upsert_order_issue_tasks_from_shortage",
                return_value=[],
            ),
            patch("backend.services.wms_audit_service.emit_line_shortage_reported", emit),
            patch("backend.services.wms_picking_product_list_service.touch_picking_in_progress"),
            patch("backend.services.wms_picking_product_list_service.recompute_order_fulfillment"),
        ):
            t1 = threading.Thread(target=worker)
            t2 = threading.Thread(target=worker)
            t1.start()
            t2.start()
            t1.join(timeout=30)
            t2.join(timeout=30)

        self.assertEqual(errors, [], msg=f"worker errors: {errors!r}")
        self.assertEqual(len(results), 2)

        wrote = [r for r in results if not r["out"].get("already_resolved")]
        noop = [r for r in results if r["out"].get("already_resolved")]
        self.assertEqual(len(wrote), 1, msg=f"results={results!r}")
        self.assertEqual(len(noop), 1)
        self.assertEqual(emit.call_count, 1)

        db = self.Session()
        try:
            fe_count = (
                db.query(FulfillmentEvent)
                .filter(FulfillmentEvent.order_item_id == 9001, FulfillmentEvent.type == FE_MISSING)
                .count()
            )
            fe_sum = sum_line_events(db, 9001, FE_MISSING)
            oi = db.query(OrderItem).filter(OrderItem.id == 9001).one()
            q = _line_shortage_report_quantities(db, oi, 9)
            self.assertEqual(fe_count, 1)
            self.assertAlmostEqual(fe_sum, 1.0)
            self.assertAlmostEqual(q["missing_qty_line"], 1.0)
            self.assertAlmostEqual(q["remaining_qty"], 0.0)
            self.assertAlmostEqual(float(oi.wms_picking_line_missing_qty or 0), 1.0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
