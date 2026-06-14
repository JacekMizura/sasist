"""P4.15B — Bundle operational UX projections (picking/packing UI, single/multi, cart volume)."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundle_order_item_ops import (
    filter_operational_order_items,
    order_item_is_operational_picking_line,
    order_item_skip_bundle_commercial_header_for_ops,
)
from backend.services.bundles.bundle_line_projections import picking_lines
from backend.services.bundles.bundle_operational_ux_service import (
    build_packing_bundle_trees,
    build_picking_bundle_trees_for_orders,
)
from backend.services.cart_service import _order_used_volume_dm3_from_items
from backend.tests.test_bundle_line_resolver import (
    _component_item,
    _ctx_on_demand,
    _ctx_stock,
    _parent_item,
)


def _on_demand_parent_meta() -> str:
    return json.dumps(
        {
            "bundle_fulfillment_mode": ON_DEMAND_ASSEMBLY,
            "bundle_id": 7,
            "bundle_name_snapshot": "Promo",
        }
    )


def _stock_parent_meta() -> str:
    return json.dumps(
        {
            "bundle_fulfillment_mode": STOCK_PRODUCTION,
            "bundle_id": 7,
            "bundle_name_snapshot": "Promo",
        }
    )


class TestPickingLinesBundleMetadata:
    def test_on_demand_components_indexed(self) -> None:
        picks = picking_lines(_ctx_on_demand())
        assert len(picks) == 2
        assert all(p.is_bundle_component for p in picks)
        assert all(p.bundle_id == 7 for p in picks)
        assert all(p.bundle_name == "Promo" for p in picks)
        assert all(p.bundle_mode == ON_DEMAND_ASSEMBLY for p in picks)
        assert [p.bundle_component_index for p in picks] == [1, 2]
        assert all(p.bundle_component_count == 2 for p in picks)
        assert all(p.parent_bundle_order_line_id == 50 for p in picks)

    def test_stock_linked_sku_single_operational_line(self) -> None:
        picks = picking_lines(_ctx_stock())
        assert len(picks) == 1
        p = picks[0]
        assert p.is_bundle_component is False
        assert p.bundle_component_index == 1
        assert p.bundle_component_count == 1
        assert p.product_id == 103
        assert p.source == "stock_sku"

    def test_on_demand_many_components_indexed(self) -> None:
        """100 składników — indeksy 1..100 bez zmiany kontraktu."""
        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY, qty=1)
        from backend.services.bundles.bundle_line_context import (
            BundleComponentSnapshotView,
            BundleLineContext,
            BundlePricingContext,
        )

        comps = tuple(
            BundleComponentSnapshotView(
                snapshot_id=i,
                order_id=100,
                order_line_id=parent.id,
                bundle_id=7,
                component_product_id=1000 + i,
                component_name=f"C{i}",
                sku=f"C{i}",
                ean=None,
                required_qty_per_bundle=1,
                required_qty_total=1,
                unit_cost_snapshot=1.0,
                unit_price_snapshot=2.0,
            )
            for i in range(1, 101)
        )
        children = tuple(
            _component_item(oid=50 + i, pid=1000 + i, parent_id=int(parent.id), qty=1) for i in range(1, 101)
        )
        ctx = BundleLineContext(
            order_id=100,
            order_line_id=int(parent.id),
            parent_order_item=parent,
            bundle_id=7,
            bundle_name="Mega",
            fulfillment_mode=ON_DEMAND_ASSEMBLY,
            bundle_qty=1,
            pricing=BundlePricingContext(99.0, 99.0, None, None),
            components=comps,
            linked_product_id=None,
            component_order_items=children,
        )
        picks = picking_lines(ctx)
        assert len(picks) == 100
        assert picks[0].bundle_component_index == 1
        assert picks[-1].bundle_component_index == 100
        assert all(p.bundle_component_count == 100 for p in picks)


class TestOperationalLineCount:
    def test_on_demand_bundle_counts_components_not_parent(self) -> None:
        parent = OrderItem(
            id=1,
            order_id=10,
            product_id=999,
            quantity=1,
            is_bundle_parent=True,
            metadata_json=_on_demand_parent_meta(),
        )
        components = [
            OrderItem(id=2, order_id=10, product_id=101, quantity=1, parent_bundle_order_item_id=1),
            OrderItem(id=3, order_id=10, product_id=102, quantity=1, parent_bundle_order_item_id=1),
            OrderItem(id=4, order_id=10, product_id=103, quantity=1, parent_bundle_order_item_id=1),
        ]
        ops = filter_operational_order_items([parent, *components])
        assert len(ops) == 3
        assert order_item_skip_bundle_commercial_header_for_ops(parent)
        assert not order_item_is_operational_picking_line(parent)

    def test_stock_bundle_parent_is_operational_line(self) -> None:
        parent = OrderItem(
            id=1,
            order_id=10,
            product_id=103,
            quantity=2,
            is_bundle_parent=True,
            metadata_json=_stock_parent_meta(),
        )
        assert order_item_is_operational_picking_line(parent)
        ops = filter_operational_order_items([parent])
        assert ops == [parent]

    def test_ten_on_demand_bundles_operational_lines(self) -> None:
        items: list[OrderItem] = []
        oid = 1
        for _b in range(10):
            items.append(
                OrderItem(
                    id=oid,
                    order_id=10,
                    product_id=999,
                    quantity=1,
                    is_bundle_parent=True,
                    metadata_json=_on_demand_parent_meta(),
                )
            )
            parent_id = oid
            oid += 1
            for c in range(3):
                items.append(
                    OrderItem(
                        id=oid,
                        order_id=10,
                        product_id=200 + c,
                        quantity=1,
                        parent_bundle_order_item_id=parent_id,
                    )
                )
                oid += 1
        assert len(filter_operational_order_items(items)) == 30


class TestCartVolumeFallback:
    def _product(self, *, pid: int, vol: float) -> Product:
        return Product(id=pid, tenant_id=1, name=f"P{pid}", volume=vol)

    def test_skips_on_demand_parent_volume(self) -> None:
        parent = OrderItem(
            id=1,
            order_id=10,
            product_id=999,
            quantity=1,
            is_bundle_parent=True,
            metadata_json=_on_demand_parent_meta(),
            product=self._product(pid=999, vol=50.0),
        )
        comp = OrderItem(
            id=2,
            order_id=10,
            product_id=101,
            quantity=2,
            parent_bundle_order_item_id=1,
            product=self._product(pid=101, vol=3.0),
        )
        order = SimpleNamespace(id=10, items=[parent, comp])
        assert _order_used_volume_dm3_from_items(order) == pytest.approx(6.0)

    def test_stock_parent_counted_once(self) -> None:
        parent = OrderItem(
            id=1,
            order_id=10,
            product_id=103,
            quantity=2,
            is_bundle_parent=True,
            metadata_json=_stock_parent_meta(),
            product=self._product(pid=103, vol=4.0),
        )
        order = SimpleNamespace(id=10, items=[parent])
        assert _order_used_volume_dm3_from_items(order) == pytest.approx(8.0)


class TestPickingBundleTrees:
    def test_build_tree_for_current_product(self) -> None:
        from backend.services.bundles.bundle_operational_ux_service import BundleOperationalUxMeta

        p_a = Product(id=101, tenant_id=1, name="Dezodorant")
        p_b = Product(id=102, tenant_id=1, name="Szampon")
        p_c = Product(id=103, tenant_id=1, name="Żel")
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
        i3 = OrderItem(id=53, order_id=10001, product_id=103, quantity=1, parent_bundle_order_item_id=50, product=p_c)
        order = Order(id=10001, number="10001", items=[parent, i1, i2, i3])
        ux = {
            51: BundleOperationalUxMeta(
                bundle_id=7,
                bundle_name="Pakiet Promocyjny",
                bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=1,
                bundle_component_count=3,
                is_bundle_component=True,
                parent_bundle_order_line_id=50,
            ),
            52: BundleOperationalUxMeta(
                bundle_id=7,
                bundle_name="Pakiet Promocyjny",
                bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=2,
                bundle_component_count=3,
                is_bundle_component=True,
                parent_bundle_order_line_id=50,
            ),
            53: BundleOperationalUxMeta(
                bundle_id=7,
                bundle_name="Pakiet Promocyjny",
                bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=3,
                bundle_component_count=3,
                is_bundle_component=True,
                parent_bundle_order_line_id=50,
            ),
        }

        def sum_pick(_db, _oiid, _cid):
            return 1.0 if _oiid == 51 else 0.0

        db = MagicMock()
        trees = build_picking_bundle_trees_for_orders(
            db,
            orders=[order],
            product_id=101,
            cart_id=1,
            ux_index=ux,
            sum_pick_fn=sum_pick,
        )
        assert len(trees) == 1
        assert trees[0]["bundle_name"] == "Pakiet Promocyjny"
        assert trees[0]["components_done"] == 1
        assert trees[0]["components_total"] == 3
        current = [c for c in trees[0]["components"] if c.is_current_product]
        assert len(current) == 1
        assert current[0].product_name == "Dezodorant"


class TestPackingBundleTrees:
    def test_packing_progress_complete(self) -> None:
        from backend.services.bundles.bundle_operational_ux_service import BundleOperationalUxMeta

        parent = OrderItem(id=50, order_id=100, product_id=999, quantity=1, is_bundle_parent=True)
        ux = {
            51: BundleOperationalUxMeta(
                bundle_id=7,
                bundle_name="Pakiet",
                bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=1,
                bundle_component_count=2,
                is_bundle_component=True,
                parent_bundle_order_line_id=50,
            ),
            52: BundleOperationalUxMeta(
                bundle_id=7,
                bundle_name="Pakiet",
                bundle_mode=ON_DEMAND_ASSEMBLY,
                bundle_component_index=2,
                bundle_component_count=2,
                is_bundle_component=True,
                parent_bundle_order_line_id=50,
            ),
        }
        line_a = SimpleNamespace(
            order_item_id=51,
            product_id=101,
            product_name="A",
            quantity=1,
            quantity_required=1,
            quantity_packed=1,
        )
        line_b = SimpleNamespace(
            order_item_id=52,
            product_id=102,
            product_name="B",
            quantity=1,
            quantity_required=1,
            quantity_packed=1,
        )

        db = MagicMock()
        order = Order(
            id=100,
            number="100",
            items=[
                parent,
                OrderItem(id=51, order_id=100, product_id=101, quantity=1, parent_bundle_order_item_id=50),
                OrderItem(id=52, order_id=100, product_id=102, quantity=1, parent_bundle_order_item_id=50),
            ],
        )

        import backend.services.bundles.bundle_operational_ux_service as mod

        orig = mod.build_bundle_ux_index_for_order
        mod.build_bundle_ux_index_for_order = lambda _db, _oid: ux
        try:
            trees = build_packing_bundle_trees(db, order=order, active_lines=[line_a, line_b])
        finally:
            mod.build_bundle_ux_index_for_order = orig

        assert len(trees) == 1
        assert trees[0]["components_packed"] == 2
        assert trees[0]["is_complete"] is True


class TestMultiOrderBreakdownContract:
    def test_operational_filter_preserves_order_and_bundle_context(self) -> None:
        o1_parent = OrderItem(
            id=1, order_id=10001, product_id=999, quantity=1, is_bundle_parent=True, metadata_json=_on_demand_parent_meta()
        )
        o1_comp = OrderItem(id=2, order_id=10001, product_id=101, quantity=1, parent_bundle_order_item_id=1)
        o2_parent = OrderItem(
            id=3, order_id=10002, product_id=999, quantity=1, is_bundle_parent=True, metadata_json=_on_demand_parent_meta()
        )
        o2_comp = OrderItem(id=4, order_id=10002, product_id=101, quantity=1, parent_bundle_order_item_id=3)
        ops = filter_operational_order_items([o1_parent, o1_comp, o2_parent, o2_comp])
        assert {(x.order_id, x.product_id) for x in ops} == {(10001, 101), (10002, 101)}
