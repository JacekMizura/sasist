"""Tests for global + per-product validation policy resolution."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.product_validation_policy import resolve_effective_receiving_requirements


class ProductValidationPolicyTests(unittest.TestCase):
    def test_global_with_product_skip(self):
        settings = SimpleNamespace(
            validation_policy_migrated=True,
            validation_require_dimensions=True,
            validation_require_weight=True,
            validation_require_batch=True,
            validation_require_expiry=False,
            validation_require_serial=False,
            validation_require_master_carton=False,
            validation_require_master_carton_ean=False,
            validation_require_master_carton_qty=False,
            validation_require_master_carton_dims=False,
            validation_require_master_carton_weight=False,
        )
        product = SimpleNamespace(
            validation_skip_dimensions=False,
            validation_skip_weight=True,
            validation_skip_batch=True,
            validation_skip_expiry=False,
            validation_skip_serial=False,
            validation_skip_master_carton=False,
            validation_skip_master_carton_ean=False,
            validation_skip_master_carton_qty=False,
            validation_skip_master_carton_dims=False,
            validation_skip_master_carton_weight=False,
            require_recv_height=False,
            require_recv_width=False,
            require_recv_length=False,
            require_recv_weight=False,
            require_recv_master_carton=False,
            require_recv_master_carton_ean=False,
            require_recv_master_carton_qty=False,
            require_recv_master_carton_dims=False,
            require_recv_master_carton_weight=False,
            track_batch=False,
            track_expiry=False,
            track_serial=False,
        )
        eff = resolve_effective_receiving_requirements(product, settings)
        self.assertTrue(eff.require_recv_height)
        self.assertTrue(eff.require_recv_width)
        self.assertTrue(eff.require_recv_length)
        self.assertFalse(eff.require_recv_weight)
        self.assertFalse(eff.track_batch)

    def test_legacy_mode_without_migration(self):
        product = SimpleNamespace(
            validation_skip_dimensions=False,
            validation_skip_weight=False,
            validation_skip_batch=False,
            validation_skip_expiry=False,
            validation_skip_serial=False,
            validation_skip_master_carton=False,
            validation_skip_master_carton_ean=False,
            validation_skip_master_carton_qty=False,
            validation_skip_master_carton_dims=False,
            validation_skip_master_carton_weight=False,
            require_recv_height=True,
            require_recv_width=True,
            require_recv_length=True,
            require_recv_weight=False,
            require_recv_master_carton=False,
            require_recv_master_carton_ean=False,
            require_recv_master_carton_qty=False,
            require_recv_master_carton_dims=False,
            require_recv_master_carton_weight=False,
            track_batch=True,
            track_expiry=False,
            track_serial=False,
        )
        eff = resolve_effective_receiving_requirements(product, None)
        self.assertTrue(eff.require_recv_height)
        self.assertTrue(eff.track_batch)


if __name__ == "__main__":
    unittest.main()
