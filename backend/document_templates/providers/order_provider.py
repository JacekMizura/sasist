"""Order / commerce document provider."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import OrderLinePrintContext, OrderPrintContext
from ..errors import DocumentProviderError
from .sample_data import sample_order_context


class OrderProvider:
    def build(self, db: Session, *, tenant_id: int, kind_code: str = "order_confirmation", **params: Any) -> OrderPrintContext:
        if params.get("sample"):
            titles = {
                "picking_list": "Lista kompletacyjna",
                "invoice": "Faktura VAT",
                "receipt": "Paragon",
                "correction": "Korekta",
            }
            return sample_order_context(title=titles.get(kind_code, "Potwierdzenie zamówienia"))

        order_id = params.get("order_id")
        sale_document_id = params.get("sale_document_id") or params.get("document_id")

        if sale_document_id:
            return self._from_sale_document(db, tenant_id=int(tenant_id), document_id=str(sale_document_id), kind_code=kind_code)

        if order_id is None:
            raise DocumentProviderError("Wymagany order_id lub sale_document_id.", code="missing_param")

        from ...models.customer import Customer
        from ...models.order import Order
        from ...services.sale_document_mapper import map_sale_document

        order = db.query(Order).filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id)).first()
        if order is None:
            raise DocumentProviderError("Zamówienie nie istnieje.", code="not_found")

        customer = None
        if getattr(order, "customer_id", None):
            customer = db.query(Customer).filter(Customer.id == int(order.customer_id)).first()

        dto = map_sale_document(db, doc=None, order=order, customer=customer, mode="detail", refresh_db=False)
        return self._from_order_dto(dto, kind_code=kind_code)

    def _from_sale_document(
        self,
        db: Session,
        *,
        tenant_id: int,
        document_id: str,
        kind_code: str,
    ) -> OrderPrintContext:
        from ...models.customer import Customer
        from ...models.order import Order
        from ...models.sale_document import SaleDocument
        from ...services.sale_document_mapper import map_sale_document

        doc = (
            db.query(SaleDocument)
            .filter(SaleDocument.id == str(document_id), SaleDocument.tenant_id == int(tenant_id))
            .first()
        )
        if doc is None:
            raise DocumentProviderError("Dokument sprzedaży nie istnieje.", code="not_found")
        order = db.query(Order).filter(Order.id == int(doc.order_id)).first()
        if order is None:
            raise DocumentProviderError("Zamówienie nie istnieje.", code="not_found")
        customer = None
        if getattr(order, "customer_id", None):
            customer = db.query(Customer).filter(Customer.id == int(order.customer_id)).first()
        dto = map_sale_document(db, doc=doc, order=order, customer=customer, mode="detail", refresh_db=False)
        return self._from_order_dto(dto, kind_code=kind_code)

    def _from_order_dto(self, dto: dict[str, Any], *, kind_code: str) -> OrderPrintContext:
        fin = dto.get("financials") or {}
        buyer = dto.get("buyer") or {}
        payment = dto.get("payment") or {}
        shipping = dto.get("shipping") or {}
        lines_raw = fin.get("lines") or dto.get("lines") or []

        items: list[OrderLinePrintContext] = []
        for ln in lines_raw:
            if not isinstance(ln, dict):
                continue
            items.append(
                OrderLinePrintContext(
                    product={
                        "name": ln.get("name") or ln.get("product_name") or "—",
                        "sku": ln.get("sku") or ln.get("product_sku"),
                        "ean": ln.get("ean") or ln.get("product_ean"),
                    },
                    quantity=str(ln.get("quantity") or "0"),
                    unit=str(ln.get("unit") or "szt."),
                    unit_price_net=str(ln.get("unit_price_net") or ln.get("price_net") or "0"),
                    line_total_net=str(ln.get("line_total_net") or ln.get("value_net") or "0"),
                )
            )

        doc_number = dto.get("document_number") or dto.get("order_number") or "—"
        created = dto.get("created_at") or dto.get("order_date")
        titles = {
            "picking_list": "Lista kompletacyjna",
            "invoice": "Faktura VAT",
            "receipt": "Paragon",
            "correction": "Korekta",
            "order_confirmation": "Potwierdzenie zamówienia",
        }

        return OrderPrintContext(
            order_number=str(dto.get("order_number") or doc_number),
            order_date=str(created or "—"),
            status=str(dto.get("status") or dto.get("order_status") or "—"),
            title=titles.get(kind_code, "Dokument"),
            document={
                "number": doc_number,
                "created_at": created,
                "status": dto.get("status"),
                "title": titles.get(kind_code, "Dokument"),
                "type_label": dto.get("document_subtype_label") or kind_code,
                "subtype": dto.get("document_subtype"),
            },
            customer={
                "name": buyer.get("name") or dto.get("client") or "—",
                "email": buyer.get("email"),
                "phone": buyer.get("phone"),
                "address": buyer.get("address"),
            },
            delivery={
                "street": (dto.get("delivery") or {}).get("street") or buyer.get("street"),
                "city": (dto.get("delivery") or {}).get("city") or buyer.get("city"),
                "postal_code": (dto.get("delivery") or {}).get("postal_code") or buyer.get("postal_code"),
            },
            payment={
                "method": payment.get("payment_method") or payment.get("method"),
                "status": payment.get("payment_status") or payment.get("status"),
                "amount": payment.get("amount"),
            },
            shipping={
                "carrier": shipping.get("carrier"),
                "tracking_number": shipping.get("tracking_number"),
            },
            items=items,
            totals={
                "net": fin.get("total_net"),
                "vat": fin.get("total_vat"),
                "gross": fin.get("total_gross"),
            },
        )


order_provider = OrderProvider()
