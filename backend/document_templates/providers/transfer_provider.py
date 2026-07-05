"""Transfer / relocation document provider."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import TransferPrintContext
from .sample_data import sample_document, sample_products


class TransferProvider:
    def build(self, db: Session, *, tenant_id: int, kind_code: str = "stock_transfer", **params: Any) -> TransferPrintContext:
        _ = db, tenant_id, params
        titles = {
            "stock_transfer": "Dokument przesunięcia",
            "relocation_document": "Dokument rozlokowania (nośniki)",
        }
        title = titles.get(str(kind_code), "Dokument transferu")
        doc_type = "TR" if kind_code == "stock_transfer" else "RL"
        doc = sample_document(title=title, doc_type=doc_type)
        return TransferPrintContext(
            document_number=doc["number"],
            document_date="08.06.2026",
            status="Otwarty",
            title=title,
            document=doc,
            source={"location": "A-01-01", "carrier": "KOSZ-042"},
            target={"location": "B-02-03", "carrier": "KOSZ-099"},
            carrier={"code": "KOSZ-042", "name": "Kosz kompletacyjny"},
            products=sample_products(),
            notes="Przesunięcie w ramach magazynu.",
        )


transfer_provider = TransferProvider()
