"""Migration safety: collective_return_receipt must not be flipped for other tenants."""

from __future__ import annotations

import inspect
import unittest
from unittest.mock import MagicMock, patch

import backend.db.z_pz_schema as z_pz_schema
from backend.db.z_pz_schema import _ensure_tenant1_z_pz_per_rmz


class TestTenant1ZPzPerRmzMigration(unittest.TestCase):
    def test_sql_scopes_to_tenant_1_only(self) -> None:
        engine = MagicMock()
        engine.dialect.name = "postgresql"
        conn = MagicMock()
        result = MagicMock()
        result.rowcount = 2
        conn.execute.return_value = result
        cm = MagicMock()
        cm.__enter__.return_value = conn
        cm.__exit__.return_value = False
        engine.begin.return_value = cm

        with (
            patch("backend.db.z_pz_schema.has_table", return_value=True),
            patch(
                "backend.db.z_pz_schema.get_table_column_names",
                return_value={"collective_return_receipt", "subtype", "tenant_id"},
            ),
        ):
            _ensure_tenant1_z_pz_per_rmz(engine)

        sql = str(conn.execute.call_args.args[0])
        self.assertIn("tenant_id = 1", sql)
        self.assertIn("collective_return_receipt", sql)
        self.assertIn("WHERE tenant_id = 1", sql)

    def test_no_global_flip_helper_exists(self) -> None:
        names = [n for n, _ in inspect.getmembers(z_pz_schema, inspect.isfunction)]
        self.assertNotIn("_migrate_z_pz_series_per_rmz_default", names)
        src = inspect.getsource(z_pz_schema.ensure_z_pz_schema)
        self.assertIn("_ensure_tenant1_z_pz_per_rmz", src)
        self.assertNotIn("_migrate_z_pz_series_per_rmz_default", src)


if __name__ == "__main__":
    unittest.main()
