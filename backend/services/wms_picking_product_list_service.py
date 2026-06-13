"""
Agregacja listy produktów do zbiórki WMS (wiele zamówień → jeden wiersz na SKU).

Bazuje na PickingRoutingService (alokacja z Inventory) i zamówieniach w danym statusie panelu.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import date, datetime
from typing import Iterable, Literal, Optional, Sequence

from sqlalchemy import func, or_, tuple_
from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.enums import CartStatus, CartType
from ..models.inventory import Inventory
from ..models.order import Order
from ..utils.order_shipping_display import order_shipping_display
from ..models.order_item import (
    OMS_LINE_STATUS_REPLACED,
    OMS_LINE_STATUS_TO_PICK,
    OrderItem,
    order_item_is_replaced_line,
)
from ..models.pick import Pick
from ..models.picking_config import PickingConfig
from ..models.app_user import AppUser
from ..models.product import Product
from ..models.stock_movement import StockMovement
from ..models.wms_picking_shortage_report import WmsPickingShortageReport


def _order_item_not_replaced_clause():
    """Linie z ``oms_line_status=REPLACED`` nie wchodzą w agregaty zbierania (historia po zamianie produktu)."""
    ols = OrderItem.oms_line_status
    return or_(ols.is_(None), ols != OMS_LINE_STATUS_REPLACED)
from .order_fulfillment_state import (
    MISSING as FS_MISSING,
    NEEDS_DECISION as FS_NEEDS_DECISION,
    READY_TO_PACK as FS_READY_TO_PACK,
    apply_fulfillment_state,
    touch_picking_in_progress,
)
from .fulfillment_event_service import (
    append_event,
    delete_pick_events_for_pick_ids,
    FE_MISSING,
    FE_PICK,
    mark_pick_events_finalized_for_pick_ids,
    picked_by_product_from_events,
    record_pick_event_for_wms_pick,
    sum_pick_events_for_line_cart,
    sync_declared_shortage_column_from_missing_events,
    sync_pick_fulfillment_traceability,
)
from .order_item_pick_allocation_service import (
    PickLotSlice,
    consume_inventory_fifo_slices,
    log_pick_allocation_debug,
    persist_pick_allocation,
)
from .inventory_allocation_service import required_disposition_for_order_item
from .order_fulfillment_recompute import (
    compute_line_missing_qty,
    line_closed_for_picking_finalize,
    line_shortage_qty_for_picking_finalize,
    order_item_needs_substitute_pick_completion,
    recompute_order_fulfillment,
)
from .order_issue_task_service import (
    count_issue_queue_operational_lines,
    ensure_open_issue_task_for_order,
    upsert_order_issue_tasks_from_shortage,
)
from .wms_picking_shortage_settings_service import get_or_create_wms_picking_shortage_settings
from ..schemas.picking_routing import PickListRow
from ..schemas.wms_picking_products import (
    WmsPickingCohortMissingLineRow,
    WmsPickingOrderTypeFilter,
    WmsPickingProductDetailResponse,
    WmsPickingProductLine,
    WmsPickingProductLinesResponse,
    WmsPickingProductLocationRow,
    WmsPickingProductOrderRow,
    WmsPickingProductPutHint,
)
from .picking_assignment_service import ensure_order_basket_for_wms_pick, format_cart_basket_label
from .picking_routing_service import PickingRoutingService
from .warehouse_product_operation_log_service import record_warehouse_product_operation
from .wms_audit_service import (
    emit_wms_picked_item,
    emit_wms_picking_finished,
    emit_wms_picking_started,
    emit_wms_shortage_reported,
    record_picking_cart_finalize_session,
)

OrderTypeFilter = Literal["single", "multi", "all"]

logger = logging.getLogger(__name__)


class PickingFinalizeError(Exception):
    """Structured finalize failure — mapped to HTTP 400/409 (never generic 500)."""

    def __init__(
        self,
        message: str,
        *,
        reason: str,
        order_id: int | None = None,
        line_id: int | None = None,
        step: str | None = None,
        http_status: int = 400,
        code: str = "picking_finalize_invalid",
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.order_id = order_id
        self.line_id = line_id
        self.step = step
        self.http_status = int(http_status)
        self.code = code

    def as_detail(self) -> dict:
        out: dict = {
            "message": str(self),
            "error": str(self),
            "reason": self.reason,
            "code": self.code,
        }
        if self.order_id is not None:
            out["order_id"] = int(self.order_id)
        if self.line_id is not None:
            out["line_id"] = int(self.line_id)
        if self.step:
            out["step"] = self.step
        return out


def _location_label_for_pick(db: Session, location_id: int) -> str:
    from ..models.location import Location

    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    if loc is None:
        return f"#{location_id}"
    return (loc.name or "").strip() or f"#{location_id}"


def _sync_fulfillment_qty_for_pick(db: Session, pick: Pick) -> None:
    """Po podziale Pick — dopasuj ilość zdarzenia PICK do rekordu Pick."""
    import json

    from ..models.fulfillment_event import FulfillmentEvent

    if pick.order_item_id is None:
        return
    rows = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id == int(pick.order_item_id),
            FulfillmentEvent.type == FE_PICK,
        )
        .all()
    )
    for ev in rows:
        try:
            m = json.loads(ev.metadata_json or "{}")
        except json.JSONDecodeError:
            m = {}
        if not isinstance(m, dict):
            m = {}
        if int(m.get("pick_id") or 0) != int(pick.id):
            continue
        ev.quantity = float(pick.quantity or 0)
        sync_pick_fulfillment_traceability(db, pick)
        break


def _apply_pick_lot_slices(
    db: Session,
    pick: Pick,
    slices: list[PickLotSlice],
    *,
    performed_by: AppUser | None = None,
    picked_at: datetime | None = None,
) -> list[Pick]:
    """
    Zdejmij stany FIFO, zapisz alokacje, jeden wpis audytu WMS na wycinek partii.
    Zwraca wszystkie rekordy Pick (oryginał + ewentualne podzielone przy wielu partiach).
    """
    if not slices:
        return [pick]
    tid = int(pick.tenant_id)
    wid = int(pick.warehouse_id or 0)
    if wid <= 0:
        raise ValueError("Brak warehouse_id na rekordzie Pick — nie można zaktualizować stanu.")
    pid = int(pick.product_id)
    lid = int(pick.location_id)
    ts = picked_at or datetime.utcnow()
    picker_uid = int(performed_by.id) if performed_by is not None and int(getattr(performed_by, "id", 0) or 0) > 0 else None
    loc_label = _location_label_for_pick(db, lid)

    finalized: list[Pick] = []
    for idx, sl in enumerate(slices):
        if idx == 0:
            row = pick
        else:
            row = Pick(
                tenant_id=tid,
                warehouse_id=wid,
                order_id=int(pick.order_id),
                order_item_id=int(pick.order_item_id) if pick.order_item_id is not None else None,
                product_id=pid,
                location_id=lid,
                cart_id=pick.cart_id,
                quantity=float(sl.quantity),
                batch_number=sl.batch_number,
                expiry_date=sl.expiry_date,
                picked_at=ts,
                picker_id=picker_uid,
                status="done",
            )
            db.add(row)
            db.flush()
            record_pick_event_for_wms_pick(db, row)
            _sync_fulfillment_qty_for_pick(db, row)

        row.quantity = float(sl.quantity)
        row.batch_number = sl.batch_number
        row.expiry_date = sl.expiry_date

        db.add(
            StockMovement(
                tenant_id=tid,
                product_id=pid,
                from_location_id=lid,
                to_location_id=None,
                quantity=float(sl.quantity),
                type="pick",
            )
        )
        if performed_by is not None:
            exp_display = (
                sl.expiry_date
                if sl.expiry_date is not None and sl.expiry_date < date(9999, 1, 1)
                else None
            )
            record_warehouse_product_operation(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                product_id=pid,
                movement_type="PICKING",
                source_location_id=lid,
                target_location_id=None,
                quantity=float(sl.quantity),
                performed_by=performed_by,
                reference_document=f"ORDER-{int(pick.order_id)}",
                stock_document_id=None,
                packaging_type="UNIT",
                packaging_quantity=float(sl.quantity),
                batch_number=sl.batch_number or None,
                expiry_date=exp_display,
                pick_id=int(row.id),
            )

        persist_pick_allocation(db, row, sl, picked_at=ts, picked_by=picker_uid)
        sync_pick_fulfillment_traceability(db, row)

        exp_log = (
            sl.expiry_date
            if sl.expiry_date is not None and sl.expiry_date < date(9999, 1, 1)
            else None
        )
        log_pick_allocation_debug(
            order_id=int(pick.order_id),
            product_id=pid,
            location_label=loc_label,
            batch=sl.batch_number,
            expiry=exp_log,
            quantity=float(sl.quantity),
        )
        finalized.append(row)

    if len(slices) > 1:
        _sync_fulfillment_qty_for_pick(db, pick)

    return finalized


def _decrement_inventory_for_wms_pick(
    db: Session,
    pick: Pick,
    *,
    performed_by: AppUser | None = None,
    picked_at: datetime | None = None,
) -> list[Pick]:
    """
    Zdejmij ilość z Inventory (FIFO po partii), zapisz alokacje i ślad partii na Pick.
  Jedna fizyczna partia = jeden wpis audytu WMS (bez duplikatu w historii produktu).
    """
    qty = float(pick.quantity or 0)
    if qty <= 1e-12:
        return [pick]
    tid = int(pick.tenant_id)
    wid = int(pick.warehouse_id or 0)
    if wid <= 0:
        raise ValueError("Brak warehouse_id na rekordzie Pick — nie można zaktualizować stanu.")
    req_disp = required_disposition_for_order_item(db, getattr(pick, "order_item_id", None))
    slices = consume_inventory_fifo_slices(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=int(pick.product_id),
        location_id=int(pick.location_id),
        quantity=qty,
        stock_disposition=req_disp,
    )
    return _apply_pick_lot_slices(db, pick, slices, performed_by=performed_by, picked_at=picked_at)


def _cart_type_upper(cart: Cart) -> str:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    return str(raw).split(".")[-1].upper()


def _order_type_filter(order_type: WmsPickingOrderTypeFilter) -> OrderTypeFilter:
    if order_type in ("single", "multi", "all"):
        return order_type
    return "all"


_PICKING_QUEUE_OPEN_FULFILLMENT = ("PICKING", "PARTIAL")


def _picking_queue_eligibility_clauses(
    db: Session | None = None,
    *,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    features=None,
):
    """Zamówienia operacyjnie otwarte na zbieranie (SSOT dla kohorty / workload)."""
    from .wms_queue_eligibility import (
        wms_queue_consolidation_phase_clauses,
        wms_queue_consolidation_plan_clauses,
        wms_queue_fulfillment_mode_clauses,
    )

    return (
        Order.picking_finished_at.is_(None),
        or_(
            Order.fulfillment_state.is_(None),
            Order.fulfillment_state.in_(_PICKING_QUEUE_OPEN_FULFILLMENT),
        ),
        *wms_queue_fulfillment_mode_clauses(
            db=db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            features=features,
            queue_name="picking",
        ),
        *wms_queue_consolidation_phase_clauses(),
        *wms_queue_consolidation_plan_clauses(),
    )


def _query_order_ids_for_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: OrderTypeFilter,
) -> list[int]:
    base = (
        db.query(Order.id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.order_ui_status_id == int(source_status_id),
            *_picking_queue_eligibility_clauses(
                db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
            ),
        )
    )
    if order_type == "all":
        rows = base.order_by(Order.id.asc()).all()
        return [int(r[0]) for r in rows]

    line_counts = (
        db.query(OrderItem.order_id, func.count(OrderItem.id).label("cnt"))
        .group_by(OrderItem.order_id)
        .subquery()
    )
    q = base.join(line_counts, line_counts.c.order_id == Order.id)
    if order_type == "single":
        q = q.filter(line_counts.c.cnt == 1)
    else:
        q = q.filter(line_counts.c.cnt > 1)
    rows = q.order_by(Order.id.asc()).all()
    return [int(r[0]) for r in rows]


def _order_ids_for_cart_finalize(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: OrderTypeFilter,
    cart_id: int,
) -> list[int]:
    """Zamówienia z kohorty z aktywnością na wózku (przypisanie lub Pick) — nie cała kohorta statusu."""
    cohort = _query_order_ids_for_status(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=order_type,
    )
    if not cohort:
        return []
    cid = int(cart_id)
    active: set[int] = set()
    on_cart = (
        db.query(Order.id)
        .filter(
            Order.id.in_(list(cohort)),
            Order.cart_id == cid,
        )
        .all()
    )
    active.update(int(r[0]) for r in on_cart)
    pick_rows = (
        db.query(Pick.order_id)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.cart_id == cid,
            Pick.order_id.in_(list(cohort)),
        )
        .distinct()
        .all()
    )
    for row in pick_rows:
        if row[0] is not None:
            active.add(int(row[0]))
    return sorted(active)


def _filter_fixed_order_ids_to_picking_queue(
    db: Session,
    order_ids: Sequence[int],
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: OrderTypeFilter,
) -> list[int]:
    """Zadanie kierownika / scope CSV — tylko zamówienia nadal kwalifikujące się do zbierania."""
    if not order_ids:
        return []
    eligible = set(
        _query_order_ids_for_status(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=order_type,
        )
    )
    return [int(x) for x in order_ids if int(x) in eligible]


def _picking_product_line_still_active(line: WmsPickingProductLine) -> bool:
    """Produkt widoczny w kolejce zbierania — coś do pobrania lub operacyjny brak."""
    return float(line.remaining_to_pick or 0) > 1e-9 or float(line.missing_quantity or 0) > 1e-9


def _sync_order_operational_state_after_picking_finalize(
    db: Session,
    orders: Sequence[Order],
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
) -> None:
    """Po domknięciu wózka: linie picked/missing, brak remaining, fulfillment bez kontekstu sesji."""
    cid = int(cart_id)
    for o in orders:
        for oi in o.items or []:
            if order_item_is_replaced_line(oi) or bool(getattr(oi, "is_bundle_parent", False)):
                continue
            qty = float(oi.quantity or 0)
            if qty <= 1e-9:
                continue
            picked = _picked_qty_for_order_item_on_cart(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                order_item_id=int(oi.id),
                cart_id=cid,
            )
            miss = float(
                line_shortage_qty_for_picking_finalize(
                    db, o, oi, session_cart_id=cid, picked=picked
                )
            )
            oi.wms_picking_line_missing_qty = round(max(0.0, miss), 6)
            if picked + miss + 1e-5 >= qty:
                if miss > 1e-9:
                    oi.wms_picking_line_status = "missing"
                else:
                    oi.wms_picking_line_status = "picked"
        recompute_order_fulfillment(db, int(o.id), commit=False, session_cart_id=None)


def _release_cart_after_picking_finalize(db: Session, cart: Cart) -> None:
    """Zwolnij wózek do kolejnego operatora — bez kasowania sfinalizowanych Pick (audyt)."""
    for basket in list(cart.baskets or []):
        basket.order_id = None
        basket.used_volume = 0.0
    cart.used_volume = 0.0
    cart.status = CartStatus.AVAILABLE


def _missing_qty_by_product_from_orders(
    db: Session,
    order_ids: Sequence[int],
    *,
    tenant_id: int,
) -> dict[int, float]:
    """Suma ``OrderItem.wms_picking_line_missing_qty`` po ``product_id`` dla kohorty."""
    if not order_ids:
        return {}
    rows = (
        db.query(OrderItem.product_id, func.coalesce(func.sum(OrderItem.wms_picking_line_missing_qty), 0.0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.id.in_(list(order_ids)),
            Order.tenant_id == int(tenant_id),
            _order_item_not_replaced_clause(),
            OrderItem.is_bundle_parent.is_(False),
        )
        .group_by(OrderItem.product_id)
        .all()
    )
    out: dict[int, float] = {}
    for pid, qty in rows:
        if pid is None:
            continue
        q = float(qty or 0)
        if q > 1e-12:
            out[int(pid)] = round(q, 6)
    return out


def _recovery_line_remaining_pick_qty(db: Session, order: Order, oi: OrderItem) -> float:
    """Ilość do dogrywki na linii — ``get_unresolved_recovery_lines`` (jedno źródło prawdy)."""
    from .wms_recovery_pick_service import get_unresolved_recovery_lines

    for row in get_unresolved_recovery_lines(db, order, log=False):
        if int(row["order_item_id"]) == int(oi.id):
            return float(row["unresolved_qty"])
    return 0.0


def _recovery_demand_by_product_from_orders(
    db: Session,
    order_ids: Sequence[int],
    *,
    tenant_id: int,
) -> dict[int, float]:
    """Suma pozostałej ilości do dogrywki per product_id (nie całe zamówienie)."""
    if not order_ids:
        return {}
    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id.in_(list(order_ids)), Order.tenant_id == int(tenant_id))
        .all()
    )
    out: dict[int, float] = {}
    for order in orders:
        for oi in order.items or []:
            rq = _recovery_line_remaining_pick_qty(db, order, oi)
            if rq <= 1e-9:
                continue
            pid = int(oi.product_id)
            out[pid] = round(float(out.get(pid, 0.0)) + rq, 6)
    return out


def _demand_by_product_from_orders(
    db: Session,
    order_ids: Sequence[int],
    *,
    tenant_id: int,
) -> dict[int, float]:
    """
    Suma ``OrderItem.quantity`` po ``product_id`` dla wszystkich wybranych zamówień (bez grupowania po zamówieniu).
    """
    if not order_ids:
        return {}
    rows = (
        db.query(OrderItem.product_id, func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.id.in_(list(order_ids)),
            Order.tenant_id == int(tenant_id),
            _order_item_not_replaced_clause(),
            OrderItem.is_bundle_parent.is_(False),
        )
        .group_by(OrderItem.product_id)
        .all()
    )
    out: dict[int, float] = {}
    for pid, qty in rows:
        if pid is None:
            continue
        q = float(qty or 0)
        if q > 1e-9:
            out[int(pid)] = round(q, 6)
    return out


def _inventory_sums_by_product_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    pairs: Sequence[tuple[int, int]],
) -> dict[tuple[int, int], float]:
    """Suma ``Inventory.quantity`` dla par (product_id, location_id)."""
    uniq = list({(int(a), int(b)) for a, b in pairs})
    if not uniq:
        return {}
    rows = (
        db.query(
            Inventory.product_id,
            Inventory.location_id,
            func.coalesce(func.sum(Inventory.quantity), 0.0),
        )
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            tuple_(Inventory.product_id, Inventory.location_id).in_(uniq),
        )
        .group_by(Inventory.product_id, Inventory.location_id)
        .all()
    )
    return { (int(r[0]), int(r[1])): round(float(r[2] or 0.0), 6) for r in rows }


def resolve_default_bulk_cart_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> Cart:
    """Pierwszy wózek BULK w magazynie — tryb bez skanu (domyślna sesja)."""
    cart = (
        db.query(Cart)
        .filter(
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
            Cart.type == CartType.BULK,
        )
        .order_by(Cart.id.asc())
        .first()
    )
    if not cart:
        raise ValueError(
            "Brak wózka BULK w magazynie — dodaj wózek lub włącz skan wózka w konfiguracji zbierania."
        )
    return cart


def resolve_wms_picking_cart_row(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_code: str,
) -> Cart:
    """Rozpoznanie wózka po kodzie zeskanowanym lub nazwie (tenant + magazyn)."""
    from .esp_scan_codes import find_cart_for_tenant_warehouse_scan

    code = (cart_code or "").strip()
    if not code:
        raise ValueError("Podaj kod wózka.")
    cart = find_cart_for_tenant_warehouse_scan(db, tenant_id, warehouse_id, code)
    if not cart:
        cart = (
            db.query(Cart)
            .filter(
                Cart.tenant_id == int(tenant_id),
                Cart.warehouse_id == int(warehouse_id),
                Cart.name == code,
            )
            .first()
        )
    if not cart:
        raise ValueError("Nie znaleziono wózka o podanym kodzie.")
    return cart


def _basket_slot_label(basket: Optional[CartBasket]) -> Optional[str]:
    if basket is None:
        return None
    name = (getattr(basket, "name", None) or "").strip()
    if name:
        return name
    row = int(getattr(basket, "row", 0) or 0)
    col = int(getattr(basket, "column", 0) or 0)
    if row or col:
        return f"Koszyk {row}/{col}"
    return f"B{int(basket.id)}"


def _allowed_pick_location_ids_for_product(
    db: Session,
    *,
    tenant_id: int,
    order_ids: Sequence[int],
    product_id: int,
) -> set[int]:
    if not order_ids:
        return set()
    routing = PickingRoutingService(db).build_location_pick_list(list(order_ids), tenant_id=tenant_id)
    return {
        int(row.location_id)
        for row in routing.pick_list
        if int(row.product_id) == int(product_id)
    }


def _picked_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: Sequence[int],
    cart_id: int | None = None,
) -> dict[int, float]:
    return picked_by_product_from_events(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_ids=list(order_ids),
        cart_id=cart_id,
    )


def _picked_qty_for_order_item_on_cart(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_item_id: int,
    cart_id: int,
) -> float:
    _ = tenant_id, warehouse_id
    return sum_pick_events_for_line_cart(db, int(order_item_id), int(cart_id))


OrderFinalizeKind = Literal["all_picked", "all_missing", "some_missing"]


def _picking_line_resolved_for_finalize(
    db: Session,
    order: Order,
    oi: OrderItem,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    recovery_state: object | None = None,
) -> tuple[bool, str]:
    """
    Linia domknięta na finalize wózka gdy ``picked + shortage >= required``.

    Brak nie musi być rozwiązany przez OMS (workflow Braki po finalize).
    Deleguje stan recovery do ``RecoveryWorkflowService`` (jedno źródło prawdy).
    """
    from .recovery_workflow_service import OrderRecoveryState, line_skipped_for_recovery, resolve_order_recovery_state

    _ = tenant_id, warehouse_id
    eps = 1e-5
    cid = int(cart_id)
    if order_item_is_replaced_line(oi):
        return True, "replaced_archive_skip"
    if line_skipped_for_recovery(oi):
        return True, "recovery_skipped_line"
    qty = float(oi.quantity or 0)
    if qty <= eps:
        return True, "zero_qty"
    picked = _picked_qty_for_order_item_on_cart(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_item_id=int(oi.id),
        cart_id=cid,
    )
    shortage = line_shortage_qty_for_picking_finalize(
        db, order, oi, session_cart_id=cid, picked=picked
    )
    if line_closed_for_picking_finalize(db, order, oi, session_cart_id=cid, picked=picked):
        if shortage > eps and picked + eps < qty:
            return True, "picked_plus_shortage"
        return True, "fully_picked"

    state: OrderRecoveryState
    if recovery_state is not None:
        state = recovery_state  # type: ignore[assignment]
    else:
        state = resolve_order_recovery_state(db, order, session_cart_id=cid, log=False)

    for ln in state.lines:
        if int(ln.order_line_id) != int(oi.id):
            continue
        if ln.reason == "awaiting_oms":
            return False, "oms_decision_required"
        if ln.active_recovery:
            return True, "recovery_deferred_substitute" if ln.replacement_applied else "recovery_deferred"
        if ln.packing_eligible or ln.recovery_completed:
            return True, "fully_picked"
        if ln.recovery_qty <= eps and ln.unresolved_qty <= eps:
            return True, "shortage_covers_gap"
        break

    return False, "incomplete"


def _missing_qty_by_product_for_finalize(
    db: Session,
    order_ids: Sequence[int],
    *,
    tenant_id: int,
    cart_id: int,
) -> dict[int, float]:
    """Suma braków per ``product_id`` dla domknięcia sesji (``line_shortage_qty_for_picking_finalize``)."""
    if not order_ids:
        return {}
    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id.in_(list(order_ids)), Order.tenant_id == int(tenant_id))
        .all()
    )
    cid = int(cart_id)
    out: dict[int, float] = defaultdict(float)
    for o in orders:
        for oi in o.items or []:
            if order_item_is_replaced_line(oi) or bool(getattr(oi, "is_bundle_parent", False)):
                continue
            pid = getattr(oi, "product_id", None)
            if pid is None:
                continue
            picked = _picked_qty_for_order_item_on_cart(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(o.warehouse_id),
                order_item_id=int(oi.id),
                cart_id=cid,
            )
            mq = float(
                line_shortage_qty_for_picking_finalize(
                    db, o, oi, session_cart_id=cid, picked=picked
                )
            )
            if mq > 1e-12:
                out[int(pid)] = round(out[int(pid)] + mq, 6)
    return dict(out)


def _classify_order_after_picking_session(
    order: Order,
    *,
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    recovery_state: object | None = None,
) -> OrderFinalizeKind:
    """Stan końcowy zamówienia po domknięciu Picków z wózka (linie zamknięte pick + brak)."""
    eps = 1e-5
    lines = list(order.items or [])
    if not lines:
        return "all_picked"
    fully_picked: list[bool] = []
    fully_missing: list[bool] = []
    for oi in lines:
        if getattr(oi, "parent_bundle_order_item_id", None) is not None:
            continue
        if bool(getattr(oi, "is_bundle_parent", False)):
            continue
        if order_item_is_replaced_line(oi):
            continue
        qty = float(oi.quantity or 0)
        if qty <= eps:
            fully_picked.append(True)
            fully_missing.append(True)
            continue
        picked = _picked_qty_for_order_item_on_cart(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            order_item_id=int(oi.id),
            cart_id=int(cart_id),
        )
        miss = line_shortage_qty_for_picking_finalize(
            db, order, oi, session_cart_id=int(cart_id), picked=picked
        )
        declared = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
        effective = picked + miss
        resolved, reason = _picking_line_resolved_for_finalize(
            db,
            order,
            oi,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            cart_id=int(cart_id),
            recovery_state=recovery_state,
        )
        logger.info(
            "[picking.finalize] LINE_CHECK order_id=%s order_item_id=%s product_id=%s "
            "required_qty=%s picked_qty=%s shortage_qty=%s resolved_shortage_qty=%s "
            "effective_qty=%s resolved=%s reason=%s cart_id=%s",
            int(order.id),
            int(oi.id),
            int(oi.product_id or 0),
            qty,
            picked,
            miss,
            declared,
            effective,
            resolved,
            reason,
            int(cart_id),
        )
        if not resolved:
            if reason in ("recovery_deferred", "recovery_deferred_substitute"):
                fully_missing.append(False)
                fully_picked.append(False)
                continue
            fully_missing.append(miss + eps >= qty)
            fully_picked.append(False)
            continue
        fully_missing.append(miss + eps >= qty)
        fully_picked.append(miss < eps and picked + eps >= qty)
    if not fully_picked and not fully_missing:
        return "all_picked"
    if all(fully_picked):
        return "all_picked"
    if all(fully_missing):
        return "all_missing"
    return "some_missing"


def _scanner_active_by_product_id(
    db: Session,
    order_ids: Sequence[int],
    product_ids: Sequence[int],
    *,
    tenant_id: int,
    cart_id: int | None,
) -> dict[int, bool]:
    """
    Produkt jest aktywny w sesji (skan EAN otwiera kartę), gdy na wózku jest linia wymagająca uwagi:

    - jeszcze coś do pobrania z magazynu: ``picked + missing < quantity``,
    - **albo** linia ze zgłoszonym brakiem (``wms_picking_line_status == missing`` z ``missing > 0``) —
      nie wyłączaj SKU z kolejki po samym braku (picker musi widzieć kartę do „Zbierz jednak” / decyzji).

    Pomijamy linie ``picked`` z pełnym pokryciem (pick + brak >= qty) oraz linie zastąpione (REPLACED).
    """
    pids = [int(x) for x in product_ids if int(x) > 0]
    if not order_ids or not pids or cart_id is None:
        return {}
    active: dict[int, bool] = {pid: False for pid in pids}
    rows = (
        db.query(OrderItem, Order.cart_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.id.in_(list(order_ids)),
            Order.tenant_id == int(tenant_id),
            OrderItem.product_id.in_(pids),
        )
        .all()
    )
    cid = int(cart_id) if cart_id is not None else None
    eps = 1e-9
    for oi, ocart in rows:
        pid = int(oi.product_id)
        if pid not in active:
            continue
        if order_item_is_replaced_line(oi):
            continue
        if cid is not None:
            if ocart is not None and int(ocart) != cid:
                continue
        need = float(oi.quantity or 0)
        if need <= eps:
            continue
        miss_ln = float(oi.wms_picking_line_missing_qty or 0)
        pq = sum_pick_events_for_line_cart(db, int(oi.id), cid)
        st = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()

        # Pełne domknięcie linii ze składu (zebrano z półki + ewentualnie brak = wymagane) — bez dalszej pracy na tej linii
        if pq + miss_ln + eps >= need:
            if st == "missing" and miss_ln > eps:
                active[pid] = True
            continue

        if st == "picked":
            continue

        if pq + miss_ln + eps < need:
            active[pid] = True
    return active


def _refresh_order_item_line_picked_status(
    db: Session,
    oi: OrderItem,
    *,
    cart_id: int,
) -> None:
    """Po picku: jeśli linia wypełniona pickami + jawnym brakiem = ``quantity``, ustaw ``picked`` (bez nadpisywania ``missing``)."""
    if order_item_is_replaced_line(oi):
        return
    st = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
    if st == "missing":
        return
    need = float(oi.quantity or 0)
    if need <= 1e-9:
        return
    pq = sum_pick_events_for_line_cart(db, int(oi.id), int(cart_id))
    miss_ln = float(oi.wms_picking_line_missing_qty or 0)
    if miss_ln > 1e-9:
        return
    picked_eff = min(pq, max(0.0, need - miss_ln))
    if picked_eff + miss_ln + 1e-9 >= need:
        oi.wms_picking_line_status = "picked"
        if (getattr(oi, "oms_line_status", None) or "").strip().upper() == OMS_LINE_STATUS_TO_PICK:
            oi.oms_line_status = None


def _build_cohort_missing_line_rows(
    db: Session,
    order_ids: Sequence[int],
    *,
    tenant_id: int,
) -> list[WmsPickingCohortMissingLineRow]:
    """Linie z ``wms_picking_line_missing_qty`` > 0 w zamówieniach kohorty."""
    if not order_ids:
        return []
    miss_co = func.coalesce(OrderItem.wms_picking_line_missing_qty, 0.0)
    rows = (
        db.query(Order, OrderItem, Product)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .filter(
            Order.id.in_(list(order_ids)),
            Order.tenant_id == int(tenant_id),
            Product.tenant_id == int(tenant_id),
            miss_co > 1e-9,
        )
        .order_by(Order.id.asc(), OrderItem.id.asc())
        .all()
    )
    out: list[WmsPickingCohortMissingLineRow] = []
    for o, oi, pr in rows:
        mq = float(oi.wms_picking_line_missing_qty or 0)
        if mq <= 1e-9:
            continue
        out.append(
            WmsPickingCohortMissingLineRow(
                order_id=int(o.id),
                order_number=str(o.number or f"#{o.id}"),
                product_id=int(oi.product_id),
                product_name=(pr.name if pr and pr.name else f"Produkt #{oi.product_id}"),
                product_ean=(str(pr.ean).strip() if pr and pr.ean else None),
                missing_quantity=round(mq, 6),
            )
        )
    return out


def _panel_status_id_for_finalize_outcome(pc: PickingConfig, kind: OrderFinalizeKind) -> int:
    tgt = int(pc.target_status_id)
    if kind == "all_picked":
        return tgt
    sid = getattr(pc, "status_on_shortage_id", None)
    if sid is not None and int(sid) > 0:
        return int(sid)
    return tgt


def _panel_status_after_picking_finalize(
    *,
    shortage_reported_order_ui_status_id: Optional[int],
    pc: PickingConfig,
    kind: OrderFinalizeKind,
) -> int:
    """
    Status panelu po domknięciu sesji wózka.

    Przy brakach: status z **Ustawienia WMS → Zbieranie → Obsługa braków** (``shortage_reported_order_ui_status_id``),
    a gdy nie ustawiono — ``target_status_id`` reguły zbierania (bez osobnego pola „status przy braku” w konfiguratorze).
    """
    if kind == "all_picked":
        return int(pc.target_status_id)
    if shortage_reported_order_ui_status_id is not None and int(shortage_reported_order_ui_status_id) > 0:
        return int(shortage_reported_order_ui_status_id)
    return int(pc.target_status_id)


def _first_shortage_product_id_for_order_issue(db: Session, order: Order) -> Optional[int]:
    """Pierwszy produkt z operacyjnym brakiem (do logu / kolejki Order Issues)."""
    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if order_item_is_replaced_line(oi):
            continue
        mq = compute_line_missing_qty(db, order, oi)
        if mq > 1e-9:
            return int(oi.product_id)
    return None


def build_wms_picking_product_lines(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    cart_id: int | None = None,
    fixed_order_ids: list[int] | None = None,
    recovery_mode: bool = False,
) -> WmsPickingProductLinesResponse:
    """
    Lista produktów do zbiórki.
    ``fixed_order_ids`` — dogrywka recovery (jedno zamówienie), bez kohorty statusu źródłowego.
    """
    ot = _order_type_filter(order_type)
    allow_continue_other_lines = True
    if fixed_order_ids is None:
        ss0 = get_or_create_wms_picking_shortage_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
        allow_continue_other_lines = bool(ss0.allow_continue_other_lines_after_shortage)
    if fixed_order_ids is not None:
        order_ids = [int(x) for x in fixed_order_ids if int(x) > 0]
        order_ids = list(dict.fromkeys(order_ids))
        if not recovery_mode:
            order_ids = _filter_fixed_order_ids_to_picking_queue(
                db,
                order_ids,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=ot,
            )
    else:
        order_ids = _query_order_ids_for_status(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=ot,
        )
    if not order_ids:
        return WmsPickingProductLinesResponse(
            products=[],
            cohort_order_count=0,
            cohort_missing_lines=[],
            pick_list=[],
            shortfalls=[],
            warnings=[f"Brak zamówień w statusie (filtr: {ot})."],
            allow_continue_other_lines_after_shortage=allow_continue_other_lines,
        )

    if recovery_mode and fixed_order_ids is not None:
        demand_by_product = _recovery_demand_by_product_from_orders(db, order_ids, tenant_id=tenant_id)
    else:
        demand_by_product = _demand_by_product_from_orders(db, order_ids, tenant_id=tenant_id)
    missing_by_product = _missing_qty_by_product_from_orders(db, order_ids, tenant_id=tenant_id)

    routing = PickingRoutingService(db).build_location_pick_list(order_ids, tenant_id=tenant_id)
    pick_list = list(routing.pick_list)

    picked_map = _picked_by_product(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, order_ids=order_ids, cart_id=cart_id
    )

    # Z alokacji (routing): pierwsza lokalizacja na trasie per produkt — tylko do sortu i wyświetlenia „głównej” lokalizacji
    by_product_first_loc: dict[int, str] = {}
    prod_lid_qty: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    prod_lid_code: dict[int, dict[int, str]] = defaultdict(dict)
    for row in pick_list:
        pid = int(row.product_id)
        code = row.location_code or ""
        if pid not in by_product_first_loc or code < by_product_first_loc[pid]:
            by_product_first_loc[pid] = code
        lid = int(row.location_id)
        prod_lid_qty[pid][lid] += float(row.total_quantity or 0)
        prod_lid_code[pid][lid] = row.location_code or ""

    # Lista produktów = WSZYSTKIE product_id występujące w liniach zamówień (nie tylko te z pick_list)
    product_ids = sorted(demand_by_product.keys())
    if not product_ids:
        extra = (
            list(routing.warnings)
            + ["Brak pozycji w zamówieniach (OrderItem) dla wybranych zamówień — sprawdź filtr i linie zamówień."]
        )
        if fixed_order_ids is not None:
            extra = ["Brak linii do dogrywki zbierki dla tego zamówienia (routing / brak alokacji)."] + list(routing.warnings)
        return WmsPickingProductLinesResponse(
            products=[],
            cohort_order_count=len(order_ids),
            cohort_missing_lines=_build_cohort_missing_line_rows(db, order_ids, tenant_id=tenant_id),
            pick_list=pick_list,
            shortfalls=list(routing.shortfalls),
            warnings=extra,
            allow_continue_other_lines_after_shortage=allow_continue_other_lines,
        )

    prows = (
        db.query(Product)
        .filter(Product.tenant_id == int(tenant_id), Product.id.in_(product_ids))
        .all()
    )
    pmap = {int(p.id): p for p in prows}

    inv_pairs: list[tuple[int, int]] = []
    for pid in product_ids:
        loc = by_product_first_loc.get(pid, "")
        if not loc or pid not in prod_lid_qty:
            continue
        for lid in prod_lid_qty[pid]:
            if prod_lid_code[pid].get(lid, "") == loc:
                inv_pairs.append((pid, int(lid)))
    inv_map = _inventory_sums_by_product_location(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, pairs=inv_pairs
    )

    scan_by_pid = _scanner_active_by_product_id(
        db, order_ids, list(product_ids), tenant_id=tenant_id, cart_id=cart_id
    )

    lines: list[WmsPickingProductLine] = []
    for pid in sorted(
        product_ids,
        key=lambda p: (by_product_first_loc.get(p) if by_product_first_loc.get(p) else "\uffff", p),
    ):
        pr = pmap.get(pid)
        name = pr.name if pr and pr.name else f"Produkt #{pid}"
        ean = pr.ean if pr else None
        img = pr.image_url if pr else None
        loc = by_product_first_loc.get(pid, "")
        tq = float(demand_by_product[pid])
        pq = round(picked_map.get(pid, 0.0), 6)
        miss_sum = round(float(missing_by_product.get(pid, 0.0)), 6)
        primary_stock = 0.0
        n_distinct_locs = len(prod_lid_qty[pid]) if pid in prod_lid_qty else 0
        if loc and pid in prod_lid_qty:
            for lid in prod_lid_qty[pid]:
                c = prod_lid_code[pid].get(lid, "")
                if c == loc:
                    primary_stock += float(inv_map.get((pid, int(lid)), 0.0))
        primary_stock = round(primary_stock, 6)
        extra_locs = max(0, n_distinct_locs - 1) if n_distinct_locs > 0 else 0
        # Pick + zgłoszony brak linii = „rozliczone” dla UI; reszta = wymagane − zebrano − braki.
        picked_raw = round(float(pq), 6)
        picked_eff = min(picked_raw, max(0.0, float(tq) - miss_sum))
        rem_pick = max(0.0, float(tq) - picked_eff - miss_sum)
        scanner_active = bool(scan_by_pid.get(pid)) if cart_id is not None else (rem_pick > 1e-9)
        lines.append(
            WmsPickingProductLine(
                product_id=pid,
                name=name,
                ean=ean,
                image_url=img,
                total_quantity=tq,
                picked_quantity=round(picked_eff, 6),
                missing_quantity=miss_sum,
                remaining_to_pick=round(rem_pick, 6),
                primary_location_code=loc,
                primary_location_stock=primary_stock,
                extra_locations_count=extra_locs,
                route_sort_key=loc if loc else "\uffff",
                scanner_active=scanner_active,
            )
        )

    cohort_missing = _build_cohort_missing_line_rows(db, order_ids, tenant_id=tenant_id)

    if recovery_mode:
        lines = [ln for ln in lines if _picking_product_line_still_active(ln)]
        logger.info(
            "[wms.recovery.lines.fetch] order_id=%s cart_id=%s recovery_mode=recovery "
            "product_count=%s cohort_order_count=%s",
            order_ids[0] if order_ids else None,
            cart_id,
            len(lines),
            len(order_ids),
        )
    else:
        lines = [ln for ln in lines if _picking_product_line_still_active(ln)]

    recovery_completed = bool(recovery_mode and len(lines) == 0)
    recovery_oid = int(order_ids[0]) if recovery_mode and order_ids else None

    return WmsPickingProductLinesResponse(
        products=lines,
        cohort_order_count=len(order_ids),
        cohort_missing_lines=cohort_missing,
        pick_list=pick_list,
        shortfalls=list(routing.shortfalls),
        warnings=list(routing.warnings),
        allow_continue_other_lines_after_shortage=allow_continue_other_lines,
        picking_mode="recovery" if recovery_mode else "normal",
        recovery_order_id=recovery_oid,
        recovery_completed=recovery_completed,
    )


def build_wms_picking_product_detail(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    product_id: int,
    cart_id: Optional[int] = None,
    fixed_order_ids: list[int] | None = None,
    recovery_mode: bool = False,
) -> Optional[WmsPickingProductDetailResponse]:
    lines_resp = build_wms_picking_product_lines(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=order_type,
        cart_id=cart_id,
        fixed_order_ids=fixed_order_ids,
        recovery_mode=recovery_mode,
    )
    row = next((p for p in lines_resp.products if int(p.product_id) == int(product_id)), None)
    if row is None:
        return None

    if fixed_order_ids is not None:
        order_ids = [int(x) for x in fixed_order_ids if int(x) > 0]
        order_ids = list(dict.fromkeys(order_ids))
        if not recovery_mode:
            order_ids = _filter_fixed_order_ids_to_picking_queue(
                db,
                order_ids,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=_order_type_filter(order_type),
            )
    else:
        order_ids = _query_order_ids_for_status(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=_order_type_filter(order_type),
        )

    loc_qty: dict[int, float] = defaultdict(float)
    loc_code: dict[int, str] = {}
    hint_merge: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for pl in lines_resp.pick_list:
        if int(pl.product_id) != int(product_id):
            continue
        lid = int(pl.location_id)
        loc_code[lid] = pl.location_code or ""
        loc_qty[lid] += float(pl.total_quantity)
        for b in pl.baskets or []:
            label = "Wózek" if b.basket_id is None else f"B{int(b.basket_id)}"
            hint_merge[lid][label] += float(b.quantity)

    lids_sorted = sorted(loc_qty.keys(), key=lambda x: (loc_code.get(x, ""), x))
    stock_by_lid: dict[int, float] = {}
    if lids_sorted:
        inv_rows = (
            db.query(Inventory.location_id, func.coalesce(func.sum(Inventory.quantity), 0.0))
            .filter(
                Inventory.tenant_id == int(tenant_id),
                Inventory.warehouse_id == int(warehouse_id),
                Inventory.product_id == int(product_id),
                Inventory.location_id.in_(lids_sorted),
            )
            .group_by(Inventory.location_id)
            .all()
        )
        stock_by_lid = {int(r[0]): round(float(r[1] or 0.0), 6) for r in inv_rows}

    locations = [
        WmsPickingProductLocationRow(
            location_id=lid,
            location_code=loc_code.get(lid, ""),
            quantity=round(loc_qty[lid], 6),
            stock_quantity=float(stock_by_lid.get(lid, 0.0)),
            put_hints=[
                WmsPickingProductPutHint(label=k, quantity=round(v, 6))
                for k, v in sorted(hint_merge[lid].items())
            ],
        )
        for lid in lids_sorted
    ]

    # Zamówienia z tym produktem — tylko bieżący wózek (sesja): cart_id zgadza się lub zamówienie jeszcze bez wózka
    orders_q = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.basket),
            joinedload(Order.shipping_method_row),
        )
        .filter(Order.id.in_(order_ids))
        .order_by(Order.id.asc())
    )
    order_rows: list[WmsPickingProductOrderRow] = []
    cid = int(cart_id) if cart_id is not None else None
    if cid is not None:
        for o in orders_q.all():
            oc = o.cart_id
            if oc is not None and int(oc) != cid:
                continue
            for oi in sorted(o.items or [], key=lambda x: int(x.id)):
                if int(oi.product_id) != int(product_id):
                    continue
                if order_item_is_replaced_line(oi):
                    continue
                pq_f = sum_pick_events_for_line_cart(db, int(oi.id), cid)
                qty = float(oi.quantity)
                miss_ln = float(oi.wms_picking_line_missing_qty or 0)
                to_pick = max(0.0, qty - pq_f - miss_ln)
                picked_row = min(float(pq_f), max(0.0, qty - miss_ln))
                decl_short = round(max(0.0, to_pick), 6)
                basket = o.basket if o.basket_id is not None else None
                sn, sl, _ = order_shipping_display(o)
                order_rows.append(
                    WmsPickingProductOrderRow(
                        order_id=int(o.id),
                        order_item_id=int(oi.id),
                        order_number=str(o.number or f"#{o.id}"),
                        quantity=qty,
                        picked_quantity=round(picked_row, 6),
                        missing_quantity=round(miss_ln, 6),
                        quantity_to_pick=round(to_pick, 6),
                        line_value=float(oi.total_price) if oi.total_price is not None else None,
                        shipping_method_name=sn,
                        shipping_method_logo_url=sl,
                        basket_slot=_basket_slot_label(basket),
                        shortage_declarable_qty=round(decl_short, 6),
                    )
                )

    active_fifo_order_id: Optional[int] = None
    for orow in order_rows:
        if float(orow.quantity_to_pick) > 1e-9:
            active_fifo_order_id = int(orow.order_id)
            break

    put_to_basket_label: Optional[str] = None
    put_to_basket_color_index = 0

    if cid is not None and active_fifo_order_id is not None:
        cart_m = (
            db.query(Cart)
            .options(joinedload(Cart.baskets))
            .filter(
                Cart.id == cid,
                Cart.tenant_id == int(tenant_id),
                Cart.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if cart_m is not None:
            act_order = (
                db.query(Order)
                .options(joinedload(Order.items).joinedload(OrderItem.product))
                .filter(Order.id == int(active_fifo_order_id))
                .first()
            )
            if act_order is not None:
                # WMS MULTI: utrwalenie koszyka przy wejściu na produkt, żeby picker widział „odłóż do” przed pierwszym pickiem.
                ensure_order_basket_for_wms_pick(db, cart_m, act_order)
                db.flush()
                refreshed_rows: list[WmsPickingProductOrderRow] = []
                for orow in order_rows:
                    odb = (
                        db.query(Order)
                        .options(joinedload(Order.basket))
                        .filter(Order.id == orow.order_id)
                        .first()
                    )
                    bask = odb.basket if odb and odb.basket_id and odb.basket else None
                    refreshed_rows.append(
                        WmsPickingProductOrderRow(
                            order_id=orow.order_id,
                            order_item_id=orow.order_item_id,
                            order_number=orow.order_number,
                            quantity=orow.quantity,
                            picked_quantity=orow.picked_quantity,
                            missing_quantity=orow.missing_quantity,
                            quantity_to_pick=orow.quantity_to_pick,
                            line_value=orow.line_value,
                            shipping_method_name=orow.shipping_method_name,
                            shipping_method_logo_url=orow.shipping_method_logo_url,
                            basket_slot=_basket_slot_label(bask),
                            shortage_declarable_qty=orow.shortage_declarable_qty,
                        )
                    )
                order_rows = refreshed_rows
                act2 = (
                    db.query(Order)
                    .options(joinedload(Order.basket))
                    .filter(Order.id == int(active_fifo_order_id))
                    .first()
                )
                if act2 and act2.basket_id and act2.basket:
                    put_to_basket_label = format_cart_basket_label(act2.basket)
                    bs_sorted = sorted(cart_m.baskets or [], key=lambda x: (x.row, x.column, x.id))
                    for i, bx in enumerate(bs_sorted):
                        if int(bx.id) == int(act2.basket_id):
                            put_to_basket_color_index = i
                            break

    pr = db.query(Product).filter(Product.tenant_id == int(tenant_id), Product.id == int(product_id)).first()
    decl_total = round(sum(float(r.shortage_declarable_qty) for r in order_rows), 6)
    return WmsPickingProductDetailResponse(
        product_id=int(product_id),
        name=pr.name if pr and pr.name else row.name,
        ean=pr.ean if pr else row.ean,
        image_url=pr.image_url if pr else row.image_url,
        total_quantity=row.total_quantity,
        picked_quantity=row.picked_quantity,
        missing_quantity=float(getattr(row, "missing_quantity", 0) or 0),
        remaining_to_pick=row.remaining_to_pick,
        locations=locations,
        orders=order_rows,
        active_fifo_order_id=active_fifo_order_id,
        put_to_basket_label=put_to_basket_label,
        put_to_basket_color_index=put_to_basket_color_index,
        allow_continue_other_lines_after_shortage=lines_resp.allow_continue_other_lines_after_shortage,
        shortage_declarable_total=decl_total,
    )


def record_wms_quick_pick(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    product_id: int,
    location_id: int,
    quantity: float,
    cart_id: int,
    fixed_order_id: int | None = None,
    operator_user_id: int | None = None,
) -> tuple[int, int]:
    """
    Zapis roboczy: rekord Pick z ``cart_id`` (sesja), ``picked_at`` = NULL do czasu finalizacji wózka.
    Wtedy dopiero spada stan Inventory i ustawiane jest ``picked_at``.
    Zwraca (order_id, order_item_id).

    ``fixed_order_id`` — dogrywka recovery: tylko jedno zamówienie (bez kohorty statusu).
    """
    if quantity <= 0:
        raise ValueError("Ilość musi być > 0.")

    if fixed_order_id is not None:
        oid = int(fixed_order_id)
        ochk = (
            db.query(Order)
            .filter(
                Order.id == oid,
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if not ochk:
            raise ValueError("Zamówienie nie należy do tego magazynu / tenanta.")
        from .wms_recovery_pick_service import get_open_recovery_task_for_order

        from .recovery_workflow_service import RecoveryWorkflowError, resolve_order_recovery_state

        try:
            rec_state = resolve_order_recovery_state(
                db,
                oid,
                session_cart_id=int(cart_id),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                log=False,
            )
        except RecoveryWorkflowError as exc:
            raise ValueError(exc.message) from exc
        if not rec_state.has_recovery_work:
            raise ValueError("Brak linii do dogrywki — braki zostały już rozwiązane.")
        order_ids = [oid]
    else:
        ot = _order_type_filter(order_type)
        order_ids = _query_order_ids_for_status(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=ot,
        )
        if not order_ids:
            raise ValueError("Brak zamówień do przypisania kompletacji.")

    allowed = _allowed_pick_location_ids_for_product(
        db, tenant_id=tenant_id, order_ids=order_ids, product_id=product_id
    )
    if not allowed:
        raise ValueError("Brak lokalizacji do pobrania tego produktu (routing / alokacja).")
    if int(location_id) not in allowed:
        raise ValueError("Lokalizacja nie należy do trasy zbiórki tego produktu.")

    cart_row = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not cart_row:
        raise ValueError("Nie znaleziono aktywnego wózka (sesja).")
    if cart_row.status == CartStatus.AVAILABLE:
        cart_row.status = CartStatus.IN_PROGRESS

    cid = int(cart_row.id)
    q_remain = float(quantity)
    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id.in_(order_ids))
        .order_by(Order.id.asc())
        .all()
    )

    last_oid, last_oiid = 0, 0
    touched_order_ids: set[int] = set()
    while q_remain > 1e-9:
        progressed = False
        for o in orders:
            for oi in sorted(o.items or [], key=lambda x: int(x.id)):
                if int(oi.product_id) != int(product_id):
                    continue
                if order_item_is_replaced_line(oi):
                    continue
                st_oi = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
                if st_oi in ("picked", "missing"):
                    continue
                need = float(oi.quantity)
                miss_ln = float(oi.wms_picking_line_missing_qty or 0)
                picked_sum = sum_pick_events_for_line_cart(db, int(oi.id), cid)
                rem = need - float(picked_sum or 0) - miss_ln
                if rem <= 1e-9:
                    continue
                take = min(q_remain, rem)
                if o.cart_id is not None and int(o.cart_id) != cid:
                    num = str(o.number or o.id)
                    raise ValueError(
                        f"Zamówienie #{num} jest przypisane do innego wózka — użyj właściwej sesji."
                    )
                ps_before = getattr(o, "picking_started_at", None)
                o.cart_id = cid
                touch_picking_in_progress(o)
                if ps_before is None and getattr(o, "picking_started_at", None) is not None:
                    emit_wms_picking_started(
                        db,
                        tenant_id=int(tenant_id),
                        warehouse_id=int(warehouse_id),
                        order=o,
                        cart=cart_row,
                        operator_user_id=operator_user_id,
                    )
                ensure_order_basket_for_wms_pick(db, cart_row, o)
                if _cart_type_upper(cart_row) == "MULTI" and o.basket_id is None:
                    num = str(o.number or o.id)
                    raise ValueError(
                        f"Brak wolnego koszyka z wystarczającą pojemnością dla zamówienia #{num} — sprawdź wózek MULTI."
                    )
                pick = Pick(
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    order_id=int(o.id),
                    order_item_id=int(oi.id),
                    product_id=int(product_id),
                    location_id=int(location_id),
                    cart_id=cid,
                    quantity=float(take),
                    picked_at=None,
                    status="picking",
                )
                if operator_user_id is not None and int(operator_user_id) > 0:
                    pick.picker_id = int(operator_user_id)
                db.add(pick)
                db.flush()
                record_pick_event_for_wms_pick(db, pick)
                pr = getattr(oi, "product", None)
                sku_hint = None
                if pr is not None:
                    sku_hint = (getattr(pr, "sku", None) or getattr(pr, "symbol", None) or None)
                    if sku_hint is not None:
                        sku_hint = str(sku_hint).strip() or None
                emit_wms_picked_item(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    order=o,
                    pick=pick,
                    cart=cart_row,
                    product_sku=sku_hint,
                    product_id=int(product_id),
                    location_id=int(location_id),
                    operator_user_id=operator_user_id,
                )
                _refresh_order_item_line_picked_status(db, oi, cart_id=cid)
                touched_order_ids.add(int(o.id))
                last_oid, last_oiid = int(o.id), int(oi.id)
                q_remain -= take
                progressed = True
                break
            if progressed:
                break
        if not progressed:
            raise ValueError("Brak linii zamówienia wymagającej kompletacji tego produktu (pozostało do rozdzielenia).")

    for oid_touch in touched_order_ids:
        recompute_order_fulfillment(db, int(oid_touch), commit=False, session_cart_id=cid)

    return last_oid, last_oiid


def _report_shortage_reject(reason: str, *, payload: dict, **ctx: object) -> None:
    logger.warning(
        "[report_shortage] REJECT reason=%s payload=%s ctx=%s",
        reason,
        payload,
        ctx,
    )
    raise ValueError(reason)


def _line_shortage_report_quantities(
    db: Session,
    oi: OrderItem,
    cart_id: int,
) -> dict[str, float]:
    """
    Ilości do zgłoszenia braku — ta sama semantyka co karta produktu (``quantity_to_pick``).

    ``remaining_qty`` = ordered − picked (sesja) − już zapisany brak operacyjny (``wms_picking_line_missing_qty``).
    Częściowe zbieranie (np. 1/2) pozostaje kwalifikowane do zgłoszenia braku.
    """
    qty = float(oi.quantity or 0)
    cid = int(cart_id)
    picked_raw = float(sum_pick_events_for_line_cart(db, int(oi.id), cid))
    miss_ln = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
    declared = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
    picked_eff = min(picked_raw, max(0.0, qty - miss_ln))
    remaining_qty = max(0.0, qty - picked_eff - miss_ln)
    shortage_existing = max(miss_ln, declared)
    return {
        "required_qty": qty,
        "picked_qty": picked_eff,
        "picked_qty_raw": picked_raw,
        "shortage_qty_existing": shortage_existing,
        "missing_qty_line": miss_ln,
        "declared_qty": declared,
        "remaining_qty": remaining_qty,
        "declarable_qty": remaining_qty,
    }


def _line_eligible_for_shortage_report(oi: OrderItem) -> tuple[bool, str]:
    """Czy można zgłosić brak na tej linii (zamiennik / TO_PICK / aktywna — nie archiwum REPLACED)."""
    if getattr(oi, "parent_bundle_order_item_id", None) is not None:
        return False, "bundle_component_line"
    if order_item_is_replaced_line(oi):
        return False, "archived_replaced_line"
    qty = float(oi.quantity or 0)
    if qty > 1e-9:
        return True, "active_line"
    rep_from = int(getattr(oi, "replaced_from_order_item_id", 0) or 0)
    if rep_from > 0:
        return True, "substitute_line"
    st = (getattr(oi, "oms_line_status", None) or "").strip().upper()
    if st == OMS_LINE_STATUS_TO_PICK:
        return True, "to_pick_line"
    return False, "no_eligible_quantity"


def _shortage_line_report_context(
    db: Session,
    oi: OrderItem,
    *,
    is_recovery: bool,
) -> dict:
    rep_from = int(getattr(oi, "replaced_from_order_item_id", 0) or 0)
    is_replacement = rep_from > 0
    orig_name = (getattr(oi, "replaced_from_product_name", None) or "").strip() or None
    pr = oi.product if getattr(oi, "product", None) is not None else None
    if pr is None and oi.product_id:
        pr = db.query(Product).filter(Product.id == int(oi.product_id)).first()
    pname = (pr.name if pr and pr.name else "") or f"Produkt #{int(oi.product_id)}"
    return {
        "is_replacement": bool(is_replacement),
        "is_recovery": bool(is_recovery),
        "original_order_item_id": rep_from if rep_from > 0 else None,
        "original_product_name": orig_name,
        "product_name": pname,
    }


def report_wms_picking_product_shortage(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    product_id: int,
    location_id: Optional[int],
    missing_qty: float,
    cart_id: int,
    ui_order_ids: Optional[Sequence[int]] = None,
    recovery_order_id: int | None = None,
    order_item_id: int | None = None,
    operator_user_id: int | None = None,
) -> dict:
    """
    Zgłoszenie braku w kontekście sesji zbierania (wózek).

    ``recovery_order_id`` / ``order_item_id`` — dogrywka i zamienniki bez kohorty statusu źródłowego
    (jak ``fixed_order_ids`` na liście produktów recovery).
    """
    payload_log = {
        "product_id": int(product_id),
        "location_id": int(location_id) if location_id is not None else None,
        "missing_qty": float(missing_qty),
        "cart_id": int(cart_id),
        "order_ids": list(ui_order_ids) if ui_order_ids is not None else None,
        "recovery_order_id": int(recovery_order_id) if recovery_order_id is not None else None,
        "order_item_id": int(order_item_id) if order_item_id is not None else None,
    }
    target_item_id = int(order_item_id) if order_item_id is not None and int(order_item_id) > 0 else None
    is_recovery = recovery_order_id is not None and int(recovery_order_id) > 0
    roid = int(recovery_order_id) if is_recovery else None

    from .picking_config_query import resolve_picking_config_for_shortage_report

    pc, picking_ctx = resolve_picking_config_for_shortage_report(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
        order_item_id=target_item_id,
        recovery_order_id=roid,
    )
    workflow_scoped = bool(picking_ctx.get("workflow_scoped"))
    workflow_type = str(picking_ctx.get("workflow_type") or "cohort")
    effective_source_status_id = int(
        picking_ctx.get("resolved_source_status_id") or int(source_status_id)
    )
    source_type = "recovery" if is_recovery else workflow_type

    logger.info(
        "[shortage.report] ENTER order_id=%s order_item_id=%s replacement_item_id=%s "
        "recovery_task_id=%s source_status_id=%s source_type=%s picking_context=%s workflow_type=%s payload=%s",
        roid or picking_ctx.get("order_id"),
        target_item_id,
        picking_ctx.get("replacement_item_id"),
        roid,
        effective_source_status_id,
        source_type,
        picking_ctx,
        workflow_type,
        payload_log,
    )

    if pc is None and not workflow_scoped:
        _report_shortage_reject(
            "Brak konfiguracji zbierania dla tego statusu źródłowego.",
            payload=payload_log,
            picking_context=picking_ctx,
        )

    pid = int(product_id)
    cid = int(cart_id)
    cart_row = (
        db.query(Cart)
        .filter(
            Cart.id == cid,
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not cart_row:
        _report_shortage_reject(
            "Nie znaleziono wózka sesji (cart_id) dla tego magazynu.",
            payload=payload_log,
        )

    forced_scope_ids: list[int] | None = None
    if target_item_id is not None:
        oi_target = (
            db.query(OrderItem)
            .options(joinedload(OrderItem.product))
            .filter(OrderItem.id == int(target_item_id))
            .first()
        )
        if oi_target is None:
            _report_shortage_reject(
                "Nie znaleziono linii zamówienia (order_item_id).",
                payload=payload_log,
                order_item_id=target_item_id,
            )
        if int(oi_target.product_id) != pid:
            _report_shortage_reject(
                "product_id nie odpowiada wskazanej linii zamówienia.",
                payload=payload_log,
                order_item_id=target_item_id,
                line_product_id=int(oi_target.product_id),
            )
        ok_ln, why_ln = _line_eligible_for_shortage_report(oi_target)
        if not ok_ln:
            _report_shortage_reject(
                f"Linia nie kwalifikuje się do zgłoszenia braku ({why_ln}).",
                payload=payload_log,
                order_item_id=target_item_id,
                is_replacement=bool(getattr(oi_target, "replaced_from_order_item_id", None)),
            )
        forced_scope_ids = [int(oi_target.order_id)]

    if is_recovery and roid is not None:
        from .wms_recovery_pick_service import prepare_recovery_picking_for_order

        prep = prepare_recovery_picking_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(roid),
            cart_id=int(cart_id),
        )
        if not prep.get("ok"):
            _report_shortage_reject(
                "Zamówienie dogrywki nie znalezione.",
                payload=payload_log,
                order_id=roid,
            )
        if prep.get("completed"):
            _report_shortage_reject(
                "Brak linii do dogrywki — braki zostały już rozwiązane.",
                payload=payload_log,
                order_id=roid,
            )
        o_rec = (
            db.query(Order)
            .filter(Order.id == int(roid), Order.tenant_id == int(tenant_id))
            .first()
        )
        if o_rec is None:
            _report_shortage_reject(
                "Zamówienie dogrywki nie znalezione.",
                payload=payload_log,
                order_id=roid,
            )
        forced_scope_ids = list(dict.fromkeys([int(roid)] + (forced_scope_ids or [])))

    if forced_scope_ids is not None:
        session_scope_ids = list(dict.fromkeys(int(x) for x in forced_scope_ids if int(x) > 0))
        orders = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id.in_(session_scope_ids))
            .all()
        )
    else:
        ot = _order_type_filter(order_type)
        order_ids_all = _query_order_ids_for_status(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=ot,
        )
        if not order_ids_all:
            _report_shortage_reject(
                "Brak zamówień w tym statusie zbierania.",
                payload=payload_log,
            )

        cohort_set = set(int(x) for x in order_ids_all)
        scoped_rows = (
            db.query(Order.id)
            .filter(
                Order.id.in_(list(order_ids_all)),
                or_(Order.cart_id == cid, Order.cart_id.is_(None)),
            )
            .all()
        )
        session_scope_ids = [int(r[0]) for r in scoped_rows]

        if ui_order_ids is not None and len(list(ui_order_ids)) > 0:
            want = [int(x) for x in ui_order_ids if int(x) > 0]
            allowed = set(session_scope_ids)
            session_scope_ids = list(dict.fromkeys([oid for oid in want if oid in allowed and oid in cohort_set]))

        if not session_scope_ids:
            _report_shortage_reject(
                "Brak zamówień w bieżącej sesji zbierania (wózek).",
                payload=payload_log,
                cohort_size=len(order_ids_all),
            )

        orders = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id.in_(session_scope_ids))
            .all()
        )

    if location_id is not None:
        allowed_locs = _allowed_pick_location_ids_for_product(
            db, tenant_id=tenant_id, order_ids=session_scope_ids, product_id=pid
        )
        if allowed_locs and int(location_id) not in allowed_locs:
            if is_recovery or target_item_id is not None:
                logger.info(
                    "[report_shortage] location_soft_skip order_ids=%s location_id=%s allowed=%s",
                    session_scope_ids,
                    int(location_id),
                    sorted(allowed_locs)[:16],
                )
            else:
                _report_shortage_reject(
                    "Lokalizacja nie należy do trasy zbiórki tego produktu.",
                    payload=payload_log,
                    location_id=int(location_id),
                    allowed_count=len(allowed_locs),
                )

    def _iter_report_lines(o: Order):
        for oi in sorted(o.items or [], key=lambda x: int(x.id)):
            if target_item_id is not None and int(oi.id) != int(target_item_id):
                continue
            if int(oi.product_id) != pid:
                continue
            ok, reason = _line_eligible_for_shortage_report(oi)
            rep_oid = getattr(oi, "replaced_from_order_item_id", None)
            orig_oid = int(rep_oid) if rep_oid is not None and int(rep_oid) > 0 else None
            q = _line_shortage_report_quantities(db, oi, cid)
            logger.info(
                "[wms.shortage.report] order_id=%s order_item_id=%s required_qty=%s picked_qty=%s "
                "shortage_qty_existing=%s remaining_qty=%s cart_id=%s allowed=%s reason=%s "
                "replacement_line_id=%s is_recovery=%s",
                int(o.id),
                int(oi.id),
                q["required_qty"],
                q["picked_qty"],
                q["shortage_qty_existing"],
                q["remaining_qty"],
                cid,
                ok,
                reason,
                int(oi.id) if orig_oid is not None else None,
                is_recovery,
            )
            if not ok:
                continue
            yield oi, q

    affected: list[int] = []
    for o in orders:
        for oi, q in _iter_report_lines(o):
            if float(q["declarable_qty"]) > 1e-9:
                affected.append(int(o.id))
                break

    if not affected:
        _report_shortage_reject(
            "Cała wymagana ilość została już rozliczona (zebrano + brak = zamówione).",
            payload=payload_log,
            session_scope_ids=session_scope_ids,
            is_recovery=is_recovery,
        )

    aff_set = list(dict.fromkeys(affected))
    max_declarable = 0.0
    for o in orders:
        if int(o.id) not in aff_set:
            continue
        for _oi, q in _iter_report_lines(o):
            max_declarable += max(0.0, float(q["declarable_qty"]))
    max_declarable = round(max_declarable, 6)
    if float(missing_qty) > max_declarable + 1e-6:
        _report_shortage_reject(
            f"Nie można zgłosić więcej niż {max_declarable:g} szt. braku "
            f"(zebrano + brak nie może przekroczyć zamówionej ilości).",
            payload=payload_log,
            max_declarable=max_declarable,
        )

    from .wms_audit_service import emit_line_shortage_reported

    remaining_budget = max(0.0, float(missing_qty))
    shortage_by_order: dict[int, float] = defaultdict(float)
    line_audit_rows: list[tuple[Order, OrderItem, float]] = []

    for o in orders:
        if int(o.id) not in aff_set:
            continue
        touch_picking_in_progress(o)
        for oi, q in _iter_report_lines(o):
            rem_line = float(q["declarable_qty"])
            if rem_line <= 1e-9:
                continue
            take = min(rem_line, remaining_budget)
            if take <= 1e-9:
                continue
            remaining_budget = max(0.0, remaining_budget - take)
            shortage_by_order[int(o.id)] += float(take)
            declared_ln = float(q["declared_qty"])
            oi.wms_shortage_declared_qty = round(declared_ln + take, 6)
            oi.wms_picking_line_status = "missing"
            pending_pick_rows = (
                db.query(Pick.id)
                .filter(
                    Pick.order_item_id == int(oi.id),
                    Pick.cart_id == cid,
                    Pick.picked_at.is_(None),
                )
                .all()
            )
            delete_pick_events_for_pick_ids(db, [int(r[0]) for r in pending_pick_rows])
            db.query(Pick).filter(
                Pick.order_item_id == int(oi.id),
                Pick.cart_id == cid,
                Pick.picked_at.is_(None),
            ).delete(synchronize_session=False)
            append_event(
                db,
                order_item_id=int(oi.id),
                event_type=FE_MISSING,
                quantity=float(take),
                metadata={
                    "cart_id": cid,
                    "source": "wms_report_shortage",
                    "recovery": is_recovery,
                    "replacement": bool(getattr(oi, "replaced_from_order_item_id", None)),
                },
            )
            sync_declared_shortage_column_from_missing_events(db, int(oi.id))
            line_audit_rows.append((o, oi, float(take)))

    for oid in aff_set:
        recompute_order_fulfillment(db, int(oid), commit=False, session_cart_id=cid)

    for o, oi, take in line_audit_rows:
        if take <= 1e-9:
            continue
        ctx = _shortage_line_report_context(db, oi, is_recovery=is_recovery)
        emit_line_shortage_reported(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(o.id),
            order_item_id=int(oi.id),
            product_id=int(pid),
            product_name=str(ctx["product_name"]),
            location_id=int(location_id) if location_id is not None else None,
            cart_id=int(cid),
            shortage_qty=float(take),
            operator_user_id=operator_user_id,
            is_replacement=bool(ctx["is_replacement"]),
            is_recovery=bool(ctx["is_recovery"]),
            original_order_item_id=ctx.get("original_order_item_id"),
            original_product_name=ctx.get("original_product_name"),
            reason="wms_report_shortage",
        )

    logger.info(
        "[shortage.report] OK order_ids=%s workflow_type=%s source_status_id=%s",
        aff_set,
        workflow_type,
        effective_source_status_id,
    )

    rep = WmsPickingShortageReport(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=effective_source_status_id,
        order_type=str(order_type),
        product_id=pid,
        location_id=int(location_id) if location_id is not None else None,
        missing_qty=float(missing_qty),
        order_ids_json=json.dumps(aff_set),
    )
    db.add(rep)

    task_ids = upsert_order_issue_tasks_from_shortage(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_ids=list(aff_set),
        shortage_product_id=pid,
        source_picking_cart_id=int(cid),
        source_operator_id=operator_user_id,
    )
    logger.info(
        "[shortage.report] braki_tasks order_ids=%s task_ids=%s product_id=%s",
        aff_set,
        task_ids,
        pid,
    )

    ss_ui = get_or_create_wms_picking_shortage_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    return {
        "ok": True,
        "orders_updated": len(aff_set),
        "target_status_id": None,
        "order_ids": aff_set,
        "order_issue_task_ids": task_ids,
        "allow_continue_other_lines_after_shortage": bool(
            getattr(ss_ui, "allow_continue_other_lines_after_shortage", True)
        ),
    }


def _finalize_recovery_state_summaries(
    db: Session,
    orders: Sequence[Order],
    *,
    cart_id: int,
) -> list[dict]:
    """Skrót stanu recovery per zamówienie — do logów finalize."""
    from .recovery_workflow_service import RecoveryWorkflowError, resolve_order_recovery_state

    cid = int(cart_id)
    out: list[dict] = []
    for order in orders:
        oid = int(order.id)
        try:
            st = resolve_order_recovery_state(db, order, session_cart_id=cid, log=False)
            out.append(
                {
                    "order_id": oid,
                    "recovery_status": st.recovery_status,
                    "unresolved_lines": int(st.totals.recovery_lines),
                    "recovery_lines": int(st.totals.recovery_lines),
                    "relocation_lines": int(st.totals.relocation_lines),
                    "oms_lines": int(st.totals.oms_decision_lines),
                    "packing_allowed": bool(st.packing_allowed),
                    "finalize_allowed": bool(st.finalize_allowed),
                    "has_recovery_work": bool(st.has_recovery_work),
                    "has_relocation_work": bool(st.has_relocation_work),
                    "state_hash": st.state_hash,
                    "state_version": st.state_version,
                }
            )
        except RecoveryWorkflowError as exc:
            out.append(
                {
                    "order_id": oid,
                    "error": exc.message,
                    "code": exc.code,
                }
            )
        except Exception as exc:
            out.append(
                {
                    "order_id": oid,
                    "error": str(exc).strip() or exc.__class__.__name__,
                    "code": "recovery_state_compute_failed",
                }
            )
    return out


def _finalize_cohort_snapshot(
    db: Session,
    orders: Sequence[Order],
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    recovery_summaries: Sequence[dict] | None = None,
) -> dict:
    """Diagnoza kohorty przed domknięciem wózka."""
    picked_lines = 0
    shortage_lines = 0
    replacement_lines = 0
    removed_lines = 0
    unresolved_lines = 0
    recovery_deferred_lines = 0
    cid = int(cart_id)
    for order in orders:
        for oi in order.items or []:
            if getattr(oi, "parent_bundle_order_item_id", None) is not None:
                continue
            if bool(getattr(oi, "is_bundle_parent", False)):
                continue
            if order_item_is_replaced_line(oi):
                removed_lines += 1
                continue
            qty = float(oi.quantity or 0)
            if qty <= 1e-9:
                continue
            picked = _picked_qty_for_order_item_on_cart(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                order_item_id=int(oi.id),
                cart_id=cid,
            )
            miss = line_shortage_qty_for_picking_finalize(
                db, order, oi, session_cart_id=cid, picked=picked
            )
            if float(getattr(oi, "oms_replaced_qty", None) or 0.0) > 1e-9:
                replacement_lines += 1
            if float(getattr(oi, "oms_removed_qty", None) or 0.0) > 1e-9:
                removed_lines += 1
            resolved, reason = _picking_line_resolved_for_finalize(
                db,
                order,
                oi,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                cart_id=cid,
            )
            if miss > 1e-9:
                shortage_lines += 1
            elif picked + 1e-9 >= qty:
                picked_lines += 1
            if reason in ("recovery_deferred", "recovery_deferred_substitute"):
                recovery_deferred_lines += 1
            elif not resolved:
                unresolved_lines += 1
    if recovery_summaries is not None:
        recovery_deferred_lines = sum(
            int(s.get("unresolved_lines") or 0) for s in recovery_summaries if "unresolved_lines" in s
        )
    return {
        "cart_id": cid,
        "order_count": len(orders),
        "picked_lines": picked_lines,
        "shortage_lines": shortage_lines,
        "replacement_lines": replacement_lines,
        "removed_lines": removed_lines,
        "unresolved_lines": unresolved_lines,
        "recovery_deferred_lines": recovery_deferred_lines,
        "recovery_state_summary": list(recovery_summaries or []),
    }


def cohort_shortage_order_ids_from_orders(db: Session, orders: Iterable[Order]) -> list[int]:
    """Zamówienia z brakiem operacyjnym lub niepełną zbiórką zamiennika (jak kolejka Order Issues)."""
    out: list[int] = []
    for o in orders:
        u, r = count_issue_queue_operational_lines(db, o)
        if u > 0 or r > 0:
            out.append(int(o.id))
    return sorted(set(out))


def cohort_shortage_stats_from_orders(orders: Iterable[Order]) -> tuple[int, float]:
    """
    Po zakończeniu zbiórki: ile SKU ma zgłoszony brak oraz suma sztuk braków (linie ``wms_picking_line_missing_qty``).
    """
    seen: set[int] = set()
    total = 0.0
    for o in orders:
        for oi in o.items or []:
            if order_item_is_replaced_line(oi):
                continue
            mq = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
            if mq > 1e-9:
                total += mq
                seen.add(int(oi.product_id))
    return len(seen), round(total, 6)


def finalize_wms_picking_cart(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: WmsPickingOrderTypeFilter,
    cart_id: int,
    operator_user_id: int | None = None,
    performed_by: AppUser | None = None,
) -> dict:
    """
    Domknięcie sesji wózka: weryfikacja że każda linia ma ``pick + brak >= qty``,
    spisanie stanu magazynu dla roboczych Pick (``picked_at`` NULL → teraz),
    ustawienie ``order_ui_status_id`` i ``fulfillment_state`` per zamówienie:
    wszystkie linie zebrane → ``READY_TO_PACK`` + ``target_status_id``;
    część braków → ``NEEDS_DECISION``; wszystkie linie jako brak → ``MISSING``.
    Status panelu przy brakach: z ustawień **Obsługa braków** (WMS → Zbieranie), inaczej ``target_status_id`` reguły.
    """
    pc = (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
            PickingConfig.source_status_id == int(source_status_id),
        )
        .first()
    )
    if not pc:
        raise PickingFinalizeError(
            "Brak konfiguracji zbierania dla tego statusu źródłowego.",
            reason="missing_picking_config",
            step="start",
            http_status=404,
            code="picking_config_not_found",
        )

    cart = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not cart:
        raise PickingFinalizeError(
            "Nie znaleziono aktywnego wózka (sesja wygasła lub błędne ID).",
            reason="cart_not_found",
            step="start",
            http_status=404,
            code="cart_not_found",
        )

    ot = _order_type_filter(order_type)
    order_ids = _order_ids_for_cart_finalize(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=ot,
        cart_id=int(cart_id),
    )
    if not order_ids:
        raise PickingFinalizeError(
            "Brak zamówień przypisanych do tego wózka w tej kohortcie.",
            reason="empty_cohort",
            step="start",
            http_status=400,
            code="cohort_empty",
        )

    cid = int(cart.id)
    sid = int(source_status_id)
    logger.info(
        "[picking.finalize.start] cart_id=%s source_status_id=%s order_type=%s tenant_id=%s warehouse_id=%s "
        "order_ids=%s cohort_orders=%s",
        cid,
        sid,
        str(order_type),
        int(tenant_id),
        int(warehouse_id),
        list(order_ids),
        len(order_ids),
    )

    try:
        for oid in order_ids:
            recompute_order_fulfillment(db, int(oid), commit=False, session_cart_id=cid)
        db.flush()
    except Exception as exc:
        logger.exception(
            "[picking.finalize.error] cart_id=%s source_status_id=%s step=recompute_fulfillment",
            cid,
            sid,
        )
        raise PickingFinalizeError(
            f"Nie udało się przeliczyć stanu zamówień przed domknięciem wózka: {exc}",
            reason=exc.__class__.__name__,
            step="recompute_fulfillment",
            http_status=409,
            code="fulfillment_recompute_failed",
        ) from exc

    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id.in_(list(order_ids)))
        .all()
    )
    for o in orders:
        if o.cart_id is not None and int(o.cart_id) != cid:
            num = str(o.number or o.id)
            raise PickingFinalizeError(
                f"Zamówienie #{num} jest przypisane do innego wózka — dokończ na właściwej sesji.",
                reason="wrong_cart",
                order_id=int(o.id),
                step="validate",
                http_status=409,
                code="order_wrong_cart",
            )

    from .recovery_workflow_service import (
        OrderRecoveryState,
        RecoveryWorkflowError,
        resolve_order_recovery_state,
        validate_order_finalize_allowed,
    )

    recovery_by_order: dict[int, OrderRecoveryState] = {}
    recovery_summaries = _finalize_recovery_state_summaries(db, orders, cart_id=cid)
    for o in orders:
        oid = int(o.id)
        try:
            recovery_by_order[oid] = resolve_order_recovery_state(
                db,
                o,
                session_cart_id=cid,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                log=True,
            )
        except RecoveryWorkflowError as exc:
            raise PickingFinalizeError(
                exc.message,
                reason=exc.code,
                order_id=oid,
                step="validate",
                http_status=exc.http_status,
                code=exc.code,
            ) from exc
        except Exception as exc:
            raise PickingFinalizeError(
                f"Nie udało się ustalić stanu recovery zamówienia #{o.number or oid}: {exc}",
                reason=exc.__class__.__name__,
                order_id=oid,
                step="validate",
                http_status=409,
                code="recovery_state_failed",
            ) from exc

    logger.info(
        "[picking.finalize.validate] cart_id=%s source_status_id=%s recovery_state_summary=%s",
        cid,
        sid,
        recovery_summaries,
    )

    for o in orders:
        rec_state = recovery_by_order[int(o.id)]
        try:
            validate_order_finalize_allowed(rec_state, order_number=str(o.number or o.id))
        except RecoveryWorkflowError as exc:
            logger.warning(
                "[picking.finalize.validate] BLOCKED order_id=%s cart_id=%s source_status_id=%s "
                "code=%s finalize_allowed=%s packing_allowed=%s",
                int(o.id),
                cid,
                sid,
                exc.code,
                rec_state.finalize_allowed,
                rec_state.packing_allowed,
            )
            raise PickingFinalizeError(
                exc.message,
                reason=exc.code,
                order_id=int(o.id),
                line_id=exc.order_item_id,
                step="validate",
                http_status=exc.http_status,
                code=exc.code,
            ) from exc

    start_snap = _finalize_cohort_snapshot(
        db,
        orders,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        cart_id=cid,
        recovery_summaries=recovery_summaries,
    )
    logger.info(
        "[picking.finalize.start] cart_id=%s source_status_id=%s snapshot=%s",
        cid,
        sid,
        start_snap,
    )

    try:
        pending_picks = (
            db.query(Pick)
            .filter(
                Pick.tenant_id == int(tenant_id),
                Pick.warehouse_id == int(warehouse_id),
                Pick.cart_id == cid,
                Pick.order_id.in_(list(order_ids)),
                Pick.picked_at.is_(None),
            )
            .order_by(Pick.id.asc())
            .with_for_update()
            .all()
        )
        now = datetime.utcnow()
        finalized_ids: list[int] = []
        for p in pending_picks:
            finalized_rows = _decrement_inventory_for_wms_pick(db, p, performed_by=performed_by, picked_at=now)
            for row in finalized_rows:
                row.picked_at = now
                row.status = "done"
                finalized_ids.append(int(row.id))
        mark_pick_events_finalized_for_pick_ids(db, finalized_ids)
        logger.info(
            "[picking.finalize.finish] cart_id=%s source_status_id=%s step=inventory picks_finalized=%s",
            cid,
            sid,
            len(finalized_ids),
        )
    except Exception as exc:
        logger.exception(
            "[picking.finalize.error] cart_id=%s source_status_id=%s step=inventory",
            cid,
            sid,
        )
        raise PickingFinalizeError(
            f"Nie udało się spisać stanu magazynu dla zbierania: {exc}",
            reason=exc.__class__.__name__,
            step="inventory",
            http_status=409,
            code="inventory_finalize_failed",
        ) from exc

    tgt = int(pc.target_status_id)
    ss = get_or_create_wms_picking_shortage_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    rep_sid = getattr(ss, "shortage_reported_order_ui_status_id", None)
    rep_sid_i = int(rep_sid) if rep_sid is not None and int(rep_sid) > 0 else None

    order_kinds: dict[int, OrderFinalizeKind] = {}
    for o in orders:
        rec_state = recovery_by_order[int(o.id)]
        lines = list(o.items or [])
        for oi in lines:
            if order_item_is_replaced_line(oi):
                continue
            qty = float(oi.quantity or 0)
            if qty <= 1e-5:
                continue
            picked_dbg = _picked_qty_for_order_item_on_cart(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                order_item_id=int(oi.id),
                cart_id=cid,
            )
            miss_dbg = line_shortage_qty_for_picking_finalize(
                db, o, oi, session_cart_id=cid, picked=picked_dbg
            )
            declared_dbg = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
            resolved_dbg, reason_dbg = _picking_line_resolved_for_finalize(
                db,
                o,
                oi,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                cart_id=cid,
                recovery_state=rec_state,
            )
            logger.info(
                "[picking.finalize.validate] order_id=%s order_item_id=%s product_id=%s "
                "required_qty=%s picked_qty=%s shortage_qty=%s resolved_shortage_qty=%s "
                "effective_qty=%s resolved=%s reason=%s cart_id=%s source_status_id=%s",
                int(o.id),
                int(oi.id),
                int(oi.product_id or 0),
                qty,
                picked_dbg,
                miss_dbg,
                declared_dbg,
                picked_dbg + miss_dbg,
                resolved_dbg,
                reason_dbg,
                cid,
                sid,
            )
        try:
            order_kinds[int(o.id)] = _classify_order_after_picking_session(
                o,
                db=db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                cart_id=cid,
                recovery_state=rec_state,
            )
        except ValueError as exc:
            raise PickingFinalizeError(
                str(exc),
                reason="classify_order",
                order_id=int(o.id),
                step="validate",
                http_status=400,
                code="order_classify_failed",
            ) from exc

    from .recovery_workflow_service import sync_relocation_tasks_from_recovery_state
    from .wms_recovery_pick_service import ensure_recovery_pick_task, get_open_recovery_task_for_order

    for o in orders:
        oid = int(o.id)
        rec_state = recovery_by_order[oid]
        kind = order_kinds[oid]
        try:
            pack_ok = bool(rec_state.packing_allowed)
            panel_kind: OrderFinalizeKind = kind
            if kind == "all_picked" and not pack_ok:
                panel_kind = "some_missing"
            if kind == "all_picked" and pack_ok:
                fs = FS_READY_TO_PACK
            elif kind == "all_missing":
                fs = FS_MISSING
            else:
                fs = FS_NEEDS_DECISION
            o.order_ui_status_id = _panel_status_after_picking_finalize(
                shortage_reported_order_ui_status_id=rep_sid_i,
                pc=pc,
                kind=panel_kind,
            )
            apply_fulfillment_state(o, fs, clear_cart=True, clear_session=True)
            emit_wms_picking_finished(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order=o,
                cart_id=cid,
                operator_user_id=operator_user_id,
                new_order_ui_status_id=int(o.order_ui_status_id) if getattr(o, "order_ui_status_id", None) else None,
            )
        except Exception as exc:
            logger.exception(
                "[picking.finalize.error] order_id=%s cart_id=%s source_status_id=%s step=apply_order_state",
                oid,
                cid,
                sid,
            )
            raise PickingFinalizeError(
                f"Nie udało się domknąć zbierania zamówienia #{o.number or oid}: {exc}",
                reason=exc.__class__.__name__,
                order_id=oid,
                step="apply_order_state",
                http_status=409,
                code="apply_order_state_failed",
            ) from exc

        try:
            sync_relocation_tasks_from_recovery_state(
                db,
                o,
                rec_state,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_event_id=f"picking_finalize:{cid}",
            )
        except Exception as exc:
            logger.exception(
                "[picking.finalize.error] order_id=%s cart_id=%s source_status_id=%s step=relocation",
                oid,
                cid,
                sid,
            )
            raise PickingFinalizeError(
                f"Nie udało się utworzyć zadań rozlokowania dla zamówienia #{o.number or oid}: {exc}",
                reason=exc.__class__.__name__,
                order_id=oid,
                step="relocation",
                http_status=409,
                code="relocation_sync_failed",
            ) from exc

        logger.info(
            "[picking.finalize.relocation] order_id=%s cart_id=%s source_status_id=%s "
            "relocation_required=%s relocation_lines=%s packing_allowed=%s",
            oid,
            cid,
            sid,
            bool(rec_state.has_relocation_work),
            int(rec_state.totals.relocation_lines),
            bool(rec_state.packing_allowed),
        )

    for o in orders:
        oid = int(o.id)
        try:
            post_state = resolve_order_recovery_state(
                db,
                o,
                session_cart_id=cid,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                log=True,
            )
            recovery_by_order[oid] = post_state
            logger.info(
                "[picking.finalize.recovery] order_id=%s cart_id=%s source_status_id=%s "
                "recovery_status=%s unresolved_lines=%s recovery_lines=%s "
                "has_recovery_work=%s state_hash=%s packing_allowed=%s",
                oid,
                cid,
                sid,
                post_state.recovery_status,
                int(post_state.totals.unresolved_lines),
                int(post_state.totals.recovery_lines),
                bool(post_state.has_recovery_work),
                post_state.state_hash,
                bool(post_state.packing_allowed),
            )
            if post_state.has_recovery_work:
                ensure_recovery_pick_task(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    order=o,
                    kind="other",
                )
        except RecoveryWorkflowError as exc:
            raise PickingFinalizeError(
                exc.message,
                reason=exc.code,
                order_id=oid,
                step="recovery",
                http_status=exc.http_status,
                code=exc.code,
            ) from exc
        except Exception as exc:
            logger.exception(
                "[picking.finalize.error] order_id=%s cart_id=%s source_status_id=%s step=recovery",
                oid,
                cid,
                sid,
            )
            raise PickingFinalizeError(
                f"Nie udało się utworzyć zadania dogrywki dla zamówienia #{o.number or oid}: {exc}",
                reason=exc.__class__.__name__,
                order_id=oid,
                step="recovery",
                http_status=409,
                code="recovery_task_failed",
            ) from exc

        recovery_required = (
            get_open_recovery_task_for_order(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order_id=oid,
            )
            is not None
        )
        post = recovery_by_order.get(oid)
        logger.info(
            "[wms.picking.finalize.order] order_id=%s workflow_state_after=%s "
            "has_shortages=%s recovery_required=%s relocation_required=%s kind=%s "
            "packing_allowed=%s state_hash=%s",
            oid,
            (getattr(o, "fulfillment_state", None) or "").strip() or None,
            order_kinds[oid] != "all_picked",
            recovery_required,
            bool(post.has_relocation_work) if post is not None else False,
            order_kinds[oid],
            bool(post.packing_allowed) if post is not None else False,
            post.state_hash if post is not None else None,
        )
        if order_kinds.get(oid, "all_picked") != "all_picked":
            try:
                ensure_open_issue_task_for_order(db, o)
            except Exception:
                logger.exception(
                    "[picking.finalize.braki_task] order_id=%s cart_id=%s source_status_id=%s",
                    oid,
                    cid,
                    sid,
                )

    try:
        _sync_order_operational_state_after_picking_finalize(
            db,
            orders,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            cart_id=cid,
        )
        _release_cart_after_picking_finalize(db, cart)

        record_picking_cart_finalize_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            cart_id=cid,
            operator_user_id=operator_user_id,
            orders=list(orders),
            completed_at=datetime.utcnow(),
        )
        logger.info(
            "[picking.finalize.finish] cart_id=%s source_status_id=%s orders_updated=%s target_status_id=%s",
            cid,
            sid,
            len(orders),
            tgt,
        )
    except Exception as exc:
        logger.exception(
            "[picking.finalize.error] cart_id=%s source_status_id=%s step=finish",
            cid,
            sid,
        )
        raise PickingFinalizeError(
            f"Nie udało się domknąć sesji wózka: {exc}",
            reason=exc.__class__.__name__,
            step="finish",
            http_status=409,
            code="cart_finalize_failed",
        ) from exc

    shortage_pc, shortage_tot = cohort_shortage_stats_from_orders(orders)
    shortage_oids = cohort_shortage_order_ids_from_orders(db, orders)
    return {
        "ok": True,
        "orders_updated": len(orders),
        "cart_id": cid,
        "target_status_id": tgt,
        "cohort_shortage_product_count": int(shortage_pc),
        "cohort_shortage_unit_total": float(shortage_tot),
        "cohort_shortage_order_ids": shortage_oids,
    }


def finalize_wms_recovery_picking_cart(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    cart_id: int,
    operator_user_id: int | None = None,
    performed_by: AppUser | None = None,
) -> dict:
    """Domknij robocze Picki na wózku tylko dla jednego zamówienia (dogrywka recovery); status OMS z ustawień braków / pakowania."""
    from ..models.wms_packing_settings import WmsPackingSettings
    from ..models.wms_recovery_pick_task import WmsRecoveryPickTask
    from .wms_picking_shortage_settings_service import get_or_create_wms_picking_shortage_settings
    from .wms_recovery_pick_service import mark_recovery_task_done

    rt = (
        db.query(WmsRecoveryPickTask)
        .filter(
            WmsRecoveryPickTask.tenant_id == int(tenant_id),
            WmsRecoveryPickTask.warehouse_id == int(warehouse_id),
            WmsRecoveryPickTask.order_id == int(order_id),
            WmsRecoveryPickTask.status == "open",
        )
        .first()
    )
    if rt is None:
        from .wms_recovery_pick_service import prepare_recovery_picking_for_order

        prep = prepare_recovery_picking_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order_id),
            cart_id=int(cart_id),
        )
        if not prep.get("ok"):
            raise ValueError("Zamówienie dogrywki nie znalezione.")
        if prep.get("completed"):
            raise ValueError("Brak linii do dogrywki — braki zostały już rozwiązane.")
        rt = (
            db.query(WmsRecoveryPickTask)
            .filter(
                WmsRecoveryPickTask.tenant_id == int(tenant_id),
                WmsRecoveryPickTask.warehouse_id == int(warehouse_id),
                WmsRecoveryPickTask.order_id == int(order_id),
                WmsRecoveryPickTask.status == "open",
            )
            .first()
        )
        if rt is None:
            raise ValueError("Brak otwartego zadania dogrywki zbierki dla tego zamówienia.")
    cart = (
        db.query(Cart)
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not cart:
        raise ValueError("Nie znaleziono aktywnego wózka (sesja).")
    cid = int(cart.id)
    oid_list = [int(order_id)]

    recompute_order_fulfillment(db, int(order_id), commit=False, session_cart_id=cid)
    db.flush()
    demand_by_product = _demand_by_product_from_orders(db, oid_list, tenant_id=tenant_id)
    missing_by_product = _missing_qty_by_product_from_orders(db, oid_list, tenant_id=tenant_id)
    picked_map = _picked_by_product(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, order_ids=oid_list, cart_id=cid
    )
    for pid, need in demand_by_product.items():
        pq = float(picked_map.get(pid, 0.0))
        mq = float(missing_by_product.get(pid, 0.0))
        if pq + mq + 1e-8 < float(need):
            raise ValueError(
                "Nie zebrano wszystkich linii dogrywki — dokończ zbiórkę lub zgłoś brak dla pozostałych produktów."
            )

    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id.in_(oid_list))
        .all()
    )
    if not orders:
        raise ValueError("Zamówienie nie znalezione.")
    o = orders[0]
    if o.cart_id is not None and int(o.cart_id) != cid:
        num = str(o.number or o.id)
        raise ValueError(
            f"Zamówienie #{num} jest przypisane do innego wózka — użyj właściwej sesji."
        )

    pending_picks = (
        db.query(Pick)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.cart_id == cid,
            Pick.order_id == int(order_id),
            Pick.picked_at.is_(None),
        )
        .order_by(Pick.id.asc())
        .with_for_update()
        .all()
    )
    now = datetime.utcnow()
    finalized_ids: list[int] = []
    for p in pending_picks:
        finalized_rows = _decrement_inventory_for_wms_pick(db, p, performed_by=performed_by, picked_at=now)
        for row in finalized_rows:
            row.picked_at = now
            row.status = "done"
            finalized_ids.append(int(row.id))
    mark_pick_events_finalized_for_pick_ids(db, finalized_ids)

    from .recovery_workflow_service import apply_fulfillment_state_from_resolver

    post_state = apply_fulfillment_state_from_resolver(db, o, session_cart_id=cid, log=True)
    fs = FS_READY_TO_PACK if post_state.packing_allowed else FS_NEEDS_DECISION
    apply_fulfillment_state(o, fs, clear_cart=True, clear_session=True)

    mark_recovery_task_done(db, rt)
    recompute_order_fulfillment(db, int(order_id), commit=False, session_cart_id=cid)
    emit_wms_picking_finished(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order=o,
        cart_id=cid,
        operator_user_id=operator_user_id,
        new_order_ui_status_id=int(o.order_ui_status_id) if getattr(o, "order_ui_status_id", None) else None,
    )
    record_picking_cart_finalize_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        cart_id=int(cid),
        operator_user_id=operator_user_id,
        orders=[o],
        completed_at=datetime.utcnow(),
    )

    logger.info(
        "[recovery.finalize] order_id=%s cart_id=%s finalized_picks=%s "
        "fulfillment=%s relocation_skipped=successful_recovery_pick",
        int(order_id),
        cid,
        len(finalized_ids),
        fs,
    )

    return {"ok": True, "order_id": int(order_id), "cart_id": cid}
