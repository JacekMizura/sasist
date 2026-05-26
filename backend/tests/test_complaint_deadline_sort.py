"""Regression: GET /complaints sort_by=deadline_urgency must not reference non-existent complaints.status."""

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import dialect as sqlite_dialect

from backend.api.complaint import _complaint_deadline_urgency_order
from backend.models.complaint import Complaint


def test_deadline_urgency_order_sql_uses_process_status_column():
    stmt = select(Complaint).order_by(*_complaint_deadline_urgency_order())
    sql = str(
        stmt.compile(
            dialect=sqlite_dialect(),
            compile_kwargs={"literal_binds": False},
        )
    )
    assert "complaint_process_status" in sql
    # Broken raw fragment used ORM name `status` as table column:
    assert "complaints.status" not in sql


def test_deadline_urgency_query_runs_on_sqlite():
    from backend.database import SessionLocal

    db = SessionLocal()
    try:
        db.query(Complaint).order_by(*_complaint_deadline_urgency_order()).limit(1).all()
    finally:
        db.close()
