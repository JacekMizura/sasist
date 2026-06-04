"""One-off: replace sqlite_master / PRAGMA table_info probes in schema_upgrade.py."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / "backend" / "db" / "schema_upgrade.py"
text = path.read_text(encoding="utf-8")

marker = "logger = logging.getLogger(__name__)"
imp = """logger = logging.getLogger(__name__)

from .schema_introspection import (
    get_table_column_names as _table_column_names,
    has_index as _has_index,
    has_table as _table_exists,
)
"""
if "from .schema_introspection import" not in text:
    text = text.replace(marker, imp, 1)

# conn.execute(text("SELECT 1 FROM sqlite_master ...")).fetchone() — one line
pat1 = re.compile(
    r'conn\.execute\(\s*text\(\s*"SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=\'([^\']+)\' LIMIT 1"\s*\)\s*\)\.fetchone\(\)',
)
text, c1 = pat1.subn(r'_table_exists(conn, "\1")', text)

pat1b = re.compile(
    r"conn\.execute\(text\(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name='([^']+)' LIMIT 1\"\)\)\.fetchone\(\)",
)
text, c1b = pat1b.subn(r'_table_exists(conn, "\1")', text)

# multiline
pat_ml = re.compile(
    r"conn\.execute\(\s*\n\s*text\(\s*\"SELECT 1 FROM sqlite_master WHERE type='table' AND name='([^']+)' LIMIT 1\"\s*\)\s*\n\s*\)\.fetchone\(\)",
)
text, c_ml = pat_ml.subn(r'_table_exists(conn, "\1")', text)

# double-quoted SQL strings (some lines use """...)
pat_dq = re.compile(
    r'conn\.execute\(\s*text\(\s*"""[\s\n]*SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=\'([^\']+)\' LIMIT 1[\s\n]*"""\s*\)\s*\)\.fetchone\(\)',
)
text, c_dq = pat_dq.subn(r'_table_exists(conn, "\1")', text)

# :t bind param
pat_t = re.compile(
    r"conn\.execute\(\s*text\(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t LIMIT 1\"\),\s*\{\"t\": tbl\},\s*\)\.fetchone\(\)",
)
text, c_t = pat_t.subn(r"_table_exists(conn, tbl)", text)

# index — capture name='...'
pat_idx = re.compile(
    r"idx = conn\.execute\(\s*text\(\s*\"SELECT 1 FROM sqlite_master WHERE type='index'[^\"]+\"\s*\)\s*\)\.fetchone\(\)",
    re.DOTALL,
)
text, c_idx = pat_idx.subn(
    '_has_index(conn, "uq_shipping_method_tenant_wh_code")',
    text,
    count=1,
)

# Generic index pattern (remaining)
def _replace_index(m: re.Match) -> str:
    block = m.group(0)
    nm = re.search(r"name='([^']+)'", block)
    if nm:
        return f'_has_index(conn, "{nm.group(1)}")'
    return block


pat_idx2 = re.compile(
    r"conn\.execute\(\s*text\(\s*\"SELECT 1 FROM sqlite_master WHERE type='index'[^\"]+\"\s*\)\s*\)\.fetchone\(\)",
    re.DOTALL,
)
text, c_idx2 = pat_idx2.subn(_replace_index, text)

# PRAGMA table_info
pat_pragma = re.compile(
    r"\{row\[1\] for row in conn\.execute\(text\((?:f)?\"PRAGMA table_info\(([^)]+)\)\"\)\)\.fetchall\(\)\}",
)
text, c_pr = pat_pragma.subn(r"_table_column_names(conn, \1)", text)

# ensure_order_issue_tasks_archive_columns → delegate
archive_old = re.compile(
    r"def ensure_order_issue_tasks_archive_columns\(engine: Engine\) -> None:.*?(?=\ndef )",
    re.DOTALL,
)
archive_new = '''def ensure_order_issue_tasks_archive_columns(engine: Engine) -> None:
    """Soft archive: ``archived_at``, ``archived_by_user_id`` (SQLite + PostgreSQL)."""
    from .schema_introspection import ensure_order_issue_tasks_archive_columns as _impl

    _impl(engine)


'''
if "ensure_order_issue_tasks_archive_columns as _impl" not in text:
    m = archive_old.search(text)
    if m and "schema_introspection" not in m.group(0):
        text = archive_old.sub(archive_new, text, count=1)

# complaint_shipments: sqlite-only DDL introspection
text = text.replace(
    """    create_sql = conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name='complaint_shipments'")
    ).fetchone()
    if create_sql and create_sql[0]:""",
    """    from .schema_introspection import get_engine as _get_engine

    create_sql = None
    if _get_engine(conn).dialect.name == "sqlite":
        create_sql = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='complaint_shipments'")
        ).fetchone()
    if create_sql and create_sql[0]:""",
)

path.write_text(text, encoding="utf-8")
remaining = text.count("sqlite_master")
print("counts", c1, c1b, c_ml, c_dq, c_t, c_idx, c_idx2, c_pr)
print("remaining sqlite_master", remaining)
