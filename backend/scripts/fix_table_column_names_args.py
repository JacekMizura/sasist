"""Fix _table_column_names(conn, bare_ident) → quoted string args."""

from __future__ import annotations

import re
from pathlib import Path

path = Path(__file__).resolve().parents[2] / "backend" / "db" / "schema_upgrade.py"
text = path.read_text(encoding="utf-8")

text = text.replace("_table_column_names(conn, {table})", "_table_column_names(conn, table)")
text = text.replace("_table_column_names(conn, {tbl})", "_table_column_names(conn, tbl)")

pat = re.compile(r"_table_column_names\(conn, ([a-z_][a-z0-9_]*)\)")
text2, n = pat.subn(r'_table_column_names(conn, "\1")', text)
path.write_text(text2, encoding="utf-8")
print("quoted", n)
