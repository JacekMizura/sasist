"""Stub providers — customer, supplier, report."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import CustomerPrintContext, ReportPrintContext, SupplierPrintContext
from .sample_data import sample_report_context


class CustomerProvider:
    def build(self, db: Session, *, tenant_id: int, **params: Any) -> CustomerPrintContext:
        _ = db, tenant_id, params
        return CustomerPrintContext(
            customer={
                "id": params.get("customer_id"),
                "name": "Jan Kowalski",
                "email": "jan@example.com",
                "phone": "+48123456789",
            },
            addresses=[{"street": "ul. Testowa 1", "city": "Warszawa", "postal_code": "00-001"}],
            stats={"orders_count": 12, "total_gross": "5420.00"},
        )


class SupplierProvider:
    def build(self, db: Session, *, tenant_id: int, **params: Any) -> SupplierPrintContext:
        _ = db, tenant_id, params
        return SupplierPrintContext(
            supplier={"id": params.get("supplier_id"), "name": "Dostawca Demo Sp. z o.o."},
            contact={"email": "biuro@dostawca.pl", "phone": "+48221234567"},
        )


class ReportProvider:
    def build(self, db: Session, *, tenant_id: int, **params: Any) -> ReportPrintContext:
        _ = db, tenant_id
        return sample_report_context(title=str(params.get("title") or "Raport"))


customer_provider = CustomerProvider()
supplier_provider = SupplierProvider()
report_provider = ReportProvider()
