"""Return document provider."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import ReturnPrintContext
from .order_provider import order_provider
from .sample_data import sample_document, sample_order_context, sample_products


class ReturnProvider:
    def build(self, db: Session, *, tenant_id: int, **params: Any) -> ReturnPrintContext:
        if params.get("sample"):
            doc = sample_document(title="Dokument zwrotu", doc_type="RET")
            order_ctx = sample_order_context(title="Dokument zwrotu")
            return ReturnPrintContext(
                return_number=doc["number"],
                order_number=order_ctx.order_number,
                status="Przyjęty",
                document=doc,
                customer=order_ctx.customer,
                products=sample_products(),
                totals=order_ctx.totals,
                notes="Zwrot w terminie 14 dni.",
            )

        if params.get("order_id"):
            order_ctx = order_provider.build(db, tenant_id=tenant_id, kind_code="return_document", order_id=params["order_id"])
            doc = order_ctx.document or sample_document(title="Dokument zwrotu", doc_type="RET")
            products = [
                {
                    "name": item.product.get("name"),
                    "sku": item.product.get("sku"),
                    "quantity": item.quantity,
                    "unit": item.unit,
                }
                for item in order_ctx.items
            ]
            return ReturnPrintContext(
                return_number=str(doc.get("number") or order_ctx.order_number),
                order_number=order_ctx.order_number,
                status=order_ctx.status,
                document=doc,
                customer=order_ctx.customer,
                products=products,
                totals=order_ctx.totals,
            )

        doc = sample_document(title="Dokument zwrotu", doc_type="RET")
        return ReturnPrintContext(return_number=doc["number"], document=doc, products=sample_products())


return_provider = ReturnProvider()
