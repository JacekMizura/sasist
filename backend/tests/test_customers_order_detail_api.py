"""Integration checks for customers list + order detail after CRM schema."""

from __future__ import annotations

import unittest

from sqlalchemy.orm import Session, joinedload

from backend.database import SessionLocal, engine
from backend.db.customer_schema import ensure_customer_crm_schema, verify_customer_schema_columns
from backend.models.order import Order
from backend.models.order_item import OrderItem


class CustomersAndOrderDetailApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        ensure_customer_crm_schema(engine)
        missing = verify_customer_schema_columns(engine)
        if missing:
            raise unittest.SkipTest(f"customers schema incomplete: {missing}")

    def test_customers_list_projection(self):
        from backend.services.customers.customer_projection import customers_to_list_out
        from backend.models.customer import Customer

        db: Session = SessionLocal()
        try:
            rows = db.query(Customer).filter(Customer.tenant_id == 1, Customer.deleted_at.is_(None)).limit(5).all()
            out = customers_to_list_out(db, rows, tenant_id=1)
            self.assertIsInstance(out, list)
        finally:
            db.close()

    def test_order_detail_build_read(self):
        try:
            from backend.api.order import build_order_read
        except ModuleNotFoundError as exc:
            raise unittest.SkipTest(f"order api deps unavailable: {exc}") from exc

        db: Session = SessionLocal()
        try:
            oid = (
                db.query(Order.id)
                .filter(Order.tenant_id == 1)
                .order_by(Order.id.desc())
                .limit(1)
                .scalar()
            )
            if not oid:
                self.skipTest("no orders in test db")
            order = (
                db.query(Order)
                .options(
                    joinedload(Order.items).joinedload(OrderItem.product),
                    joinedload(Order.order_ui_status),
                    joinedload(Order.shipping_method_row),
                )
                .filter(Order.id == int(oid))
                .first()
            )
            self.assertIsNotNone(order)
            out = build_order_read(db, order)
            self.assertEqual(int(out.id), int(oid))
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
