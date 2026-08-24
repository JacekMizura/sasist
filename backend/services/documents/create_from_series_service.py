"""Canonical document creation from an explicit DocumentSeries trigger."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ...models.document_series import DocumentSeries
from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from ...models.order_warehouse_reservation import OrderWarehouseReservation
from ...models.product import Product
from ..activity_log.domain_activity import record_domain_activity
from ..activity_log.domain_event_codes import (
    ORDER_WAREHOUSE_RZ_CREATED,
    ORDER_WZ_DOCUMENTARY_CREATED,
)
from ..activity_log.order_event_codes import SALE_DOCUMENT_CREATED
from ..bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from ..order_reservations.availability import warehouse_business_available_qty
from ..order_reservations.constants import OWR_ACTIVE_STATUSES, STOCK_DOC_TYPE_RESERVATION
from ..order_reservations.reservation_service import (
    OrderWarehouseReservationError,
    reserved_qty_for_order_product,
    sync_order_warehouse_reservation_to_target,
)
from ..order_reservations.rz_document_service import ensure_rz_document_for_order
from ..stock_disposition import resolve_order_item_required_disposition
from ..warehouse_wz.post_pick_settlement import ensure_documentary_wz_for_pick_settlement
from ..warehouse_wz.settlement_resolution import next_undocumented_wms_settlement
from .generate_document_support import (
    DocumentCreationOverrides,
    build_issuance_overrides_dict,
    format_sale_date_pl,
    is_generate_document_supported,
    resolve_series_payment_term_text,
    resolve_series_sale_date_iso,
)


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
    sale_document_id: str | None = None
    print_job_id: int | None = None
    series_name: str | None = None


def create_document_from_series(
    db: Session,
    *,
    tenant_id: int,
    series_id: str,
    order_id: int,
    actor_user_id: int | None = None,
    trigger_context: DocumentTriggerContext | None = None,
    overrides: DocumentCreationOverrides | None = None,
    api_base_url: str | None = None,
) -> CreatedDocumentResult:
    """
    Thin dispatcher: load series → type/subtype handler.

    Supported: SALE/INVOICE, SALE/RECEIPT, WAREHOUSE/RESERVATION (RZ), WAREHOUSE/WZ (documentary).
    """
    ctx = trigger_context or DocumentTriggerContext()
    ov = overrides or DocumentCreationOverrides()
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

    if not is_generate_document_supported(series_type, subtype):
        raise DocumentCreationError(
            f"Unsupported series type/subtype for automation: {series_type}/{subtype}",
            code="unsupported_series",
        )

    if series_type == "SALE" and subtype in ("INVOICE", "RECEIPT"):
        result = _handle_sale(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=warehouse_id,
            order=order,
            series=series,
            subtype=subtype,
            actor_user_id=actor_user_id,
            ctx=ctx,
            overrides=ov,
        )
    elif series_type == "WAREHOUSE" and subtype == STOCK_DOC_TYPE_RESERVATION:
        result = _handle_rz(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=warehouse_id,
            order=order,
            series=series,
            actor_user_id=actor_user_id,
            ctx=ctx,
        )
    elif series_type == "WAREHOUSE" and subtype == "WZ":
        result = _handle_wz(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=warehouse_id,
            order=order,
            series=series,
            actor_user_id=actor_user_id,
            ctx=ctx,
        )
    else:
        raise DocumentCreationError(
            f"Unsupported series type/subtype for automation: {series_type}/{subtype}",
            code="unsupported_series",
        )

    if ov.auto_print:
        print_job_id = _enqueue_document_print(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=warehouse_id,
            result=result,
            workstation_id=int(ov.print_station_id) if ov.print_station_id else None,
            actor_user_id=actor_user_id,
            api_base_url=api_base_url,
        )
        meta = dict(result.metadata or {})
        meta["print_job_id"] = print_job_id
        meta["print_station_id"] = ov.print_station_id
        station_name = _workstation_display_name(
            db, tenant_id=int(tenant_id), workstation_id=int(ov.print_station_id or 0)
        )
        if station_name:
            meta["print_station_name"] = station_name
        result = CreatedDocumentResult(
            stock_document_id=result.stock_document_id,
            document_number=result.document_number,
            document_type=result.document_type,
            series_id=result.series_id,
            created=result.created,
            settlement_mode=result.settlement_mode,
            metadata=meta,
            sale_document_id=result.sale_document_id,
            print_job_id=print_job_id,
            series_name=result.series_name or str(getattr(series, "name", None) or ""),
        )
    elif not result.series_name:
        result = CreatedDocumentResult(
            stock_document_id=result.stock_document_id,
            document_number=result.document_number,
            document_type=result.document_type,
            series_id=result.series_id,
            created=result.created,
            settlement_mode=result.settlement_mode,
            metadata=result.metadata,
            sale_document_id=result.sale_document_id,
            print_job_id=result.print_job_id,
            series_name=str(getattr(series, "name", None) or ""),
        )

    return result


def _enqueue_document_print(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    result: CreatedDocumentResult,
    workstation_id: int | None,
    actor_user_id: int | None,
    api_base_url: str | None,
) -> int:
    import os

    from ...schemas.printing.queue import QueuePrintRequest
    from ..printing.errors import PrintingError
    from ..printing.queue_service import queue_print_job

    if workstation_id is None or workstation_id < 1:
        raise DocumentCreationError("print_station_id is required when auto_print=true", code="print_station_required")

    base = (api_base_url or os.environ.get("PUBLIC_API_BASE_URL") or "http://127.0.0.1:8000").rstrip("/")
    try:
        if result.sale_document_id:
            payload = QueuePrintRequest(
                document_type="sale_document",
                document_id_str=str(result.sale_document_id),
                warehouse_id=int(warehouse_id),
                workstation_id=int(workstation_id),
                copies=1,
            )
        else:
            payload = QueuePrintRequest(
                document_type="stock_document",
                document_id=int(result.stock_document_id),
                warehouse_id=int(warehouse_id),
                workstation_id=int(workstation_id),
                copies=1,
            )
        job = queue_print_job(
            db,
            tenant_id=int(tenant_id),
            payload=payload,
            api_base_url=base,
            created_by_user_id=actor_user_id,
            commit=False,
        )
    except PrintingError as exc:
        raise DocumentCreationError(str(exc), code="print_failed") from exc
    except Exception as exc:
        raise DocumentCreationError(f"Auto-print failed: {exc}", code="print_failed") from exc
    return int(job.id)


def _workstation_display_name(db: Session, *, tenant_id: int, workstation_id: int) -> str | None:
    try:
        from ...models.wms_workstations.workstation import WmsWorkstation

        row = (
            db.query(WmsWorkstation)
            .filter(
                WmsWorkstation.id == int(workstation_id),
                WmsWorkstation.tenant_id == int(tenant_id),
            )
            .first()
        )
        if row is None:
            return None
        name = str(getattr(row, "name", None) or "").strip()
        return name or None
    except Exception:
        return None


def _handle_sale(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    series: DocumentSeries,
    subtype: str,
    actor_user_id: int | None,
    ctx: DocumentTriggerContext,
    overrides: DocumentCreationOverrides,
) -> CreatedDocumentResult:
    from ..wms_sale_document_service import create_sale_document, panel_document_type_for_series
    from ...models.sale_document import SaleDocument
    from ..activity_log.domain_activity import find_activity_by_correlation

    oid = int(order.id)
    panel = panel_document_type_for_series(series)
    corr = (
        f"automation-sale:{ctx.automation_execution_id or 0}:"
        f"{ctx.automation_effect_id or 0}:{oid}:{series.id}"
    )

    # Idempotent retry of the same automation effect execution.
    if ctx.automation_execution_id:
        prior = find_activity_by_correlation(db, correlation_id=corr, tenant_id=tenant_id)
        if prior is not None:
            existing = (
                db.query(SaleDocument)
                .filter(
                    SaleDocument.order_id == oid,
                    SaleDocument.document_kind == "PRIMARY",
                    SaleDocument.series_type == "SALE",
                )
                .order_by(SaleDocument.created_at.desc())
                .first()
            )
            if existing is not None:
                return CreatedDocumentResult(
                    stock_document_id=0,
                    document_number=str(existing.document_number or ""),
                    document_type=str(existing.document_subtype or subtype),
                    series_id=str(series.id),
                    created=False,
                    settlement_mode=None,
                    metadata={"order_id": oid, "idempotent_retry": True, "sale_document_id": str(existing.id)},
                    sale_document_id=str(existing.id),
                    series_name=str(series.name or ""),
                )

    before = (
        db.query(SaleDocument)
        .filter(
            SaleDocument.order_id == oid,
            SaleDocument.document_kind == "PRIMARY",
            SaleDocument.series_type == "SALE",
        )
        .order_by(SaleDocument.created_at.desc())
        .first()
    )

    issuance = build_issuance_overrides_dict(series, order, overrides)
    doc = create_sale_document(
        db,
        order=order,
        series_id=str(series.id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        panel_document_type=panel,
        issuance_overrides=issuance or None,
    )
    created = before is None or str(before.id) != str(doc.id)
    # create_sale_document reuses existing PRIMARY — treat as not newly created.
    if before is not None and str(before.id) == str(doc.id):
        created = False

    num = str(doc.document_number or "")
    term_txt = resolve_series_payment_term_text(series, overrides)
    sale_iso = resolve_series_sale_date_iso(series, order, overrides)
    meta = _meta_base(ctx, series_id=str(series.id), order_id=oid)
    meta.update(
        {
            "sale_document_id": str(doc.id),
            "payment_term": term_txt,
            "sale_date": sale_iso,
            "additional_description": overrides.additional_description if overrides.override_description else None,
        }
    )

    if created and ctx.source.upper() == "AUTOMATION":
        bits = [f"Automatyzacja — utworzono dokument {num}."]
        if term_txt:
            bits.append(f"Termin płatności: {term_txt}.")
        if sale_iso:
            pl = format_sale_date_pl(sale_iso)
            if pl:
                bits.append(f"Data sprzedaży: {pl}.")
        if overrides.override_description and overrides.additional_description:
            bits.append("Dodano opis dodatkowy.")
        record_domain_activity(
            db,
            tenant_id=int(tenant_id),
            event_type=SALE_DOCUMENT_CREATED,
            description=" ".join(bits),
            order_id=oid,
            warehouse_id=int(warehouse_id),
            actor_user_id=actor_user_id,
            correlation_id=corr,
            metadata={k: v for k, v in meta.items() if v is not None},
            source_module="automation",
            category="automation",
        )

    return CreatedDocumentResult(
        stock_document_id=0,
        document_number=num,
        document_type=str(doc.document_subtype or subtype),
        series_id=str(series.id),
        created=created,
        settlement_mode=None,
        metadata={k: v for k, v in meta.items() if v is not None},
        sale_document_id=str(doc.id),
        series_name=str(series.name or ""),
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


def _order_line_reservation_targets(
    db: Session,
    *,
    order: Order,
) -> dict[tuple[int, str], float]:
    """Aggregate operational order lines → (product_id, disposition) → target qty."""
    items = list(getattr(order, "items", None) or [])
    if not items:
        items = (
            db.query(OrderItem)
            .filter(OrderItem.order_id == int(order.id))
            .all()
        )
    targets: dict[tuple[int, str], float] = {}
    for oi in items:
        if order_item_is_replaced_line(oi):
            continue
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        pid = int(getattr(oi, "product_id", 0) or 0)
        if pid <= 0:
            continue
        raw = float(getattr(oi, "quantity", 0) or 0)
        removed = float(getattr(oi, "oms_removed_qty", None) or 0)
        qty = max(0.0, round(raw - removed, 6))
        if qty <= 1e-9:
            continue
        sd = resolve_order_item_required_disposition(oi)
        key = (pid, sd)
        targets[key] = round(float(targets.get(key, 0.0)) + qty, 6)
    return targets


def _product_label(db: Session, *, tenant_id: int, product_id: int) -> tuple[str, str, str]:
    p = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
        .first()
    )
    if p is None:
        return (f"#{product_id}", "—", "—")
    name = str(getattr(p, "name", None) or "").strip() or f"#{product_id}"
    sku = str(getattr(p, "sku", None) or getattr(p, "symbol", None) or "").strip() or "—"
    ean = str(getattr(p, "ean", None) or "").strip() or "—"
    return (name, sku, ean)


def _sync_business_reservations_for_rz_trigger(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    actor_user_id: int | None,
) -> list[dict[str, Any]]:
    """
    Explicit RZ trigger: sync OWR to current order line targets (create/increase/decrease).
    Does not create RZ — caller ensures document after this succeeds.
    """
    oid = int(order.id)
    targets = _order_line_reservation_targets(db, order=order)
    if not targets:
        raise DocumentCreationError(
            "Brak pozycji zamówienia do rezerwacji — nie można utworzyć RZ.",
            code="no_order_lines",
        )

    # ATP gate before mutation (clear per-product messages).
    for (pid, sd), target in targets.items():
        cap = warehouse_business_available_qty(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(pid),
            stock_disposition=sd,
            exclude_order_id=oid,
        )
        if float(target) > float(cap) + 1e-9:
            name, sku, ean = _product_label(db, tenant_id=int(tenant_id), product_id=int(pid))
            raise DocumentCreationError(
                f"Brak dostępnego stanu do rezerwacji. Produkt {name}, SKU {sku}, EAN {ean}: "
                f"wymagane {float(target):g}, dostępne {float(cap):g}.",
                code="insufficient_atp",
            )

    existing = (
        db.query(OrderWarehouseReservation)
        .filter(
            OrderWarehouseReservation.tenant_id == int(tenant_id),
            OrderWarehouseReservation.warehouse_id == int(warehouse_id),
            OrderWarehouseReservation.order_id == oid,
            OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
        )
        .all()
    )
    existing_keys = {
        (int(r.product_id), str(r.stock_disposition or "SALEABLE")) for r in existing
    }

    reserved_lines: list[dict[str, Any]] = []
    for (pid, sd), target in sorted(targets.items(), key=lambda x: x[0][0]):
        try:
            sync_order_warehouse_reservation_to_target(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order_id=oid,
                product_id=int(pid),
                target_qty=float(target),
                stock_disposition=sd,
                performed_by_user_id=actor_user_id,
            )
        except OrderWarehouseReservationError as exc:
            name, sku, ean = _product_label(db, tenant_id=int(tenant_id), product_id=int(pid))
            avail = warehouse_business_available_qty(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(pid),
                stock_disposition=sd,
                exclude_order_id=oid,
            )
            raise DocumentCreationError(
                f"Brak dostępnego stanu do rezerwacji. Produkt {name}, SKU {sku}, EAN {ean}: "
                f"wymagane {float(target):g}, dostępne {float(avail):g}.",
                code=getattr(exc, "code", None) or "insufficient_atp",
            ) from exc
        rem = reserved_qty_for_order_product(
            db,
            tenant_id=int(tenant_id),
            order_id=oid,
            product_id=int(pid),
            warehouse_id=int(warehouse_id),
            stock_disposition=sd,
        )
        name, sku, ean = _product_label(db, tenant_id=int(tenant_id), product_id=int(pid))
        reserved_lines.append(
            {
                "product_id": int(pid),
                "name": name,
                "sku": sku,
                "ean": ean,
                "quantity": float(rem),
                "stock_disposition": sd,
            }
        )

    # Release OWR for products no longer on the order.
    for key in existing_keys - set(targets.keys()):
        pid, sd = key
        sync_order_warehouse_reservation_to_target(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=oid,
            product_id=int(pid),
            target_qty=0.0,
            stock_disposition=sd,
            performed_by_user_id=actor_user_id,
        )

    return reserved_lines


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
    """
    Explicit RZ trigger: sync business reservation (OWR) from order lines, then ensure RZ.

    Not: existing OWR → document wrapper.
    Yes: order → OWR create/sync → RZ document (physical inventory unchanged).
    """
    oid = int(order.id)
    from ..activity_log.domain_activity import find_activity_by_correlation

    # Idempotent retry of the same automation effect execution.
    if ctx.automation_execution_id:
        from ...models.activity_event import ActivityEvent
        from ...models.stock_document import StockDocument
        import json

        corr_prefix = (
            f"automation-rz:{ctx.automation_execution_id}:"
            f"{ctx.automation_effect_id or 0}:{oid}:"
        )
        legacy_prefix = f"automation-rz:{ctx.automation_execution_id}:{oid}:"
        prior = (
            db.query(ActivityEvent)
            .filter(
                ActivityEvent.tenant_id == int(tenant_id),
                ActivityEvent.correlation_id.like(f"{corr_prefix}%"),
            )
            .order_by(ActivityEvent.id.desc())
            .first()
        )
        if prior is None:
            prior = (
                db.query(ActivityEvent)
                .filter(
                    ActivityEvent.tenant_id == int(tenant_id),
                    ActivityEvent.correlation_id.like(f"{legacy_prefix}%"),
                )
                .order_by(ActivityEvent.id.desc())
                .first()
            )
        if prior is not None:
            doc_id = None
            try:
                meta_prior = json.loads(prior.metadata_json or "{}") if prior.metadata_json else {}
            except Exception:
                meta_prior = {}
            raw = (meta_prior or {}).get("stock_document_id")
            if raw:
                try:
                    doc_id = int(raw)
                except (TypeError, ValueError):
                    doc_id = None
            existing_doc = None
            if doc_id:
                existing_doc = (
                    db.query(StockDocument)
                    .filter(
                        StockDocument.id == int(doc_id),
                        StockDocument.tenant_id == int(tenant_id),
                    )
                    .first()
                )
            if existing_doc is None:
                existing_doc = (
                    db.query(StockDocument)
                    .filter(
                        StockDocument.tenant_id == int(tenant_id),
                        StockDocument.warehouse_id == int(warehouse_id),
                        StockDocument.order_id == oid,
                        StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION,
                    )
                    .order_by(StockDocument.id.desc())
                    .first()
                )
            if existing_doc is not None:
                return CreatedDocumentResult(
                    stock_document_id=int(existing_doc.id),
                    document_number=str(existing_doc.document_number or ""),
                    document_type=STOCK_DOC_TYPE_RESERVATION,
                    series_id=str(series.id),
                    created=False,
                    settlement_mode=None,
                    metadata={
                        "order_id": oid,
                        "idempotent_retry": True,
                        "reserved_qty_total": float(
                            sum(
                                float(r.quantity or 0)
                                for r in db.query(OrderWarehouseReservation)
                                .filter(
                                    OrderWarehouseReservation.tenant_id == int(tenant_id),
                                    OrderWarehouseReservation.warehouse_id == int(warehouse_id),
                                    OrderWarehouseReservation.order_id == oid,
                                    OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
                                )
                                .all()
                            )
                        ),
                    },
                    series_name=str(series.name or ""),
                )

    reserved_lines: list[dict[str, Any]] = []
    try:
        with db.begin_nested():
            reserved_lines = _sync_business_reservations_for_rz_trigger(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order=order,
                actor_user_id=actor_user_id,
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
    except DocumentCreationError:
        raise
    except OrderWarehouseReservationError as exc:
        raise DocumentCreationError(str(exc), code=getattr(exc, "code", None) or "owr_failed") from exc
    except Exception as exc:
        raise DocumentCreationError(
            f"Nie udało się utworzyć rezerwacji RZ: {exc}",
            code="rz_create_failed",
        ) from exc

    num = str(getattr(doc, "document_number", None) or "")
    total_qty = round(sum(float(x.get("quantity") or 0) for x in reserved_lines), 6)
    order_label = str(getattr(order, "number", None) or oid)
    created = True
    corr = (
        f"automation-rz:{ctx.automation_execution_id or 0}:"
        f"{ctx.automation_effect_id or 0}:{oid}:{int(doc.id)}"
    )
    prior_doc = find_activity_by_correlation(
        db, correlation_id=f"doc-rz:{oid}:{int(doc.id)}", tenant_id=tenant_id
    )
    if prior_doc is not None:
        created = False
    else:
        if ctx.source.upper() == "AUTOMATION":
            desc = (
                f"Automatyzacja — utworzono rezerwację {num}. "
                f"Zarezerwowano {total_qty:g} szt. produktów dla zamówienia #{order_label}."
            )
        else:
            desc = (
                f"Utworzono rezerwację {num}. "
                f"Zarezerwowano {total_qty:g} szt. produktów dla zamówienia #{order_label}."
            )
        meta = _meta_base(ctx, series_id=str(series.id), order_id=oid)
        meta.update(
            {
                "reserved_qty_total": total_qty,
                "reserved_lines": reserved_lines,
                "order_number": order_label,
                "stock_document_id": int(doc.id),
            }
        )
        record_domain_activity(
            db,
            tenant_id=int(tenant_id),
            event_type=ORDER_WAREHOUSE_RZ_CREATED,
            description=desc,
            order_id=oid,
            warehouse_id=int(warehouse_id),
            stock_document_id=int(doc.id),
            actor_user_id=actor_user_id,
            correlation_id=f"doc-rz:{oid}:{int(doc.id)}",
            metadata=meta,
            source_module="automation" if ctx.source.upper() == "AUTOMATION" else "domain",
            category="document",
        )
        if ctx.source.upper() == "AUTOMATION" and ctx.automation_execution_id:
            record_domain_activity(
                db,
                tenant_id=int(tenant_id),
                event_type=ORDER_WAREHOUSE_RZ_CREATED,
                description=desc,
                order_id=oid,
                warehouse_id=int(warehouse_id),
                stock_document_id=int(doc.id),
                actor_user_id=actor_user_id,
                correlation_id=corr,
                metadata=meta,
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
        metadata={
            "order_id": oid,
            "order_number": order_label,
            "reserved_qty_total": total_qty,
            "reserved_lines": reserved_lines,
        },
        series_name=str(series.name or ""),
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
