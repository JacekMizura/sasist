"""Printed shop-floor card — alternate execution *interface* for ORDERS MOs.

Same collecting / RW / progress lifecycle as WMS and ERP. Preview PDF must not
mutate stock; conscious start may lock reservations and finish collecting (RW).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.picking_config import (
    PRODUCTION_EXECUTION_METHOD_PRINT,
    PRODUCTION_EXECUTION_METHOD_WMS,
)
from ...models.production import PRODUCTION_ORDER_SOURCE_ORDERS, ProductionOrder
from ...schemas.production import ComponentAllocationWrite
from ..production_config_query import get_production_config_by_id
from ..production_order_service import ProductionOrderError, serialize_order, validate_stock_shortages
from .execution_interface import PRINT_INTERFACE, is_print_interface, is_wms_interface, normalized_execution_interface
from .order_execution_service import (
    _consume_order_materials,
    _init_order_collection_tasks,
    _load_order,
)

logger = logging.getLogger(__name__)


def resolve_configured_execution_method(db: Session, order: ProductionOrder) -> str:
    """Configured method from production config (per production status). Default WMS."""
    cfg_id = getattr(order, "picking_config_id", None)
    if cfg_id is None:
        return PRODUCTION_EXECUTION_METHOD_WMS
    cfg = get_production_config_by_id(db, int(cfg_id), require_active=False)
    if cfg is None:
        return PRODUCTION_EXECUTION_METHOD_WMS
    raw = str(getattr(cfg, "production_execution_method", None) or PRODUCTION_EXECUTION_METHOD_WMS).strip().upper()
    if raw == PRODUCTION_EXECUTION_METHOD_PRINT:
        return PRODUCTION_EXECUTION_METHOD_PRINT
    return PRODUCTION_EXECUTION_METHOD_WMS


def _read_collection_blob(order: ProductionOrder) -> dict[str, Any]:
    raw = getattr(order, "collection_state_json", None) or "{}"
    try:
        data = json.loads(str(raw))
    except json.JSONDecodeError:
        data = {"tasks": []}
    if not isinstance(data, dict):
        data = {"tasks": []}
    data.setdefault("tasks", [])
    return data


def _write_execution_audit(order: ProductionOrder, patch: dict[str, Any]) -> None:
    data = _read_collection_blob(order)
    audit = dict(data.get("execution_audit") or {})
    audit.update(patch)
    data["execution_audit"] = audit
    order.collection_state_json = json.dumps(data, ensure_ascii=False)


def _assert_print_materials_ready(db: Session, order: ProductionOrder) -> None:
    if not bool(getattr(order, "materials_reserved", False)):
        raise ProductionOrderError(
            "Brak komponentów — uzupełnij rezerwacje przed rozpoczęciem produkcji z wydruku.",
            code="component_shortage",
        )
    shortages = validate_stock_shortages(db, order)
    if shortages:
        raise ProductionOrderError(
            "Brak komponentów — nie można rozpocząć produkcji z wydruku.",
            code="component_shortage",
            shortages=[s.model_dump() for s in shortages],
        )


def _allocations_from_reservations(db: Session, order: ProductionOrder) -> list[ComponentAllocationWrite]:
    from ..reservations.reservation_service import list_material_reservations

    rows = list_material_reservations(
        db,
        tenant_id=int(order.tenant_id),
        production_order_id=int(order.id),
        active_only=True,
    )
    if not rows:
        raise ProductionOrderError(
            "Brak aktywnych rezerwacji komponentów.",
            code="no_reservations",
        )
    snap_by_product = {int(s.component_product_id): int(s.id) for s in order.line_snapshots or []}
    allocs: list[ComponentAllocationWrite] = []
    for r in rows:
        snap_id = snap_by_product.get(int(r["product_id"]))
        if snap_id is None:
            continue
        qty = float(r.get("quantity") or 0)
        if qty <= 0:
            continue
        allocs.append(
            ComponentAllocationWrite(
                line_snapshot_id=snap_id,
                location_id=int(r["location_id"]),
                quantity=qty,
                batch_number=r.get("batch_number"),
                lot=r.get("lot"),
                serial_number=r.get("serial_number"),
            )
        )
    if not allocs:
        raise ProductionOrderError(
            "Rezerwacje nie pokrywają składników zlecenia.",
            code="no_reservations",
        )
    return allocs


def _mark_collection_tasks_complete_from_reservations(db: Session, order: ProductionOrder) -> None:
    from ..reservations.reservation_service import reservations_to_collection_hints

    data = _read_collection_blob(order)
    hints = reservations_to_collection_hints(
        db, tenant_id=int(order.tenant_id), production_order_id=int(order.id)
    )
    for t in data.get("tasks") or []:
        pid = int(t.get("component_product_id") or 0)
        rows = hints.get(pid) or []
        if not rows:
            t["collected_qty"] = float(t.get("required_qty") or 0)
            continue
        first = rows[0]
        t["selected_location_id"] = int(first["location_id"])
        t["location_id"] = int(first["location_id"])
        t["location_code"] = str(first.get("location_code") or "")
        t["selected_batch_number"] = first.get("batch_number")
        t["selected_lot"] = first.get("lot")
        t["selected_serial_number"] = first.get("serial_number")
        t["collected_qty"] = float(t.get("required_qty") or 0)
    order.collection_state_json = json.dumps(data, ensure_ascii=False)


def _finish_print_rw_from_reservations(
    db: Session,
    order: ProductionOrder,
    *,
    performed_by_user_id: int | None,
) -> None:
    """Create one RW via existing consume path — idempotent if RW already exists."""
    if order.rw_stock_document_id:
        return
    allocs = _allocations_from_reservations(db, order)
    _mark_collection_tasks_complete_from_reservations(db, order)
    _consume_order_materials(
        db, order, component_allocations=allocs, performed_by_user_id=performed_by_user_id
    )
    from ..reservations.reservation_service import consume_production_reservations

    consume_production_reservations(
        db, tenant_id=int(order.tenant_id), production_order_id=int(order.id)
    )
    order.status = "in_progress"
    order.collecting_completed_at = datetime.utcnow()
    _write_execution_audit(
        order,
        {
            "rw_completed_at": datetime.utcnow().isoformat() + "Z",
            "rw_completed_by_user_id": performed_by_user_id,
        },
    )


def start_print_execution_order(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    started_by_user_id: int | None = None,
    consume_materials: bool = True,
):
    """Start ORDERS MO via printed card. Optional consume_materials → existing RW path.

    Idempotent: already started / RW present → no second lock/RW; returns current state.
    """
    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(getattr(order, "source_type", "") or "") != PRODUCTION_ORDER_SOURCE_ORDERS:
        raise ProductionOrderError(
            "Wydruk zlecenia dotyczy tylko produkcji z zamówień.",
            code="invalid_source_type",
        )
    configured = resolve_configured_execution_method(db, order)
    if configured != PRODUCTION_EXECUTION_METHOD_PRINT and not is_print_interface(order):
        raise ProductionOrderError(
            "To zlecenie jest skonfigurowane na Terminal WMS.",
            code="print_not_configured",
        )
    if str(order.status) in ("completed", "cancelled"):
        raise ProductionOrderError("Zlecenie jest zamknięte.", code="terminal_status")
    if is_wms_interface(order) or getattr(order, "released_to_wms_at", None) is not None:
        raise ProductionOrderError(
            "Produkcja została już wydana do terminalu WMS.",
            code="wms_locked",
        )

    iface = normalized_execution_interface(order)
    already_started = iface == PRINT_INTERFACE and str(order.status) in (
        "collecting",
        "in_progress",
        "awaiting_putaway",
        "putaway",
        "completed",
    )
    if already_started or order.rw_stock_document_id:
        logger.info(
            "[production.print_start] idempotent order_id=%s status=%s rw=%s",
            order.id,
            order.status,
            order.rw_stock_document_id,
        )
        _write_execution_audit(
            order,
            {
                "restart_attempted_at": datetime.utcnow().isoformat() + "Z",
                "restart_attempted_by_user_id": started_by_user_id,
                "already_started": True,
            },
        )
        db.flush()
        return serialize_order(db, order, with_availability=True, with_order_sources=True)

    if str(order.status) not in ("draft", "planned"):
        raise ProductionOrderError(
            "Rozpoczęcie przez wydruk możliwe tylko dla zleceń zaplanowanych.",
            code="invalid_status",
        )

    _assert_print_materials_ready(db, order)

    order.execution_interface = PRINT_INTERFACE
    state = _init_order_collection_tasks(db, order)
    # Preserve / merge audit into collection blob
    state["execution_audit"] = {
        "execution_method": PRINT_INTERFACE,
        "execution_interface": PRINT_INTERFACE,
        "started_at": datetime.utcnow().isoformat() + "Z",
        "started_by_user_id": started_by_user_id,
        "document_generated_at": datetime.utcnow().isoformat() + "Z",
    }
    order.collection_state_json = json.dumps(state, ensure_ascii=False)
    order.status = "collecting"
    order.started_at = order.started_at or datetime.utcnow()
    if started_by_user_id and not order.created_by_user_id:
        order.created_by_user_id = int(started_by_user_id)

    from ..reservations.reservation_service import lock_production_reservations

    lock_production_reservations(db, tenant_id=int(tenant_id), production_order_id=int(order.id))

    if consume_materials:
        _finish_print_rw_from_reservations(
            db, order, performed_by_user_id=started_by_user_id
        )

    order.updated_at = datetime.utcnow()
    db.flush()
    logger.info(
        "[production.print_start] order_id=%s started_by=%s consume=%s status=%s rw=%s",
        order.id,
        started_by_user_id,
        consume_materials,
        order.status,
        order.rw_stock_document_id,
    )
    return serialize_order(db, order, with_availability=True, with_order_sources=True)


def resolve_production_order_by_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    code: str,
):
    """Resolve scanned MO barcode / number to ProductionOrder (existing lifecycle)."""
    raw = (code or "").strip()
    if not raw:
        raise ProductionOrderError("Pusty kod skanu.", code="empty_code")

    q = db.query(ProductionOrder).filter(
        ProductionOrder.tenant_id == int(tenant_id),
        ProductionOrder.warehouse_id == int(warehouse_id),
    )
    order = q.filter(ProductionOrder.number == raw).first()
    if order is None and raw.upper().startswith("MO"):
        # allow MO123 / MO-123 variants matching stored number
        order = q.filter(ProductionOrder.number.ilike(raw)).first()
    if order is None and raw.isdigit():
        order = q.filter(ProductionOrder.id == int(raw)).first()
    if order is None:
        raise ProductionOrderError("Nie znaleziono zlecenia produkcyjnego.", code="not_found")
    return serialize_order(db, order, with_availability=True, with_order_sources=True)
