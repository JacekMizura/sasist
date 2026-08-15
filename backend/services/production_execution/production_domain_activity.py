"""Emit domain Activity Log milestones for production MO/BAT (one event, multi-link)."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ..activity_log.domain_activity import record_domain_activity
from ..activity_log.domain_event_codes import (
    PRODUCTION_BATCH_CREATED,
    PRODUCTION_CANCELLED,
    PRODUCTION_COLLECTION_COMPLETED,
    PRODUCTION_COLLECTION_PROGRESS,
    PRODUCTION_COLLECTION_STARTED,
    PRODUCTION_COMPLETED,
    PRODUCTION_COMPONENT_SHORTAGE,
    PRODUCTION_CREATED_FROM_PLANNING,
    PRODUCTION_DEMAND_REDUCED,
    PRODUCTION_DUE_DATE_CHANGED,
    PRODUCTION_EXTERNAL_STOCK_COVERED_ORDER,
    PRODUCTION_MATERIALS_RESERVED,
    PRODUCTION_MATERIAL_RESERVATIONS_RELEASED,
    PRODUCTION_OPERATOR_ASSIGNED,
    PRODUCTION_OPERATOR_CHANGED,
    PRODUCTION_ORDER_CREATED,
    PRODUCTION_ORDER_DEMAND_FULFILLED,
    PRODUCTION_OUTPUT_REGISTERED,
    PRODUCTION_PLANNED_QTY_CHANGED,
    PRODUCTION_PROGRESS_REPORTED,
    PRODUCTION_PUTAWAY_COMPLETED,
    PRODUCTION_PW_CREATED,
    PRODUCTION_RELEASED,
    PRODUCTION_RESUMED,
    PRODUCTION_RW_CREATED,
    PRODUCTION_SENT_TO_PUTAWAY,
    PRODUCTION_SHORTAGE_AUTO_RESUMED,
    PRODUCTION_SHORTAGE_RESOLVED,
    PRODUCTION_SOURCE_DETACHED,
    PRODUCTION_STARTED,
    PRODUCTION_STATUS_AUTO_CHANGED,
    PRODUCTION_TRACEABILITY_BLOCKED,
)


def _qty_txt(v: Any) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "0"
    if abs(f - round(f)) < 1e-9:
        return str(int(round(f)))
    return f"{f:.4f}".rstrip("0").rstrip(".")


def _mo_label(order: Any) -> str:
    num = getattr(order, "number", None) or getattr(order, "document_number", None)
    oid = getattr(order, "id", None)
    return str(num).strip() if num else (f"MO-{oid}" if oid else "MO")


def _batch_label(batch: Any) -> str:
    num = getattr(batch, "number", None) or getattr(batch, "batch_number", None)
    bid = getattr(batch, "id", None)
    return str(num).strip() if num else (f"BAT-{bid}" if bid else "BAT")


def _base_meta(
    *,
    mo: Optional[int],
    bat: Optional[int],
    lbl: str,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "production_number": lbl,
        "mo_number": lbl if mo else None,
        "production_batch_number": lbl if bat and not mo else None,
        "production_order_id": mo,
        "batch_id": bat,
    }
    if extra:
        meta.update({k: v for k, v in extra.items() if v is not None})
    return meta


def _emit(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    event_type: str,
    description: str,
    correlation_id: str,
    actor_user_id: Optional[int] = None,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
    stock_document_id: Optional[int] = None,
    label: Optional[str] = None,
    category: str = "status",
    severity: str = "INFO",
    metadata: Optional[dict[str, Any]] = None,
    document_label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    lbl = label or (f"MO-{mo}" if mo else (f"BAT-{bat}" if bat else "production"))
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=event_type,
        description=description,
        actor_user_id=actor_user_id,
        order_id=order_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        stock_document_id=stock_document_id,
        correlation_id=correlation_id,
        source_module="production",
        category=category,
        severity=severity,
        production_label=lbl,
        document_label=document_label,
        metadata=_base_meta(mo=mo, bat=bat, lbl=lbl, extra=metadata),
    )


def emit_production_order_created(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: int,
    product_id: Optional[int] = None,
    planned_quantity: Optional[float] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    order_id: Optional[int] = None,
    from_planning: bool = False,
) -> None:
    mo = int(production_order_id)
    lbl = label or f"MO-{mo}"
    q = _qty_txt(planned_quantity) if planned_quantity is not None else None
    if from_planning:
        _emit(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            event_type=PRODUCTION_CREATED_FROM_PLANNING,
            description="Utworzono zlecenie z planowania zapasu." + (f" {lbl}." if lbl else ""),
            correlation_id=f"mo:{mo}:created-from-planning",
            actor_user_id=actor_user_id,
            production_order_id=mo,
            product_id=product_id,
            order_id=order_id,
            label=lbl,
            metadata={"planned_quantity": planned_quantity, "quantity": planned_quantity},
        )
        return
    desc = f"Utworzono zlecenie produkcji {lbl}" + (f" na {q} szt." if q else ".")
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_ORDER_CREATED,
        description=desc if desc.endswith(".") else desc + ".",
        correlation_id=f"mo:{mo}:created",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        product_id=product_id,
        order_id=order_id,
        label=lbl,
        severity="SUCCESS",
        metadata={"planned_quantity": planned_quantity, "quantity": planned_quantity},
    )


def emit_production_batch_created(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    batch_id: int,
    product_id: Optional[int] = None,
    planned_quantity: Optional[float] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    bat = int(batch_id)
    lbl = label or f"BAT-{bat}"
    q = _qty_txt(planned_quantity) if planned_quantity is not None else None
    desc = f"Utworzono serię produkcyjną {lbl}" + (f" na {q} szt." if q else ".")
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_BATCH_CREATED,
        description=desc if desc.endswith(".") else desc + ".",
        correlation_id=f"batch:{bat}:created",
        actor_user_id=actor_user_id,
        batch_id=bat,
        product_id=product_id,
        label=lbl,
        severity="SUCCESS",
        metadata={"planned_quantity": planned_quantity, "quantity": planned_quantity},
    )


def emit_production_operator_assigned(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    operator_name: str,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    changed_from: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:operator:{operator_name}" if mo else f"batch:{bat}:operator:{operator_name}"
    if changed_from:
        _emit(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            event_type=PRODUCTION_OPERATOR_CHANGED,
            description=f"Zmieniono operatora: {changed_from} → {operator_name}.",
            correlation_id=key[:64],
            actor_user_id=actor_user_id,
            production_order_id=mo,
            batch_id=bat,
            label=label,
            metadata={
                "old_operator_name": changed_from,
                "new_operator_name": operator_name,
                "operator_name": operator_name,
            },
        )
        return
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_OPERATOR_ASSIGNED,
        description=f"Przypisano operatora: {operator_name}.",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        label=label,
        metadata={"operator_name": operator_name, "new_operator_name": operator_name},
    )


def emit_production_due_date_changed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    old_due_date: str,
    new_due_date: str,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:due:{new_due_date}" if mo else f"batch:{bat}:due:{new_due_date}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_DUE_DATE_CHANGED,
        description=f"Termin zmieniono z {old_due_date} na {new_due_date}.",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        label=label,
        metadata={"old_due_date": old_due_date, "new_due_date": new_due_date},
    )


def emit_production_planned_qty_changed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    old_quantity: float,
    new_quantity: float,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = (
        f"mo:{mo}:planned-qty:{_qty_txt(new_quantity)}"
        if mo
        else f"batch:{bat}:planned-qty:{_qty_txt(new_quantity)}"
    )
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_PLANNED_QTY_CHANGED,
        description=f"Planowana ilość: {_qty_txt(old_quantity)} → {_qty_txt(new_quantity)} szt.",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        label=label,
        metadata={"old_quantity": old_quantity, "new_quantity": new_quantity, "planned_quantity": new_quantity},
    )


def emit_production_released(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    order_ids: Optional[list[int]] = None,
    product_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:released" if mo else f"batch:{bat}:released"
    first_order = order_ids[0] if order_ids else None
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_RELEASED,
        description="Zlecenie przekazano do realizacji.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=first_order,
        label=label,
    )


def emit_production_component_shortage(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    shortage_sku: Optional[str] = None,
    shortage_qty: Optional[float] = None,
    component_product_id: Optional[int] = None,
    correlation_suffix: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    suffix = correlation_suffix or (shortage_sku or "materials")
    key = f"mo:{mo}:shortage:{suffix}" if mo else f"batch:{bat}:shortage:{suffix}"
    if shortage_sku and shortage_qty is not None:
        desc = f"Nie można rozpocząć produkcji — brakuje {shortage_sku}: {_qty_txt(shortage_qty)} szt."
    else:
        desc = "Nie można rozpocząć produkcji — brak materiałów."
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_COMPONENT_SHORTAGE,
        description=desc,
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id or component_product_id,
        order_id=order_id,
        label=label,
        category="shortage",
        severity="WARNING",
        metadata={
            "shortage_sku": shortage_sku,
            "shortage_qty": shortage_qty,
            "component_product_id": component_product_id,
        },
    )


def emit_production_shortage_resolved(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:shortage-resolved" if mo else f"batch:{bat}:shortage-resolved"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_SHORTAGE_RESOLVED,
        description="Materiały dostępne — zlecenie może zostać wznowione.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        label=label,
        severity="SUCCESS",
    )


def emit_production_materials_reserved(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:materials-reserved" if mo else f"batch:{bat}:materials-reserved"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_MATERIALS_RESERVED,
        description="Zarezerwowano materiały do produkcji.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        label=label,
        category="reservation",
        severity="SUCCESS",
    )


def emit_production_material_reservations_released(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:materials-released:{reason or 'ok'}" if mo else f"batch:{bat}:materials-released:{reason or 'ok'}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_MATERIAL_RESERVATIONS_RELEASED,
        description="Zwolniono rezerwacje materiałów.",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        label=label,
        category="reservation",
        metadata={"reason": reason},
    )


def emit_production_collection_started(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    product_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:collection:start" if mo else f"batch:{bat}:collection:start"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_COLLECTION_STARTED,
        description="Rozpoczęto pobieranie komponentów.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        label=label,
        category="picking",
    )


def emit_production_collection_progress(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    collected_qty: float,
    required_qty: float,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    """Milestone only — do not call per scan."""
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = (
        f"mo:{mo}:collection:progress:{_qty_txt(collected_qty)}"
        if mo
        else f"batch:{bat}:collection:progress:{_qty_txt(collected_qty)}"
    )
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_COLLECTION_PROGRESS,
        description=f"Pobrano {_qty_txt(collected_qty)}/{_qty_txt(required_qty)} szt. materiałów.",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        label=label,
        category="picking",
        metadata={"collected_qty": collected_qty, "required_qty": required_qty},
    )


def emit_production_collection_completed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    product_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:collection:end" if mo else f"batch:{bat}:collection:end"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_COLLECTION_COMPLETED,
        description="Zakończono pobieranie komponentów.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        label=label,
        category="picking",
        severity="SUCCESS",
    )


def emit_production_rw_created(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    stock_document_id: int,
    document_number: Optional[str] = None,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    order_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    doc_id = int(stock_document_id)
    key = f"mo:{mo}:rw:{doc_id}" if mo else f"batch:{bat}:rw:{doc_id}"
    doc_no = document_number or f"RW#{doc_id}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_RW_CREATED,
        description=f"Utworzono {doc_no}.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        stock_document_id=doc_id,
        label=label,
        severity="SUCCESS",
        document_label=doc_no,
        metadata={"document_number": doc_no, "rw_document_id": doc_id, "rw_document_number": doc_no},
    )


def emit_production_started(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:started" if mo else f"batch:{bat}:started"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_STARTED,
        description="Rozpoczęto produkcję.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        label=label,
    )


def emit_production_progress_reported(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    qty: Optional[float] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    correlation_suffix: Optional[str] = None,
) -> None:
    """Legacy alias — prefer emit_production_output_registered."""
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    suffix = correlation_suffix or (f"qty:{qty}" if qty is not None else "tick")
    key = f"mo:{mo}:progress:{suffix}" if mo else f"batch:{bat}:progress:{suffix}"
    qtxt = f" (+{_qty_txt(qty)})" if qty is not None else ""
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_PROGRESS_REPORTED,
        description=f"Zraportowano postęp produkcji: {lbl}{qtxt}",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        label=lbl,
        metadata={"quantity": qty},
    )


def emit_production_output_registered(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    output_id: int,
    quantity: float,
    produced_total: float,
    planned_quantity: float,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
    stock_document_id: Optional[int] = None,
    document_number: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    batch_number: Optional[str] = None,
    serial_numbers: Optional[list[str]] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    out_id = int(output_id)
    key = f"mo:{mo}:output:{out_id}" if mo else f"batch:{bat}:output:{out_id}"
    serials = [str(x).strip() for x in (serial_numbers or []) if str(x).strip()]
    lot = (batch_number or "").strip() or None
    if serials:
        desc = f"Zarejestrowano produkcję {_qty_txt(quantity)} szt. z numerami seryjnymi."
    elif lot:
        desc = (
            f"Zarejestrowano produkcję {_qty_txt(quantity)} szt. · Partia (LOT): {lot} · "
            f"łącznie {_qty_txt(produced_total)}/{_qty_txt(planned_quantity)} szt."
        )
    else:
        desc = (
            f"Zarejestrowano produkcję {_qty_txt(quantity)} szt. · "
            f"łącznie {_qty_txt(produced_total)}/{_qty_txt(planned_quantity)} szt."
        )
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_OUTPUT_REGISTERED,
        description=desc,
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        stock_document_id=stock_document_id,
        label=label,
        severity="SUCCESS",
        document_label=document_number,
        metadata={
            "quantity": quantity,
            "produced_total": produced_total,
            "planned_quantity": planned_quantity,
            "batch_number": lot,
            "serial_count": len(serials) if serials else 0,
            "serial_numbers": serials or None,
            "output_id": out_id,
            "pw_document_id": stock_document_id,
            "document_number": document_number,
            "pw_document_number": document_number,
        },
    )


def emit_production_pw_created(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    stock_document_id: int,
    document_number: Optional[str] = None,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    quantity: Optional[float] = None,
    order_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    doc_id = int(stock_document_id)
    key = f"mo:{mo}:pw:{doc_id}" if mo else f"batch:{bat}:pw:{doc_id}"
    doc_no = document_number or f"PW#{doc_id}"
    desc = f"Utworzono {doc_no} na {_qty_txt(quantity)} szt." if quantity is not None else f"Utworzono {doc_no}."
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_PW_CREATED,
        description=desc,
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        stock_document_id=doc_id,
        label=label,
        severity="SUCCESS",
        document_label=doc_no,
        metadata={
            "document_number": doc_no,
            "pw_document_id": doc_id,
            "pw_document_number": doc_no,
            "quantity": quantity,
        },
    )


def emit_production_sent_to_putaway(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    quantity: Optional[float] = None,
    stock_document_id: Optional[int] = None,
    document_number: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    doc_part = f":pw:{int(stock_document_id)}" if stock_document_id else ""
    key = f"mo:{mo}:sent-putaway{doc_part}" if mo else f"batch:{bat}:sent-putaway{doc_part}"
    desc = (
        f"Przekazano {_qty_txt(quantity)} szt. do rozlokowania."
        if quantity is not None
        else "Przekazano do rozlokowania."
    )
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_SENT_TO_PUTAWAY,
        description=desc,
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        stock_document_id=stock_document_id,
        label=label,
        document_label=document_number,
        metadata={"quantity": quantity, "document_number": document_number, "pw_document_id": stock_document_id},
    )


def emit_production_putaway_completed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    stock_document_id: int,
    document_number: Optional[str] = None,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    quantity: Optional[float] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    doc_id = int(stock_document_id)
    key = f"mo:{mo}:pw:{doc_id}:putaway-done" if mo else f"batch:{bat}:pw:{doc_id}:putaway-done"
    doc_no = document_number or f"PW#{doc_id}"
    desc = f"Rozlokowano {_qty_txt(quantity)} szt. wyrobu." if quantity is not None else f"Rozlokowano FG z {doc_no}."
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_PUTAWAY_COMPLETED,
        description=desc,
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        stock_document_id=doc_id,
        label=label,
        severity="SUCCESS",
        document_label=doc_no,
        metadata={"document_number": doc_no, "quantity": quantity, "pw_document_id": doc_id},
    )


def emit_production_order_demand_fulfilled(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: int,
    order_id: int,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    order_number: Optional[str] = None,
) -> None:
    mo = int(production_order_id)
    oid = int(order_id)
    ol = (order_number or str(oid)).strip()
    if ol and not ol.startswith("#"):
        ol = f"#{ol}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_ORDER_DEMAND_FULFILLED,
        description=f"Produkcja pokryła zapotrzebowanie zamówienia {ol}.",
        correlation_id=f"mo:{mo}:order:{oid}:fulfilled",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        product_id=product_id,
        order_id=oid,
        label=label,
        severity="SUCCESS",
        metadata={"order_id": oid, "order_number": ol},
    )


def emit_production_external_stock_covered_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int],
    order_id: int,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    correlation_suffix: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    oid = int(order_id)
    suffix = correlation_suffix or "ext"
    key = f"mo:{mo}:order:{oid}:ext-covered:{suffix}" if mo else f"order:{oid}:ext-covered:{suffix}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_EXTERNAL_STOCK_COVERED_ORDER,
        description="Zamówienie pokryto istniejącym stockiem — produkcja pozostaje na wolny zapas.",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        product_id=product_id,
        order_id=oid,
        label=label,
        metadata={"order_id": oid},
    )


def emit_production_demand_reduced(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int],
    order_id: int,
    product_id: Optional[int] = None,
    old_quantity: float,
    new_quantity: float,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    oid = int(order_id)
    key = f"mo:{mo}:order:{oid}:demand:{_qty_txt(old_quantity)}->{_qty_txt(new_quantity)}"
    if not mo:
        key = f"order:{oid}:demand:{_qty_txt(old_quantity)}->{_qty_txt(new_quantity)}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_DEMAND_REDUCED,
        description=f"Zapotrzebowanie produkcyjne zmniejszono {_qty_txt(old_quantity)} → {_qty_txt(new_quantity)} szt.",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        product_id=product_id,
        order_id=oid,
        label=label,
        metadata={
            "old_quantity": old_quantity,
            "new_quantity": new_quantity,
            "was_outstanding": old_quantity,
            "remaining_outstanding": new_quantity,
            "order_id": oid,
        },
    )


def emit_production_source_detached(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int],
    order_id: int,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    correlation_suffix: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    oid = int(order_id)
    suffix = correlation_suffix or "detach"
    key = f"mo:{mo}:order:{oid}:detached:{suffix}" if mo else f"order:{oid}:detached:{suffix}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_SOURCE_DETACHED,
        description="Zamówienie pokryto z magazynu — produkcja trafia na wolny zapas.",
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        product_id=product_id,
        order_id=oid,
        label=label,
        metadata={"order_id": oid},
    )


def emit_production_completed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    product_id: Optional[int] = None,
    produced_total: Optional[float] = None,
    planned_quantity: Optional[float] = None,
    order_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:completed" if mo else f"batch:{bat}:completed"
    if produced_total is not None and planned_quantity is not None:
        desc = f"Zakończono zlecenie produkcji {_qty_txt(produced_total)}/{_qty_txt(planned_quantity)} szt."
    else:
        desc = "Zakończono zlecenie produkcji."
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_COMPLETED,
        description=desc,
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        label=label,
        severity="SUCCESS",
        metadata={"produced_total": produced_total, "planned_quantity": planned_quantity},
    )


def emit_production_cancelled(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:cancelled" if mo else f"batch:{bat}:cancelled"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_CANCELLED,
        description="Anulowano zlecenie produkcyjne.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        label=label,
        severity="WARNING",
    )


def emit_production_resumed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:resumed" if mo else f"batch:{bat}:resumed"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_RESUMED,
        description="Wznowiono zlecenie produkcyjne.",
        correlation_id=key,
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        label=label,
        severity="SUCCESS",
    )


def emit_production_traceability_blocked(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    reason_message: str,
    correlation_suffix: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    suffix = correlation_suffix or "blocked"
    key = f"mo:{mo}:trace-blocked:{suffix}" if mo else f"batch:{bat}:trace-blocked:{suffix}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_TRACEABILITY_BLOCKED,
        description=reason_message,
        correlation_id=key[:64],
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        label=label,
        severity="WARNING",
        category="validation",
        metadata={"reason_message": reason_message},
    )


def emit_production_status_auto_changed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
    from_status_label: str,
    to_status_label: str,
    label: Optional[str] = None,
    correlation_suffix: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    suffix = correlation_suffix or f"{from_status_label}->{to_status_label}"
    key = f"mo:{mo}:auto-status:{suffix}" if mo else f"batch:{bat}:auto-status:{suffix}"
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_STATUS_AUTO_CHANGED,
        description=f"Automatycznie przeniesiono z {from_status_label} do {to_status_label}.",
        correlation_id=key[:64],
        actor_user_id=None,  # System
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        order_id=order_id,
        label=label,
        metadata={
            "from_status_label": from_status_label,
            "to_status_label": to_status_label,
        },
    )


def emit_production_shortage_auto_resumed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: int,
    product_id: Optional[int] = None,
    order_id: Optional[int] = None,
    label: Optional[str] = None,
    correlation_suffix: Optional[str] = None,
) -> None:
    mo = int(production_order_id)
    suffix = correlation_suffix or (f"order:{order_id}" if order_id else "ok")
    _emit(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_SHORTAGE_AUTO_RESUMED,
        description="Wznowiono produkcję po uzupełnieniu materiałów.",
        correlation_id=f"mo:{mo}:shortage-auto-resumed:{suffix}"[:64],
        actor_user_id=None,  # System / Phase 8
        production_order_id=mo,
        product_id=product_id,
        order_id=order_id,
        label=label,
        severity="SUCCESS",
    )
