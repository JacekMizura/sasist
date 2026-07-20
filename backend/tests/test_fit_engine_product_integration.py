"""Product integration tests — capacity contract, distribution plan, packaging enrichment."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.fit_engine.models import FitContainer, FitItem, OrientationMode, StackingMode
from backend.services.packaging_engine.decision import finalize_primary_packaging
from backend.services.packaging_engine.presentation import map_reject_reason_to_operator
from backend.services.packaging_engine.suggestions import PackagingSuggestionDraft
from backend.services.slotting.capacity_presentation import (
    additional_capacity_copy,
    product_location_capacity_dict,
)
from backend.services.slotting.location_capacity_solver import LocationCapacityResult
from backend.services.slotting.putaway_distribution_service import build_putaway_distribution_plan


def _cap(**kw):
    defaults = dict(
        location_id=1,
        location_code="A-01",
        product_id=10,
        current_quantity=12,
        total_capacity=20,
        additional_capacity=8,
        selected_orientation=0,
        count_x=2,
        count_y=2,
        count_z=5,
        stacks_count=4,
        stacks=4,
        units_per_stack=5,
        utilization_percent=60.0,
        limiting_factor="space",
        method="GEOMETRIC",
        confidence="EXACT",
        explanation="ok",
        warnings=[],
    )
    defaults.update(kw)
    return LocationCapacityResult(**defaults)


class TestCapacityContract(unittest.TestCase):
    def test_case1_additional_8(self):
        d = product_location_capacity_dict(_cap())
        self.assertEqual(d["current_quantity"], 12)
        self.assertEqual(d["total_capacity"], 20)
        self.assertEqual(d["additional_capacity"], 8)
        self.assertEqual(d["additional_capacity_label"], "Można dołożyć 8 szt.")

    def test_case2_estimated_copy(self):
        d = product_location_capacity_dict(_cap(confidence="ESTIMATED"))
        self.assertIn("Szacunkowo", d["additional_capacity_label"])
        self.assertNotEqual(additional_capacity_copy(additional=8, confidence="EXACT"), d["additional_capacity_label"])

    def test_case3_full(self):
        d = product_location_capacity_dict(_cap(current_quantity=20, additional_capacity=0, utilization_percent=100))
        self.assertEqual(d["additional_capacity"], 0)
        self.assertIn("pełna", d["additional_capacity_label"].lower())

    def test_case10_unknown(self):
        msg = additional_capacity_copy(additional=0, confidence="UNKNOWN")
        self.assertIn("Brak danych", msg)


class TestDistributionPlanner(unittest.TestCase):
    def test_case7_50_split_heuristic(self):
        """Mock ranked locations with fixed additional capacities → 8+20+20+2."""
        from backend.services.slotting import putaway_distribution_service as pds

        cards = [
            {
                "product_id": 1,
                "location_id": 1,
                "location_code": "A-01",
                "current_quantity": 12,
                "total_capacity": 20,
                "additional_capacity": 8,
                "utilization_percent": 60,
                "method": "GEOMETRIC",
                "confidence": "EXACT",
                "limiting_factor": "space",
                "limiting_factor_label": "PRZESTRZEŃ",
                "selected_orientation": 0,
                "stacks": 1,
                "units_per_stack": 1,
                "warnings": [],
                "explanation": "",
                "additional_capacity_label": "",
                "capacity_ratio_label": "",
            },
            {
                "product_id": 1,
                "location_id": 2,
                "location_code": "B-04",
                "current_quantity": 0,
                "total_capacity": 20,
                "additional_capacity": 20,
                "utilization_percent": 0,
                "method": "GEOMETRIC",
                "confidence": "EXACT",
                "limiting_factor": None,
                "limiting_factor_label": None,
                "selected_orientation": 0,
                "stacks": 1,
                "units_per_stack": 1,
                "warnings": [],
                "explanation": "",
                "additional_capacity_label": "",
                "capacity_ratio_label": "",
            },
            {
                "product_id": 1,
                "location_id": 3,
                "location_code": "B-05",
                "current_quantity": 0,
                "total_capacity": 20,
                "additional_capacity": 20,
                "utilization_percent": 0,
                "method": "GEOMETRIC",
                "confidence": "EXACT",
                "limiting_factor": None,
                "limiting_factor_label": None,
                "selected_orientation": 0,
                "stacks": 1,
                "units_per_stack": 1,
                "warnings": [],
                "explanation": "",
                "additional_capacity_label": "",
                "capacity_ratio_label": "",
            },
            {
                "product_id": 1,
                "location_id": 4,
                "location_code": "C-01",
                "current_quantity": 0,
                "total_capacity": 10,
                "additional_capacity": 10,
                "utilization_percent": 0,
                "method": "GEOMETRIC",
                "confidence": "EXACT",
                "limiting_factor": None,
                "limiting_factor_label": None,
                "selected_orientation": 0,
                "stacks": 1,
                "units_per_stack": 1,
                "warnings": [],
                "explanation": "",
                "additional_capacity_label": "",
                "capacity_ratio_label": "",
            },
        ]

        class FakeSug:
            def __init__(self, lid, code, same, score):
                self.location_id = lid
                self.location_code = code
                self.same_sku_present = same
                self.score = score

        ranked = [
            FakeSug(1, "A-01", True, 80),
            FakeSug(2, "B-04", False, 50),
            FakeSug(3, "B-05", False, 49),
            FakeSug(4, "C-01", False, 40),
        ]

        db = MagicMock()
        product = SimpleNamespace(id=1, tenant_id=1)
        db.query.return_value.filter.return_value.first.return_value = product
        locs = [SimpleNamespace(id=c["location_id"], name=c["location_code"]) for c in cards]
        # Location query .filter.in_.all
        db.query.return_value.filter.return_value.all.return_value = locs

        orig_suggest = pds.suggest_putaway_locations
        orig_solve = pds.solve_location_capacity
        orig_dict = pds.product_location_capacity_dict

        def fake_suggest(*a, **k):
            return ranked

        def fake_solve(db, *, location, product, packaging_mode="UNIT"):
            return SimpleNamespace(**{**cards[0], "location_id": int(location.id)})

        card_by = {c["location_id"]: c for c in cards}

        def fake_dict(solved):
            lid = int(getattr(solved, "location_id", 0) or solved.get("location_id") if isinstance(solved, dict) else 0)
            # solved may be namespace from fake_solve — use location from call chain via location_id on namespace
            lid = int(getattr(solved, "location_id", 0))
            return dict(card_by[lid])

        pds.suggest_putaway_locations = fake_suggest
        pds.solve_location_capacity = lambda db, location, product, packaging_mode="UNIT": SimpleNamespace(
            **card_by[int(location.id)]
        )
        pds.product_location_capacity_dict = lambda solved: dict(card_by[int(getattr(solved, "location_id"))])

        try:
            plan = build_putaway_distribution_plan(
                db, tenant_id=1, warehouse_id=1, product_id=1, quantity=50
            )
        finally:
            pds.suggest_putaway_locations = orig_suggest
            pds.solve_location_capacity = orig_solve
            pds.product_location_capacity_dict = orig_dict

        qtys = [a.allocated_quantity for a in plan.allocations]
        self.assertEqual(sum(qtys), 50)
        self.assertEqual(plan.remaining_quantity, 0)
        self.assertEqual(qtys[0], 8)
        self.assertIn(20.0, qtys)
        self.assertEqual(qtys[-1], 2)

    def test_case9_insufficient(self):
        from backend.services.slotting import putaway_distribution_service as pds

        card = {
            "product_id": 1,
            "location_id": 1,
            "location_code": "A-01",
            "current_quantity": 18,
            "total_capacity": 20,
            "additional_capacity": 2,
            "utilization_percent": 90,
            "method": "GEOMETRIC",
            "confidence": "EXACT",
            "limiting_factor": None,
            "limiting_factor_label": None,
            "selected_orientation": 0,
            "stacks": 1,
            "units_per_stack": 1,
            "warnings": [],
            "explanation": "",
            "additional_capacity_label": "",
            "capacity_ratio_label": "",
        }

        class FakeSug:
            location_id = 1
            location_code = "A-01"
            same_sku_present = True
            score = 90

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id=1, tenant_id=1)
        db.query.return_value.filter.return_value.all.return_value = [SimpleNamespace(id=1, name="A-01")]
        orig_s = pds.suggest_putaway_locations
        orig_sol = pds.solve_location_capacity
        orig_d = pds.product_location_capacity_dict
        pds.suggest_putaway_locations = lambda *a, **k: [FakeSug()]
        pds.solve_location_capacity = lambda *a, **k: SimpleNamespace(**card)
        pds.product_location_capacity_dict = lambda s: dict(card)
        try:
            plan = build_putaway_distribution_plan(db, tenant_id=1, warehouse_id=1, product_id=1, quantity=50)
        finally:
            pds.suggest_putaway_locations = orig_s
            pds.solve_location_capacity = orig_sol
            pds.product_location_capacity_dict = orig_d
        self.assertEqual(plan.allocated_quantity, 2)
        self.assertEqual(plan.remaining_quantity, 48)
        self.assertIn("INSUFFICIENT_CAPACITY", plan.warnings)


class TestPackagingIntegration(unittest.TestCase):
    def test_case13_reject_reason_label(self):
        label = map_reject_reason_to_operator("ITEM_DIMENSION_EXCEEDS_CONTAINER").lower()
        self.assertIn("produkt", label)
        self.assertTrue("du" in label or "wymiar" in label)

    def test_case14_weight_reason(self):
        self.assertIn("wag", map_reject_reason_to_operator("WEIGHT_EXCEEDED").lower())

    def test_case20_smart_never_promotes_nofit(self):
        order = SimpleNamespace(id=1, items=[], shipping_method_id=None)
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
            PackagingSuggestionDraft(1, "SMART_MATCHING", "BAD", "BAD", "", None, 0.99, None, "hist", sort_key=2)
        ]
        primary, _ = finalize_primary_packaging(
            order,
            [bad],
            smart,
            eligible_carton_ids=set(),
            smart_bonus_by_id={"BAD": 1.0},
            demand_cm3=100,
        )
        self.assertIsNone(primary)

    def test_case19_fit_plan_serialization_shape(self):
        from backend.services.packaging_engine.cartonization_solver import PackagingFitResult, CartonPlan, CartonPlanItem

        r = PackagingFitResult(
            fits=True,
            recommended_carton_id="M",
            cartons=[
                CartonPlan(
                    carton_id="M",
                    carton_name="Karton M",
                    items=[CartonPlanItem(1, 2, "A")],
                    usable_dimensions={"length_cm": 40, "width_cm": 30, "height_cm": 20},
                    fill_percent=74,
                    total_weight_kg=8.2,
                    confidence="EXACT",
                    volume_utilization=74,
                )
            ],
            multi_carton_required=False,
            method="GEOMETRIC",
            confidence="EXACT",
            explanation="ok",
        )
        d = r.to_dict()
        self.assertEqual(d["carton_count"], 1)
        self.assertIn("plan", d)
        self.assertEqual(d["plan"][0]["usable_dimensions"]["length_cm"], 40)


if __name__ == "__main__":
    unittest.main()
