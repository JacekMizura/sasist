"""
Direct sale complete — PostgreSQL rejects FOR UPDATE on outer-join nullable side.

  python -m pytest backend/tests/test_direct_sale_session_for_update.py -q

Optional live PostgreSQL check (Railway / local):
  DATABASE_URL=postgresql://... python -m pytest backend/tests/test_direct_sale_session_for_update.py -q
"""

from __future__ import annotations

import os
import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import joinedload, sessionmaker

from backend.models.commerce_operational import DirectSaleSession
from backend.services.direct_sale.session_service import get_session_for_complete


def _compile_postgres_sql(query) -> str:
    return str(
        query.statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).upper()


class TestDirectSaleSessionForUpdateSql(unittest.TestCase):
    def test_joinedload_with_for_update_generates_outer_join_lock_sql(self):
        """Documents the anti-pattern PostgreSQL rejects (SQLite tolerates)."""
        engine = create_engine("sqlite:///:memory:")
        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            bad = (
                db.query(DirectSaleSession)
                .options(joinedload(DirectSaleSession.lines))
                .filter(DirectSaleSession.id == 1, DirectSaleSession.tenant_id == 1)
                .with_for_update()
            )
            sql = _compile_postgres_sql(bad)
            self.assertIn("LEFT OUTER JOIN", sql)
            self.assertIn("FOR UPDATE", sql)
            self.assertNotIn("FOR UPDATE OF", sql)
        finally:
            db.close()

    def test_session_lock_query_has_no_outer_join(self):
        engine = create_engine("sqlite:///:memory:")
        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            lock = (
                db.query(DirectSaleSession)
                .filter(DirectSaleSession.id == 1, DirectSaleSession.tenant_id == 1)
                .with_for_update()
            )
            sql = _compile_postgres_sql(lock)
            self.assertIn("FOR UPDATE", sql)
            self.assertNotIn("LEFT OUTER JOIN", sql)
        finally:
            db.close()


@unittest.skipUnless(
    (os.environ.get("DATABASE_URL") or "").startswith("postgres"),
    "needs PostgreSQL DATABASE_URL",
)
class TestGetSessionForCompletePostgres(unittest.TestCase):
    """Live regression: joinedload+with_for_update fails; split lock succeeds."""

    def test_joinedload_with_for_update_raises_on_postgres(self):
        from backend.database import SessionLocal

        db = SessionLocal()
        try:
            row = db.execute(
                text("SELECT id, tenant_id FROM direct_sale_sessions ORDER BY id DESC LIMIT 1")
            ).first()
            if row is None:
                self.skipTest("no direct_sale_sessions row in database")
            with self.assertRaises(Exception) as ctx:
                (
                    db.query(DirectSaleSession)
                    .options(joinedload(DirectSaleSession.lines))
                    .filter(
                        DirectSaleSession.id == int(row[0]),
                        DirectSaleSession.tenant_id == int(row[1]),
                    )
                    .with_for_update()
                    .first()
                )
            msg = str(ctx.exception).lower()
            self.assertTrue(
                "nullable side" in msg or "for update" in msg,
                f"expected PostgreSQL FOR UPDATE outer-join error, got: {ctx.exception!r}",
            )
            db.rollback()
        finally:
            db.close()

    def test_get_session_for_complete_does_not_raise_on_postgres(self):
        from backend.database import SessionLocal

        db = SessionLocal()
        try:
            row = db.execute(
                text(
                    """
                    SELECT id, tenant_id FROM direct_sale_sessions
                    ORDER BY id DESC LIMIT 1
                    """
                )
            ).first()
            if row is None:
                self.skipTest("no direct_sale_sessions row in database")
            sess = get_session_for_complete(db, int(row[0]), tenant_id=int(row[1]))
            if sess is not None:
                _ = list(sess.lines)
            db.rollback()
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
