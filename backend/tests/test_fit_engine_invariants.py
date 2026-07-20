"""Invariant / property harness for shared fit_engine (audit §13)."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.fit_engine.adapters import fit_container_from_carton
from backend.services.fit_engine.geometry import best_identical_unit_layout
from backend.services.fit_engine.models import FitContainer, FitItem, FitConfidence, OrientationMode, StackingMode
from backend.services.fit_engine.placement import try_pack_items_into_container
from backend.services.fit_engine.placement_validator import aabb_overlap, validate_placements
from backend.services.fit_engine.stacking import stack_height_cm
from backend.services.packaging_engine.decision import finalize_primary_packaging
from backend.services.packaging_engine.engine import _merge_by_carton
from backend.services.packaging_engine.suggestions import PackagingSuggestionDraft
from backend.services.packaging_engine.three_d_matching import suggest_three_d_matching
from backend.services.product_logistic_validator import validate_product_logistics


def _box(**kw):
    defaults = dict(
        product_id=1,
        length_cm=10,
        width_cm=10,
        height_cm=10,
        weight_kg=1.0,
        orientation=OrientationMode.ANY,
        stacking=StackingMode.STACKABLE,
    )
    defaults.update(kw)
    return FitItem(**defaults)


def _space(L, W, H, **kw):
    return FitContainer("c", L, W, H, **kw)


class TestFitInvariants(unittest.TestCase):
    def test_A_larger_container_not_reduce(self):
        item = _box()
        a = best_identical_unit_layout(_space(100, 50, 40), item).capacity
        b = best_identical_unit_layout(_space(120, 50, 40), item).capacity
        self.assertGreaterEqual(b, a)

    def test_B_larger_max_stack_not_reduce(self):
        a = best_identical_unit_layout(
            _space(100, 60, 100), _box(length_cm=20, width_cm=20, height_cm=10, max_stack_count=3)
        ).capacity
        b = best_identical_unit_layout(
            _space(100, 60, 100), _box(length_cm=20, width_cm=20, height_cm=10, max_stack_count=5)
        ).capacity
        self.assertGreaterEqual(b, a)

    def test_C_larger_product_not_increase(self):
        a = best_identical_unit_layout(
            _space(100, 50, 40), _box(length_cm=20, width_cm=10, height_cm=10)
        ).capacity
        b = best_identical_unit_layout(
            _space(100, 50, 40), _box(length_cm=25, width_cm=10, height_cm=10)
        ).capacity
        self.assertLessEqual(b, a)

    def test_D_E_F_G_placements_valid(self):
        c = _space(60, 40, 40)
        pack = try_pack_items_into_container(
            c,
            [(_box(product_id=1, length_cm=40, width_cm=30, height_cm=20), 1), (_box(product_id=2, length_cm=20, width_cm=30, height_cm=20), 1)],
        )
        self.assertTrue(pack.fits)
        gate = validate_placements(c, pack.placements, total_weight_kg=pack.total_weight_kg)
        self.assertTrue(gate.ok)
        for i, a in enumerate(pack.placements):
            for b in pack.placements[i + 1 :]:
                self.assertFalse(aabb_overlap(a, b))

    def test_H_location_carton_parity(self):
        item = _box(length_cm=20, width_cm=10, height_cm=10)
        loc = _space(100, 50, 40, kind="location")
        cart = FitContainer("carton", 100, 50, 40, kind="carton")
        self.assertEqual(
            best_identical_unit_layout(loc, item).capacity,
            best_identical_unit_layout(cart, item).capacity,
        )

    def test_I_no_stack_no_load_above(self):
        a = _box(product_id=1, length_cm=20, width_cm=20, height_cm=20, stacking=StackingMode.NO_STACK)
        b = _box(product_id=2, length_cm=20, width_cm=20, height_cm=20)
        pack = try_pack_items_into_container(_space(20, 20, 60), [(a, 1), (b, 1)])
        self.assertFalse(pack.fits)

    def test_J_fragile_conservative(self):
        a = _box(product_id=1, length_cm=20, width_cm=20, height_cm=20, fragile=True)
        b = _box(product_id=2, length_cm=20, width_cm=20, height_cm=20)
        pack = try_pack_items_into_container(_space(20, 20, 60), [(a, 1), (b, 1)])
        self.assertFalse(pack.fits)

    def test_K_compressed_monotonic(self):
        item = _box(height_cm=25, compressible=True, compressed_height_cm=10)
        heights = [stack_height_cm(item, n) for n in range(1, 6)]
        self.assertEqual(heights, sorted(heights))

    def test_L_max_stack_per_stack(self):
        layout = best_identical_unit_layout(
            _space(100, 60, 100),
            _box(
                length_cm=20,
                width_cm=20,
                height_cm=10,
                max_stack_count=5,
                orientation=OrientationMode.NO_ROTATION,
            ),
        )
        self.assertEqual(layout.units_per_stack, 5)
        self.assertEqual(layout.capacity, layout.stacks_count * 5)
        self.assertEqual(layout.capacity, 75)

    def test_M_missing_dims_not_exact(self):
        item = FitItem(1, 0, 0, 0, volume_dm3=1.0)
        layout = best_identical_unit_layout(_space(0, 0, 0), item)
        self.assertNotEqual(layout.confidence, FitConfidence.EXACT)

    def test_N_volume_ok_geom_fail(self):
        from backend.services.fit_engine.geometry import item_fits_in_container_any_orientation

        ok, reason = item_fits_in_container_any_orientation(_space(50, 50, 50), _box(length_cm=100, width_cm=10, height_cm=10))
        self.assertFalse(ok)
        self.assertEqual(reason, "ITEM_DIMENSION_EXCEEDS_CONTAINER")

    def test_O_smart_cannot_resurrect_reject(self):
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
        order = SimpleNamespace(id=7, items=[SimpleNamespace(quantity=1, product=prod)], shipping_method_id=None)
        bad = SimpleNamespace(
            id="BAD",
            name="BAD",
            length_cm=50,
            width_cm=50,
            height_cm=50,
            packaging_type="box",
            material_type="",
            image_url=None,
            unit_cost=1,
            purchase_price=None,
            last_purchase_price_net=None,
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
            unit_cost=2,
            purchase_price=None,
            last_purchase_price_net=None,
        )
        td = suggest_three_d_matching(order, [bad, good])
        smart = [
            PackagingSuggestionDraft(7, "SMART_MATCHING", "BAD", "BAD", "", None, 0.9, None, "carrier", sort_key=1.2)
        ]
        merged = _merge_by_carton(smart, td)
        primary, _ = finalize_primary_packaging(
            order,
            [bad, good],
            merged,
            eligible_carton_ids={"GOOD"},
            smart_bonus_by_id={"BAD": 0.5, "GOOD": 0.1},
            demand_cm3=10000,
        )
        self.assertIsNotNone(primary)
        self.assertEqual(primary.suggested_package_id, "GOOD")

    def test_internal_dims_used_for_fit(self):
        carton = SimpleNamespace(
            id="1",
            name="C",
            length_cm=40,
            width_cm=30,
            height_cm=20,
            internal_length_cm=39,
            internal_width_cm=29,
            internal_height_cm=19,
            max_payload_kg=15,
        )
        c = fit_container_from_carton(carton)
        self.assertTrue(c.dimensions_are_usable)
        self.assertEqual(c.length_cm, 39)
        self.assertEqual(c.max_weight_kg, 15)

    def test_external_fallback_warning(self):
        carton = SimpleNamespace(id="1", name="C", length_cm=40, width_cm=30, height_cm=20)
        c = fit_container_from_carton(carton)
        self.assertFalse(c.dimensions_are_usable)
        self.assertIn("USABLE_DIMENSIONS_NOT_DEFINED", c.warnings)

    def test_logistic_validator_compression(self):
        r = validate_product_logistics(
            height=10,
            stack_compressible=True,
            compressed_height_cm=12,
        )
        self.assertFalse(r.ok)
        self.assertTrue(any(e.code == "COMPRESSED_HEIGHT_EXCEEDS_HEIGHT" for e in r.errors))

    def test_O2_empty_eligible_no_smart_primary(self):
        """When physical eligible set is empty, Smart must not become PRIMARY."""
        order = SimpleNamespace(id=7, items=[], shipping_method_id=None)
        bad = SimpleNamespace(
            id="BAD",
            name="BAD",
            length_cm=50,
            width_cm=50,
            height_cm=50,
            packaging_type="box",
            material_type="",
            image_url=None,
            unit_cost=1,
            purchase_price=None,
            last_purchase_price_net=None,
        )
        smart = [
            PackagingSuggestionDraft(7, "SMART_MATCHING", "BAD", "BAD", "", None, 0.99, None, "hist", sort_key=2.0)
        ]
        primary, _ = finalize_primary_packaging(
            order,
            [bad],
            smart,
            eligible_carton_ids=set(),
            smart_bonus_by_id={"BAD": 1.0},
            demand_cm3=1000,
        )
        self.assertIsNone(primary)


if __name__ == "__main__":
    unittest.main()
