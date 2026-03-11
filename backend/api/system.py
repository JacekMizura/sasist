import logging
import os

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db, engine

router = APIRouter(prefix="/system", tags=["System"])
logger = logging.getLogger(__name__)

# Project root (parent of backend/)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", ".."))
CHANGELOG_PATH = os.path.join(_PROJECT_ROOT, "PROJECT_CHANGELOG.md")


@router.get("/health")
def system_health():
    return {
        "status": "ok",
        "service": "WMS backend"
    }


def _get_db_path():
    """Resolve SQLite database path from engine (same as database.py uses)."""
    raw = getattr(engine.url, "database", None) or "test.db"
    if not os.path.isabs(raw):
        raw = raw.lstrip("./\\")
        return os.path.abspath(os.path.join(_PROJECT_ROOT, raw))
    return os.path.abspath(raw)


@router.get("/db-size")
def database_size(db: Session = Depends(get_db)):
    db_path = _get_db_path()

    if not os.path.exists(db_path):
        size_mb = 0
        tables_count = 0
        total_rows = 0
        logger.info("Database path: %s (file not found)", db_path)
        logger.info("Database size MB: 0")
    else:
        size_bytes = os.path.getsize(db_path)
        size_mb = round(size_bytes / (1024 * 1024), 2)
        logger.info("Database path: %s", db_path)
        logger.info("Database size MB: %s", size_mb)

        # Number of tables (exclude sqlite_sequence)
        try:
            r = db.execute(text("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).fetchone()
            tables_count = r[0] if r else 0
        except Exception:
            tables_count = 0

        # Total rows across all user tables
        total_rows = 0
        try:
            tables = db.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).fetchall()
            for (tname,) in tables:
                safe_name = str(tname).replace('"', '""')
                row = db.execute(text(f'SELECT COUNT(*) FROM "{safe_name}"')).fetchone()
                total_rows += row[0] if row else 0
        except Exception:
            pass

    return {
        "database_size_mb": size_mb,
        "size_mb": size_mb,
        "tables_count": tables_count,
        "total_rows": total_rows,
    }


@router.get("/changelog", response_class=PlainTextResponse)
def get_changelog():
    """Return contents of PROJECT_CHANGELOG.md."""
    if not os.path.exists(CHANGELOG_PATH):
        return PlainTextResponse(content="# Changelog\n\n(File not found.)", status_code=404)
    try:
        with open(CHANGELOG_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        return PlainTextResponse(content=content)
    except Exception as e:
        logger.exception("Failed to read changelog: %s", e)
        return PlainTextResponse(content="# Changelog\n\n(Read error.)", status_code=500)


@router.get("/debug-counts")
def debug_counts(db: Session = Depends(get_db)):
    """
    Temporary debug endpoint: record counts for analytics-related tables.
    Use to verify import and why analytics may return empty results.
    """
    tables = [
        "orders",
        "order_items",
        "products",
        "inventory",
        "inventory_units",
        "stock",
        "picks",
        "inventory_movements",
    ]
    counts = {}
    for table in tables:
        try:
            row = db.execute(text(f"SELECT COUNT(*) as n FROM {table}")).fetchone()
            counts[table] = row[0] if row else 0
        except Exception as e:
            counts[table] = f"error: {e}"
    logger.info("debug_counts: %s", counts)
    return {"counts": counts}
