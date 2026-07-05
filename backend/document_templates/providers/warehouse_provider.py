"""Warehouse document provider — WZ/PZ/PW/RW/MM and related stock docs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import WarehouseDocumentLinePrintContext, WarehousePrintContext
from ..errors import DocumentProviderError
from .sample_data import sample_warehouse_context

_DOC_TITLES = {
    "wz": "Wydanie zewnętrzne (WZ)",
    "pz": "Przyjęcie zewnętrzne (PZ)",
    "pw": "Przyjęcie wewnętrzne (PW)",
    "rw": "Rozchód wewnętrzny (RW)",
    "mm": "Przesunięcie międzymagazynowe (MM)",
}


def _fmt_date(dt: Any) -> str:
    if dt is None:
        return "—"
    if isinstance(dt, datetime):
        return dt.strftime("%d.%m.%Y")
    return str(dt)


def _fmt_qty(value: Any) -> str:
    if value is None:
        return "0"
    try:
        q = float(value)
        if abs(q - round(q)) < 1e-6:
            return str(int(round(q)))
        return f"{q:.4f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return str(value)


class WarehouseDocumentProvider:
    def build(
        self,
        db: Session,
        *,
        tenant_id: int,
        kind_code: str = "wz",
        **params: Any,
    ) -> WarehousePrintContext:
        if params.get("sample"):
            title = _DOC_TITLES.get(str(kind_code).lower(), "Dokument magazynowy")
            return sample_warehouse_context(title=title, doc_type=str(kind_code).upper())

        document_id = params.get("document_id")
        if document_id is None:
            raise DocumentProviderError("Wymagany document_id.", code="missing_param")

        from ...services.stock_document_service import get_stock_document_read

        read = get_stock_document_read(db, int(tenant_id), int(document_id))
        if read is None:
            raise DocumentProviderError("Dokument magazynowy nie istnieje.", code="not_found")

        doc_type = str(getattr(read, "document_type", None) or kind_code or "WZ").upper()
        title = _DOC_TITLES.get(doc_type.lower(), doc_type)
        doc_number = getattr(read, "document_number", None) or f"#{document_id}"
        created = getattr(read, "created_at", None)

        products: list[dict[str, Any]] = []
        lines: list[WarehouseDocumentLinePrintContext] = []
        for ln in getattr(read, "items", None) or []:
            name = getattr(ln, "product_name", None) or getattr(ln, "name", None) or "—"
            sku = getattr(ln, "product_sku", None) or getattr(ln, "sku", None)
            ean = getattr(ln, "product_ean", None) or getattr(ln, "ean", None)
            qty = getattr(ln, "received_quantity", None) or getattr(ln, "quantity", None)
            loc = (
                getattr(ln, "from_location_name", None)
                or getattr(ln, "mm_line_from_location_name", None)
                or getattr(ln, "location_name", None)
            )
            unit = getattr(ln, "unit", None) or "szt."
            row = {
                "name": name,
                "sku": sku,
                "ean": ean,
                "quantity": _fmt_qty(qty),
                "unit": unit,
                "locations": loc or "—",
                "location": loc or "—",
                "product": {"name": name, "sku": sku, "ean": ean},
            }
            products.append(row)
            lines.append(
                WarehouseDocumentLinePrintContext(
                    product={"name": name, "sku": sku, "ean": ean},
                    quantity=_fmt_qty(qty),
                    unit=str(unit),
                    location=loc,
                )
            )

        document = {
            "number": doc_number,
            "created_at": created.isoformat() if isinstance(created, datetime) else _fmt_date(created),
            "status": str(getattr(read, "status", None) or "—"),
            "title": title,
            "type": doc_type,
            "notes": getattr(read, "notes", None),
            "barcode_value": doc_number,
        }

        return WarehousePrintContext(
            document_number=doc_number,
            document_type=doc_type,
            document_date=_fmt_date(created),
            status=str(getattr(read, "status", None) or "—"),
            title=title,
            document=document,
            products=products,
            lines=lines,
            source_warehouse={"name": getattr(read, "warehouse_name", None) or "—"},
            destination_warehouse={"name": getattr(read, "destination_warehouse_name", None) or "—"},
            partner={"name": getattr(read, "partner_name", None) or getattr(read, "supplier_name", None) or "—"},
            notes=getattr(read, "notes", None),
            order_number=getattr(read, "order_number", None),
        )


warehouse_document_provider = WarehouseDocumentProvider()
