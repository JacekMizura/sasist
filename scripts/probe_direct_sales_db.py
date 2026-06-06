"""Probe direct_sale_sessions in backend/test.db."""
import sqlite3
from pathlib import Path

db_path = Path(__file__).resolve().parent.parent / "backend" / "test.db"
print("DB:", db_path, "exists:", db_path.exists())
c = sqlite3.connect(db_path)
cur = c.cursor()
cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%direct%'"
)
print("direct tables:", cur.fetchall())
try:
    cur.execute(
        "SELECT id, status, pipeline_status, pipeline_failed_stage, order_id "
        "FROM direct_sale_sessions ORDER BY id DESC LIMIT 15"
    )
    print("sessions:", cur.fetchall())
except Exception as e:
    print("sessions query error:", e)
try:
    cur.execute("PRAGMA table_info(direct_sale_sessions)")
    print("columns:", [x[1] for x in cur.fetchall()])
except Exception as e:
    print("pragma error:", e)
