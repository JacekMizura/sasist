"""_migrate_z_pz_series_padding must use DB column ``type``, not ORM name series_type."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text

from backend.db.z_pz_schema import _migrate_z_pz_series_padding


class TestZPzSeriesPaddingMigration(unittest.TestCase):
    def test_updates_warehouse_series_via_type_column(self) -> None:
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE document_series (
                        id TEXT PRIMARY KEY,
                        type TEXT NOT NULL,
                        subtype TEXT NOT NULL,
                        padding_length INTEGER NOT NULL DEFAULT 6
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO document_series (id, type, subtype, padding_length)
                    VALUES
                      ('wh', 'WAREHOUSE', 'PZ', 6),
                      ('sale', 'SALE', 'INVOICE', 6)
                    """
                )
            )

        _migrate_z_pz_series_padding(engine)

        with engine.connect() as conn:
            rows = {
                r[0]: r[1]
                for r in conn.execute(
                    text("SELECT id, padding_length FROM document_series")
                ).fetchall()
            }
        self.assertEqual(rows["wh"], 0)
        self.assertEqual(rows["sale"], 6)

    def test_skips_when_type_column_missing(self) -> None:
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE document_series (
                        id TEXT PRIMARY KEY,
                        subtype TEXT NOT NULL,
                        padding_length INTEGER NOT NULL DEFAULT 6
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "INSERT INTO document_series (id, subtype, padding_length) "
                    "VALUES ('x', 'PZ', 6)"
                )
            )

        # Must not raise (production bug was querying non-existent series_type).
        _migrate_z_pz_series_padding(engine)

        with engine.connect() as conn:
            pad = conn.execute(
                text("SELECT padding_length FROM document_series WHERE id = 'x'")
            ).scalar()
        self.assertEqual(pad, 6)


if __name__ == "__main__":
    unittest.main()
