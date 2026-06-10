"""Customer list projection — must not 500 after CRM schema evolution."""

from __future__ import annotations

import unittest

from sqlalchemy.orm import Session

from backend.database import SessionLocal, engine
from backend.db.customer_schema import ensure_customer_crm_schema
from backend.models.customer import Customer
from backend.services.customers.customer_profile_service import ensure_customer_profile_defaults
from backend.services.customers.customer_projection import customers_to_list_out


class CustomersListProjectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        ensure_customer_crm_schema(engine)

    def _query_tenant_rows(self, db: Session, *, search: str | None = None):
        q = db.query(Customer).filter(Customer.tenant_id == 1, Customer.deleted_at.is_(None))
        if search:
            from sqlalchemy import or_

            s = f"%{search.strip()}%"
            q = q.filter(
                or_(
                    Customer.first_name.ilike(s),
                    Customer.last_name.ilike(s),
                    Customer.email.ilike(s),
                )
            )
        return q.order_by(Customer.id.desc()).all()

    def test_list_projection_default(self):
        db: Session = SessionLocal()
        try:
            rows = self._query_tenant_rows(db)
            out = customers_to_list_out(db, rows, tenant_id=1)
            self.assertIsInstance(out, list)
        finally:
            db.close()

    def test_list_customer_without_orders(self):
        db: Session = SessionLocal()
        cid = 0
        try:
            row = Customer(
                tenant_id=1,
                first_name="Test",
                last_name="NoOrders",
                email="noorders-list-test@example.com",
            )
            ensure_customer_profile_defaults(db, row)
            db.add(row)
            db.commit()
            cid = int(row.id)

            matches = customers_to_list_out(
                db,
                self._query_tenant_rows(db, search="noorders-list-test@example.com"),
                tenant_id=1,
            )
            match = next(x for x in matches if x.id == cid)
            self.assertEqual(match.order_count, 0)
            self.assertEqual(match.total_gross, 0.0)
            self.assertEqual(match.customer_status, "active")
            self.assertFalse(match.flags.vip)
        finally:
            if cid:
                db.query(Customer).filter(Customer.id == cid).delete()
                db.commit()
            db.close()

    def test_list_vip_flags_in_response(self):
        db: Session = SessionLocal()
        cid = 0
        try:
            row = Customer(
                tenant_id=1,
                first_name="VIP",
                last_name="ListTest",
                email="vip-list-test@example.com",
                flags_json='{"vip":true}',
            )
            ensure_customer_profile_defaults(db, row)
            db.add(row)
            db.commit()
            cid = int(row.id)

            matches = customers_to_list_out(
                db,
                self._query_tenant_rows(db, search="vip-list-test@example.com"),
                tenant_id=1,
            )
            match = next(x for x in matches if x.id == cid)
            self.assertTrue(match.flags.vip)
        finally:
            if cid:
                db.query(Customer).filter(Customer.id == cid).delete()
                db.commit()
            db.close()


if __name__ == "__main__":
    unittest.main()
