"""Canonical bundle_component_index normalization + picking tree safety."""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.schemas.wms_picking_products import (
    WmsPickingBundleComponentStatus,
    WmsPickingOrderBundleTree,
    WmsPickingProductLine,
    WmsPickingProductLinesResponse,
)
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY
from backend.services.bundles.bundle_component_index import (
    bundle_component_index_sort_key,
    normalize_sibling_bundle_component_indices,
)
from backend.services.bundles.bundle_operational_ux_service import (
    BundleOperationalUxMeta,
    build_picking_bundle_trees_for_orders,
)
from backend.services.wms_picking_product_list_service import build_wms_picking_product_detail


def _on_demand_parent_meta() -> str:
    return json.dumps(
        {
            "bundle_fulfillment_mode": ON_DEMAND_ASSEMBLY,
            "bundle_id": 7,
            "bundle_name_snapshot": "Promo",
        }
    )


class TestNormalizeSiblingIndices(unittest.TestCase):
    def test_preserves_unique_1_to_n(self) -> None:
        got = normalize_sibling_bundle_component_indices([(51, 1), (52, 2), (53, 3)])
        self.assertEqual(got, {51: 1, 52: 2, 53: 3})

    def test_nulls_get_deterministic_1_to_n_by_order_item_id(self) -> None:
        got = normalize_sibling_bundle_component_indices([(53, None), (51, None), (52, None)])
        self.assertEqual(got, {51: 1, 52: 2, 53: 3})

    def test_mixed_valid_and_null_does_not_collapse_to_one(self) -> None:
        got = normalize_sibling_bundle_component_indices([(51, 1), (52, None), (53, None)])
        self.assertEqual(got[51], 1)
        self.assertEqual(sorted(got.values()), [1, 2, 3])
        self.assertEqual(len(set(got.values())), 3)

    def test_zero_treated_as_missing(self) -> None:
        got = normalize_sibling_bundle_component_indices([(51, 0), (52, 0)])
        self.assertEqual(got, {51: 1, 52: 2})

    def test_sort_key_none_safe(self) -> None:
        rows = [(3, None), (1, 2), (2, None)]
        ordered = sorted(rows, key=lambda r: bundle_component_index_sort_key(r[1], order_item_id=r[0]))
        self.assertEqual(ordered[0], (1, 2))


class TestPickingTreesNullIndex(unittest.TestCase):
    def _order_with_three_components(self) -> tuple[Order, dict[int, BundleOperationalUxMeta]]:
        p_a = Product(id=101, tenant_id=1, name="A")
        p_b = Product(id=102, tenant_id=1, name="B")
        p_c = Product(id=346, tenant_id=1, name="Sznurowadła")
        parent = OrderItem(
            id=50,
            order_id=10001,
            product_id=999,
            quantity=1,
            is_bundle_parent=True,
            metadata_json=_on_demand_parent_meta(),
        )
        i1 = OrderItem(id=51, order_id=10001, product_id=101, quantity=1, parent_bundle_order_item_id=50, product=p_a)
        i2 = OrderItem(id=52, order_id=10001, product_id=102, quantity=1, parent_bundle_order_item_id=50, product=p_b)
        i3 = OrderItem(id=53, order_id=10001, product_id=346, quantity=1, parent_bundle_order_item_id=50, product=p_c)
        order = Order(id=10001, number="10001", items=[parent, i1, i2, i3])
        return order, parent

    def test_correct_indices_1_to_n(self) -> None:
        order, _ = self._order_with_three_components()
        ux = {
            51: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=1, bundle_component_count=3,
                is_bundle_component=True, parent_bundle_order_line_id=50,
            ),
            52: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=2, bundle_component_count=3,
                is_bundle_component=True, parent_bundle_order_line_id=50,
            ),
            53: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=3, bundle_component_count=3,
                is_bundle_component=True, parent_bundle_order_line_id=50,
            ),
        }
        trees = build_picking_bundle_trees_for_orders(
            MagicMock(), orders=[order], product_id=346, cart_id=3, ux_index=ux, sum_pick_fn=lambda *_: 0.0
        )
        self.assertEqual(len(trees), 1)
        idxs = [c.bundle_component_index for c in trees[0]["components"]]
        self.assertEqual(idxs, [1, 2, 3])
        for c in trees[0]["components"]:
            WmsPickingBundleComponentStatus(
                order_item_id=c.order_item_id,
                product_id=c.product_id,
                product_name=c.product_name,
                quantity=c.quantity,
                picked_quantity=c.picked_quantity,
                quantity_to_pick=c.quantity_to_pick,
                bundle_component_index=c.bundle_component_index,
                is_current_product=c.is_current_product,
                pick_done=c.pick_done,
            )

    def test_null_indices_reassigned_not_zero(self) -> None:
        order, _ = self._order_with_three_components()
        ux = {
            51: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=None, bundle_component_count=3,
                is_bundle_component=True, parent_bundle_order_line_id=50,
            ),
            52: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=None, bundle_component_count=3,
                is_bundle_component=True, parent_bundle_order_line_id=50,
            ),
            53: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=None, bundle_component_count=3,
                is_bundle_component=True, parent_bundle_order_line_id=50,
            ),
        }
        trees = build_picking_bundle_trees_for_orders(
            MagicMock(), orders=[order], product_id=346, cart_id=3, ux_index=ux, sum_pick_fn=lambda *_: 0.0
        )
        self.assertEqual(len(trees), 1)
        idxs = [c.bundle_component_index for c in trees[0]["components"]]
        self.assertEqual(idxs, [1, 2, 3])
        self.assertNotIn(0, idxs)

    def test_plain_product_without_bundle_yields_empty_trees(self) -> None:
        p = Product(id=346, tenant_id=1, name="Plain")
        oi = OrderItem(id=10, order_id=1, product_id=346, quantity=1, product=p)
        order = Order(id=1, number="1", items=[oi])
        trees = build_picking_bundle_trees_for_orders(
            MagicMock(), orders=[order], product_id=346, cart_id=3, ux_index={}, sum_pick_fn=lambda *_: 0.0
        )
        self.assertEqual(trees, [])

    def test_stock_non_component_skipped(self) -> None:
        """STOCK linked SKU has parent link but is_bundle_component=False — not a component row."""
        p = Product(id=103, tenant_id=1, name="SKU")
        parent = OrderItem(
            id=50, order_id=1, product_id=103, quantity=1, is_bundle_parent=True, product=p
        )
        order = Order(id=1, number="1", items=[parent])
        ux = {
            50: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="Stock", bundle_mode="STOCK_PRODUCTION",
                bundle_component_index=1, bundle_component_count=1,
                is_bundle_component=False, parent_bundle_order_line_id=50,
            ),
        }
        trees = build_picking_bundle_trees_for_orders(
            MagicMock(), orders=[order], product_id=103, cart_id=1, ux_index=ux, sum_pick_fn=lambda *_: 0.0
        )
        self.assertEqual(trees, [])

    def test_detail_materialization_with_null_meta_does_not_raise(self) -> None:
        """Mirrors former HTTP 500 path: detail builds WmsPickingOrderBundleTree after trees."""
        order, _ = self._order_with_three_components()
        ux = {
            oid: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=None, bundle_component_count=3,
                is_bundle_component=True, parent_bundle_order_line_id=50,
            )
            for oid in (51, 52, 53)
        }
        trees_raw = build_picking_bundle_trees_for_orders(
            MagicMock(), orders=[order], product_id=346, cart_id=3, ux_index=ux, sum_pick_fn=lambda *_: 0.0
        )
        order_bundle_trees = [
            WmsPickingOrderBundleTree(
                order_id=int(t["order_id"]),
                order_number=str(t["order_number"]),
                bundle_id=int(t["bundle_id"]),
                bundle_name=str(t["bundle_name"]),
                bundle_mode=str(t["bundle_mode"]),
                parent_order_line_id=int(t["parent_order_line_id"]),
                components_total=int(t["components_total"]),
                components_done=int(t["components_done"]),
                components=[
                    WmsPickingBundleComponentStatus(
                        order_item_id=int(c.order_item_id),
                        product_id=int(c.product_id),
                        product_name=str(c.product_name),
                        quantity=float(c.quantity),
                        picked_quantity=float(c.picked_quantity),
                        quantity_to_pick=float(c.quantity_to_pick),
                        bundle_component_index=int(c.bundle_component_index),
                        is_current_product=bool(c.is_current_product),
                        pick_done=bool(c.pick_done),
                    )
                    for c in t["components"]
                ],
            )
            for t in trees_raw
        ]
        self.assertEqual(len(order_bundle_trees), 1)
        self.assertEqual(
            [c.bundle_component_index for c in order_bundle_trees[0].components],
            [1, 2, 3],
        )


class TestDetailServiceLegacyNullIndex(unittest.TestCase):
    def test_build_detail_survives_null_component_indices(self) -> None:
        fake_line = WmsPickingProductLine(
            product_id=346,
            name="Sznurowadła",
            total_quantity=1.0,
            picked_quantity=0.0,
            remaining_to_pick=1.0,
        )
        fake_lines = WmsPickingProductLinesResponse(
            products=[fake_line],
            pick_list=[],
            allow_continue_other_lines_after_shortage=True,
        )
        p_a = Product(id=101, tenant_id=1, name="A")
        p_b = Product(id=346, tenant_id=1, name="Sznurowadła")
        parent = OrderItem(
            id=50, order_id=1, product_id=999, quantity=1,
            is_bundle_parent=True, metadata_json=_on_demand_parent_meta(),
        )
        i1 = OrderItem(id=51, order_id=1, product_id=101, quantity=1, parent_bundle_order_item_id=50, product=p_a)
        i2 = OrderItem(id=52, order_id=1, product_id=346, quantity=1, parent_bundle_order_item_id=50, product=p_b)
        order = Order(id=1, number="1", cart_id=3, items=[parent, i1, i2])

        bad_ux = {
            51: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=None, is_bundle_component=True, parent_bundle_order_line_id=50,
            ),
            52: BundleOperationalUxMeta(
                bundle_id=7, bundle_name="P", bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=None, is_bundle_component=True, parent_bundle_order_line_id=50,
            ),
        }

        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.group_by.return_value = q
        q.all.return_value = [order]
        q.first.return_value = None

        with (
            patch(
                "backend.services.wms_picking_product_list_service.build_wms_picking_product_lines",
                return_value=fake_lines,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
                return_value=[1],
            ),
            patch(
                "backend.services.wms_picking_product_list_service.build_bundle_ux_index_for_orders",
                return_value=bad_ux,
            ),
        ):
            row = build_wms_picking_product_detail(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=6,
                order_type="all",
                product_id=346,
                cart_id=3,
            )
        self.assertIsNotNone(row)
        assert row is not None
        self.assertTrue(len(row.order_bundle_trees) >= 1)
        idxs = [c.bundle_component_index for t in row.order_bundle_trees for c in t.components]
        self.assertTrue(all(i >= 1 for i in idxs))
        self.assertNotIn(0, idxs)


if __name__ == "__main__":
    unittest.main()
