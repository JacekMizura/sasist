"""ERP document generation — series/subtype → DTE kind and template overrides."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..constants import DEFAULT_VARIANT_CODE
from ..adapters.sale_document_adapter import sale_kind_for_subtype

SERIES_SUBTYPE_TO_KIND: dict[str, str] = {
    "INVOICE": "invoice",
    "RECEIPT": "receipt",
    "CORRECTION": "correction",
    "WZ": "wz",
    "PZ": "pz",
    "PW": "pw",
    "RW": "rw",
    "MM": "mm",
    "Z_PZ": "pz",
}


def kind_code_for_series_subtype(subtype: str | None, *, series_type: str | None = None) -> str | None:
    sub = str(subtype or "").strip().upper()
    if not sub:
        return None
    if sub in SERIES_SUBTYPE_TO_KIND:
        return SERIES_SUBTYPE_TO_KIND[sub]
    st = str(series_type or "").strip().upper()
    if st == "SALE":
        return sale_kind_for_subtype(sub)
    return None


def series_template_render_kwargs(series: Any | None) -> dict[str, Any]:
    if series is None:
        return {}
    version_id = getattr(series, "document_template_version_id", None)
    variant = getattr(series, "document_template_variant_code", None) or DEFAULT_VARIANT_CODE
    out: dict[str, Any] = {"variant_code": str(variant)}
    if version_id is not None:
        out["template_version_id"] = int(version_id)
    return out


def ensure_series_binding_from_version(
    db: Session,
    *,
    tenant_id: int,
    kind_code: str,
    version_id: int,
    variant_code: str = DEFAULT_VARIANT_CODE,
) -> None:
    """When user picks a published version on a series, upsert default binding."""
    from ..models import DocumentTemplateVersion
    from ..services.template_service import upsert_binding

    ver = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(version_id)).first()
    if ver is None:
        return
    upsert_binding(
        db,
        tenant_id=int(tenant_id),
        kind_code=str(kind_code),
        template_id=int(ver.template_id),
        version_id=int(ver.id),
        variant_code=str(variant_code),
    )
