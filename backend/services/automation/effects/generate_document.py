"""generate_document effect — create document from explicit series_id (+ optional overrides)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ...documents.create_from_series_service import (
    DocumentCreationError,
    DocumentTriggerContext,
    create_document_from_series,
)
from ...documents.generate_document_support import (
    format_sale_date_pl,
    parse_document_creation_overrides,
)
from ..constants import ENTITY_ORDER
from . import EffectResult


def _business_message(result, *, series_name: str | None) -> str:
    meta = result.metadata or {}
    if str(result.document_type or "").upper() in ("RESERVATION", "RZ"):
        total = meta.get("reserved_qty_total")
        order_label = meta.get("order_number") or meta.get("order_id") or ""
        head = (
            f"Utworzono rezerwację {result.document_number}"
            if result.created
            else f"Rezerwacja {result.document_number} (bez duplikatu)"
        )
        bits = [head]
        if total is not None:
            bits.append(f"Zarezerwowano {float(total):g} szt.")
        if order_label:
            bits.append(f"Zamówienie #{order_label}")
        if result.print_job_id:
            station = meta.get("print_station_name") or (
                f"stanowisko #{meta['print_station_id']}" if meta.get("print_station_id") else "tak"
            )
            bits.append(f"Wydruk: {station}")
        return " · ".join(bits)

    parts = [
        f"Utworzono dokument {result.document_number}"
        if result.created
        else f"Dokument {result.document_number} (bez duplikatu)"
    ]
    label = series_name or result.series_name
    if label:
        parts.append(f"Seria: {label}")
    if meta.get("payment_term"):
        parts.append(f"Termin płatności: {meta['payment_term']}")
    sale_pl = format_sale_date_pl(meta.get("sale_date"))
    if sale_pl:
        parts.append(f"Data sprzedaży: {sale_pl}")
    if meta.get("additional_description"):
        parts.append("Opis dodatkowy: tak")
    if result.print_job_id:
        station = meta.get("print_station_name") or (
            f"stanowisko #{meta['print_station_id']}" if meta.get("print_station_id") else "tak"
        )
        parts.append(f"Wydruk: {station}")
    return " · ".join(parts)


def execute_generate_document(
    db: Session,
    *,
    config: dict[str, Any],
    event: StatusTransitionEvent,
    actor_user_id: Optional[int],
    execution_id: Optional[int] = None,
    effect_id: Optional[int] = None,
) -> EffectResult:
    entity_type = str(event.entity_type or "").upper()
    if entity_type != ENTITY_ORDER:
        return EffectResult(
            ok=False,
            message=f"generate_document only supports ORDER (got {entity_type})",
            data={"error_code": "entity_mismatch"},
        )

    series_id = str(
        config.get("series_id")
        or config.get("document_series_id")
        or config.get("doc_series_id")
        or ""
    ).strip()
    if not series_id:
        return EffectResult(
            ok=False,
            message="generate_document requires series_id",
            data={"error_code": "series_id_required"},
        )

    try:
        overrides = parse_document_creation_overrides(config)
    except ValueError as exc:
        code = str(exc)
        return EffectResult(
            ok=False,
            message=f"generate_document invalid config: {code}",
            data={"error_code": code},
        )

    rule_id = None
    try:
        rule_id = int(getattr(event, "matched_rule_id", None) or 0) or None
    except (TypeError, ValueError):
        rule_id = None

    ctx = DocumentTriggerContext(
        source="AUTOMATION",
        actor_label="Automatyzacja",
        automation_execution_id=int(execution_id) if execution_id else None,
        automation_rule_id=rule_id,
        automation_effect_id=int(effect_id) if effect_id else None,
        root_event_id=int(event.id) if getattr(event, "id", None) else None,
        metadata={
            "initiating_event_id": int(event.id) if getattr(event, "id", None) else None,
            "to_status_id": getattr(event, "to_status_id", None),
            "from_status_id": getattr(event, "from_status_id", None),
        },
    )

    try:
        result = create_document_from_series(
            db,
            tenant_id=int(event.tenant_id),
            series_id=series_id,
            order_id=int(event.entity_id),
            actor_user_id=actor_user_id,
            trigger_context=ctx,
            overrides=overrides,
        )
    except DocumentCreationError as exc:
        return EffectResult(
            ok=False,
            message=str(exc),
            data={"error_code": exc.code},
        )
    except Exception as exc:
        return EffectResult(
            ok=False,
            message=f"generate_document failed: {exc}",
            data={"error_code": "generate_document_failed"},
        )

    return EffectResult(
        ok=True,
        message=_business_message(result, series_name=result.series_name),
        data={
            "stock_document_id": result.stock_document_id or None,
            "sale_document_id": result.sale_document_id,
            "document_number": result.document_number,
            "document_type": result.document_type,
            "series_id": result.series_id,
            "series_name": result.series_name,
            "created": result.created,
            "settlement_mode": result.settlement_mode,
            "print_job_id": result.print_job_id,
            "metadata": result.metadata,
        },
    )
