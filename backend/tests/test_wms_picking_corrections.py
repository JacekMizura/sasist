"""
Korekty zbierania: undo draft Pick + empty location (bez zmiany stocku przy undo).

  python -m pytest backend/tests/test_wms_picking_corrections.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_picking_corrections.undo_pick_service import (
    UndoPickError,
    undo_wms_session_picks,
)
from backend.services.wms_picking_corrections.empty_location_service import (
    EmptyLocationError,
    confirm_empty_pick_location,
    _alternate_locations,
)
from backend.services.wms_picking_product_list_service import _line_shortage_report_quantities


class TestUndoDraftPicks(unittest.TestCase):
    def test_undo_one_of_one(self):
        pick = SimpleNamespace(
            id=10,
            order_id=100,
            order_item_id=50,
            product_id=7,
            location_id=3,
            quantity=1.0,
            cart_id=9,
            picked_at=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id=9)
        # draft picks query chain: query(Pick).filter(...).order_by(...).all()
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.all.return_value = [pick]
        db.query.side_effect = lambda *a, **k: (
            SimpleNamespace(filter=MagicMock(return_value=SimpleNamespace(first=MagicMock(return_value=SimpleNamespace(id=9)))))
            if a and getattr(a[0], "__name__", "") == "Cart"
            else q
        )

        with patch(
            "backend.services.wms_picking_corrections.undo_pick_service._draft_picks_q",
            return_value=SimpleNamespace(all=lambda: [pick]),
        ), patch(
            "backend.services.wms_picking_corrections.undo_pick_service.delete_pick_events_for_pick_ids"
        ) as del_ev, patch(
            "backend.services.wms_picking_corrections.undo_pick_service.recompute_order_fulfillment"
        ), patch(
            "backend.services.wms_audit_service.emit_wms_pick_undone"
        ):
            db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id=9)
            out = undo_wms_session_picks(
                db,
                tenant_id=1,
                warehouse_id=1,
                cart_id=9,
                product_id=7,
                quantity=1,
                operator_user_id=1,
            )
        self.assertEqual(out["undone_qty"], 1.0)
        self.assertTrue(out["inventory_unchanged"])
        self.assertEqual(out["deleted_pick_ids"], [10])
        db.delete.assert_called_once_with(pick)
        del_ev.assert_called_once()

    def test_undo_one_of_five_partial_row(self):
        pick = SimpleNamespace(
            id=11,
            order_id=100,
            order_item_id=50,
            product_id=7,
            location_id=3,
            quantity=5.0,
            cart_id=9,
            picked_at=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id=9)
        with patch(
            "backend.services.wms_picking_corrections.undo_pick_service._draft_picks_q",
            return_value=SimpleNamespace(all=lambda: [pick]),
        ), patch(
            "backend.services.wms_picking_corrections.undo_pick_service._sync_pick_event_qty"
        ) as sync, patch(
            "backend.services.wms_picking_corrections.undo_pick_service.recompute_order_fulfillment"
        ), patch(
            "backend.services.wms_audit_service.emit_wms_pick_undone"
        ):
            out = undo_wms_session_picks(
                db,
                tenant_id=1,
                warehouse_id=1,
                cart_id=9,
                product_id=7,
                quantity=1,
            )
        self.assertEqual(out["undone_qty"], 1.0)
        self.assertEqual(pick.quantity, 4.0)
        self.assertEqual(out["deleted_pick_ids"], [])
        sync.assert_called_once()
        db.delete.assert_not_called()

    def test_undo_does_not_call_inventory(self):
        """C: undo nie zmienia inventory — brak wywołań Inventory."""
        pick = SimpleNamespace(
            id=12,
            order_id=1,
            order_item_id=2,
            product_id=3,
            location_id=4,
            quantity=1.0,
            cart_id=9,
            picked_at=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id=9)
        with patch(
            "backend.services.wms_picking_corrections.undo_pick_service._draft_picks_q",
            return_value=SimpleNamespace(all=lambda: [pick]),
        ), patch(
            "backend.services.wms_picking_corrections.undo_pick_service.delete_pick_events_for_pick_ids"
        ), patch(
            "backend.services.wms_picking_corrections.undo_pick_service.recompute_order_fulfillment"
        ), patch(
            "backend.services.wms_audit_service.emit_wms_pick_undone"
        ), patch(
            "backend.services.inventory_manual_adjustment_service.apply_manual_stock_correction"
        ) as adj:
            undo_wms_session_picks(
                db, tenant_id=1, warehouse_id=1, cart_id=9, product_id=3, quantity=1
            )
        adj.assert_not_called()


class TestShortageDeclarableAfterPick(unittest.TestCase):
    def test_fully_picked_still_declarable(self):
        oi = SimpleNamespace(
            id=50,
            quantity=1.0,
            wms_picking_line_missing_qty=0.0,
            wms_shortage_declared_qty=0.0,
        )
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
            return_value=1.0,
        ):
            q = _line_shortage_report_quantities(db, oi, cart_id=9)
        self.assertEqual(q["remaining_qty"], 0.0)
        self.assertEqual(q["picked_qty"], 1.0)
        self.assertEqual(q["declarable_qty"], 1.0)


class TestEmptyLocation(unittest.TestCase):
    def test_concurrent_stock_change_rejected(self):
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_corrections.empty_location_service.can_manual_adjust_stock",
            return_value=True,
        ), patch(
            "backend.services.wms_picking_corrections.empty_location_service._product_qty_at_location",
            return_value=50.0,
        ):
            db.query.return_value.filter.return_value.first.side_effect = [
                SimpleNamespace(id=1, name="A13-B-1", warehouse_id=1),
                SimpleNamespace(id=7, ean="590", name="SKU", tenant_id=1),
            ]
            with self.assertRaises(EmptyLocationError) as ctx:
                confirm_empty_pick_location(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    cart_id=9,
                    product_id=7,
                    location_id=1,
                    observed_stock_qty=99.0,
                )
            self.assertEqual(ctx.exception.code, "STOCK_CHANGED")

    def test_zero_location_keeps_other_stock(self):
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_corrections.empty_location_service.can_manual_adjust_stock",
            return_value=True,
        ), patch(
            "backend.services.wms_picking_corrections.empty_location_service._product_qty_at_location",
            side_effect=[99.0, 0.0],
        ), patch(
            "backend.services.wms_picking_corrections.empty_location_service.apply_manual_stock_correction",
            return_value={"stock_document_id": 55},
        ) as adj, patch(
            "backend.services.wms_picking_corrections.empty_location_service.undo_wms_session_picks",
            return_value={"undone_qty": 1.0},
        ), patch(
            "backend.services.wms_picking_corrections.empty_location_service._alternate_locations",
            return_value=[{"location_id": 2, "location_code": "A14-C-2", "stock_quantity": 12.0}],
        ), patch(
            "backend.services.wms_audit_service.emit_wms_location_emptied"
        ):
            db.query.return_value.filter.return_value.first.side_effect = [
                SimpleNamespace(id=1, name="A13-B-1", warehouse_id=1),
                SimpleNamespace(id=7, ean="5905108775698", name="SKU", tenant_id=1),
            ]
            out = confirm_empty_pick_location(
                db,
                tenant_id=1,
                warehouse_id=1,
                cart_id=9,
                product_id=7,
                location_id=1,
                observed_stock_qty=99.0,
                report_product_shortage_if_no_alt=False,
            )
        self.assertEqual(out["shortage_kind"], "LOCATION_SHORTAGE")
        self.assertEqual(out["previous_qty"], 99.0)
        self.assertEqual(out["new_qty"], 0.0)
        self.assertEqual(len(out["alternate_locations"]), 1)
        self.assertEqual(out["alternate_locations"][0]["location_code"], "A14-C-2")
        adj.assert_called_once()
        self.assertEqual(adj.call_args.kwargs["quantity_delta"], -99.0)
        self.assertEqual(adj.call_args.kwargs["location_id"], 1)
        self.assertEqual(adj.call_args.kwargs["product_id"], 7)


if __name__ == "__main__":
    unittest.main()
