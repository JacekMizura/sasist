"""Purchasing API performance and schema guards."""

from __future__ import annotations

import unittest
from datetime import datetime

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from backend.db.purchasing_schema import ensure_purchasing_orm_schema
from backend.db.schema_upgrade import (
    ensure_purchase_order_tax_invoice_columns,
    ensure_purchase_orders_tables,
    ensure_supplier_purchasing_columns,
    ensure_suppliers_and_inbound_deliveries_tables,
    ensure_tenant_default_warehouse_column,
)
from backend.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from backend.models.supplier import Supplier
from backend.models.tenant import Tenant
from backend.services import purchasing_order_service as po_svc


class TestPurchasingOrdersListQueryCount(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        self._query_count = 0

        @event.listens_for(self.engine, "before_cursor_execute")
        def _count_queries(conn, cursor, statement, parameters, context, executemany):
            self._query_count += 1

        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)"))
            conn.execute(text("INSERT INTO tenants (id, name, created_at, updated_at) VALUES (1, 'T', datetime('now'), datetime('now'))"))
            conn.execute(
                text(
                    """
                    CREATE TABLE warehouses (id INTEGER PRIMARY KEY)
                    """
                )
            )
            conn.execute(text("INSERT INTO warehouses (id) VALUES (1)"))
        ensure_suppliers_and_inbound_deliveries_tables(self.engine)
        ensure_supplier_purchasing_columns(self.engine)
        ensure_purchase_orders_tables(self.engine)
        ensure_purchase_order_tax_invoice_columns(self.engine)
        ensure_purchasing_orm_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        db = self.Session()
        sup = Supplier(id=1, tenant_id=1, name="Sup A", active=True)
        db.add(sup)
        for i in range(1, 6):
            po = PurchaseOrder(
                id=i,
                tenant_id=1,
                warehouse_id=1,
                supplier_id=1,
                order_number=f"PO/2026/{i}",
                status="Draft",
                currency="PLN",
                subtotal=10.0,
                shipping_cost=0.0,
                total_value=10.0,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(po)
            db.add(
                PurchaseOrderItem(
                    purchase_order_id=i,
                    product_id=100 + i,
                    qty=1.0,
                    received_qty=0.0,
                    line_total=10.0,
                )
            )
        db.commit()
        db.close()

    def test_list_purchase_orders_bounded_queries(self):
        db = self.Session()
        self._query_count = 0
        rows, total = po_svc.list_purchase_orders(
            db, tenant_id=1, supplier_id=None, status=None, page=1, page_size=25
        )
        queries = self._query_count
        db.close()
        self.assertEqual(total, 5)
        self.assertEqual(len(rows), 5)
        self.assertLessEqual(queries, 4, f"expected <=4 SQL round-trips, got {queries}")


if __name__ == "__main__":
    unittest.main()
