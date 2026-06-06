"""Tiered schema policy — Tier 0 validation must pass on dev DB."""

from __future__ import annotations

import unittest

from backend.database import engine
from backend.db.schema_tiers import validate_core_schema


class TestSchemaTiers(unittest.TestCase):
    def test_validate_core_schema_passes(self) -> None:
        result = validate_core_schema(engine)
        self.assertTrue(result.ok)
        self.assertGreater(result.checked_tables, 0)
        self.assertEqual(len(result.mismatches), 0)


if __name__ == "__main__":
    unittest.main()
