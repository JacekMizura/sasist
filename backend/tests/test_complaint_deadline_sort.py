"""Regression: GET /complaints sort_by=deadline_urgency must work on SQLite and PostgreSQL."""

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.sqlite import dialect as sqlite_dialect

from backend.api.complaint import _complaint_deadline_urgency_order
from backend.models.complaint import Complaint


def test_deadline_urgency_order_sql_uses_process_status_column_sqlite():
    stmt = select(Complaint).order_by(*_complaint_deadline_urgency_order(dialect_name="sqlite"))
    sql = str(
        stmt.compile(
            dialect=sqlite_dialect(),
            compile_kwargs={"literal_binds": False},
        )
    )
    assert "complaint_process_status" in sql
    assert "complaints.status" not in sql
    assert "julianday" in sql


def test_deadline_urgency_order_sql_postgres_uses_date_diff_not_julianday():
    stmt = select(Complaint).order_by(*_complaint_deadline_urgency_order(dialect_name="postgresql"))
    sql = str(
        stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": False},
        )
    )
    assert "complaint_process_status" in sql
    assert "complaints.status" not in sql
    assert "julianday" not in sql.lower()
    assert "current_date" in sql.lower()


def test_deadline_urgency_query_runs_on_sqlite():
    from backend.database import SessionLocal

    db = SessionLocal()
    try:
        db.query(Complaint).order_by(*_complaint_deadline_urgency_order(dialect_name="sqlite")).limit(1).all()
    finally:
        db.close()
