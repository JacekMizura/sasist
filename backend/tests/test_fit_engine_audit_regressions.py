"""Regression tests from fit-engine deep audit (2026-07-20)."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.fit_engine.geometry import best_identical_unit_layout
from backend.services.fit_engine.models import FitContainer, FitItem, OrientationMode, StackingMode
from backend.services.fit_engine.placement import try_pack_items_into_container
from backend.services.packaging_engine.decision import finalize_primary_packaging
from backend.services.packaging_engine.engine import _merge_by_carton
from backend.services.packaging_engine.suggestions import PackagingSuggestionDraft
from backend.services.packaging_engine.three_d_matching import suggest_three_d_matching


class TestAuditRegressions(unittest.TestCase):
    def test_compression_not_applied_on_rotated_non_height_axis(self):
        """compressed_height_cm applies only when product height is vertical."""
        item = FitItem(
            product_id=1,
            length_cm=60,
            width_cm=40,
            height_cm=25,
            weight_kg=0.5,
            compressible=True,
            compressed_height_cm=10,
            max_stack_count=6,
            orientation=OrientationMode.ANY,
            stacking=StackingMode.STACKABLE,
        )
        layout = best_identical_unit_layout(
            FitContainer("c", 120, 80, 70, kind="generic"),
            item,
        )
        self.assertEqual(layout.capacity, 20)
        self.assertEqual(layout.stacks_count, 4)
        self.assertEqual(layout.units_per_stack, 5)

    def test_no_stack_blocks_item_on_top_in_multi_sku(self):
        a = FitItem(
            product_id=1,
            length_cm=20,
            width_cm=20,
            height_cm=20,
            weight_kg=1.0,
            stacking=StackingMode.NO_STACK,
            orientation=OrientationMode.ANY,
        )
        b = FitItem(
            product_id=2,
            length_cm=20,
            width_cm=20,
            height_cm=20,
            weight_kg=1.0,
            stacking=StackingMode.STACKABLE,
            orientation=OrientationMode.ANY,
        )
        pack = try_pack_items_into_container(
            FitContainer("c", 20, 20, 60, kind="carton"),
            [(a, 1), (b, 1)],
        )
        self.assertFalse(pack.fits)
        self.assertEqual(pack.reason, "GEOMETRIC_PACKING_FAILED")

    def test_smart_cannot_primary_geometrically_rejected_carton(self):
        prod = SimpleNamespace(
            id=1,
            length=100,
            width=10,
            height=10,
            weight=1,
            volume=1,
            orientation_type="any",
            stack_behavior="stackable",
            stack_compressible=False,
            compressed_height_cm=None,
            max_stack_weight=None,
            max_stack_count=None,
            shape_type="box",
            name="long",
            fragile=False,
            units_per_carton=0,
        )
        order = SimpleNamespace(
            id=7,
            items=[SimpleNamespace(quantity=1, product=prod)],
            shipping_method_id=None,
        )
        bad = SimpleNamespace(
            id="BAD",
            name="BAD",
            length_cm=50,
            width_cm=50,
            height_cm=50,
            packaging_type="box",
            material_type="",
            image_url=None,
        )
        good = SimpleNamespace(
            id="GOOD",
            name="GOOD",
            length_cm=120,
            width_cm=40,
            height_cm=40,
            packaging_type="box",
            material_type="",
            image_url=None,
        )
        td = suggest_three_d_matching(order, [bad, good])
        smart = [
            PackagingSuggestionDraft(
                7,
                "SMART_MATCHING",
                "BAD",
                "BAD",
                "",
                None,
                0.9,
                None,
                "carrier link",
                sort_key=1.2,
            )
        ]
        merged = _merge_by_carton(smart, td)
        primary, _alts = finalize_primary_packaging(
            order,
            [bad, good],
            merged,
            eligible_carton_ids={"GOOD"},
            smart_bonus_by_id={"BAD": 0.9},
            demand_cm3=10000,
        )
        self.assertEqual(primary.suggested_package_id, "GOOD")
        self.assertNotIn("Odrzucony:", primary.reason or "")


if __name__ == "__main__":
    unittest.main()
