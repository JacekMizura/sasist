"""Trusted capacity vs computational fallback (putaway UX / ranking / plan)."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.fit_engine.adapters import fit_item_from_product
from backend.services.packaging_engine.cartonization_solver import solve_cartonization
from backend.services.slotting.capacity_presentation import product_location_capacity_dict
from backend.services.slotting.capacity_trust import (
    geometry_source_from_defaults,
    resolve_trusted_capacity,
)
from backend.services.slotting.putaway_strategy_service import _score_location


def _prod(**kw):
    d = dict(
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
    )
    d.update(kw)
    return SimpleNamespace(**d)


class TestCapacityTrust(unittest.TestCase):
    def test_A_fallback_geometry_not_trusted(self):
        item = fit_item_from_product(_prod())
        self.assertEqual(geometry_source_from_defaults(item.defaulted_fields), "FALLBACK")
        trust = resolve_trusted_capacity(
            geometric_additional=160000,
            geometric_total=160000,
            current_qty=0,
            defaulted_fields=item.defaulted_fields,
            unit_weight_kg=0,
            weight_remaining_kg=None,
        )
        self.assertFalse(trust["capacity_numeric_trusted"])
        self.assertEqual(trust["capacity_confidence"], "UNKNOWN")
        self.assertIsNone(trust["additional_capacity"])
        card = product_location_capacity_dict(
            {
                "product_id": 1,
                "location_id": 1,
                "location_code": "A11",
                "current_quantity": 0,
                **{k: trust[k] for k in (
                    "additional_capacity",
                    "total_capacity",
                    "geometry_source",
                    "capacity_numeric_trusted",
                    "computational_additional_capacity",
                    "computational_total_capacity",
                    "planning_additional_capacity",
                )},
                "confidence": trust["capacity_confidence"],
                "method": "GEOMETRIC",
                "warnings": [],
                "used_defaults": True,
                "defaulted_fields": list(item.defaulted_fields),
            }
        )
        self.assertFalse(card["capacity_numeric_trusted"])
        self.assertIsNone(card["additional_capacity"])
        self.assertIn("NIEOKREŚLONA", card["additional_capacity_label"].upper())
        self.assertNotIn("160000", card["capacity_ratio_label"])
        self.assertNotIn("63000", card["capacity_ratio_label"])

    def test_B_real_1x1x1_trusted(self):
        item = fit_item_from_product(_prod(length=1, width=1, height=1, weight=0.01))
        self.assertEqual(geometry_source_from_defaults(item.defaulted_fields), "REAL_DATA")
        trust = resolve_trusted_capacity(
            geometric_additional=100,
            geometric_total=100,
            current_qty=0,
            defaulted_fields=item.defaulted_fields,
            unit_weight_kg=0.01,
            weight_remaining_kg=None,
        )
        self.assertTrue(trust["capacity_numeric_trusted"])
        self.assertEqual(trust["additional_capacity"], 100)

    def test_C_weight_known_geometry_unknown(self):
        item = fit_item_from_product(_prod(weight=20))
        trust = resolve_trusted_capacity(
            geometric_additional=99999,
            geometric_total=99999,
            current_qty=0,
            defaulted_fields=item.defaulted_fields,
            unit_weight_kg=20,
            weight_remaining_kg=40,
        )
        self.assertEqual(trust["geometry_source"], "FALLBACK")
        self.assertTrue(trust["capacity_numeric_trusted"])
        self.assertEqual(trust["additional_capacity"], 2.0)
        self.assertEqual(trust["capacity_confidence"], "ESTIMATED")

    def test_E_planning_probe_not_500(self):
        trust = resolve_trusted_capacity(
            geometric_additional=160000,
            geometric_total=160000,
            current_qty=0,
            defaulted_fields=["length", "width", "height", "weight"],
            unit_weight_kg=0,
            weight_remaining_kg=None,
        )
        self.assertEqual(trust["planning_additional_capacity"], 1.0)
        self.assertIsNone(trust["additional_capacity"])

    def test_G_ranking_ignores_synthetic_max_fit(self):
        s_small, _ = _score_location(
            capacity_fits=True,
            max_fit=63000,
            remaining_pct=0,
            same_sku=False,
            pick_sequence=1,
            picking_priority=100,
            strategy="CONSOLIDATE_SKU",
            zone_match=False,
            capacity_numeric_trusted=False,
        )
        s_huge, _ = _score_location(
            capacity_fits=True,
            max_fit=160000,
            remaining_pct=0,
            same_sku=False,
            pick_sequence=2,
            picking_priority=100,
            strategy="CONSOLIDATE_SKU",
            zone_match=False,
            capacity_numeric_trusted=False,
        )
        self.assertEqual(s_small, s_huge)

        s_real_big, _ = _score_location(
            capacity_fits=True,
            max_fit=160000,
            remaining_pct=0,
            same_sku=False,
            pick_sequence=1,
            picking_priority=100,
            strategy="CONSOLIDATE_SKU",
            zone_match=False,
            capacity_numeric_trusted=True,
        )
        s_real_small, _ = _score_location(
            capacity_fits=True,
            max_fit=20,
            remaining_pct=0,
            same_sku=False,
            pick_sequence=1,
            picking_priority=100,
            strategy="CONSOLIDATE_SKU",
            zone_match=False,
            capacity_numeric_trusted=True,
        )
        self.assertGreater(s_real_big, s_real_small)

    def test_F_packing_geometry_fallback_not_exact(self):
        item = fit_item_from_product(_prod())
        carton = SimpleNamespace(
            id="C1",
            name="XS",
            length_cm=10,
            width_cm=10,
            height_cm=10,
            internal_length_cm=10,
            internal_width_cm=10,
            internal_height_cm=10,
            max_payload_kg=50,
        )
        r = solve_cartonization(items_with_qty=[(item, 1)], cartons=[carton])
        self.assertNotEqual(r.confidence, "EXACT")
        self.assertTrue(any("GEOMETRY_SOURCE_FALLBACK" in w or "TECHNICAL" in w for w in r.warnings))


if __name__ == "__main__":
    unittest.main()
