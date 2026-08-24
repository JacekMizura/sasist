"""Canonical document creation from an explicit DocumentSeries trigger."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ...models.document_series import DocumentSeries
from ...models.order import Order
from ...models.order_warehouse_reservation import OrderWarehouseReservation
from ..activity_log.domain_activity import record_domain_activity
from ..activity_log.domain_event_codes import (
    ORDER_WAREHOUSE_RZ_CREATED,
    ORDER_WZ_DOCUMENTARY_CREATED,
)
from ..order_reservations.constants import OWR_ACTIVE_STATUSES, STOCK_DOC_TYPE_RESERVATION
from ..order_reservations.rz_document_service import ensure_rz_document_for_order
from ..warehouse_wz.post_pick_settlement import ensure_documentary_wz_for_pick_settlement
from ..warehouse_wz.settlement_resolution import next_undocumented_wms_settlement


class DocumentCreationError(ValueError):
    def __init__(self, message: str, *, code: str = "document_creation_error"):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class DocumentTriggerContext:
    source: str = "AUTOMATION"
    actor_label: str = "Automatyzacja"
    automation_execution_id: int | None = None
    automation_rule_id: int | None = None
    automation_effect_id: int | None = None
    root_event_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CreatedDocumentResult:
    stock_document_id: int
    document_number: str
    document_type: str
    series_id: str
    created: bool
    settlement_mode: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def create_document_from_series(
    db: Session,
    *,
    tenant_id: int,
    series_id: str,
    order_id: int,
    actor_user_id: int | None = None,
    trigger_context: DocumentTriggerContext | None = None,
) -> CreatedDocumentResult:
    """
    Thin dispatcher: load series → type/subtype handler.

    Supported warehouse subtypes in this iteration: RESERVATION (RZ), WZ (documentary).
    """
    ctx = trigger_context or DocumentTriggerContext()
    sid = str(series_id or "").strip()
    if not sid:
        raise DocumentCreationError("series_id is required", code="series_id_required")

    series = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.id == sid,
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.is_active.is_(True),
        )
        .first()
    )
    if series is None:
        raise DocumentCreationError("Document series not found for tenant", code="series_not_found")

    order = (
        db.query(Order)
        .filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise DocumentCreationError("Order not found for tenant", code="order_not_found")

    series_type = str(getattr(series, "series_type", None) or getattr(series, "type", None) or "").strip().upper()
    subtype = str(getattr(series, "subtype", None) or "").strip().upper()
    warehouse_id = int(order.warehouse_id)

    # Series scoped to warehouse when set.
    series_wh = getattr(series, "warehouse_id", None)
    if series_wh is not None and int(series_wh) != warehouse_id:
        raise DocumentCreationError(
            "Document series warehouse does not match order warehouse",
            code="series_warehouse_mismatch",
        )

    if series_type == "WAREHOUSE" and subtype == STOCK_DOC_TYPE_RESERVATION:
        return _handle_rz(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=warehouse_id,
            order=order,
            series=series,
            actor_user_id=actor_user_id,
            ctx=ctx,
        )
    if series_type == "WAREHOUSE" and subtype == "WZ":
        return _handle_wz(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=warehouse_id,
            order=order,
            series=series,
            actor_user_id=actor_user_id,
            ctx=ctx,
        )

    raise DocumentCreationError(
        f"Unsupported series type/subtype for automation: {series_type}/{subtype}",
        code="unsupported_series",
    )


def _meta_base(ctx: DocumentTriggerContext, *, series_id: str, order_id: int) -> dict[str, Any]:
    meta = {
        "trigger_source": ctx.source,
        "actor_label": ctx.actor_label,
        "series_id": series_id,
        "order_id": int(order_id),
        "automation_execution_id": ctx.automation_execution_id,
        "automation_rule_id": ctx.automation_rule_id,
        "automation_effect_id": ctx.automation_effect_id,
        "root_event_id": ctx.root_event_id,
    }
    meta.update(ctx.metadata or {})
    return {k: v for k, v in meta.items() if v is not None}


def _handle_rz(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    series: DocumentSeries,
    actor_user_id: int | None,
    ctx: DocumentTriggerContext,
) -> CreatedDocumentResult:
    oid = int(order.id)
    active = (
        db.query(OrderWarehouseReservation)
        .filter(
            OrderWarehouseReservation.tenant_id == int(tenant_id),
            OrderWarehouseReservation.warehouse_id == int(warehouse_id),
            OrderWarehouseReservation.order_id == oid,
            OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
            OrderWarehouseReservation.quantity > 0,
        )
        .count()
    )
    if active <= 0:
        raise DocumentCreationError(
            "Brak aktywnej rezerwacji magazynowej (OWR) — nie można utworzyć RZ.",
            code="owr_missing",
        )

    doc = ensure_rz_document_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=oid,
        created_by_user_id=actor_user_id,
        document_series=series,
        creation_source=ctx.source,
        raise_on_error=True,
    )
    if doc is None:
        raise DocumentCreationError(
            "Nie udało się utworzyć dokumentu RZ.",
            code="rz_create_failed",
        )

    # Detect create vs reuse: correlation with document id.
    created = True
    num = str(getattr(doc, "document_number", None) or "")
    corr = f"automation-rz:{ctx.automation_execution_id or 0}:{oid}:{int(doc.id)}"
    # If activity already exists for this doc from prior create, treat as reuse.
    from ..activity_log.domain_activity import find_activity_by_correlation

    prior = find_activity_by_correlation(db, correlation_id=f"doc-rz:{oid}:{int(doc.id)}", tenant_id=tenant_id)
    if prior is not None:
        created = False
    else:
        record_domain_activity(
            db,
            tenant_id=int(tenant_id),
            event_type=ORDER_WAREHOUSE_RZ_CREATED,
            description=(
                f"{ctx.actor_label} — utworzono dokument RZ {num}."
                if ctx.source.upper() == "AUTOMATION"
                else f"Utworzono dokument RZ {num}."
            ),
            order_id=oid,
            warehouse_id=int(warehouse_id),
            stock_document_id=int(doc.id),
            actor_user_id=actor_user_id,
            correlation_id=f"doc-rz:{oid}:{int(doc.id)}",
            metadata=_meta_base(ctx, series_id=str(series.id), order_id=oid),
            source_module="automation" if ctx.source.upper() == "AUTOMATION" else "domain",
            category="document",
        )
        if ctx.source.upper() == "AUTOMATION" and ctx.automation_execution_id:
            record_domain_activity(
                db,
                tenant_id=int(tenant_id),
                event_type=ORDER_WAREHOUSE_RZ_CREATED,
                description=f"Automatyzacja — utworzono dokument RZ {num}.",
                order_id=oid,
                warehouse_id=int(warehouse_id),
                stock_document_id=int(doc.id),
                actor_user_id=actor_user_id,
                correlation_id=corr,
                metadata=_meta_base(ctx, series_id=str(series.id), order_id=oid),
                source_module="automation",
                category="automation",
            )

    return CreatedDocumentResult(
        stock_document_id=int(doc.id),
        document_number=num,
        document_type=STOCK_DOC_TYPE_RESERVATION,
        series_id=str(series.id),
        created=created,
        settlement_mode=None,
        metadata={"order_id": oid},
    )


def _handle_wz(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    series: DocumentSeries,
    actor_user_id: int | None,
    ctx: DocumentTriggerContext,
) -> CreatedDocumentResult:
    from ..warehouse_wz.constants import SETTLEMENT_WMS_PICK
    from ...models.stock_document import StockDocument

    oid = int(order.id)
    settlement = next_undocumented_wms_settlement(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=oid,
    )
    if settlement is None:
        # Idempotent retry of the same automation execution — return prior documentary WZ.
        if ctx.automation_execution_id:
            from ...models.activity_event import ActivityEvent
            import json

            prefix = f"automation-wz:{int(ctx.automation_execution_id)}:{oid}:"
            prior = (
                db.query(ActivityEvent)
                .filter(
                    ActivityEvent.tenant_id == int(tenant_id),
                    ActivityEvent.correlation_id.like(f"{prefix}%"),
                )
                .order_by(ActivityEvent.id.desc())
                .first()
            )
            doc_id = None
            if prior is not None:
                try:
                    meta = json.loads(prior.metadata_json or "{}") if prior.metadata_json else {}
                except Exception:
                    meta = {}
                raw = (meta or {}).get("stock_document_id")
                if raw:
                    doc_id = int(raw)
            wz = None
            if doc_id:
                wz = (
                    db.query(StockDocument)
                    .filter(
                        StockDocument.id == int(doc_id),
                        StockDocument.tenant_id == int(tenant_id),
                    )
                    .first()
                )
            if wz is None and prior is not None:
                wz = (
                    db.query(StockDocument)
                    .filter(
                        StockDocument.tenant_id == int(tenant_id),
                        StockDocument.warehouse_id == int(warehouse_id),
                        StockDocument.order_id == oid,
                        StockDocument.document_type == "WZ",
                        StockDocument.settlement_mode == SETTLEMENT_WMS_PICK,
                    )
                    .order_by(StockDocument.id.desc())
                    .first()
                )
            if prior is not None and wz is not None:
                return CreatedDocumentResult(
                    stock_document_id=int(wz.id),
                    document_number=str(wz.document_number or ""),
                    document_type="WZ",
                    series_id=str(series.id),
                    created=False,
                    settlement_mode=SETTLEMENT_WMS_PICK,
                    metadata={"order_id": oid, "idempotent_retry": True},
                )
        raise DocumentCreationError(
            "Brak nieudokumentowanego settlementu WMS do utworzenia documentary WZ.",
            code="wz_no_settlement_context",
        )

    meta_extra = _meta_base(ctx, series_id=str(series.id), order_id=oid)
    meta_extra["fulfillment_key"] = settlement.fulfillment_key

    result = ensure_documentary_wz_for_pick_settlement(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order=order,
        pick_ids=list(settlement.pick_ids),
        fulfillment_kind=settlement.fulfillment_kind,
        fulfillment_session_id=settlement.fulfillment_session_id,
        performed_by_user_id=actor_user_id,
        metadata_extra=meta_extra,
        document_series=series,
        creation_source=ctx.source,
    )
    if result is None:
        raise DocumentCreationError(
            "Nie udało się utworzyć documentary WZ.",
            code="wz_create_failed",
        )

    num = str(result.document_number or "")
    if result.created and ctx.source.upper() == "AUTOMATION":
        record_domain_activity(
            db,
            tenant_id=int(tenant_id),
            event_type=ORDER_WZ_DOCUMENTARY_CREATED,
            description=f"Automatyzacja — utworzono dokument WZ {num}.",
            order_id=oid,
            warehouse_id=int(warehouse_id),
            stock_document_id=int(result.stock_document_id),
            actor_user_id=actor_user_id,
            correlation_id=(
                f"automation-wz:{ctx.automation_execution_id or 0}:{oid}:{result.idempotency_key}"
            ),
            metadata={**meta_extra, "stock_document_id": int(result.stock_document_id)},
            source_module="automation",
            category="automation",
        )

    return CreatedDocumentResult(
        stock_document_id=int(result.stock_document_id),
        document_number=num,
        document_type="WZ",
        series_id=str(series.id),
        created=bool(result.created),
        settlement_mode=SETTLEMENT_WMS_PICK,
        metadata={
            "order_id": oid,
            "fulfillment_key": settlement.fulfillment_key,
            "pick_ids": list(settlement.pick_ids),
            "idempotency_key": result.idempotency_key,
        },
    )
