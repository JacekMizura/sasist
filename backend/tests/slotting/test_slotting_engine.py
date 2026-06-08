"""Slotting / capacity engine tests."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.slotting_schema import ensure_slotting_schema
from backend.services.slotting.capacity_service import (
    calculate_location_capacity,
    location_volume_capacity_dm3,
    product_footprint_from_orm,
)
from backend.services.slotting.constraint_service import check_orientation_compatible, check_stacking_compatible
from backend.services.slotting.heatmap_service import build_warehouse_heatmap
from backend.services.slotting.occupancy_service import (
    aggregate_location_occupancy_from_inventory,
    capacity_state_from_utilization,
    utilization_percent,
)
from backend.services.slotting.putaway_strategy_service import _score_location
from backend.services.slotting.slotting_models import (
    ORIENTATION_UPRIGHT_ONLY,
    ProductFootprint,
    STACKING_NONE,
    STACKING_PALLET_ONLY,
    STRATEGY_CONSOLIDATE_SKU,
)


def _loc(**kw):
    defaults = dict(
        id=1,
        name="A1-01",
        warehouse_id=1,
        width=100.0,
        depth=100.0,
        height=100.0,
        is_active=True,
        occupied_volume_dm3=0.0,
        occupied_weight_kg=0.0,
        capacity_utilization_percent=0.0,
        type="pick",
        picking_priority=50,
        pick_sequence=10,
        max_weight_kg=500.0,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _product(**kw):
    defaults = dict(
        id=10,
        tenant_id=1,
        length=10.0,
        width=10.0,
        height=10.0,
        weight=1.0,
        volume=1.0,
        orientation_type="any",
        stack_behavior="stackable",
        stack_compressible=False,
        max_stack_weight=None,
        units_per_carton=12,
        carton_length_cm=40.0,
        carton_width_cm=30.0,
        carton_height_cm=20.0,
        carton_weight_kg=12.0,
        carton_volume_dm3=24.0,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


class TestCapacityFit(unittest.TestCase):
    def test_basic_fit_by_volume(self):
        loc = _loc()
        prod = _product(volume=1.0)
        fit = calculate_location_capacity(loc, prod, 50)
        self.assertTrue(fit.fits)
        self.assertGreater(fit.max_units, 0)
        self.assertIn(fit.limiting_factor, ("volume", "weight"))

    def test_weight_overflow(self):
        loc = _loc(max_weight_kg=5.0, width=200, depth=200, height=200)
        prod = _product(weight=2.0, volume=0.5)
        fit = calculate_location_capacity(loc, prod, 5)
        self.assertFalse(fit.fits)
        self.assertEqual(fit.failure_reason, "Location exceeds weight limit")
        self.assertEqual(fit.limiting_factor, "weight")

    def test_orientation_mismatch_missing_height(self):
        fp = ProductFootprint(
            product_id=1,
            length_cm=10,
            width_cm=10,
            height_cm=0,
            weight_kg=1,
            volume_dm3=1,
            orientation=ORIENTATION_UPRIGHT_ONLY,
        )
        ok, reason = check_orientation_compatible(fp, "pick")
        self.assertFalse(ok)
        self.assertIn("Orientation incompatible", reason or "")

    def test_stacking_none_blocks_multi_qty(self):
        fp = ProductFootprint(
            product_id=1,
            length_cm=10,
            width_cm=10,
            height_cm=10,
            weight_kg=1,
            volume_dm3=1,
            stacking_mode=STACKING_NONE,
        )
        ok, reason, layers = check_stacking_compatible(fp, packaging_carton=False, requested_qty=3)
        self.assertFalse(ok)
        self.assertIn("Stacking prohibited", reason or "")
        self.assertEqual(layers, 1)

    def test_stacking_pallet_only_unit_mode(self):
        fp = ProductFootprint(
            product_id=1,
            length_cm=10,
            width_cm=10,
            height_cm=10,
            weight_kg=1,
            volume_dm3=1,
            stacking_mode=STACKING_PALLET_ONLY,
        )
        ok, reason, _ = check_stacking_compatible(fp, packaging_carton=False, requested_qty=1)
        self.assertFalse(ok)
        self.assertIn("Pallet-only", reason or "")

    def test_max_stack_weight_caps_units(self):
        loc = _loc(max_weight_kg=1000.0)
        prod = _product(weight=2.0, volume=0.2, max_stack_weight=4.0)
        fit = calculate_location_capacity(loc, prod, 10)
        self.assertFalse(fit.fits)

    def test_carton_packaging_mode(self):
        loc = _loc()
        prod = _product()
        fit = calculate_location_capacity(loc, prod, 2, "CARTON")
        self.assertTrue(fit.fits)
        self.assertGreaterEqual(fit.max_cartons, 1)

    def test_no_dimensions_location_allows_unbounded(self):
        loc = _loc(width=0, depth=0, height=0, max_weight_kg=0)
        prod = _product()
        fit = calculate_location_capacity(loc, prod, 100)
        self.assertTrue(fit.fits)


class TestOccupancyAndHeatmap(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        with cls.engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY, tenant_id INTEGER)"))
            conn.execute(text("INSERT INTO warehouses (id, tenant_id) VALUES (1, 1)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE locations (
                        id INTEGER PRIMARY KEY,
                        warehouse_id INTEGER,
                        name VARCHAR(64),
                        width FLOAT,
                        depth FLOAT,
                        height FLOAT,
                        is_active BOOLEAN DEFAULT 1,
                        type VARCHAR(16),
                        location_type VARCHAR(20) DEFAULT 'NORMAL',
                        operational_zone_type VARCHAR(24),
                        sales_priority INTEGER DEFAULT 100,
                        picking_priority INTEGER DEFAULT 100,
                        replenishment_priority INTEGER DEFAULT 100,
                        pick_sequence INTEGER,
                        occupied_volume_dm3 FLOAT DEFAULT 0,
                        occupied_weight_kg FLOAT DEFAULT 0,
                        capacity_utilization_percent FLOAT DEFAULT 0,
                        max_weight_kg FLOAT,
                        created_at TIMESTAMP,
                        updated_at TIMESTAMP
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE products (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER,
                        length FLOAT,
                        width FLOAT,
                        height FLOAT,
                        weight FLOAT,
                        volume FLOAT,
                        orientation_type VARCHAR(32),
                        stack_behavior VARCHAR(32)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE inventory (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER,
                        warehouse_id INTEGER,
                        location_id INTEGER,
                        product_id INTEGER,
                        quantity FLOAT
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "INSERT INTO locations (id, warehouse_id, name, width, depth, height, is_active, type) "
                    "VALUES (1, 1, 'A1', 100, 100, 100, 1, 'pick')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO products (id, tenant_id, length, width, height, weight, volume, orientation_type, stack_behavior) "
                    "VALUES (10, 1, 10, 10, 10, 1, 1, 'any', 'stackable')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO inventory (id, tenant_id, warehouse_id, location_id, product_id, quantity) "
                    "VALUES (1, 1, 1, 1, 10, 50)"
                )
            )
        ensure_slotting_schema(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def test_utilization_percent(self):
        self.assertAlmostEqual(utilization_percent(250, 1000), 25.0)
        self.assertEqual(utilization_percent(0, 0), 0.0)

    def test_capacity_state_mapping(self):
        self.assertEqual(capacity_state_from_utilization(0), "EMPTY")
        self.assertEqual(capacity_state_from_utilization(50), "MEDIUM")
        self.assertEqual(capacity_state_from_utilization(101), "OVERFLOW")

    def test_occupancy_aggregate_from_inventory(self):
        db = self.Session()
        try:
            from unittest.mock import patch

            fp = product_footprint_from_orm(_product())
            with patch(
                "backend.services.slotting.occupancy_service.load_product_footprints_bulk",
                return_value={10: fp},
            ):
                occ_vol, occ_w = aggregate_location_occupancy_from_inventory(db, location_id=1)
            self.assertAlmostEqual(occ_vol, 50.0, places=2)
            self.assertAlmostEqual(occ_w, 50.0, places=2)
            util = utilization_percent(occ_vol, 1000.0)
            self.assertGreater(util, 0)
            self.assertEqual(capacity_state_from_utilization(util), "LOW")
        finally:
            db.close()

    def test_heatmap_with_simple_locations(self):
        db = self.Session()
        try:
            hm = build_warehouse_heatmap(db, warehouse_id=1, tenant_id=1)
            self.assertEqual(hm["warehouse_id"], 1)
            self.assertGreaterEqual(len(hm["locations"]), 1)
        finally:
            db.close()


class TestPutawaySuggestions(unittest.TestCase):
    def test_scoring_prefers_same_sku(self):
        from backend.services.slotting.putaway_strategy_service import _score_location

        score_same, tags_same = _score_location(
            capacity_fits=True,
            max_fit=20,
            remaining_pct=40,
            same_sku=True,
            pick_sequence=10,
            picking_priority=50,
            strategy=STRATEGY_CONSOLIDATE_SKU,
            zone_match=False,
        )
        score_empty, _ = _score_location(
            capacity_fits=True,
            max_fit=20,
            remaining_pct=40,
            same_sku=False,
            pick_sequence=10,
            picking_priority=50,
            strategy=STRATEGY_CONSOLIDATE_SKU,
            zone_match=False,
        )
        self.assertGreater(score_same, score_empty)
        self.assertIn("same_sku_present", tags_same)

    def test_validate_putaway_assignment_warnings(self):
        loc = _loc(max_weight_kg=1.0)
        prod = _product(weight=5.0, volume=0.1)
        fit = calculate_location_capacity(loc, prod, 1)
        self.assertFalse(fit.fits)
        self.assertTrue(fit.failure_reason)

    def test_product_footprint_volume_fallback(self):
        prod = _product(volume=0, length=20, width=10, height=5)
        fp = product_footprint_from_orm(prod)
        self.assertGreater(fp.volume_dm3, 0)

    def test_location_volume_capacity(self):
        loc = _loc(width=100, depth=50, height=20)
        self.assertAlmostEqual(location_volume_capacity_dm3(loc), 100.0, places=2)


if __name__ == "__main__":
    unittest.main()
