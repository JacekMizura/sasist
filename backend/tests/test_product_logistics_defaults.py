"""Missing logistics data policy + provenance + receiving validation."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.fit_engine.adapters import fit_item_from_product
from backend.services.fit_engine.geometry import best_identical_unit_layout
from backend.services.fit_engine.models import FitConfidence, FitContainer
from backend.services.product_logistics_normalizer import (
    normalize_product_logistics,
    dimension_provided,
    master_weight_complete_for_receiving,
)
from backend.services.product_receiving_requirements import validate_required_product_data
from backend.services.product_validation_policy import EffectiveReceivingRequirements


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


class _Eff:
    require_recv_height = True
    require_recv_width = True
    require_recv_length = True
    require_recv_weight = True
    require_recv_master_carton = False
    require_recv_master_carton_ean = False
    require_recv_master_carton_qty = False
    require_recv_master_carton_dims = False
    require_recv_master_carton_weight = False


class TestMissingDataNormalizer(unittest.TestCase):
    def test_M1_null_defaults_no_crash(self):
        n = normalize_product_logistics(_prod())
        self.assertEqual(n.length_cm, 1.0)
        self.assertEqual(n.width_cm, 1.0)
        self.assertEqual(n.height_cm, 1.0)
        self.assertEqual(n.weight_kg, 0.0)
        self.assertTrue(n.used_defaults)
        self.assertEqual(set(n.defaulted_fields), {"length", "width", "height", "weight"})
        item = fit_item_from_product(_prod())
        layout = best_identical_unit_layout(FitContainer("L", 100, 50, 40), item)
        self.assertGreater(layout.capacity, 0)
        self.assertNotEqual(layout.confidence, FitConfidence.EXACT)

    def test_M2_partial_width_default(self):
        n = normalize_product_logistics(_prod(length=20, height=10))
        self.assertEqual(n.length_cm, 20)
        self.assertEqual(n.width_cm, 1)
        self.assertEqual(n.height_cm, 10)
        self.assertIn("width", n.defaulted_fields)
        self.assertTrue(n.used_defaults)

    def test_M6_real_1x1x1_is_provided(self):
        n = normalize_product_logistics(_prod(length=1, width=1, height=1, weight=0.01))
        self.assertFalse(n.used_defaults)
        self.assertTrue(n.dimensions_provided)
        self.assertEqual(n.data_quality, "REAL")
        item = fit_item_from_product(_prod(length=1, width=1, height=1, weight=0.01))
        layout = best_identical_unit_layout(FitContainer("L", 10, 10, 10), item)
        self.assertEqual(layout.confidence, FitConfidence.EXACT)

    def test_M7_null_weight_not_provided(self):
        self.assertFalse(master_weight_complete_for_receiving(_prod(weight=None)))
        self.assertTrue(master_weight_complete_for_receiving(_prod(weight=0)))
        self.assertTrue(master_weight_complete_for_receiving(_prod(weight=1.5)))

    def test_M10_defaults_not_exact(self):
        item = fit_item_from_product(_prod())
        layout = best_identical_unit_layout(FitContainer("L", 100, 100, 100), item)
        self.assertEqual(layout.confidence, FitConfidence.ESTIMATED)


class TestReceivingVsDefaults(unittest.TestCase):
    def test_M3_no_require_passes(self):
        from unittest.mock import patch

        with patch(
            "backend.services.product_receiving_requirements.resolve_effective_receiving_requirements",
            return_value=EffectiveReceivingRequirements(
                require_recv_height=False,
                require_recv_width=False,
                require_recv_length=False,
                require_recv_weight=False,
                require_recv_master_carton=False,
                require_recv_master_carton_ean=False,
                require_recv_master_carton_qty=False,
                require_recv_master_carton_dims=False,
                require_recv_master_carton_weight=False,
            ),
        ):
            r = validate_required_product_data(_prod())
            self.assertTrue(r.complete)

    def test_M4_require_dims_null_fails(self):
        from unittest.mock import patch

        with patch(
            "backend.services.product_receiving_requirements.resolve_effective_receiving_requirements",
            return_value=_Eff(),
        ):
            r = validate_required_product_data(_prod())
            self.assertFalse(r.complete)
            keys = {m.key for m in r.missing}
            self.assertTrue({"length", "width", "height", "weight"} <= keys)

    def test_M4b_runtime_defaults_do_not_satisfy_master(self):
        """Normalizer fills 1x1x1 for fit, but master stays NULL → receiving still incomplete."""
        p = _prod()
        n = normalize_product_logistics(p)
        self.assertEqual(n.length_cm, 1.0)
        self.assertFalse(dimension_provided(p.length))
        from unittest.mock import patch

        with patch(
            "backend.services.product_receiving_requirements.resolve_effective_receiving_requirements",
            return_value=_Eff(),
        ):
            r = validate_required_product_data(p)
            self.assertFalse(r.complete)

    def test_M5_real_dims_pass(self):
        from unittest.mock import patch

        with patch(
            "backend.services.product_receiving_requirements.resolve_effective_receiving_requirements",
            return_value=_Eff(),
        ):
            r = validate_required_product_data(_prod(length=20, width=10, height=5, weight=1.2))
            self.assertTrue(r.complete)

    def test_M6_real_1cm_passes_receiving(self):
        from unittest.mock import patch

        with patch(
            "backend.services.product_receiving_requirements.resolve_effective_receiving_requirements",
            return_value=_Eff(),
        ):
            r = validate_required_product_data(_prod(length=1, width=1, height=1, weight=0))
            self.assertTrue(r.complete)


class TestPackingDefaultsConfidence(unittest.TestCase):
    def test_P12_P13_defaults_degrade_confidence(self):
        from backend.services.packaging_engine.cartonization_solver import solve_cartonization

        real = fit_item_from_product(_prod(id=1, length=10, width=10, height=10, weight=1))
        missing = fit_item_from_product(_prod(id=2))
        carton = SimpleNamespace(
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
        r = solve_cartonization(items_with_qty=[(real, 1), (missing, 1)], cartons=[carton])
        self.assertTrue(r.fits)
        self.assertEqual(r.confidence, FitConfidence.ESTIMATED.value)
        self.assertTrue(any("TECHNICAL_LOGISTICS_DEFAULTS" in w for w in r.warnings))


if __name__ == "__main__":
    unittest.main()
