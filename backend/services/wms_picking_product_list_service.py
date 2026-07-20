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
from .bundle_order_item_ops import (
    order_item_skip_bundle_commercial_header_for_ops,
    sqlalchemy_operational_picking_order_item_clause,
)


def _order_item_not_replaced_clause():
    """Linie z ``oms_line_status=REPLACED`` nie wchodzą w agregaty zbierania (historia po zamianie produktu)."""
    ols = OrderItem.oms_line_status
    return or_(ols.is_(None), ols != OMS_LINE_STATUS_REPLACED)
from .order_fulfillment_state import (
    MISSING as FS_MISSING,
    NEEDS_DECISION as FS_NEEDS_DECISION,
    PACKING as FS_PACKING,
    PICKING,
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
    picked_by_order_item_from_events,
    picked_by_product_from_events,
    record_pick_event_for_wms_pick,
    sum_line_events,
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
    WmsPickingBundleComponentStatus,
    WmsPickingCohortMissingLineRow,
    WmsPickingLineResolutionStatus,
    WmsPickingOrderBundleTree,
    WmsPickingOrderTypeFilter,
    WmsPickingProductAllocation,
    WmsPickingProductBundleBreakdownRow,
    WmsPickingProductDetailResponse,
    WmsPickingProductLine,
    WmsPickingProductLinesResponse,
    WmsPickingProductLocationRow,
    WmsPickingProductOrderRow,
    WmsPickingProductPutHint,
)
from .bundles.bundle_operational_ux_service import (
    build_bundle_ux_index_for_orders,
    build_picking_bundle_trees_for_orders,
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
        extra: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.order_id = order_id
        self.line_id = line_id
        self.step = step
        self.http_status = int(http_status)
        self.code = code
        self.extra = dict(extra or {})

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
        if self.extra:
            out.update(self.extra)
        return out


def _location_label_for_pick(db: Session, location_id: int) -> str:
    from ..models.location import Location

    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    if loc is None:
        return f"#{location_id}"
    return (loc.name or "").strip() or f"#{location_id}"


def _finalize_pick_trace_payload(
    db: Session,
    pick: Pick,
    *,
    cart_id: int,
    prior_consumed_pick_ids: list[int],
) -> dict:
    """
    Diagnostic snapshot before inventory consume — does not mutate state.
    ``inventory_physical_available`` reflects in-transaction stock (after prior picks
    in this finalize loop already consumed).
    """
    from .wms_basket_put.location_stock import (
        on_hand_qty_at_location,
        pending_pick_qty_at_location,
    )

    tid = int(pick.tenant_id)
    wid = int(pick.warehouse_id or 0)
    pid = int(pick.product_id)
    lid = int(pick.location_id)
    pq = float(pick.quantity or 0)
    physical = on_hand_qty_at_location(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=pid,
        location_id=lid,
        for_update=False,
    )
    pending_all = pending_pick_qty_at_location(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=pid,
        location_id=lid,
    )
    # Effective for *this* pick = physical − other unfinalized (exclude self).
    pending_others = max(0.0, float(pending_all) - pq)
    effective = max(0.0, float(physical) - float(pending_others))
    shortage = 0.0
    oiid = getattr(pick, "order_item_id", None)
    if oiid is not None:
        oi = db.query(OrderItem).filter(OrderItem.id == int(oiid)).first()
        if oi is not None:
            shortage = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
    created = getattr(pick, "created_at", None)
    return {
        "cart_id": int(cart_id),
        "pick_id": int(pick.id),
        "product_id": pid,
        "order_id": int(pick.order_id),
        "order_item_id": int(oiid) if oiid is not None else None,
        "location_id": lid,
        "location_code": _location_label_for_pick(db, lid),
        "pick_quantity": pq,
        "picked_at": pick.picked_at.isoformat() if getattr(pick, "picked_at", None) else None,
        "created_at": created.isoformat() if created is not None else None,
        "inventory_physical_available": round(float(physical), 6),
        "pending_unfinalized_pick_qty_for_same_product_location": round(float(pending_all), 6),
        "pending_other_unfinalized_excl_self": round(float(pending_others), 6),
        "effective_available": round(float(effective), 6),
        "shortage_for_order_item": round(float(shortage), 6),
        "prior_consumed_pick_ids_this_txn": list(prior_consumed_pick_ids),
    }


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

    # NULL / blank / PICKING / PARTIAL — zgodnie z touch_picking_in_progress / start_picking.
    # MISSING / READY_TO_PACK / PACKING / NEEDS_DECISION są poza kolejką zbierania.
    return (
        Order.picking_finished_at.is_(None),
        Order.deleted_at.is_(None),
        or_(
            Order.fulfillment_state.is_(None),
            func.trim(Order.fulfillment_state) == "",
            Order.fulfillment_state.in_(_PICKING_QUEUE_OPEN_FULFILLMENT),
        ),
        *wms_queue_fulfillment_mode_clauses(
            db=db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            features=features,
            queue_name="picking",
        ),
        *wms_queue_consolidation_phase_clauses(for_picking=True),
        *wms_queue_consolidation_plan_clauses(),
    )


def count_assignable_orders_for_picking_statuses(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_ids: list[int],
) -> dict[int, int]:
    """
    Licznik kafelka statusu (ikona wózka) — **PRELIMINARY** SSOT z kohortą
    ``_query_order_ids_for_status`` + ``cart_id IS NULL``.

    Świadomie BEZ ``gate_orders_before_capacity`` (stock/location) — pełny gate
    jest tylko przy skanie wózka. Dashboard może więc być > 0 przy final assignment = 0.
    """
    ids = [int(x) for x in source_status_ids if int(x) > 0]
    if not ids:
        return {}
    rows = (
        db.query(Order.order_ui_status_id, func.count(Order.id))
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.order_ui_status_id.in_(ids),
            Order.cart_id.is_(None),
            *_picking_queue_eligibility_clauses(
                db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
            ),
        )
        .group_by(Order.order_ui_status_id)
        .all()
    )
    return {int(sid): int(n) for sid, n in rows}


# Komunikat operatora gdy preliminary > 0, ale gate/start nie przypisał nic do wózka.
# Bez kodów REJECTION_REASON — szczegóły w PICK_ASSIGN_TRACE.
OPERATOR_MSG_NO_ASSIGNABLE_AFTER_VALIDATION = (
    "Brak zamówień możliwych do przypisania. "
    "Zamówienia oczekujące nie przeszły walidacji dostępności lub lokalizacji."
)


def operator_message_when_cart_unassigned(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
) -> str | None:
    """Gdy wózek pusty po starcie: jeśli nadal są oczekujące w statusie → walidacja; inaczej None."""
    n = count_assignable_orders_for_picking_statuses(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_ids=[int(source_status_id)],
    ).get(int(source_status_id), 0)
    if n > 0:
        return OPERATOR_MSG_NO_ASSIGNABLE_AFTER_VALIDATION
    return None


def bootstrap_start_picking_if_needed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    source_status_id: int,
    order_type: OrderTypeFilter,
    operator_user_id: int,
    fixed_order_ids: list[int] | None = None,
) -> tuple[WmsOperationSession | None, str | None]:
    """
    Po skanie wózka / wejściu na listę produktów:
    AVAILABLE|ASSIGNED → start_picking (jedyny writer order.cart_id).
    PICKING → no-op (zwraca istniejącą sesję).

    Gdy brak assignable orders: NIE claim → AVAILABLE (pusty wózek nie zostaje PRZYPISANY).

    Returns:
        (session | None, operator_message | None) — message bez kodów technicznych.
    """
    from .cart_picking_lifecycle_service import (
        find_open_picking_session,
        get_cart_status,
        release_cart,
        start_picking,
    )
    from ..models.enums import CartStatus
    from .wms_picking_assign_trace import log_pick_assign_trace

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
    if cart is None:
        raise ValueError("Nie znaleziono wózka.")

    st = get_cart_status(cart)
    if st == CartStatus.PICKING:
        return find_open_picking_session(db, cart=cart), None
    if st not in (CartStatus.AVAILABLE, CartStatus.ASSIGNED):
        return None, None

    cart_code = getattr(cart, "code", None) or getattr(cart, "name", None)

    def _heal_empty_assigned(commit_result: str) -> None:
        """Pusty ASSIGNED bez pracy → AVAILABLE (SSOT badge, nie kosmetyka FE)."""
        log_pick_assign_trace(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=str(order_type),
            cart_id=int(cart.id),
            cart_code=str(cart_code) if cart_code else None,
            selected_ids=[],
            assigned_ids=[],
            commit_result=commit_result,
            run_validation=True,
        )
        if get_cart_status(cart) == CartStatus.ASSIGNED:
            release_cart(db, cart=cart, reason="no_assignable_orders_on_scan")

    if fixed_order_ids is not None:
        order_ids = [int(x) for x in fixed_order_ids if int(x) > 0]
    else:
        order_ids = _query_order_ids_for_status(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=order_type,
        )
    orders: list[Order] = []
    if order_ids:
        orders = (
            db.query(Order)
            .filter(
                Order.id.in_(order_ids),
                Order.cart_id.is_(None),
                Order.deleted_at.is_(None),
            )
            .order_by(Order.id.asc())
            .all()
        )

    if not orders:
        _heal_empty_assigned("no_free_candidates")
        # Brak free candidates — nie twierdź o walidacji; opcjonalnie jeśli nadal preliminary.
        return None, operator_message_when_cart_unassigned(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
        )

    from .wms_order_validation.gate import gate_orders_before_capacity

    had_preliminary_free = len(orders)
    orders = gate_orders_before_capacity(
        db,
        orders=orders,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        operator_user_id=None,  # automatyczny gate — Activity Log: System
    )
    if not orders:
        _heal_empty_assigned("gate_rejected_all")
        # Gate odrzucił kandydatów — komunikat niezależnie od tego, czy FAIL status
        # przeniósł zamówienia poza kohortę (count po gate mógłby być 0).
        return None, (
            OPERATOR_MSG_NO_ASSIGNABLE_AFTER_VALIDATION if had_preliminary_free > 0 else None
        )

    try:
        sess = start_picking(
            db,
            cart=cart,
            orders=orders,
            operator_user_id=int(operator_user_id),
            source_status_id=int(source_status_id),
            on_capacity="truncate",
        )
    except Exception as exc:
        log_pick_assign_trace(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=str(order_type),
            cart_id=int(cart.id),
            cart_code=str(cart_code) if cart_code else None,
            selected_ids=[],
            assigned_ids=[],
            commit_result=f"start_picking_error:{type(exc).__name__}",
            run_validation=True,
        )
        raise

    assigned_ids = [
        int(o.id)
        for o in db.query(Order)
        .filter(Order.cart_id == int(cart.id), Order.deleted_at.is_(None))
        .all()
    ]
    log_pick_assign_trace(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
        order_type=str(order_type),
        cart_id=int(cart.id),
        cart_code=str(cart_code) if cart_code else None,
        selected_ids=assigned_ids,
        assigned_ids=assigned_ids,
        commit_result="ok" if assigned_ids else "start_picking_zero_assigned",
        run_validation=True,
    )
    return sess, None


def _query_order_ids_for_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: OrderTypeFilter,
) -> list[int]:
    """Kohorta kolejki statusu (hub / kandydaci do start_picking). Nie SSOT zajętości wózka."""
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
        .filter(
            sqlalchemy_operational_picking_order_item_clause(OrderItem),
            _order_item_not_replaced_clause(),
        )
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


def resolve_wms_picking_order_ids(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: OrderTypeFilter,
    cart_id: int | None = None,
    picking_session_id: int | None = None,
    fixed_order_ids: list[int] | None = None,
    recovery_mode: bool = False,
) -> list[int]:
    """
    Jedyna ścieżka rozstrzygania zbioru zamówień dla widoków/akcji zbierania.

    - ``fixed_order_ids`` (recovery / scope) — override jawny.
    - ``picking_session_id`` — **SSOT cartless** (order.picking_session_id).
    - ``cart_id`` ustawione — **SSOT** ``list_orders_on_cart``.
    - bez wózka/sesji — kohorta statusu (hub / podgląd kolejki).
    """
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
                order_type=order_type,
            )
        return order_ids

    if picking_session_id is not None:
        from .wms_cartless_picking.scope import get_cartless_session_or_raise, list_order_ids_on_picking_session

        # Walidacja tenant/warehouse (ownership opcjonalna — odczyt listy produktów).
        get_cartless_session_or_raise(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_id=int(picking_session_id),
            operator_user_id=None,
            require_open=False,
            allow_system=True,
        )
        return list_order_ids_on_picking_session(
            db,
            session_id=int(picking_session_id),
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
        )

    if cart_id is not None:
        cart = (
            db.query(Cart)
            .filter(
                Cart.id == int(cart_id),
                Cart.tenant_id == int(tenant_id),
                Cart.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if cart is None:
            return []
        from .cart_stats_service import list_orders_on_cart

        return [int(o.id) for o in list_orders_on_cart(db, cart)]

    return _query_order_ids_for_status(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=order_type,
    )


def _order_ids_for_cart_finalize(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: OrderTypeFilter,
    cart_id: int,
) -> list[int]:
    """Finalize: wyłącznie zamówienia na wózku (SSOT). Parametry status/type zachowane dla kompatybilności API."""
    _ = (source_status_id, order_type)
    cart = (
        db.query(Cart)
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        return []
    from .cart_stats_service import list_orders_on_cart

    return [int(o.id) for o in list_orders_on_cart(db, cart)]


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


def _bundle_breakdown_for_product(
    db: Session,
    *,
    order_ids: list[int],
    product_id: int,
    ux_index: dict,
) -> list[WmsPickingProductBundleBreakdownRow]:
    if not order_ids:
        return []
    rows: list[WmsPickingProductBundleBreakdownRow] = []
    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id.in_([int(x) for x in order_ids]))
        .order_by(Order.id.asc())
        .all()
    )
    pid = int(product_id)
    for order in orders:
        for oi in order.items or []:
            if int(oi.product_id) != pid:
                continue
            if order_item_is_replaced_line(oi):
                continue
            if order_item_skip_bundle_commercial_header_for_ops(oi):
                continue
            meta = ux_index.get(int(oi.id))
            rows.append(
                WmsPickingProductBundleBreakdownRow(
                    order_id=int(order.id),
                    order_number=str(order.number or f"#{order.id}"),
                    bundle_id=int(meta.bundle_id) if meta and meta.bundle_id is not None else None,
                    bundle_name=str(meta.bundle_name) if meta and meta.bundle_name else None,
                    bundle_mode=str(meta.bundle_mode) if meta and meta.bundle_mode else None,
                    quantity=float(oi.quantity or 0),
                )
            )
    return rows


def _apply_bundle_ux_to_order_row(
    row: WmsPickingProductOrderRow,
    *,
    ux_index: dict,
    order_item_id: int,
) -> WmsPickingProductOrderRow:
    meta = ux_index.get(int(order_item_id))
    if meta is None:
        return row
    return row.model_copy(
        update={
            "bundle_id": meta.bundle_id,
            "bundle_name": meta.bundle_name,
            "bundle_mode": meta.bundle_mode,
            "bundle_component_index": meta.bundle_component_index,
            "bundle_component_count": meta.bundle_component_count,
            "is_bundle_component": bool(meta.is_bundle_component),
            "parent_bundle_order_line_id": meta.parent_bundle_order_line_id,
        }
    )


def _picking_product_line_still_active(line: WmsPickingProductLine) -> bool:
    """Linia z otwartą pracą: coś do pobrania lub operacyjny brak (nie = widoczność w sesji)."""
    return float(line.remaining_to_pick or 0) > 1e-9 or float(line.missing_quantity or 0) > 1e-9


def _picking_line_resolution_status(
    *,
    remaining_to_pick: float,
    picked_quantity: float,
    missing_quantity: float,
) -> WmsPickingLineResolutionStatus:
    """
    Kanoniczny stan UI dla linii SKU.

    ``completed=True`` (remaining≈0) obejmuje zarówno pełne zebranie, jak i pełny brak —
    ``resolution_status`` rozróżnia te przypadki (SHORTAGE ≠ COMPLETED_PICK).

    Przy remaining>0: PARTIAL gdy jest jakikolwiek postęp (picked lub shortage), inaczej ACTIVE.
    """
    rem = float(remaining_to_pick or 0)
    miss = float(missing_quantity or 0)
    picked = float(picked_quantity or 0)
    if rem > 1e-9:
        if picked > 1e-9 or miss > 1e-9:
            return "PARTIAL"
        return "ACTIVE"
    if miss > 1e-9:
        return "SHORTAGE"
    return "COMPLETED_PICK"


def _picking_product_line_completed(line: WmsPickingProductLine) -> bool:
    """Demand sesji rozliczony (remaining≈0) — SKU nadal należy do snapshotu sesji z wózkiem."""
    return float(line.remaining_to_pick or 0) <= 1e-9


def _picking_product_line_session_sort_key(line: WmsPickingProductLine) -> tuple:
    """ACTIVE → PARTIAL → COMPLETED_PICK → SHORTAGE; potem trasa / product_id."""
    status = getattr(line, "resolution_status", None) or _picking_line_resolution_status(
        remaining_to_pick=float(line.remaining_to_pick or 0),
        picked_quantity=float(line.picked_quantity or 0),
        missing_quantity=float(line.missing_quantity or 0),
    )
    tier = {
        "ACTIVE": 0,
        "PARTIAL": 1,
        "COMPLETED_PICK": 2,
        "SHORTAGE": 3,
    }.get(str(status), 0)
    return (tier, line.route_sort_key or "\uffff", int(line.product_id))


def _picked_location_code_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: Sequence[int],
    cart_id: int,
    product_ids: Sequence[int],
) -> dict[int, str]:
    """Ostatnia lokalizacja Pick per SKU w sesji wózka — historyczny hint dla completed bez routingu."""
    if not product_ids or not order_ids:
        return {}
    from ..models.location import Location

    rows = (
        db.query(Pick.product_id, Location.name, Pick.picked_at, Pick.id)
        .join(Location, Location.id == Pick.location_id)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.cart_id == int(cart_id),
            Pick.order_id.in_(list(order_ids)),
            Pick.product_id.in_([int(x) for x in product_ids]),
        )
        .all()
    )
    best: dict[int, tuple[tuple[datetime, int], str]] = {}
    for pid, name, picked_at, pick_id in rows:
        code = (name or "").strip()
        if not code:
            continue
        key = (picked_at if isinstance(picked_at, datetime) else datetime(1970, 1, 1), int(pick_id))
        prev = best.get(int(pid))
        if prev is None or key > prev[0]:
            best[int(pid)] = (key, code)
    return {pid: code for pid, (_k, code) in best.items()}


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
            if order_item_is_replaced_line(oi) or order_item_skip_bundle_commercial_header_for_ops(oi):
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
    """Deprecated — finalize NIE zwalnia wózka (SSOT: zwolnienie po ostatnim pakowaniu)."""
    from .cart_picking_lifecycle_service import complete_picking_keep_cart

    _ = db
    _ = cart
    # retained name for call sites during transition; no-op body (see finalize_wms_picking_cart)
    return


def _missing_qty_by_product_from_orders(
    db: Session,
    order_ids: Sequence[int],
    *,
    tenant_id: int,
) -> dict[int, float]:
    """Suma capped ``OrderItem.wms_picking_line_missing_qty`` po ``product_id`` (legacy overcount-safe)."""
    if not order_ids:
        return {}
    rows = (
        db.query(
            OrderItem.product_id,
            OrderItem.quantity,
            OrderItem.wms_picking_line_missing_qty,
        )
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.id.in_(list(order_ids)),
            Order.tenant_id == int(tenant_id),
            _order_item_not_replaced_clause(),
            sqlalchemy_operational_picking_order_item_clause(OrderItem),
        )
        .all()
    )
    out: dict[int, float] = {}
    for pid, qty, miss in rows:
        if pid is None:
            continue
        ordered = float(qty or 0)
        raw = float(miss or 0)
        # Invariant: missing ≤ required (picked accounted later in line builder).
        q = min(max(0.0, raw), max(0.0, ordered)) if ordered > 1e-12 else 0.0
        if q > 1e-12:
            out[int(pid)] = round(float(out.get(int(pid), 0.0)) + q, 6)
    return out


def _allocations_by_product_from_orders(
    db: Session,
    order_ids: Sequence[int],
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int | None,
    picking_session_id: int | None = None,
) -> dict[int, list[WmsPickingProductAllocation]]:
    """
    Breakdown per ``order_item_id`` (nie FIFO): required / picked / shortage / unresolved.

    ``shortage_qty`` = ``OrderItem.wms_picking_line_missing_qty`` (SSOT deklaracji braku).
    """
    if not order_ids:
        return {}
    orders = (
        db.query(Order)
        .options(joinedload(Order.items), joinedload(Order.basket))
        .filter(Order.id.in_(list(order_ids)), Order.tenant_id == int(tenant_id))
        .order_by(Order.id.asc())
        .all()
    )
    picked_by_oi: dict[int, float] = {}
    if picking_session_id is not None and cart_id is None:
        from .wms_cartless_picking.scope import sum_picks_for_order_item_cartless

        for o in orders:
            for oi in o.items or []:
                picked_by_oi[int(oi.id)] = float(
                    sum_picks_for_order_item_cartless(db, order_item_id=int(oi.id))
                )
    else:
        picked_by_oi = picked_by_order_item_from_events(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_ids=list(order_ids),
            cart_id=int(cart_id) if cart_id is not None else None,
        )

    out: dict[int, list[WmsPickingProductAllocation]] = defaultdict(list)
    for o in orders:
        basket = o.basket if o.basket_id is not None else None
        basket_label = _basket_slot_label(basket)
        for oi in sorted(o.items or [], key=lambda x: int(x.id)):
            if order_item_is_replaced_line(oi):
                continue
            if order_item_skip_bundle_commercial_header_for_ops(oi):
                continue
            pid = int(oi.product_id)
            qty = float(oi.quantity or 0)
            if qty <= 1e-12:
                continue
            miss_raw = float(oi.wms_picking_line_missing_qty or 0)
            pq_raw = float(picked_by_oi.get(int(oi.id), 0.0) or 0.0)
            miss = min(max(0.0, miss_raw), qty)
            picked = min(max(0.0, pq_raw), max(0.0, qty - miss))
            unresolved = max(0.0, qty - picked - miss)
            out[pid].append(
                WmsPickingProductAllocation(
                    order_id=int(o.id),
                    order_number=str(o.number or f"#{o.id}"),
                    order_item_id=int(oi.id),
                    basket_label=basket_label,
                    required_qty=round(qty, 6),
                    picked_qty=round(picked, 6),
                    shortage_qty=round(miss, 6),
                    unresolved_qty=round(unresolved, 6),
                )
            )
    return dict(out)

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
            sqlalchemy_operational_picking_order_item_clause(OrderItem),
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
            if order_item_is_replaced_line(oi) or order_item_skip_bundle_commercial_header_for_ops(oi):
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
        if order_item_skip_bundle_commercial_header_for_ops(oi):
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
    picking_session_id: int | None = None,
    fixed_order_ids: list[int] | None = None,
    recovery_mode: bool = False,
) -> WmsPickingProductLinesResponse:
    """
    Lista produktów do zbiórki.
    Z ``picking_session_id`` — cartless SSOT.
    Z ``cart_id`` — wyłącznie zamówienia z ``list_orders_on_cart`` (SSOT).
    Bez wózka/sesji — kohorta statusu (hub).
    ``fixed_order_ids`` — dogrywka recovery / jawny scope.
    """
    ot = _order_type_filter(order_type)
    allow_continue_other_lines = True
    if fixed_order_ids is None:
        ss0 = get_or_create_wms_picking_shortage_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
        allow_continue_other_lines = bool(ss0.allow_continue_other_lines_after_shortage)
    order_ids = resolve_wms_picking_order_ids(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=ot,
        cart_id=cart_id,
        picking_session_id=picking_session_id,
        fixed_order_ids=fixed_order_ids,
        recovery_mode=recovery_mode,
    )
    # Race: zamówienia na wózku bez picków — rewalidacja (nie niszczy sesji z częściowym pickiem).
    if cart_id is not None and not recovery_mode and order_ids:
        try:
            from .wms_order_validation.gate import defensive_revalidate_cart_orders_without_picks

            cart_orders = (
                db.query(Order)
                .filter(Order.id.in_(list(order_ids)), Order.tenant_id == int(tenant_id))
                .all()
            )
            detached = defensive_revalidate_cart_orders_without_picks(
                db,
                cart_id=int(cart_id),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                orders=cart_orders,
                operator_user_id=None,
            )
            if detached:
                order_ids = resolve_wms_picking_order_ids(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    source_status_id=source_status_id,
                    order_type=ot,
                    cart_id=cart_id,
                    fixed_order_ids=fixed_order_ids,
                    recovery_mode=recovery_mode,
                )
        except Exception:
            logger.exception(
                "[wms.validation] defensive cart revalidate failed cart_id=%s", cart_id
            )
    if not order_ids:
        empty_msg = (
            f"Brak zamówień przypisanych do wózka (filtr: {ot})."
            if cart_id is not None and fixed_order_ids is None
            else f"Brak zamówień w statusie (filtr: {ot})."
        )
        if cart_id is not None and fixed_order_ids is None:
            better = operator_message_when_cart_unassigned(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_status_id=int(source_status_id),
            )
            if better:
                empty_msg = better
        return WmsPickingProductLinesResponse(
            products=[],
            cohort_order_count=0,
            cohort_missing_lines=[],
            pick_list=[],
            shortfalls=[],
            warnings=[empty_msg],
            allow_continue_other_lines_after_shortage=allow_continue_other_lines,
        )

    if recovery_mode and fixed_order_ids is not None:
        demand_by_product = _recovery_demand_by_product_from_orders(db, order_ids, tenant_id=tenant_id)
    else:
        demand_by_product = _demand_by_product_from_orders(db, order_ids, tenant_id=tenant_id)
    missing_by_product = _missing_qty_by_product_from_orders(db, order_ids, tenant_id=tenant_id)
    allocations_by_product = _allocations_by_product_from_orders(
        db,
        order_ids,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        cart_id=cart_id,
        picking_session_id=picking_session_id,
    )

    routing = PickingRoutingService(db).build_location_pick_list(order_ids, tenant_id=tenant_id)
    pick_list = list(routing.pick_list)

    if picking_session_id is not None:
        from .wms_cartless_picking.scope import picked_by_product_cartless

        picked_map = picked_by_product_cartless(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            order_ids=order_ids,
        )
    else:
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

    from .order_consolidation.consolidation_context import consolidation_shelf_labels_by_product

    consolidation_shelves = consolidation_shelf_labels_by_product(
        db,
        order_ids=order_ids,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
    )

    ux_index = build_bundle_ux_index_for_orders(db, order_ids)

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
        # Legacy overcount: missing nie może przekroczyć required − picked.
        picked_raw = round(float(pq), 6)
        picked_eff = min(picked_raw, float(tq))
        miss_sum = min(round(float(missing_by_product.get(pid, 0.0)), 6), max(0.0, float(tq) - picked_eff))
        rem_pick = max(0.0, float(tq) - picked_eff - miss_sum)
        line_completed = rem_pick <= 1e-9
        resolution = _picking_line_resolution_status(
            remaining_to_pick=rem_pick,
            picked_quantity=picked_eff,
            missing_quantity=miss_sum,
        )
        scanner_active = (
            bool(scan_by_pid.get(pid))
            if cart_id is not None
            else (rem_pick > 1e-9)  # hub lub cartless session
        )
        shelf_label = consolidation_shelves.get(int(pid))
        breakdown = _bundle_breakdown_for_product(
            db, order_ids=order_ids, product_id=int(pid), ux_index=ux_index
        )
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
                completed=line_completed,
                resolution_status=resolution,
                primary_location_code=loc,
                primary_location_stock=primary_stock,
                extra_locations_count=extra_locs,
                route_sort_key=loc if loc else "\uffff",
                scanner_active=scanner_active,
                consolidation_pick=shelf_label is not None,
                consolidation_shelf_label=shelf_label,
                bundle_breakdown=breakdown,
                allocations=list(allocations_by_product.get(int(pid), [])),
            )
        )

    cohort_missing = _build_cohort_missing_line_rows(db, order_ids, tenant_id=tenant_id)

    all_lines_for_stats = list(lines)

    # Sesja z wózkiem LUB cartless: pełny snapshot demandu (w tym completed). Hub: tylko aktywna kolejka.
    if cart_id is None and picking_session_id is None:
        lines = [ln for ln in lines if _picking_product_line_still_active(ln)]
    elif cart_id is not None:
        need_loc_pids = [
            int(ln.product_id)
            for ln in lines
            if _picking_product_line_completed(ln)
            and float(ln.picked_quantity or 0) > 1e-9
            and not (ln.primary_location_code or "").strip()
        ]
        if need_loc_pids:
            picked_locs = _picked_location_code_by_product(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                order_ids=order_ids,
                cart_id=int(cart_id),
                product_ids=need_loc_pids,
            )
            if picked_locs:
                patched: list[WmsPickingProductLine] = []
                for ln in lines:
                    code = picked_locs.get(int(ln.product_id))
                    if code and not (ln.primary_location_code or "").strip():
                        patched.append(
                            ln.model_copy(
                                update={
                                    "primary_location_code": code,
                                    "route_sort_key": code,
                                }
                            )
                        )
                    else:
                        patched.append(ln)
                lines = patched
                all_lines_for_stats = list(lines)

    lines = sorted(lines, key=_picking_product_line_session_sort_key)

    if recovery_mode:
        logger.info(
            "[wms.recovery.lines.fetch] order_id=%s cart_id=%s recovery_mode=recovery "
            "product_count=%s active_count=%s cohort_order_count=%s",
            order_ids[0] if order_ids else None,
            cart_id,
            len(lines),
            sum(1 for ln in lines if _picking_product_line_still_active(ln)),
            len(order_ids),
        )

    recovery_completed = bool(
        recovery_mode and not any(_picking_product_line_still_active(ln) for ln in all_lines_for_stats)
    )
    recovery_oid = int(order_ids[0]) if recovery_mode and order_ids else None

    from .cart_picking_lifecycle_service import compute_session_stats_from_product_lines
    from ..schemas.wms_picking_products import WmsPickingSessionStats

    stats = compute_session_stats_from_product_lines(all_lines_for_stats)

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
        session_stats=WmsPickingSessionStats(**stats),
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
    picking_session_id: int | None = None,
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
        picking_session_id=picking_session_id,
        fixed_order_ids=fixed_order_ids,
        recovery_mode=recovery_mode,
    )
    row = next((p for p in lines_resp.products if int(p.product_id) == int(product_id)), None)
    if row is None:
        return None

    order_ids = resolve_wms_picking_order_ids(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=_order_type_filter(order_type),
        cart_id=cart_id,
        picking_session_id=picking_session_id,
        fixed_order_ids=fixed_order_ids,
        recovery_mode=recovery_mode,
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
    ux_index = build_bundle_ux_index_for_orders(db, order_ids)
    from .order_consolidation.consolidation_context import (
        consolidation_rack_picking_active,
        local_plan_item_for_product as _local_plan_item_for_product,
    )
    from .order_consolidation.staging_service import _shelf_info_for_order as _shelf_info_for_order_row

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
                if order_item_skip_bundle_commercial_header_for_ops(oi):
                    continue
                pq_f = sum_pick_events_for_line_cart(db, int(oi.id), cid)
                qty = float(oi.quantity)
                miss_ln = float(oi.wms_picking_line_missing_qty or 0)
                to_pick = max(0.0, qty - pq_f - miss_ln)
                picked_row = min(float(pq_f), max(0.0, qty - miss_ln))
                decl_short = round(max(0.0, to_pick), 6)
                basket = o.basket if o.basket_id is not None else None
                sn, sl, _ = order_shipping_display(o)
                order_shelf = None
                order_cons_pick = False
                if consolidation_rack_picking_active(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    source_status_id=int(source_status_id),
                    order_id=int(o.id),
                ):
                    local_it = _local_plan_item_for_product(db, order_id=int(o.id), product_id=int(product_id))
                    if local_it is not None and str(local_it.status).upper() not in ("CANCELLED", "STAGED"):
                        sh = _shelf_info_for_order_row(db, int(o.id))
                        order_shelf = sh["shelf_label"] if sh else None
                        order_cons_pick = order_shelf is not None
                order_rows.append(
                    _apply_bundle_ux_to_order_row(
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
                            basket_slot=_basket_slot_label(basket) if not order_cons_pick else None,
                            shortage_declarable_qty=round(decl_short, 6),
                            consolidation_pick=order_cons_pick,
                            consolidation_shelf_label=order_shelf,
                        ),
                        ux_index=ux_index,
                        order_item_id=int(oi.id),
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
        skip_basket = consolidation_rack_picking_active(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_id=int(active_fifo_order_id),
        )
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
        if cart_m is not None and not skip_basket:
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
                            basket_slot=_basket_slot_label(bask) if not orow.consolidation_pick else None,
                            shortage_declarable_qty=orow.shortage_declarable_qty,
                            consolidation_pick=orow.consolidation_pick,
                            consolidation_shelf_label=orow.consolidation_shelf_label,
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

    consolidation_active = False
    consolidation_shelf_label: Optional[str] = None
    consolidation_plan_id: Optional[int] = None
    consolidation_plan_item_id: Optional[int] = None
    pending_shelf_deposit = False
    if active_fifo_order_id is not None:
        from .order_consolidation.consolidation_context import (
            active_consolidation_plan,
            consolidation_rack_picking_active,
            local_plan_item_for_product,
        )
        from .order_consolidation.staging_service import _shelf_info_for_order

        if consolidation_rack_picking_active(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_id=int(active_fifo_order_id),
        ):
            consolidation_active = True
            put_to_basket_label = None
            put_to_basket_color_index = 0
            for lid in hint_merge:
                hint_merge[lid] = {}
            shelf = _shelf_info_for_order(db, int(active_fifo_order_id))
            consolidation_shelf_label = shelf["shelf_label"] if shelf else None
            plan = active_consolidation_plan(db, int(active_fifo_order_id))
            consolidation_plan_id = int(plan.id) if plan else None
            local_item = local_plan_item_for_product(
                db, order_id=int(active_fifo_order_id), product_id=int(product_id)
            )
            if local_item is not None:
                consolidation_plan_item_id = int(local_item.id)
                pending_shelf_deposit = str(local_item.status).upper() == "PICKED"
            if consolidation_shelf_label:
                locations = [
                    WmsPickingProductLocationRow(
                        location_id=lid,
                        location_code=loc_code.get(lid, ""),
                        quantity=round(loc_qty[lid], 6),
                        stock_quantity=float(stock_by_lid.get(lid, 0.0)),
                        put_hints=[
                            WmsPickingProductPutHint(
                                label=str(consolidation_shelf_label),
                                quantity=round(loc_qty[lid], 6),
                            )
                        ],
                    )
                    for lid in lids_sorted
                ]

    orders_for_trees = orders_q.all() if cid is not None else []
    raw_trees = build_picking_bundle_trees_for_orders(
        db,
        orders=orders_for_trees,
        product_id=int(product_id),
        cart_id=cid,
        ux_index=ux_index,
        sum_pick_fn=sum_pick_events_for_line_cart,
    )
    order_bundle_trees = [
        WmsPickingOrderBundleTree(
            order_id=int(t["order_id"]),
            order_number=str(t["order_number"]),
            bundle_id=int(t["bundle_id"]),
            bundle_name=str(t["bundle_name"]),
            bundle_mode=str(t["bundle_mode"]),
            parent_order_line_id=int(t["parent_order_line_id"]),
            components_total=int(t["components_total"]),
            components_done=int(t["components_done"]),
            components=[
                WmsPickingBundleComponentStatus(
                    order_item_id=int(c.order_item_id),
                    product_id=int(c.product_id),
                    product_name=str(c.product_name),
                    quantity=float(c.quantity),
                    picked_quantity=float(c.picked_quantity),
                    quantity_to_pick=float(c.quantity_to_pick),
                    bundle_component_index=int(c.bundle_component_index),
                    is_current_product=bool(c.is_current_product),
                    pick_done=bool(c.pick_done),
                )
                for c in t["components"]
            ],
        )
        for t in raw_trees
    ]

    detail = WmsPickingProductDetailResponse(
        product_id=int(product_id),
        name=pr.name if pr and pr.name else row.name,
        ean=pr.ean if pr else row.ean,
        image_url=pr.image_url if pr else row.image_url,
        total_quantity=row.total_quantity,
        picked_quantity=row.picked_quantity,
        missing_quantity=float(getattr(row, "missing_quantity", 0) or 0),
        remaining_to_pick=row.remaining_to_pick,
        resolution_status=getattr(row, "resolution_status", None)
        or _picking_line_resolution_status(
            remaining_to_pick=float(row.remaining_to_pick or 0),
            picked_quantity=float(row.picked_quantity or 0),
            missing_quantity=float(getattr(row, "missing_quantity", 0) or 0),
        ),
        locations=locations,
        orders=order_rows,
        active_fifo_order_id=active_fifo_order_id,
        put_to_basket_label=put_to_basket_label,
        put_to_basket_color_index=put_to_basket_color_index,
        allow_continue_other_lines_after_shortage=lines_resp.allow_continue_other_lines_after_shortage,
        shortage_declarable_total=decl_total,
        consolidation_active=consolidation_active,
        consolidation_shelf_label=consolidation_shelf_label,
        consolidation_plan_id=consolidation_plan_id,
        consolidation_plan_item_id=consolidation_plan_item_id,
        pending_shelf_deposit=pending_shelf_deposit,
        order_bundle_trees=order_bundle_trees,
        basket_put_pending=None,
        basket_put_active_series=None,
        requires_basket_put_confirm=False,
    )

    # MULTI baskets: expose pending put / series from session (SSOT).
    if cart_id is not None and int(cart_id) > 0:
        try:
            from .wms_basket_put import get_basket_put_ui_state

            cart_for_put = (
                db.query(Cart)
                .filter(Cart.id == int(cart_id), Cart.tenant_id == int(tenant_id))
                .first()
            )
            if cart_for_put is not None:
                ui_put = get_basket_put_ui_state(
                    db,
                    cart=cart_for_put,
                    product_id=int(product_id),
                    order_ids=list(order_ids or []),
                    sanitize=True,
                )
                detail.requires_basket_put_confirm = bool(ui_put.get("requires_basket_put"))
                # QUANTITY MODE: pending/series are legacy unit-scan state — clear so they
                # cannot compete with SELECT_BASKET → ENTER_QUANTITY on detail.
                if detail.requires_basket_put_confirm:
                    from .wms_basket_put import clear_basket_put_state

                    if ui_put.get("pending") or ui_put.get("active_series"):
                        clear_basket_put_state(
                            db, cart=cart_for_put, reason="quantity_mode_detail_ssot"
                        )
                    detail.basket_put_pending = None
                    detail.basket_put_active_series = None
                    detail.put_to_basket_label = None
                else:
                    detail.basket_put_pending = ui_put.get("pending")
                    detail.basket_put_active_series = ui_put.get("active_series")
                    series = detail.basket_put_active_series
                    if isinstance(series, dict) and series.get("basket_label"):
                        detail.put_to_basket_label = str(series["basket_label"])
                    else:
                        detail.put_to_basket_label = None
                # Pending unbound → never show a single destination label.
                if detail.basket_put_pending:
                    detail.put_to_basket_label = None
        except Exception:
            logger.exception("basket_put ui state failed cart_id=%s", cart_id)
    return detail


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
    scope_order_id: int | None = None,
    operator_user_id: int | None = None,
) -> tuple[int, int]:
    """
    Zapis roboczy: rekord Pick z ``cart_id`` (sesja), ``picked_at`` = NULL do czasu finalizacji wózka.
    Wtedy dopiero spada stan Inventory i ustawiane jest ``picked_at``.
    Zwraca (order_id, order_item_id).

    ``fixed_order_id`` — dogrywka recovery: tylko jedno zamówienie (bez kohorty statusu).
    ``scope_order_id`` — zawężenie do jednego zamówienia bez bramki recovery
    (np. alokacja MULTI po skanie koszyka).
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
    elif scope_order_id is not None:
        oid = int(scope_order_id)
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
        order_ids = [oid]
    else:
        ot = _order_type_filter(order_type)
        order_ids = resolve_wms_picking_order_ids(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=ot,
            cart_id=int(cart_id),
        )
        if not order_ids:
            raise ValueError("Brak zamówień przypisanych do tego wózka.")

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

    from .cart_picking_lifecycle_service import (
        InvalidCartStateError,
        SessionNotFoundError,
        assert_cart_ready_for_quick_pick,
        get_cart_status,
    )

    st = get_cart_status(cart_row)
    if st != CartStatus.PICKING:
        raise InvalidCartStateError(
            f"Wózek musi być w stanie PICKING (jest: {st.value}). "
            "Najpierw zeskanuj wózek (startPicking).",
            status=st.value,
        )

    try:
        assert_cart_ready_for_quick_pick(db, cart_row)
    except (SessionNotFoundError, InvalidCartStateError):
        raise

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
                if order_item_skip_bundle_commercial_header_for_ops(oi):
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
                if o.cart_id is None or int(o.cart_id) != cid:
                    num = str(o.number or o.id)
                    raise ValueError(
                        f"Zamówienie #{num} nie jest na tym wózku. "
                        "Przypisanie następuje wyłącznie przy skanie wózka (startPicking)."
                    )
                ps_before = getattr(o, "picking_started_at", None)
                touch_picking_in_progress(o)
                if getattr(o, "picking_session_id", None) is None:
                    raise SessionNotFoundError(
                        "Brak picking_session_id na zamówieniu — wymagany startPicking (skan wózka)."
                    )
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
                try:
                    from .cart_picking_lifecycle_service import notify_first_product_confirmed

                    notify_first_product_confirmed(
                        db,
                        cart=cart_row,
                        operator_user_id=operator_user_id,
                        order_id=int(o.id),
                        product_id=int(product_id),
                    )
                except Exception:
                    logger.exception(
                        "notify_first_product_confirmed failed cart_id=%s",
                        cid,
                    )
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
        from .order_consolidation.consolidation_context import (
            consolidation_rack_picking_active,
            mark_local_plan_item_picked,
        )

        if consolidation_rack_picking_active(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_id=int(oid_touch),
        ):
            mark_local_plan_item_picked(db, order_id=int(oid_touch), product_id=int(product_id))

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

    ``remaining_qty`` = ordered − picked (sesja) − już zapisany brak operacyjny.
    ``declarable_qty`` = remaining + picked_eff — pozwala zgłosić brak po pełnym skanie
    (najpierw cofamy draft picki, potem zapisujemy MISSING; invariant picked+shortage ≤ required).
    """
    qty = float(oi.quantity or 0)
    cid = int(cart_id)
    picked_raw = float(sum_pick_events_for_line_cart(db, int(oi.id), cid))
    # RAW event/column sum vs EFFECTIVE missing (capped do ordered − picked).
    raw_miss_col = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
    declared_col = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
    raw_event_miss = float(sum_line_events(db, int(oi.id), FE_MISSING))
    miss_uncapped = max(raw_miss_col, raw_event_miss, declared_col)
    gap = max(0.0, qty - min(picked_raw, qty))
    miss_ln = min(miss_uncapped, gap) if gap > 1e-12 else 0.0
    declared = min(max(declared_col, raw_event_miss), gap) if gap > 1e-12 else 0.0
    picked_eff = min(picked_raw, max(0.0, qty - miss_ln))
    remaining_qty = max(0.0, qty - picked_eff - miss_ln)
    shortage_existing = max(miss_ln, declared)
    # Nie przekraczaj ordered − już zgłoszony brak (capped)
    declarable_qty = max(0.0, qty - miss_ln)
    return {
        "required_qty": qty,
        "picked_qty": picked_eff,
        "picked_qty_raw": picked_raw,
        "shortage_qty_existing": shortage_existing,
        "missing_qty_line": miss_ln,
        "declared_qty": declared,
        "remaining_qty": remaining_qty,
        "declarable_qty": declarable_qty,
    }


def _line_eligible_for_shortage_report(oi: OrderItem) -> tuple[bool, str]:
    """Czy można zgłosić brak na tej linii (zamiennik / TO_PICK / aktywna — nie archiwum REPLACED)."""
    if order_item_skip_bundle_commercial_header_for_ops(oi):
        return False, "bundle_commercial_header"
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

    try:
        from .wms_basket_put import clear_basket_put_state

        cart_clr = db.query(Cart).filter(Cart.id == int(cart_id)).first()
        if cart_clr is not None:
            clear_basket_put_state(db, cart=cart_clr, reason="shortage")
    except Exception:
        logger.exception("clear_basket_put_state on shortage failed cart_id=%s", cart_id)

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

    # MULTI / baskets: shortage is always per order_item (+ basket allocation).
    # Product-level FIFO budget must not close other baskets' unresolved qty.
    try:
        from .wms_basket_put.resolve import cart_is_baskets_mode

        baskets_mode = cart_is_baskets_mode(cart_row)
    except Exception:
        baskets_mode = False
    if baskets_mode and target_item_id is None:
        _report_shortage_reject(
            "Dla wózka z koszykami podaj order_item_id — brak rozliczany per zamówienie/koszyk.",
            payload=payload_log,
            cart_type=getattr(getattr(cart_row, "type", None), "value", getattr(cart_row, "type", None)),
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
            .order_by(Order.id.asc())
            .all()
        )
    else:
        ot = _order_type_filter(order_type)
        session_scope_ids = resolve_wms_picking_order_ids(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=ot,
            cart_id=cid,
        )
        if not session_scope_ids:
            _report_shortage_reject(
                "Brak zamówień przypisanych do tego wózka.",
                payload=payload_log,
            )

        if ui_order_ids is not None and len(list(ui_order_ids)) > 0:
            want = [int(x) for x in ui_order_ids if int(x) > 0]
            allowed = set(session_scope_ids)
            session_scope_ids = list(dict.fromkeys([oid for oid in want if oid in allowed]))

        if not session_scope_ids:
            _report_shortage_reject(
                "Brak zamówień w bieżącej sesji zbierania (wózek).",
                payload=payload_log,
                cohort_size=0,
            )

        orders = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id.in_(session_scope_ids))
            .order_by(Order.id.asc())
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

    # Concurrent double-submit: zablokuj te same OrderItem przed declarable / FE_MISSING.
    candidate_item_ids: list[int] = []
    for o in orders:
        for oi, _q in _iter_report_lines(o):
            candidate_item_ids.append(int(oi.id))
    if candidate_item_ids:
        locked_rows = list(
            db.query(OrderItem)
            .filter(OrderItem.id.in_(list(dict.fromkeys(candidate_item_ids))))
            .with_for_update()
            .all()
        )
        if locked_rows:
            locked_by_id = {int(r.id): r for r in locked_rows}
            for o in orders:
                refreshed: list[OrderItem] = []
                for oi in o.items or []:
                    locked = locked_by_id.get(int(oi.id))
                    refreshed.append(locked if locked is not None else oi)
                o.items = refreshed


    affected: list[int] = []
    for o in orders:
        for oi, q in _iter_report_lines(o):
            if float(q["declarable_qty"]) > 1e-9:
                affected.append(int(o.id))
                break

    ss_ui_early = get_or_create_wms_picking_shortage_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    allow_continue_early = bool(getattr(ss_ui_early, "allow_continue_other_lines_after_shortage", True))

    if not affected:
        # Idempotencja: brak już pełny (picked + missing >= required) → NO-OP, bez drugiego eventu.
        already_full = False
        already_order_ids: list[int] = []
        for o in orders:
            for oi, q in _iter_report_lines(o):
                req = float(q["required_qty"])
                miss_ex = float(q["missing_qty_line"])
                picked_ex = float(q["picked_qty"])
                if req > 1e-9 and miss_ex + 1e-9 >= max(0.0, req - picked_ex) and miss_ex > 1e-9:
                    already_full = True
                    already_order_ids.append(int(o.id))
        if already_full:
            logger.info(
                "[shortage.report] NOOP already_resolved product_id=%s cart_id=%s order_ids=%s",
                pid,
                cid,
                already_order_ids,
            )
            return {
                "ok": True,
                "already_resolved": True,
                "orders_updated": 0,
                "target_status_id": None,
                "order_ids": list(dict.fromkeys(already_order_ids)),
                "order_issue_task_ids": [],
                "allow_continue_other_lines_after_shortage": allow_continue_early,
            }
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
            if baskets_mode and target_item_id is not None:
                # MULTI: only unresolved remaining — never auto-convert picks to shortage.
                max_declarable += max(0.0, float(q["remaining_qty"]))
            else:
                max_declarable += max(0.0, float(q["declarable_qty"]))
    max_declarable = round(max_declarable, 6)
    if max_declarable <= 1e-9:
        logger.info(
            "[shortage.report] NOOP already_resolved (max_declarable=0) product_id=%s cart_id=%s",
            pid,
            cid,
        )
        return {
            "ok": True,
            "already_resolved": True,
            "orders_updated": 0,
            "target_status_id": None,
            "order_ids": aff_set,
            "order_issue_task_ids": [],
            "allow_continue_other_lines_after_shortage": allow_continue_early,
        }
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

    def _apply_shortage_take(o: Order, oi: OrderItem, *, take: float, rem_before: float) -> None:
        nonlocal remaining_budget
        if take <= 1e-9:
            return
        remaining_budget = max(0.0, remaining_budget - take)
        shortage_by_order[int(o.id)] += float(take)
        declared_ln = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
        oi.wms_shortage_declared_qty = round(declared_ln + take, 6)
        miss_ln = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
        oi.wms_picking_line_missing_qty = round(miss_ln + take, 6)
        oi.wms_picking_line_status = "missing"
        need_undo = max(0.0, float(take) - float(rem_before))
        if need_undo > 1e-9:
            from .wms_picking_corrections.undo_pick_service import undo_wms_session_picks

            undo_wms_session_picks(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                cart_id=cid,
                product_id=int(oi.product_id),
                quantity=float(need_undo),
                location_id=int(location_id) if location_id is not None else None,
                order_ids=[int(o.id)],
                order_item_id=int(oi.id),
                operator_user_id=operator_user_id,
            )
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
                "undid_picks_qty": float(need_undo),
                "order_id": int(o.id),
                "order_number": str(getattr(o, "number", None) or f"#{o.id}"),
                "product_id": int(oi.product_id),
            },
        )
        # Widoczność FE_MISSING: flush w sum_line_events (SSOT write→read), nie w append_event.
        sync_declared_shortage_column_from_missing_events(db, int(oi.id))
        line_audit_rows.append((o, oi, float(take)))

    # Pass 1: tylko remaining_qty — typowy „Zgłoś brak” nie konwertuje już zebranych sztuk.
    for o in orders:
        if int(o.id) not in aff_set or remaining_budget <= 1e-9:
            continue
        touch_picking_in_progress(o)
        for oi, q in _iter_report_lines(o):
            if remaining_budget <= 1e-9:
                break
            rem_only = float(q["remaining_qty"])
            if rem_only <= 1e-9:
                continue
            take = min(rem_only, remaining_budget)
            _apply_shortage_take(o, oi, take=take, rem_before=rem_only)

    # Pass 2: konwersja draft pick → shortage (np. po 1/1, gdy remaining=0).
    # MULTI baskets: skip — shortage is only for unresolved remaining on a chosen line.
    if remaining_budget > 1e-9 and not (baskets_mode and target_item_id is not None):
        for o in orders:
            if int(o.id) not in aff_set or remaining_budget <= 1e-9:
                continue
            touch_picking_in_progress(o)
            for oi, q in _iter_report_lines(o):
                if remaining_budget <= 1e-9:
                    break
                q2 = _line_shortage_report_quantities(db, oi, cid)
                rem_left = float(q2["remaining_qty"])
                convert_cap = max(0.0, float(q2["declarable_qty"]) - rem_left)
                if convert_cap <= 1e-9:
                    continue
                take = min(convert_cap, remaining_budget)
                _apply_shortage_take(o, oi, take=take, rem_before=rem_left)

    for oid in aff_set:
        recompute_order_fulfillment(db, int(oid), commit=False, session_cart_id=cid)

    for o, oi, take in line_audit_rows:
        if take <= 1e-9:
            continue
        ctx = _shortage_line_report_context(db, oi, is_recovery=is_recovery)
        q_after = _line_shortage_report_quantities(db, oi, cid)
        pr = oi.product if getattr(oi, "product", None) is not None else None
        ean_v = getattr(pr, "ean", None) if pr is not None else None
        sku_v = getattr(pr, "sku", None) if pr is not None else None
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
            order_number=str(getattr(o, "number", None) or f"#{o.id}"),
            ean=str(ean_v).strip() if ean_v else None,
            sku=str(sku_v).strip() if sku_v else None,
            required_qty=float(q_after["required_qty"]),
            picked_qty=float(q_after["picked_qty"]),
            remaining_qty=float(q_after["remaining_qty"]),
            cart_code=(getattr(cart_row, "code", None) or None),
            picking_session_id=getattr(cart_row, "current_session_id", None),
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

    return {
        "ok": True,
        "already_resolved": False,
        "orders_updated": len(aff_set),
        "target_status_id": None,
        "order_ids": aff_set,
        "order_issue_task_ids": task_ids,
        "allow_continue_other_lines_after_shortage": allow_continue_early,
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
            if order_item_skip_bundle_commercial_header_for_ops(oi):
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
    if cart is not None:
        try:
            from .wms_basket_put import clear_basket_put_state

            clear_basket_put_state(db, cart=cart, reason="finalize_cart")
        except Exception:
            logger.exception("clear_basket_put_state on finalize failed cart_id=%s", cart_id)
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
            "Brak zamówień przypisanych do tego wózka.",
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

    failing_pick_diag: dict | None = None
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
            trace = _finalize_pick_trace_payload(
                db, p, cart_id=cid, prior_consumed_pick_ids=list(finalized_ids)
            )
            logger.info("FINALIZE_PICK_TRACE %s", trace)
            try:
                finalized_rows = _decrement_inventory_for_wms_pick(
                    db, p, performed_by=performed_by, picked_at=now
                )
            except Exception as pick_exc:
                failing_pick_diag = {
                    **trace,
                    "error": str(pick_exc),
                    "error_type": type(pick_exc).__name__,
                }
                logger.error("FINALIZE_PICK_FAILED %s", failing_pick_diag)
                raise
            for row in finalized_rows:
                row.picked_at = now
                row.status = "done"
                finalized_ids.append(int(row.id))
        mark_pick_events_finalized_for_pick_ids(db, finalized_ids)
        from .bundles.bundle_lot_snapshot_service import persist_bundle_lot_snapshots_for_picks

        persist_bundle_lot_snapshots_for_picks(db, finalized_ids)
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
        err_code = "inventory_finalize_failed"
        err_msg = f"Nie udało się spisać stanu magazynu dla zbierania: {exc}"
        extra: dict | None = {"failing_pick": failing_pick_diag} if failing_pick_diag else None
        if failing_pick_diag:
            err_code = "PICK_LOCATION_STOCK_MISMATCH"
            fp = failing_pick_diag
            prod_name = f"produkt #{fp.get('product_id')}"
            try:
                from ..models.product import Product as _Product

                prow = db.query(_Product).filter(_Product.id == int(fp.get("product_id") or 0)).first()
                if prow is not None and (prow.name or "").strip():
                    prod_name = str(prow.name).strip()
            except Exception:
                pass
            loc_code = fp.get("location_code") or f"#{fp.get('location_id')}"
            pq = float(fp.get("pick_quantity") or 0)
            avail = float(fp.get("inventory_physical_available") or 0)
            err_msg = (
                "Nie można zakończyć zbierania.\n\n"
                f"Pobranie {pq:g} szt. produktu {prod_name} "
                f"zapisano z lokalizacji {loc_code}, "
                f"ale dostępny stan nie pokrywa tego pobrania "
                f"(dostępne {avail:g}).\n\n"
                "Sprawdź zapisane pobranie i cofnij błędny wpis."
            )
            # Keep machine fields for FE CTA (normalize quantity alias).
            fp_out = dict(fp)
            fp_out["quantity"] = fp.get("pick_quantity")
            fp_out["product_name"] = prod_name
            extra = {"failing_pick": fp_out}
        raise PickingFinalizeError(
            err_msg,
            reason=exc.__class__.__name__,
            step="inventory",
            http_status=409,
            code=err_code,
            order_id=int(failing_pick_diag["order_id"]) if failing_pick_diag and failing_pick_diag.get("order_id") else None,
            line_id=int(failing_pick_diag["order_item_id"])
            if failing_pick_diag and failing_pick_diag.get("order_item_id")
            else None,
            extra=extra,
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
            from .order_shipping_fk_service import sanitize_order_orphan_shipping_method_id

            sanitize_order_orphan_shipping_method_id(db, o)
            pack_ok = bool(rec_state.packing_allowed)
            panel_kind: OrderFinalizeKind = kind
            if kind == "all_picked" and not pack_ok:
                panel_kind = "some_missing"
            if kind == "all_picked" and pack_ok:
                from .order_consolidation.consolidation_context import consolidation_blocks_ready_to_pack

                if consolidation_blocks_ready_to_pack(db, int(o.id)):
                    fs = PICKING
                else:
                    fs = FS_PACKING
            elif kind == "all_missing":
                fs = FS_MISSING
            else:
                fs = FS_NEEDS_DECISION
            o.order_ui_status_id = _panel_status_after_picking_finalize(
                shortage_reported_order_ui_status_id=rep_sid_i,
                pc=pc,
                kind=panel_kind,
            )
            # SSOT: wózek zostaje przypięty do pakowania
            apply_fulfillment_state(o, fs, clear_cart=False, clear_session=False)
            if fs == FS_PACKING:
                o.status = "PACKING"
            if fs in (FS_PACKING, FS_NEEDS_DECISION):
                from .picking_handoff_service import apply_cart_picking_handoff

                apply_cart_picking_handoff(o, cart)
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
                "[picking.finalize.error] order_id=%s cart_id=%s source_status_id=%s step=apply_order_state "
                "exc_type=%s",
                oid,
                cid,
                sid,
                type(exc).__name__,
            )
            raise PickingFinalizeError(
                "Nie udało się zakończyć zbierania z powodu niespójności danych zamówienia. "
                "Sesja nie została zakończona.",
                reason=type(exc).__name__,
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
                "[picking.finalize.error] order_id=%s cart_id=%s source_status_id=%s step=relocation "
                "exc_type=%s",
                oid,
                cid,
                sid,
                type(exc).__name__,
            )
            raise PickingFinalizeError(
                "Nie udało się zakończyć zbierania (zadania rozlokowania). Sesja nie została zakończona.",
                reason=type(exc).__name__,
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
            except Exception as braki_exc:
                from sqlalchemy.exc import OperationalError, ProgrammingError

                logger.exception(
                    "[picking.finalize.braki_task] order_id=%s cart_id=%s source_status_id=%s",
                    oid,
                    cid,
                    sid,
                )
                # Schema / SQL failures must not be swallowed — otherwise Braki queue 500s later.
                if isinstance(braki_exc, (OperationalError, ProgrammingError)):
                    raise PickingFinalizeError(
                        f"Nie udało się utworzyć zadania Braki dla zamówienia #{o.number or oid}: {braki_exc}",
                        reason=braki_exc.__class__.__name__,
                        order_id=oid,
                        step="braki_task",
                        http_status=500,
                        code="braki_task_schema_failed",
                    ) from braki_exc

    try:
        _sync_order_operational_state_after_picking_finalize(
            db,
            orders,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            cart_id=cid,
        )
        from .cart_picking_lifecycle_service import finish_picking_after_wms_finalize
        from .wms_picking_shortage_settings_service import is_shortage_auto_detach_enabled

        packing_bound_ids = [
            int(o.id) for o in orders if order_kinds.get(int(o.id), "all_picked") == "all_picked"
        ]
        shortage_kind_ids = [
            int(o.id) for o in orders if order_kinds.get(int(o.id), "all_picked") != "all_picked"
        ]
        auto_detach_raw = bool(getattr(ss, "disable_auto_detach_missing_orders_from_carts", False))
        auto_detach_on = is_shortage_auto_detach_enabled(ss)
        shortage_detach_ids = list(shortage_kind_ids) if auto_detach_on else []
        if not auto_detach_on:
            # Keep shortage on cart (config OFF) — treat like packing-bound for cart close.
            packing_bound_ids = [int(o.id) for o in orders]

        for o in orders:
            logger.info(
                "FINALIZE_TRACE CLASSIFICATION order_id=%s classification=%s "
                "fulfillment_state=%s cart_id=%s",
                int(o.id),
                order_kinds.get(int(o.id)),
                getattr(o, "fulfillment_state", None),
                getattr(o, "cart_id", None),
            )
        logger.info(
            "FINALIZE_TRACE AUTO_DETACH_SETTING raw_value=%s effective_auto_detach=%s "
            "shortage_kind_ids=%s shortage_detach_candidates=%s",
            auto_detach_raw,
            auto_detach_on,
            shortage_kind_ids,
            shortage_detach_ids,
        )
        logger.info("FINALIZE_TRACE FINALIZE_START cart_id=%s", cid)

        finish_out = finish_picking_after_wms_finalize(
            db,
            cart=cart,
            orders=orders,
            packing_bound_order_ids=packing_bound_ids,
            shortage_detach_order_ids=shortage_detach_ids,
            operator_user_id=operator_user_id,
        )
        logger.info(
            "FINALIZE_TRACE DETACH_CALLED=YES result=%s",
            {
                "detached": finish_out.get("detached_order_ids"),
                "packing": finish_out.get("packing_order_ids"),
                "released": finish_out.get("cart_released"),
                "status": finish_out.get("cart_status"),
            },
        )
        # Telemetria finalize (bez ponownego sterowania lifecycle)
        try:
            record_picking_cart_finalize_session(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                cart_id=cid,
                operator_user_id=operator_user_id,
                orders=list(orders),
                completed_at=datetime.utcnow(),
            )
        except Exception:
            logger.exception("[picking.finalize] telemetry record failed cart_id=%s", cid)
        logger.info(
            "[picking.finalize.finish] cart_id=%s source_status_id=%s orders_updated=%s "
            "target_status_id=%s packing_bound=%s shortage_detached=%s auto_detach=%s",
            cid,
            sid,
            len(orders),
            tgt,
            packing_bound_ids,
            shortage_detach_ids,
            auto_detach_on,
        )
        logger.info("FINALIZE_TRACE COMMIT_PENDING cart_id=%s", cid)
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
        trace = _finalize_pick_trace_payload(
            db, p, cart_id=cid, prior_consumed_pick_ids=list(finalized_ids)
        )
        logger.info("FINALIZE_PICK_TRACE %s", trace)
        try:
            finalized_rows = _decrement_inventory_for_wms_pick(
                db, p, performed_by=performed_by, picked_at=now
            )
        except Exception as pick_exc:
            logger.error(
                "FINALIZE_PICK_FAILED %s",
                {**trace, "error": str(pick_exc), "error_type": type(pick_exc).__name__},
            )
            raise
        for row in finalized_rows:
            row.picked_at = now
            row.status = "done"
            finalized_ids.append(int(row.id))
    mark_pick_events_finalized_for_pick_ids(db, finalized_ids)
    from .bundles.bundle_lot_snapshot_service import persist_bundle_lot_snapshots_for_picks

    persist_bundle_lot_snapshots_for_picks(db, finalized_ids)

    from .recovery_workflow_service import apply_fulfillment_state_from_resolver

    post_state = apply_fulfillment_state_from_resolver(db, o, session_cart_id=cid, log=True)
    fs = FS_PACKING if post_state.packing_allowed else FS_NEEDS_DECISION
    apply_fulfillment_state(o, fs, clear_cart=False, clear_session=False)
    if fs == FS_PACKING:
        o.status = "PACKING"
    if fs in (FS_PACKING, FS_NEEDS_DECISION):
        from .picking_handoff_service import apply_cart_picking_handoff

        cart_row = db.query(Cart).filter(Cart.id == int(cid)).first() if cid else None
        apply_cart_picking_handoff(o, cart_row)

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
