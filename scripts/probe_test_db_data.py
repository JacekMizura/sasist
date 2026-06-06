"""Probe test.db for data usable in direct sales complete repro."""
import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parent.parent / "backend" / "test.db"
c = sqlite3.connect(db)
cur = c.cursor()

def q(sql, params=()):
    try:
        cur.execute(sql, params)
        return cur.fetchall()
    except Exception as e:
        return f"ERR: {e}"

print("tenants:", q("SELECT id, name FROM tenants LIMIT 5"))
print("warehouses:", q("SELECT id, tenant_id, name FROM warehouses LIMIT 5"))
print("products:", q("SELECT id, name, symbol FROM products LIMIT 5"))
print("locations:", q("SELECT id, warehouse_id, code FROM locations LIMIT 8"))
print("inventory:", q(
    "SELECT product_id, location_id, quantity FROM warehouse_inventory "
    "WHERE quantity > 0 LIMIT 10"
))
print("direct_sales_settings:", q(
    "SELECT tenant_id, warehouse_id FROM direct_sales_settings LIMIT 5"
))
print("document_series SALE:", q(
    "SELECT id, subtype, warehouse_document_series_id FROM document_series "
    "WHERE document_type='SALE' LIMIT 8"
))
print("stock_documents cols:", q("PRAGMA table_info(stock_documents)"))
print("sale_document_stock_links:", q(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sale_document_stock_links'"
))
