"""Inventory document provider."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import InventoryPrintContext
from .sample_data import sample_document, sample_products


class InventoryProvider:
    def build(self, db: Session, *, tenant_id: int, **params: Any) -> InventoryPrintContext:
        _ = db, tenant_id, params
        doc = sample_document(title="Dokument inwentaryzacyjny", doc_type="INV")
        if not params.get("sample") and params.get("document_id"):
            doc["number"] = f"INV/{params['document_id']}"
        return InventoryPrintContext(
            document_number=doc["number"],
            document_date="08.06.2026",
            status="W trakcie",
            document=doc,
            warehouse={"name": "Magazyn główny", "code": "WH-01"},
            products=sample_products(),
            summary={"counted_lines": len(sample_products()), "differences": "0"},
            notes="Inwentaryzacja cykliczna.",
        )


inventory_provider = InventoryProvider()
