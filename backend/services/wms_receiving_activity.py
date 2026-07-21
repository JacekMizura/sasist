"""
PZ receiving → shared Activity Log (Historia czynności).

Reuses ``record_activity`` / object_type=document. Polish descriptions are stored
at write time; event_code stays technical for catalogs.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from .activity_log import ActivityLinkSpec, record_activity

logger = logging.getLogger(__name__)

EVENT_PZ_DOCUMENT_CREATED = "pz_document_created"
EVENT_PZ_PRODUCT_ADDED = "pz_product_added"
EVENT_PZ_PRODUCT_RECEIVED = "pz_product_received"
EVENT_PZ_RECEIVE_REVERTED = "pz_receive_reverted"
EVENT_PZ_DEFECT_REPORTED = "pz_defect_reported"
EVENT_PZ_DOCUMENT_QTY_CHANGED = "pz_document_qty_changed"
EVENT_PZ_PRICE_CHANGED = "pz_price_changed"
EVENT_PZ_VAT_CHANGED = "pz_vat_changed"
EVENT_PZ_SUPPLIER_CHANGED = "pz_supplier_changed"
EVENT_PZ_PRODUCT_REMOVED = "pz_product_removed"
EVENT_PZ_RECEIVING_FINISHED = "pz_receiving_finished"
EVENT_PZ_PUTAWAY = "pz_putaway"
EVENT_PZ_PUTAWAY_HANDLING_CHANGED = "pz_putaway_handling_changed"
EVENT_PZ_PUTAWAY_CANCELLED = "pz_putaway_cancelled"

RECEIVING_EVENT_TITLES_PL: dict[str, str] = {
    EVENT_PZ_DOCUMENT_CREATED: "Utworzono dokument",
    EVENT_PZ_PRODUCT_ADDED: "Dodano produkt",
    EVENT_PZ_PRODUCT_RECEIVED: "Przyjęto produkt",
    EVENT_PZ_RECEIVE_REVERTED: "Cofnięto przyjęcie",
    EVENT_PZ_DEFECT_REPORTED: "Zgłoszono wadę",
    EVENT_PZ_DOCUMENT_QTY_CHANGED: "Zmieniono ilość z dokumentu",
    EVENT_PZ_PRICE_CHANGED: "Zmieniono cenę",
    EVENT_PZ_VAT_CHANGED: "Zmieniono VAT",
    EVENT_PZ_SUPPLIER_CHANGED: "Zmieniono dostawcę",
    EVENT_PZ_PRODUCT_REMOVED: "Usunięto produkt",
    EVENT_PZ_RECEIVING_FINISHED: "Zakończono przyjęcie",
    EVENT_PZ_PUTAWAY: "Rozlokowano towar",
    EVENT_PZ_PUTAWAY_HANDLING_CHANGED: "Zmieniono sposób obsługi rozlokowania",
    EVENT_PZ_PUTAWAY_CANCELLED: "Anulowano rozlokowanie",
}

RECEIVING_EVENT_DESCRIPTIONS_PL: dict[str, str] = {
    EVENT_PZ_DOCUMENT_CREATED: "Utworzono dokument PZ.",
    EVENT_PZ_PRODUCT_ADDED: "Dodano produkt do dokumentu PZ.",
    EVENT_PZ_PRODUCT_RECEIVED: "Przyjęto produkt.",
    EVENT_PZ_RECEIVE_REVERTED: "Cofnięto przyjęcie produktu.",
    EVENT_PZ_DEFECT_REPORTED: "Oznaczono produkt jako wadliwy.",
    EVENT_PZ_DOCUMENT_QTY_CHANGED: "Zmieniono ilość z dokumentu.",
    EVENT_PZ_PRICE_CHANGED: "Zmieniono cenę netto.",
    EVENT_PZ_VAT_CHANGED: "Zmieniono VAT.",
    EVENT_PZ_SUPPLIER_CHANGED: "Zmieniono dostawcę.",
    EVENT_PZ_PRODUCT_REMOVED: "Usunięto produkt z dokumentu.",
    EVENT_PZ_RECEIVING_FINISHED: "Zakończono przyjęcie dokumentu PZ.",
    EVENT_PZ_PUTAWAY: "Rozlokowano towar.",
    EVENT_PZ_PUTAWAY_HANDLING_CHANGED: "Zmieniono sposób obsługi po przyjęciu (rozlokowanie / bez rozlokowania).",
    EVENT_PZ_PUTAWAY_CANCELLED: "Anulowano obowiązek rozlokowania.",
}


def _actor_id(user: AppUser | None) -> int | None:
    if user is None or getattr(user, "id", None) is None:
        return None
    return int(user.id)


def record_pz_activity(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    event_code: str,
    description: str,
    performed_by: AppUser | None = None,
    warehouse_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    severity: str = "INFO",
) -> None:
    """Best-effort dual-write into Activity Log linked to stock document."""
    code = str(event_code or "").strip()
    desc = (description or "").strip() or RECEIVING_EVENT_DESCRIPTIONS_PL.get(code, "Zdarzenie PZ.")
    nested = db.begin_nested()
    try:
        record_activity(
            db,
            event_code=code[:64],
            description=desc[:512],
            links=[
                ActivityLinkSpec(
                    object_type="document",
                    object_id=int(document_id),
                    role="primary",
                    object_label=f"PZ #{int(document_id)}",
                )
            ],
            severity=severity,
            category="status",
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
            actor_user_id=_actor_id(performed_by),
            source_module="wms_receiving",
            metadata=dict(metadata or {}),
        )
        nested.commit()
    except Exception:
        nested.rollback()
        logger.exception(
            "record_pz_activity failed document_id=%s event=%s",
            document_id,
            code,
        )


def fmt_qty_pl(n: float) -> str:
    s = f"{float(n):.4f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


def fmt_money_pl(n: float) -> str:
    return f"{float(n):.2f}".replace(".", ",") + " zł"


def fmt_vat_pl(n: float) -> str:
    s = f"{float(n):.2f}".rstrip("0").rstrip(".")
    return f"{s.replace('.', ',')}%"


def product_label(*, name: str | None, ean: str | None = None, sku: str | None = None, product_id: int | None = None) -> str:
    base = (name or "").strip() or (f"produkt #{product_id}" if product_id else "produkt")
    bits: list[str] = []
    if ean and str(ean).strip():
        bits.append(f"EAN {str(ean).strip()}")
    if sku and str(sku).strip():
        bits.append(f"SKU {str(sku).strip()}")
    if bits:
        return f"{base} ({', '.join(bits)})"
    return base
