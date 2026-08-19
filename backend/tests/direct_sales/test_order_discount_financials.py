"""Order discount allocation — Session / Order / document financial invariants.

  python -m pytest backend/tests/direct_sales/test_order_discount_financials.py -q
"""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.direct_sale.order_discount_allocation import compute_final_line_gross_allocations
from backend.services.direct_sale.session_financials_service import compute_session_totals
from backend.services.sale_document_financials import compute_sale_totals_from_order


def _mock_db(vat_by_product: dict[int, float] | None = None) -> MagicMock:
    vat_map = vat_by_product or {}

    db = MagicMock()

    def _query(*_a, **_k):
        q = MagicMock()

        def _filter(*_fa, **_fk):
            f = MagicMock()

            def _first():
                # product_id filter uses Product.id
                return SimpleNamespace(vat_percent=23.0, metadata_json=None)

            f.first = _first
            return f

        q.filter = _filter
        return q

    db.query = _query

    def _vat(db_arg, product_id: int) -> float:
        return float(vat_map.get(int(product_id), 0.0))

    return db


def _line(
    line_id: int,
    *,
    unit_net: float,
    qty: float = 1.0,
    disc_type=None,
    disc_val=0.0,
    product_id: int | None = None,
):
    return SimpleNamespace(
        id=line_id,
        product_id=product_id or line_id,
        quantity=qty,
        unit_price=unit_net,
        sort_order=line_id,
        line_discount_type=disc_type,
        line_discount_value=disc_val,
        discount_amount=0.0,
    )


def _session(*, lines, order_type=None, order_val=0.0):
    return SimpleNamespace(
        id=99,
        tenant_id=1,
        warehouse_id=1,
        lines=lines,
        order_discount_type=order_type,
        order_discount_value=order_val,
    )


class TestOrderDiscountFinancialInvariants(unittest.TestCase):
    def setUp(self):
        self.vat_patcher = patch(
            "backend.services.direct_sale.session_financials_service.product_vat_for_direct_sale",
            side_effect=lambda _db, pid: 0.0,
        )
        self.vat_patcher.start()

    def tearDown(self):
        self.vat_patcher.stop()

    def _assert_invariant(self, db, sess):
        totals = compute_session_totals(db, sess)
        allocations = compute_final_line_gross_allocations(db, sess)
        session_total = round(float(totals["total_gross"]), 2)
        alloc_sum = round(sum(float(a["final_line_gross"]) for a in allocations), 2)
        self.assertEqual(alloc_sum, session_total)
        self.assertEqual(session_total, round(float(totals["total_gross"]), 2))

        items = []
        for alloc in allocations:
            meta = {
                "line_gross_total": float(alloc["final_line_gross"]),
                "line_discount_gross": float(alloc["line_discount_gross"]),
                "order_discount_allocation_gross": float(alloc.get("order_discount_allocation_gross") or 0),
            }
            items.append(
                SimpleNamespace(
                    id=int(alloc["line_id"]),
                    product_id=int(alloc["product_id"]),
                    quantity=int(alloc["quantity"]),
                    unit_price=float(alloc["final_unit_net"]),
                    total_price=float(alloc["final_line_net"]),
                    vat_percent=float(alloc["vat_percent"]),
                    metadata_json=json.dumps(meta),
                    parent_bundle_order_item_id=None,
                )
            )

        order = SimpleNamespace(value=session_total, items=items, currency="PLN")
        doc = compute_sale_totals_from_order(order)  # type: ignore[arg-type]
        self.assertEqual(round(float(doc["total_gross"]), 2), session_total)
        item_gross_sum = round(
            sum(json.loads(i.metadata_json)["line_gross_total"] for i in items),
            2,
        )
        self.assertEqual(item_gross_sum, session_total)
        return session_total, doc, items

    def test_no_discount(self):
        db = _mock_db()
        sess = _session(lines=[_line(1, unit_net=100.0), _line(2, unit_net=50.0)])
        total, _doc, _items = self._assert_invariant(db, sess)
        self.assertEqual(total, 150.0)

    def test_line_discount_only(self):
        db = _mock_db()
        sess = _session(lines=[_line(1, unit_net=100.0, disc_type="percent", disc_val=10.0)])
        total, _doc, _items = self._assert_invariant(db, sess)
        self.assertEqual(total, 90.0)

    def test_single_line_order_discount_10_percent(self):
        db = _mock_db()
        sess = _session(lines=[_line(1, unit_net=100.0)], order_type="percent", order_val=10.0)
        total, _doc, _items = self._assert_invariant(db, sess)
        self.assertEqual(total, 90.0)

    def test_two_equal_lines_order_discount_10_percent(self):
        db = _mock_db()
        sess = _session(
            lines=[_line(1, unit_net=100.0), _line(2, unit_net=100.0)],
            order_type="percent",
            order_val=10.0,
        )
        total, _doc, _items = self._assert_invariant(db, sess)
        self.assertEqual(total, 180.0)

    def test_two_unequal_lines_order_discount_10_percent(self):
        db = _mock_db()
        sess = _session(
            lines=[_line(1, unit_net=100.0), _line(2, unit_net=50.0)],
            order_type="percent",
            order_val=10.0,
        )
        total, _doc, _items = self._assert_invariant(db, sess)
        self.assertEqual(total, 135.0)

    def test_line_and_order_discount_combined(self):
        db = _mock_db()
        sess = _session(
            lines=[_line(1, unit_net=100.0, disc_type="percent", disc_val=10.0)],
            order_type="percent",
            order_val=10.0,
        )
        total, _doc, _items = self._assert_invariant(db, sess)
        self.assertEqual(total, 81.0)

    def test_qty_gt_one(self):
        db = _mock_db()
        sess = _session(
            lines=[_line(1, unit_net=50.0, qty=2.0)],
            order_type="percent",
            order_val=10.0,
        )
        total, _doc, _items = self._assert_invariant(db, sess)
        self.assertEqual(total, 90.0)

    def test_rounding_remainder_three_lines(self):
        db = _mock_db()
        sess = _session(
            lines=[
                _line(1, unit_net=33.33),
                _line(2, unit_net=33.33),
                _line(3, unit_net=33.34),
            ],
            order_type="percent",
            order_val=7.0,
        )
        self._assert_invariant(db, sess)

    def test_mixed_vat_rates(self):
        db = _mock_db({1: 23.0, 2: 8.0})
        with patch(
            "backend.services.direct_sale.session_financials_service.product_vat_for_direct_sale",
            side_effect=lambda _db, pid: {1: 23.0, 2: 8.0}.get(int(pid), 0.0),
        ):
            sess = _session(
                lines=[_line(1, unit_net=100.0, product_id=1), _line(2, unit_net=100.0, product_id=2)],
                order_type="percent",
                order_val=10.0,
            )
            totals = compute_session_totals(db, sess)
            self._assert_invariant(db, sess)
            self.assertEqual(round(float(totals["total_net"]) + float(totals["total_vat"]), 2), round(float(totals["total_gross"]), 2))


if __name__ == "__main__":
    unittest.main()
