"""Fallback / provenance / WMS product validation matrix (no parallel settings).

Uses existing Ustawienia WMS → Walidacja produktu SSOT:
  resolve_effective_receiving_requirements(product, wms_settings)
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.services.fit_engine.adapters import fit_item_from_product
from backend.services.fit_engine.geometry import best_identical_unit_layout
from backend.services.fit_engine.models import FitConfidence, FitContainer, StackingMode
from backend.services.packaging_engine.cartonization_solver import solve_cartonization
from backend.services.packaging_engine.decision import finalize_primary_packaging
from backend.services.packaging_engine.suggestions import PackagingSuggestionDraft
from backend.services.product_logistics_normalizer import (
    normalize_product_logistics,
    dimension_provided,
    master_weight_complete_for_receiving,
)
from backend.services.product_receiving_requirements import validate_required_product_data
from backend.services.product_validation_policy import (
    EffectiveReceivingRequirements,
    resolve_effective_receiving_requirements,
)


def _prod(**kw):
    defaults = dict(
        id=1,
        name="P",
        length=None,
        width=None,
        height=None,
        weight=None,
        volume=None,
        orientation_type=None,
        stack_behavior=None,
        stack_compressible=False,
        compressed_height_cm=None,
        max_stack_weight=None,
        max_stack_count=None,
        fragile=False,
        shape_type="box",
        units_per_carton=0,
        validation_skip_dimensions=False,
        validation_skip_weight=False,
        validation_skip_batch=True,
        validation_skip_expiry=True,
        validation_skip_serial=True,
        validation_skip_master_carton=True,
        validation_skip_master_carton_ean=True,
        validation_skip_master_carton_qty=True,
        validation_skip_master_carton_dims=True,
        validation_skip_master_carton_weight=True,
        require_recv_height=False,
        require_recv_width=False,
        require_recv_length=False,
        require_recv_weight=False,
        require_recv_master_carton=False,
        require_recv_master_carton_ean=False,
        require_recv_master_carton_qty=False,
        require_recv_master_carton_dims=False,
        require_recv_master_carton_weight=False,
        metadata_json=None,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _wms(*, dims=False, weight=False, migrated=True):
    return SimpleNamespace(
        validation_policy_migrated=migrated,
        validation_require_dimensions=dims,
        validation_require_weight=weight,
        validation_require_batch=False,
        validation_require_expiry=False,
        validation_require_serial=False,
        validation_require_master_carton=False,
        validation_require_master_carton_ean=False,
        validation_require_master_carton_qty=False,
        validation_require_master_carton_dims=False,
        validation_require_master_carton_weight=False,
    )


def _carton(**kw):
    base = dict(
        id="C1",
        name="M",
        length_cm=100,
        width_cm=100,
        height_cm=100,
        internal_length_cm=100,
        internal_width_cm=100,
        internal_height_cm=100,
        max_payload_kg=50,
    )
    base.update(kw)
    return SimpleNamespace(**base)


class TestFallbackMatrix(unittest.TestCase):
    def test_01_full_xyz_weight_normal(self):
        n = normalize_product_logistics(_prod(length=20, width=10, height=5, weight=1.2))
        self.assertFalse(n.used_defaults)
        self.assertEqual(n.data_quality, "REAL")
        item = fit_item_from_product(_prod(length=20, width=10, height=5, weight=1.2))
        layout = best_identical_unit_layout(FitContainer("L", 100, 50, 40), item)
        self.assertEqual(layout.confidence, FitConfidence.EXACT)
        self.assertGreater(layout.capacity, 0)

    def test_02_missing_xyz_runtime_1x1x1_estimated(self):
        n = normalize_product_logistics(_prod())
        self.assertEqual((n.length_cm, n.width_cm, n.height_cm), (1.0, 1.0, 1.0))
        self.assertTrue(n.used_defaults)
        item = fit_item_from_product(_prod())
        layout = best_identical_unit_layout(FitContainer("L", 100, 50, 40), item)
        self.assertEqual(layout.confidence, FitConfidence.ESTIMATED)
        self.assertGreater(layout.capacity, 0)

    def test_03_partial_xyz_width_fallback(self):
        n = normalize_product_logistics(_prod(length=20, height=10, weight=0.5))
        self.assertEqual(n.length_cm, 20)
        self.assertEqual(n.width_cm, 1)
        self.assertEqual(n.height_cm, 10)
        self.assertEqual(n.defaulted_fields, ["width"])
        self.assertTrue(n.used_defaults)
        item = fit_item_from_product(_prod(length=20, height=10, weight=0.5))
        layout = best_identical_unit_layout(FitContainer("L", 100, 50, 40), item)
        self.assertEqual(layout.confidence, FitConfidence.ESTIMATED)

    def test_04_missing_weight_zero_kg_estimated(self):
        n = normalize_product_logistics(_prod(length=20, width=10, height=5))
        self.assertEqual(n.weight_kg, 0.0)
        self.assertIn("weight", n.defaulted_fields)
        self.assertTrue(n.used_defaults)
        self.assertFalse(master_weight_complete_for_receiving(_prod(length=20, width=10, height=5)))

    def test_05_missing_stacking_safe_default(self):
        n = normalize_product_logistics(_prod(length=10, width=10, height=10, weight=1))
        self.assertEqual(n.stack_behavior, StackingMode.STACKABLE)
        self.assertFalse(n.compressible)
        self.assertIsNone(n.max_stack_count)
        self.assertFalse(n.fragile)

    def test_06_real_1x1x1_not_fallback(self):
        p = _prod(length=1, width=1, height=1, weight=0)
        n = normalize_product_logistics(p)
        self.assertFalse(n.used_defaults)
        self.assertTrue(n.dimensions_provided)
        self.assertTrue(dimension_provided(p.length))
        # Contrast: NULL is not provided even though runtime would be 1
        self.assertFalse(dimension_provided(None))
        item = fit_item_from_product(p)
        layout = best_identical_unit_layout(FitContainer("L", 10, 10, 10), item)
        self.assertEqual(layout.confidence, FitConfidence.EXACT)

    def test_07_validation_setting_off_does_not_block(self):
        p = _prod()  # null dims
        eff = resolve_effective_receiving_requirements(p, _wms(dims=False, weight=False))
        self.assertFalse(eff.require_recv_length)
        r = validate_required_product_data(p, _wms(dims=False, weight=False))
        self.assertTrue(r.complete)

    def test_08_validation_setting_on_requires_real_data(self):
        p = _prod()
        # Runtime fallback must NOT mutate master
        n = normalize_product_logistics(p)
        self.assertEqual(n.length_cm, 1.0)
        self.assertIsNone(p.length)
        eff = resolve_effective_receiving_requirements(p, _wms(dims=True, weight=True))
        self.assertTrue(eff.require_recv_length)
        r = validate_required_product_data(p, _wms(dims=True, weight=True))
        self.assertFalse(r.complete)
        keys = {m.key for m in r.missing}
        self.assertTrue({"length", "width", "height", "weight"} <= keys)
        # After real data entered — pass
        r2 = validate_required_product_data(
            _prod(length=20, width=10, height=5, weight=1.2),
            _wms(dims=True, weight=True),
        )
        self.assertTrue(r2.complete)

    def test_09_warehouse_capacity_with_fallback(self):
        from backend.services.slotting.capacity_presentation import product_location_capacity_dict
        from backend.services.slotting.location_capacity_solver import LocationCapacityResult

        item = fit_item_from_product(_prod())
        self.assertTrue(item.used_defaults)
        layout = best_identical_unit_layout(FitContainer("L", 40, 30, 20), item)
        solved = LocationCapacityResult(
            location_id=1,
            location_code="A-01",
            product_id=1,
            current_quantity=0,
            total_capacity=float(layout.capacity),
            additional_capacity=float(layout.capacity),
            selected_orientation=0,
            count_x=0,
            count_y=0,
            count_z=0,
            stacks_count=0,
            stacks=0,
            units_per_stack=0,
            utilization_percent=0,
            limiting_factor=layout.limiting_factor,
            method=layout.method.value,
            confidence=layout.confidence.value,
            explanation=layout.explanation,
            warnings=list(getattr(layout, "warnings", None) or []),
            used_defaults=True,
            defaulted_fields=list(item.defaulted_fields),
        )
        card = product_location_capacity_dict(solved, fit_item=item)
        self.assertTrue(card["used_defaults"])
        self.assertEqual(str(card["confidence"]).upper(), "UNKNOWN")
        self.assertFalse(card["capacity_numeric_trusted"])
        self.assertIsNone(card["additional_capacity"])
        self.assertIn("NIEOKREŚLONA", card["additional_capacity_label"].upper())

    def test_10_cartonization_with_fallback(self):
        missing = fit_item_from_product(_prod(id=2))
        r = solve_cartonization(items_with_qty=[(missing, 3)], cartons=[_carton()])
        self.assertTrue(r.fits)
        self.assertEqual(r.confidence, FitConfidence.ESTIMATED.value)
        self.assertTrue(any("TECHNICAL_LOGISTICS_DEFAULTS" in w for w in r.warnings))

    def test_11_smart_matching_cannot_bypass_physical_gate(self):
        order = SimpleNamespace(id=7, items=[], shipping_method_id=None)
        bad = SimpleNamespace(
            id="BAD",
            name="BAD",
            length_cm=10,
            width_cm=10,
            height_cm=10,
            packaging_type="box",
            material_type="",
            image_url=None,
            unit_cost=1,
            purchase_price=None,
            last_purchase_price_net=None,
        )
        smart = [
            PackagingSuggestionDraft(
                7, "SMART_MATCHING", "BAD", "BAD", "", None, 0.99, None, "hist", sort_key=2.0
            )
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

    def test_12_same_product_location_and_carton_rules(self):
        p = _prod(length=20, width=None, height=10, weight=None, stack_behavior=None)
        loc_item = fit_item_from_product(p)
        pack_item = fit_item_from_product(p)
        self.assertEqual(loc_item.length_cm, pack_item.length_cm)
        self.assertEqual(loc_item.width_cm, pack_item.width_cm)
        self.assertEqual(loc_item.height_cm, pack_item.height_cm)
        self.assertEqual(loc_item.weight_kg, pack_item.weight_kg)
        self.assertEqual(loc_item.used_defaults, pack_item.used_defaults)
        self.assertEqual(set(loc_item.defaulted_fields), set(pack_item.defaulted_fields))
        self.assertEqual(loc_item.stacking, pack_item.stacking)
        loc_layout = best_identical_unit_layout(FitContainer("L", 100, 50, 40), loc_item)
        pack = solve_cartonization(items_with_qty=[(pack_item, 1)], cartons=[_carton()])
        self.assertEqual(loc_layout.confidence, FitConfidence.ESTIMATED)
        self.assertEqual(pack.confidence, FitConfidence.ESTIMATED.value)


class TestNoParallelValidationSettings(unittest.TestCase):
    def test_policy_uses_wms_settings_not_invented_flags(self):
        p = _prod(validation_skip_dimensions=False)
        off = resolve_effective_receiving_requirements(p, _wms(dims=False, weight=False))
        on = resolve_effective_receiving_requirements(p, _wms(dims=True, weight=True))
        self.assertFalse(off.require_recv_length)
        self.assertTrue(on.require_recv_length and on.require_recv_weight)
        # Per-product skip still works against global ON
        skipped = _prod(validation_skip_dimensions=True, validation_skip_weight=True)
        skipped_eff = resolve_effective_receiving_requirements(skipped, _wms(dims=True, weight=True))
        self.assertFalse(skipped_eff.require_recv_length)
        self.assertFalse(skipped_eff.require_recv_weight)

    def test_normalizer_does_not_mutate_product(self):
        p = _prod()
        normalize_product_logistics(p)
        self.assertIsNone(p.length)
        self.assertIsNone(p.width)
        self.assertIsNone(p.height)
        self.assertIsNone(p.weight)


class TestLegacyReceivingPatchCompat(unittest.TestCase):
    """Keep older patch-style cases green."""

    def test_M3_no_require_passes(self):
        with patch(
            "backend.services.product_receiving_requirements.resolve_effective_receiving_requirements",
            return_value=EffectiveReceivingRequirements(),
        ):
            self.assertTrue(validate_required_product_data(_prod()).complete)


if __name__ == "__main__":
    unittest.main()
