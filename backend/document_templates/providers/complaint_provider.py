"""Complaint document provider."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import ComplaintPrintContext
from .sample_data import sample_document, sample_order_context, sample_products


class ComplaintProvider:
    def build(self, db: Session, *, tenant_id: int, **params: Any) -> ComplaintPrintContext:
        _ = db, tenant_id
        if params.get("sample") or not params.get("complaint_id"):
            doc = sample_document(title="Dokument reklamacji", doc_type="CMP")
            order_ctx = sample_order_context(title="Dokument reklamacji")
            return ComplaintPrintContext(
                complaint_number=doc["number"],
                order_number=order_ctx.order_number,
                status="Zgłoszona",
                document=doc,
                customer=order_ctx.customer,
                products=sample_products(),
                reason="Uszkodzenie w transporcie",
                notes="Klient dołączył zdjęcia.",
            )

        doc = sample_document(title="Dokument reklamacji", doc_type="CMP")
        doc["number"] = f"CMP/{params['complaint_id']}"
        return ComplaintPrintContext(
            complaint_number=doc["number"],
            document=doc,
            products=sample_products(),
            reason=str(params.get("reason") or "—"),
        )


complaint_provider = ComplaintProvider()
