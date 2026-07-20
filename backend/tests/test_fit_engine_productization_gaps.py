"""Productization gaps: shared shelf/rack weight + shipping method constraints."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.fit_engine.adapters import fit_item_from_product
from backend.services.packaging_engine.cartonization_solver import (
    ShippingPackageConstraints,
    effective_carton_payload_kg,
    solve_cartonization,
)
from backend.services.slotting.structural_weight import (
    StructuralWeightBudget,
    apply_weight_budget_to_additional,
)


def _prod(**kw):
    d = dict(
        id=1,
        name="P",
        length=10,
        width=10,
        height=10,
        weight=1.0,
        volume=None,
        orientation_type=None,
        stack_behavior="stackable",
        stack_compressible=False,
        compressed_height_cm=None,
        max_stack_weight=None,
        max_stack_count=None,
        fragile=False,
        shape_type="box",
        units_per_carton=0,
    )
    d.update(kw)
    return SimpleNamespace(**d)


def _carton(**kw):
    b = dict(
        id="C1",
        name="M",
        length_cm=50,
        width_cm=40,
        height_cm=40,
        internal_length_cm=50,
        internal_width_cm=40,
        internal_height_cm=40,
        max_payload_kg=30,
    )
    b.update(kw)
    return SimpleNamespace(**b)


class TestStructuralWeight(unittest.TestCase):
    def test_W8_shared_shelf_limits_additional(self):
        # Location remaining 100kg but shelf remaining 30kg → effective 30
        budget = StructuralWeightBudget(
            location_remaining_kg=100.0,
            shelf_remaining_kg=30.0,
            rack_remaining_kg=None,
            effective_remaining_kg=30.0,
            limiting_layer="shelf",
            shelf_max_kg=300.0,
            shelf_occupied_kg=270.0,
        )
        add, lim, warns = apply_weight_budget_to_additional(
            additional=100,
            unit_weight_kg=1.0,
            budget=budget,
            limiting_factor="space",
        )
        self.assertEqual(add, 30.0)
        self.assertEqual(lim, "shelf_weight")
        self.assertTrue(any("SHELF" in w for w in warns))

    def test_W9_rack_min_of_three(self):
        budget = StructuralWeightBudget(
            location_remaining_kg=100.0,
            shelf_remaining_kg=30.0,
            rack_remaining_kg=20.0,
            effective_remaining_kg=20.0,
            limiting_layer="rack",
            rack_max_kg=1500.0,
        )
        add, lim, _ = apply_weight_budget_to_additional(
            additional=50,
            unit_weight_kg=1.0,
            budget=budget,
            limiting_factor=None,
        )
        self.assertEqual(add, 20.0)
        self.assertEqual(lim, "rack_weight")


class TestShippingConstraints(unittest.TestCase):
    def test_effective_payload_min(self):
        c = _carton(max_payload_kg=30)
        ship = ShippingPackageConstraints(max_package_weight_kg=25)
        self.assertEqual(effective_carton_payload_kg(c, ship), 25.0)
        ship2 = ShippingPackageConstraints(max_package_weight_kg=40)
        self.assertEqual(effective_carton_payload_kg(c, ship2), 30.0)

    def test_P5_single_carton_rejected_by_shipping_weight(self):
        # 26 kg order, carton 30, shipping 25 → single carton NO FIT by weight
        item = fit_item_from_product(_prod(weight=26.0, length=5, width=5, height=5))
        r = solve_cartonization(
            items_with_qty=[(item, 1)],
            cartons=[_carton(max_payload_kg=30)],
            allow_multi_carton=False,
            shipping_constraints=ShippingPackageConstraints(max_package_weight_kg=25),
        )
        self.assertFalse(r.fits)
        self.assertTrue(any("WEIGHT" in (x.reason or "").upper() for x in r.rejected_cartons) or not r.fits)

    def test_P6_multi_carton_respects_shipping_weight(self):
        # 36 kg as 18 identical 2kg units → split into packages each <= 25
        item = fit_item_from_product(_prod(id=1, weight=2.0, length=5, width=5, height=5))
        r = solve_cartonization(
            items_with_qty=[(item, 18)],
            cartons=[_carton(id="C1", max_payload_kg=30)],
            allow_multi_carton=True,
            shipping_constraints=ShippingPackageConstraints(max_package_weight_kg=25),
        )
        self.assertTrue(r.fits)
        self.assertTrue(r.multi_carton_required or len(r.cartons) >= 1)
        for plan in r.cartons:
            self.assertLessEqual(plan.total_weight_kg, 25.0 + 1e-6)

    def test_P7_carton_tighter_than_shipping(self):
        item = fit_item_from_product(_prod(weight=1.0, length=5, width=5, height=5))
        r = solve_cartonization(
            items_with_qty=[(item, 1)],
            cartons=[_carton(max_payload_kg=30)],
            shipping_constraints=ShippingPackageConstraints(max_package_weight_kg=40),
        )
        self.assertTrue(r.fits)
        # Effective limit recorded via container (30)
        self.assertEqual(effective_carton_payload_kg(_carton(max_payload_kg=30), ShippingPackageConstraints(40)), 30)


if __name__ == "__main__":
    unittest.main()
