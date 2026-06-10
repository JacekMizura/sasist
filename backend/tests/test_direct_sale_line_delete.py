"""Direct sale line delete — defensive reservation release and lookup."""

from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sale.line_delete_service import (
    get_session_line,
    remove_session_line,
)


class TestDirectSaleLineDelete(unittest.TestCase):
    def test_get_session_line_not_found_raises_404(self):
        db = MagicMock()
        sess = MagicMock(id=10)
        db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(DirectSaleError) as ctx:
            get_session_line(db, sess, line_id=99)
        self.assertEqual(ctx.exception.http_status, 404)
        self.assertEqual(ctx.exception.code, "line_not_found")

    def test_remove_session_line_deletes_without_reservation(self):
        db = MagicMock()
        sess = MagicMock(id=10, tenant_id=1, warehouse_id=2, status="ACTIVE")
        line = MagicMock(
            id=5,
            product_id=100,
            quantity=2.0,
            stock_reservation_id=None,
        )
        db.query.return_value.filter.return_value.first.return_value = line

        with patch(
            "backend.services.direct_sale.line_delete_service.emit_operational_sales_event"
        ) as emit:
            remove_session_line(db, sess, line_id=5)

        db.delete.assert_called_once_with(line)
        db.flush.assert_called()
        db.expire.assert_called_once_with(sess, ["lines"])
        emit.assert_called_once()

    def test_remove_session_line_skips_missing_reservation(self):
        db = MagicMock()
        sess = MagicMock(id=10, tenant_id=1, warehouse_id=2, status="ACTIVE")
        line = MagicMock(
            id=5,
            product_id=100,
            quantity=1.0,
            stock_reservation_id=777,
        )

        line_query = MagicMock()
        line_query.filter.return_value.first.return_value = line
        res_query = MagicMock()
        res_query.filter.return_value.first.return_value = None
        db.query.side_effect = [line_query, res_query]

        with patch(
            "backend.services.direct_sale.line_delete_service.emit_operational_sales_event"
        ):
            remove_session_line(db, sess, line_id=5)

        self.assertIsNone(line.stock_reservation_id)
        db.delete.assert_called_once_with(line)

    def test_remove_session_line_release_failure_still_deletes(self):
        db = MagicMock()
        sess = MagicMock(id=10, tenant_id=1, warehouse_id=2, status="ACTIVE")
        line = MagicMock(
            id=5,
            product_id=100,
            quantity=1.0,
            stock_reservation_id=42,
        )
        res = MagicMock(id=42, status="reserved", quantity=1.0, tenant_id=1, product_id=100, location_id=3)

        line_query = MagicMock()
        line_query.filter.return_value.first.return_value = line
        res_query = MagicMock()
        res_query.filter.return_value.first.return_value = res
        db.query.side_effect = [line_query, res_query]

        with patch(
            "backend.services.direct_sale.line_delete_service.release_reservation",
            side_effect=RuntimeError("movement failed"),
        ), patch(
            "backend.services.direct_sale.line_delete_service.record_inventory_movement",
            side_effect=RuntimeError("movement failed"),
        ), patch(
            "backend.services.direct_sale.line_delete_service.emit_operational_sales_event"
        ):
            remove_session_line(db, sess, line_id=5)

        db.delete.assert_called_once_with(line)
        self.assertIsNone(line.stock_reservation_id)

    def test_remove_session_line_closed_session_raises(self):
        db = MagicMock()
        sess = MagicMock(status="COMPLETED")
        with self.assertRaises(DirectSaleError) as ctx:
            remove_session_line(db, sess, line_id=1)
        self.assertEqual(ctx.exception.code, "session_closed")


if __name__ == "__main__":
    unittest.main()
