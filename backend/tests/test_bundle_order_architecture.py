"""P4.13 — bundle order architecture: snapshots and fulfillment modes (unit)."""

from __future__ import annotations

import pytest

from unittest.mock import MagicMock

from backend.models.bundle import Bundle, BundleItem
from backend.models.product import Product
from backend.services.bundle_explosion import (
    BundleExplosionError,
    _explode_on_demand_bundle,
    _explode_stock_production_bundle,
    merge_resolved_lines,
)
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundle_order_snapshot_service import build_component_snapshots_from_bundle


def _bundle_with_items(*, mode: str, linked_product_id: int | None = None) -> Bundle:
    p1 = Product(id=101, tenant_id=1, name="Dezodorant", sku="DEZ", purchase_price=5.0, sale_price=10.0)
    p2 = Product(id=102, tenant_id=1, name="Szampon", sku="SZA", purchase_price=3.0, sale_price=8.0)
    p3 = Product(id=103, tenant_id=1, name="Pakiet SKU", sku="PAK", purchase_price=0.0, sale_price=99.0)
    b = Bundle(
        id=1,
        tenant_id=1,
        name="Pakiet Promocyjny",
        sku="PROMO",
        sale_price=99.0,
        active=True,
        bundle_fulfillment_mode=mode,
        linked_product_id=linked_product_id,
    )
    b.items = [
        BundleItem(id=1, bundle_id=1, product_id=101, product=p1, quantity=2, sort_order=0),
        BundleItem(id=2, bundle_id=1, product_id=102, product=p2, quantity=1, sort_order=1),
    ]
    if linked_product_id == 103:
        b.linked_product_id = 103
    return b


class TestBundleExplosionModes:
    def test_on_demand_explodes_components_and_snapshot(self) -> None:
        bundle = _bundle_with_items(mode=ON_DEMAND_ASSEMBLY)
        lines = _explode_on_demand_bundle(
            bundle,
            bundle_order_qty=3,
            line_unit_price_override=99.0,
            required_stock_disposition="SALEABLE",
            instance_id="inst-1",
        )
        merged = merge_resolved_lines(lines)
        parents = [r for r in merged if r.is_bundle_parent]
        children = [r for r in merged if not r.is_bundle_parent]
        assert len(parents) == 1
        assert len(children) == 2
        assert sum(c.quantity for c in children if c.product_id == 101) == 6
        assert sum(c.quantity for c in children if c.product_id == 102) == 3
        snaps = build_component_snapshots_from_bundle(bundle, bundle_order_qty=3)
        assert len(snaps) == 2
        assert snaps[0].quantity_total == 6

    def test_stock_production_single_line_linked_product(self) -> None:
        p3 = Product(id=103, tenant_id=1, name="Pakiet SKU", sku="PAK", sale_price=99.0)
        bundle = _bundle_with_items(mode=STOCK_PRODUCTION, linked_product_id=103)
        bundle.items.append(
            BundleItem(id=3, bundle_id=1, product_id=103, product=p3, quantity=1, sort_order=2)
        )
        lines = _explode_stock_production_bundle(
            MagicMock(),
            bundle,
            bundle_order_qty=2,
            line_unit_price_override=99.0,
            required_stock_disposition="SALEABLE",
            instance_id="inst-2",
        )
        # linked product resolved from bundle items path when id matches component
        merged = merge_resolved_lines(lines)
        assert len(merged) == 1
        line = merged[0]
        assert line.is_bundle_parent is True
        assert line.product_id == 103
        assert line.quantity == 2
        assert STOCK_PRODUCTION in (line.metadata_json or "")

    def test_stock_production_requires_linked_product(self) -> None:
        bundle = _bundle_with_items(mode=STOCK_PRODUCTION, linked_product_id=None)
        bundle.linked_product_id = None
        with pytest.raises(BundleExplosionError, match="linked_product_id"):
            _explode_stock_production_bundle(
                MagicMock(),
                bundle,
                bundle_order_qty=1,
                line_unit_price_override=None,
                required_stock_disposition="SALEABLE",
                instance_id="inst-3",
            )

    def test_snapshot_purchase_prices_from_catalog(self) -> None:
        bundle = _bundle_with_items(mode=ON_DEMAND_ASSEMBLY)
        snaps = build_component_snapshots_from_bundle(bundle, bundle_order_qty=1)
        by_pid = {s.product_id: s for s in snaps}
        assert by_pid[101].purchase_price_net_snapshot == 5.0
        assert by_pid[102].purchase_price_net_snapshot == 3.0
