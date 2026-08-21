"""generate_sale_correction — thin adapter to sale correction domain (RETURN)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ....models.wms_order_return import WmsOrderReturn
from ...sale_documents.errors import SaleCorrectionError
from ...sale_documents.issue_service import issue_sale_correction_for_return
from ..constants import ENTITY_RETURN
from . import EffectResult

#: Domain SaleCorrectionError.code → automation result error_code
_DOMAIN_CODE_MAP = {
    "RETURN_NOT_READY": "return_not_ready_for_correction",
    "SOURCE_DOCUMENT_MISSING": "source_document_missing",
    "SOURCE_NOT_FOUND": "source_document_missing",
    "CORRECTION_NOT_SUPPORTED_FOR_DOCUMENT_TYPE": "correction_not_supported_for_document_type",
    "LINE_MAPPING_FAILED": "correction_line_mapping_failed",
    "SOURCE_SHIPPING_NOT_AVAILABLE": "source_shipping_not_available",
    "CORRECTION_SCOPE_REDUCED_AFTER_ISSUE": "correction_scope_reduced_after_issue",
    "LEGACY_CORRECTION_SCOPE_AMBIGUOUS": "legacy_correction_scope_ambiguous",
    "CORRECTION_OVER_SOURCE": "correction_over_source",
}


def _map_domain_code(code: str) -> str:
    c = str(code or "").strip().upper()
    return _DOMAIN_CODE_MAP.get(c, c.lower() if c else "sale_correction_failed")


def _include_shipping_from_config(config: dict[str, Any]) -> bool:
    raw = config.get("include_shipping_cost", False)
    if isinstance(raw, str):
        return raw.strip().lower() in ("1", "true", "yes", "on")
    return bool(raw)


def execute_generate_sale_correction(
    db: Session,
    *,
    config: dict[str, Any],
    event: StatusTransitionEvent,
    actor_user_id: Optional[int],
) -> EffectResult:
    """
    Business meaning: „Wystaw korektę faktury”.

    Thin adapter only — domain service is SSOT for readiness, VAT, numbering, lines, idempotency.
    Config: ``include_shipping_cost`` (default false) — shipping from source SaleDocument SHIPPING item.
    """
    del actor_user_id
    cfg = config if isinstance(config, dict) else {}
    include_shipping = _include_shipping_from_config(cfg)

    entity_type = str(event.entity_type or "").upper()
    if entity_type != ENTITY_RETURN:
        return EffectResult(
            ok=False,
            message=f"generate_sale_correction only supports RETURN (got {entity_type})",
            data={"error_code": "unsupported_entity_for_effect"},
        )

    row = (
        db.query(WmsOrderReturn)
        .filter(
            WmsOrderReturn.id == int(event.entity_id),
            WmsOrderReturn.tenant_id == int(event.tenant_id),
        )
        .first()
    )
    if row is None:
        return EffectResult(
            ok=False,
            message="Return not found",
            data={"error_code": "return_not_found"},
        )

    wh_id = int(row.warehouse_id) if getattr(row, "warehouse_id", None) else None
    try:
        result = issue_sale_correction_for_return(
            db,
            tenant_id=int(event.tenant_id),
            return_id=int(row.id),
            warehouse_id=wh_id,
            include_shipping_cost=include_shipping,
        )
    except SaleCorrectionError as exc:
        code = _map_domain_code(exc.code)
        return EffectResult(
            ok=False,
            message=str(exc.message or exc),
            data={"error_code": code, "domain_code": str(exc.code)},
        )
    except Exception as exc:
        return EffectResult(
            ok=False,
            message=f"generate_sale_correction failed: {exc}",
            data={"error_code": "sale_correction_failed"},
        )

    doc = result.document
    source_id = getattr(doc, "source_sale_document_id", None) if doc is not None else None
    source_number = None
    if doc is not None:
        source = getattr(doc, "source_document", None)
        if source is not None:
            source_number = getattr(source, "document_number", None)
        elif source_id:
            from ....models.sale_document import SaleDocument

            src_row = db.query(SaleDocument).filter(SaleDocument.id == str(source_id)).first()
            if src_row is not None:
                source_number = getattr(src_row, "document_number", None)

    return EffectResult(
        ok=True,
        message="generate_sale_correction_ok",
        data={
            "correction_document_id": str(doc.id) if doc is not None else None,
            "correction_number": str(getattr(doc, "document_number", None) or "") if doc is not None else None,
            "source_document_id": str(source_id) if source_id else None,
            "source_document_number": str(source_number) if source_number else None,
            "reused_existing": bool(result.reused_existing),
            "no_new_delta": bool(result.no_new_delta),
            "include_shipping_cost": include_shipping,
        },
    )
