import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parent.parent / "backend" / "test.db"
c = sqlite3.connect(db)
cur = c.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
inv_tables = [t for t in tables if 'invent' in t.lower() or 'stock' in t.lower() or 'location' in t.lower()]
print("relevant tables:", inv_tables)

for t in ["locations", "location_stock", "inventory", "product_inventory", "warehouse_stock"]:
    if t in tables:
        cur.execute(f"PRAGMA table_info({t})")
        print(f"\n{t} cols:", [x[1] for x in cur.fetchall()])
        cur.execute(f"SELECT * FROM {t} LIMIT 3")
        print(f"{t} sample:", cur.fetchall())

cur.execute("PRAGMA table_info(document_series)")
print("\ndocument_series cols:", [x[1] for x in cur.fetchall()])
cur.execute("SELECT id, subtype, warehouse_document_series_id FROM document_series LIMIT 8")
print("document_series:", cur.fetchall())

cur.execute(
    "SELECT id, status, pipeline_status, pipeline_failed_stage, pipeline_state_json "
    "FROM direct_sale_sessions WHERE id=1"
)
print("session 1:", cur.fetchall())
