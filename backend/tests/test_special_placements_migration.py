"""Migration: locations specials → warehouse_special_placements."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text

from backend.db.warehouse_special_placements_schema import ensure_warehouse_special_placements_schema
from backend.models.location import Location
from backend.models.warehouse_special_placement import WarehouseSpecialPlacement
from backend.database import Base


class SpecialPlacementsMigrationTest(unittest.TestCase):
    def test_migrates_and_clears_location_geometry(self):
        engine = create_engine("sqlite:///:memory:")
        # Minimal parent tables for FKs
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO warehouses (id) VALUES (1)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE locations (
                        id INTEGER PRIMARY KEY,
                        warehouse_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        type TEXT NOT NULL DEFAULT 'pick',
                        location_type TEXT NOT NULL DEFAULT 'NORMAL',
                        x REAL,
                        y REAL,
                        z REAL,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        sales_priority INTEGER NOT NULL DEFAULT 100,
                        picking_priority INTEGER NOT NULL DEFAULT 100,
                        replenishment_priority INTEGER NOT NULL DEFAULT 100,
                        occupied_volume_dm3 REAL NOT NULL DEFAULT 0,
                        occupied_weight_kg REAL NOT NULL DEFAULT 0,
                        capacity_utilization_percent REAL NOT NULL DEFAULT 0
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO locations
                        (id, warehouse_id, name, type, location_type, x, y, z)
                    VALUES
                        (1, 1, 'START', 'pick', 'PICK_START', 100, 200, 0),
                        (2, 1, 'PACK', 'pick', 'PACKING', 300, 400, NULL),
                        (3, 1, 'DOCK-IN', 'floor', 'DOCK', NULL, NULL, NULL),
                        (4, 1, 'DOCK', 'floor', 'DOCK', 500, 600, NULL),
                        (5, 1, 'A-01', 'pick', 'NORMAL', 1, 2, 3)
                    """
                )
            )

        # Create placements table via ORM metadata subset
        WarehouseSpecialPlacement.__table__.create(bind=engine)

        ensure_warehouse_special_placements_schema(engine)

        with engine.connect() as conn:
            placements = conn.execute(
                text(
                    "SELECT role, x_cm, y_cm, location_id FROM warehouse_special_placements ORDER BY role"
                )
            ).fetchall()
            roles = {r[0]: r for r in placements}
            self.assertIn("PICK_START", roles)
            self.assertEqual(roles["PICK_START"][1], 100.0)
            self.assertEqual(roles["PICK_START"][2], 200.0)
            self.assertEqual(roles["PICK_START"][3], 1)
            self.assertIn("PACKING", roles)
            self.assertIn("DOCK", roles)
            # Prefer named DOCK over DOCK-IN
            self.assertEqual(roles["DOCK"][3], 4)
            self.assertEqual(roles["DOCK"][1], 500.0)

            specials = conn.execute(
                text(
                    "SELECT id, x, y, z FROM locations WHERE location_type IN ('PICK_START','PACKING','DOCK')"
                )
            ).fetchall()
            for _id, x, y, z in specials:
                self.assertIsNone(x)
                self.assertIsNone(y)
                self.assertIsNone(z)

            normal = conn.execute(
                text("SELECT x, y, z FROM locations WHERE id = 5")
            ).one()
            self.assertEqual(normal[0], 1.0)
            self.assertEqual(normal[1], 2.0)
            self.assertEqual(normal[2], 3.0)

        # Idempotent second run
        ensure_warehouse_special_placements_schema(engine)
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM warehouse_special_placements")).scalar()
            self.assertEqual(int(count), 3)


if __name__ == "__main__":
    unittest.main()
