"""
ZGŁOŚ BRAK — first submit persists SHORTAGE; double-submit is idempotent.

ROOT CAUSE regression: SessionLocal(autoflush=False) + sync/recompute SUM(MISSING)
wiped ``wms_picking_line_missing_qty`` before commit while Activity still emitted.

  python -m pytest backend/tests/test_wms_picking_shortage_first_submit.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from backend.models.app_user import AppUser
from backend.models.cart import Cart
from backend.models.enums import CartStatus, CartType
from backend.models.fulfillment_event import FE_MISSING, FulfillmentEvent
from backend.models.order import Order
from backend.models.order_activity_log import OrderActivityLog
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_event import EVT_ORDER_LINE_SHORTAGE_REPORTED, WmsOrderEvent
from backend.services.cart_picking_lifecycle_service import compute_session_stats_from_product_lines
from backend.services.fulfillment_event_service import (
    append_event,
    sum_line_events,
    sync_declared_shortage_column_from_missing_events,
)
from backend.services.order_fulfillment_recompute import recompute_order_fulfillment
from backend.services.wms_picking_product_list_service import (
    _picking_line_resolution_status,
    report_wms_picking_product_shortage,
)


class AutoflushFalseShortageColumnTests(unittest.TestCase):
    """Reproduces production SessionLocal(autoflush=False) wipe without full report stack."""

    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        for model in (Tenant, Warehouse, Order, OrderItem, Product, FulfillmentEvent, Cart):
            model.__table__.create(engine, checkfirst=True)
        Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        self.db = Session()
        self.db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        self.db.add(Product(id=10, tenant_id=1, name="Sznurówki", ean="5905108775698"))
        self.db.flush()
        o = Order(
            id=1214,
            tenant_id=1,
            warehouse_id=1,
            number="1214",
            status="NEW",
            cart_id=3,
        )
        self.db.add(o)
        self.db.flush()
        oi = OrderItem(
            id=9001,
            order_id=1214,
            product_id=10,
            quantity=1.0,
            wms_picking_line_missing_qty=0.0,
            wms_shortage_declared_qty=0.0,
        )
        self.db.add(oi)
        self.db.commit()
        self.oi_id = 9001
        self.order_id = 1214

    def tearDown(self):
        self.db.close()

    def test_apply_missing_then_recompute_keeps_column_with_autoflush_false(self):
        oi = self.db.query(OrderItem).filter(OrderItem.id == self.oi_id).first()
        oi.wms_shortage_declared_qty = 1.0
        oi.wms_picking_line_missing_qty = 1.0
        oi.wms_picking_line_status = "missing"
        append_event(
            self.db,
            order_item_id=self.oi_id,
            event_type=FE_MISSING,
            quantity=1.0,
            metadata={"cart_id": 3, "source": "wms_report_shortage"},
        )
        # Production path: sync + recompute before commit (must not wipe).
        sync_declared_shortage_column_from_missing_events(self.db, self.oi_id)
        recompute_order_fulfillment(self.db, self.order_id, commit=False, session_cart_id=3)
        self.db.commit()

        oi2 = self.db.query(OrderItem).filter(OrderItem.id == self.oi_id).first()
        self.assertAlmostEqual(float(oi2.wms_picking_line_missing_qty or 0), 1.0)
        self.assertAlmostEqual(float(oi2.wms_shortage_declared_qty or 0), 1.0)
        self.assertAlmostEqual(sum_line_events(self.db, self.oi_id, FE_MISSING), 1.0)
        rem = max(0.0, 1.0 - 0.0 - 1.0)
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=rem, picked_quantity=0.0, missing_quantity=1.0),
            "SHORTAGE",
        )


class ReportShortageIdempotencyMockTests(unittest.TestCase):
    def _line(self, *, missing: float = 0.0):
        return SimpleNamespace(
            id=501,
            order_id=1214,
            product_id=77,
            quantity=1.0,
            replaced_from_order_item_id=None,
            oms_line_status=None,
            wms_shortage_declared_qty=missing,
            wms_picking_line_missing_qty=missing,
            wms_picking_line_status="missing" if missing > 0 else None,
            parent_bundle_order_item_id=None,
            product=SimpleNamespace(name="Sznurówki", ean="5905108775698", sku="SKU-1"),
        )

    def _db(self, oi, order, cart):
        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            q.options.return_value = q
            q.order_by.return_value = q
            from backend.models.cart import Cart as CartModel
            from backend.models.order import Order as OrderModel
            from backend.models.order_item import OrderItem as OrderItemModel

            if model is CartModel:
                q.first.return_value = cart
            elif model is OrderItemModel:
                q.first.return_value = oi
            elif model is OrderModel:
                q.all.return_value = [order]
                q.first.return_value = order
            else:
                q.first.return_value = None
                q.all.return_value = []
            return q

        db.query.side_effect = query_side
        db.flush = MagicMock()
        return db

    def test_double_submit_already_resolved_no_second_emit(self):
        oi = self._line(missing=1.0)
        order = SimpleNamespace(id=1214, number="1214", items=[oi], tenant_id=1, cart_id=9, warehouse_id=1)
        cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, code="CART-0001", current_session_id=55)
        db = self._db(oi, order, cart)
        emit = MagicMock()
        with (
            patch(
                "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
                return_value=(None, {"workflow_scoped": True, "workflow_type": "line_scoped", "resolved_source_status_id": 7}),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
                return_value=0.0,
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
                operator_user_id=42,
            )
        self.assertTrue(out["ok"])
        self.assertTrue(out.get("already_resolved"))
        self.assertEqual(out["orders_updated"], 0)
        emit.assert_not_called()
        self.assertAlmostEqual(float(oi.wms_picking_line_missing_qty), 1.0)

    def test_first_submit_emits_once_with_operator(self):
        oi = self._line(missing=0.0)
        order = SimpleNamespace(id=1214, number="1214", items=[oi], tenant_id=1, cart_id=9, warehouse_id=1)
        cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, code="CART-0001", current_session_id=55)
        db = self._db(oi, order, cart)
        emit = MagicMock()
        append_calls: list[dict] = []

        def append_event_side(db, *, order_item_id, event_type, quantity, metadata=None):
            append_calls.append({"order_item_id": order_item_id, "quantity": quantity, "type": event_type})

        with (
            patch(
                "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
                return_value=(None, {"workflow_scoped": True, "workflow_type": "line_scoped", "resolved_source_status_id": 7}),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
                return_value=0.0,
            ),
            patch(
                "backend.services.wms_picking_product_list_service._allowed_pick_location_ids_for_product",
                return_value=set(),
            ),
            patch("backend.services.wms_picking_product_list_service.touch_picking_in_progress"),
            patch(
                "backend.services.wms_picking_product_list_service.append_event",
                side_effect=append_event_side,
            ),
            patch("backend.services.wms_picking_product_list_service.sync_declared_shortage_column_from_missing_events"),
            patch("backend.services.wms_picking_product_list_service.recompute_order_fulfillment"),
            patch("backend.services.wms_audit_service.emit_line_shortage_reported", emit),
            patch(
                "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
                return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.upsert_order_issue_tasks_from_shortage",
                return_value=[1],
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
                operator_user_id=42,
            )
        self.assertTrue(out["ok"])
        self.assertFalse(out.get("already_resolved"))
        self.assertEqual(len(append_calls), 1)
        self.assertAlmostEqual(float(oi.wms_picking_line_missing_qty), 1.0)
        emit.assert_called_once()
        kwargs = emit.call_args.kwargs
        self.assertEqual(kwargs.get("operator_user_id"), 42)
        self.assertEqual(kwargs.get("order_id"), 1214)
        self.assertEqual(kwargs.get("order_item_id"), 501)
        self.assertEqual(kwargs.get("ean"), "5905108775698")


class SessionStatsShortageNotZebraneTests(unittest.TestCase):
    def test_zero_picked_one_shortage(self):
        lines = [
            SimpleNamespace(
                total_quantity=1,
                picked_quantity=0,
                missing_quantity=1,
                remaining_to_pick=0,
                resolution_status="SHORTAGE",
            ),
            SimpleNamespace(
                total_quantity=1,
                picked_quantity=0,
                missing_quantity=0,
                remaining_to_pick=1,
                resolution_status="ACTIVE",
            ),
            SimpleNamespace(
                total_quantity=1,
                picked_quantity=0,
                missing_quantity=0,
                remaining_to_pick=1,
                resolution_status="ACTIVE",
            ),
            SimpleNamespace(
                total_quantity=1,
                picked_quantity=0,
                missing_quantity=0,
                remaining_to_pick=1,
                resolution_status="ACTIVE",
            ),
        ]
        stats = compute_session_stats_from_product_lines(lines)
        self.assertEqual(stats["zebrane"], 0)
        self.assertEqual(stats["braki"], 1)
        self.assertEqual(stats["do_zebrania"], 3)


class EmitShortageOperatorMessageTests(unittest.TestCase):
    def test_emit_passes_operator_and_order_aware_message(self):
        from backend.services.wms_audit_service import emit_line_shortage_reported

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [
            SimpleNamespace(code="CART-0001", name="Wózek"),  # Cart
            SimpleNamespace(number="1214"),  # Order
            SimpleNamespace(first_name="Super", last_name="Admin", login="admin"),  # AppUser via operator_display_name
        ]
        with (
            patch("backend.services.wms_audit_service.insert_wms_order_event") as ins,
            patch("backend.services.wms_audit_service.append_order_activity_for_wms") as app,
            patch("backend.services.wms_audit_service.location_display_label", return_value="A1"),
            patch("backend.services.wms_audit_service.cart_display_name_for_wms", return_value="CART-0001"),
            patch("backend.services.wms_audit_service.operator_display_name", return_value="Super Admin"),
            patch("backend.services.activity_log.record_activity"),
        ):
            emit_line_shortage_reported(
                db,
                tenant_id=1,
                warehouse_id=1,
                order_id=1214,
                order_item_id=9001,
                product_id=10,
                product_name="Sznurówki trekkingowe 120 cm",
                location_id=5,
                cart_id=3,
                shortage_qty=1.0,
                operator_user_id=7,
                order_number="1214",
                ean="5905108775698",
                required_qty=1.0,
                picked_qty=0.0,
                remaining_qty=0.0,
                cart_code="CART-0001",
            )
        app.assert_called_once()
        msg = app.call_args.kwargs["message"]
        self.assertIn("Super Admin", msg)
        self.assertIn("5905108775698", msg)
        self.assertIn("CART-0001", msg)
        self.assertNotIn("na linii", msg.lower())
        self.assertEqual(app.call_args.kwargs.get("operator_user_id"), 7)
        meta = ins.call_args.kwargs["metadata"]
        self.assertEqual(meta["order_id"], 1214)
        self.assertEqual(meta["order_number"], "1214")
        self.assertEqual(meta["order_item_id"], 9001)
        self.assertEqual(meta["ean"], "5905108775698")
        self.assertEqual(meta["operator_name"], "Super Admin")


if __name__ == "__main__":
    unittest.main()
