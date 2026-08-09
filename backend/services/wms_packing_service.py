"""Lista kolejki pakowania: status docelowy z picking_config + tryby (bez wózka / BULK / koszyki)."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from collections import defaultdict
from typing import List, Literal, Optional, Tuple, Type, TypeVar, cast

from pydantic import BaseModel
from sqlalchemy import and_, desc, exists, func, or_, select
from sqlalchemy.orm import Session, joinedload

from ..models.cart import Cart
from ..auth.roles import is_super_role
from ..models.app_user import AppUser, UserWmsProfile
from ..models.carton import Carton, carton_shipping_method_links
from ..models.cart_basket import CartBasket
from ..models.enums import CartType
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.order import Order
from ..models.order_document import OrderDocument
from ..models.order_document_type_enum import OrderDocumentType
from ..models.order_item import OMS_LINE_STATUS_TO_PICK, OrderItem, order_item_is_replaced_line
from ..models.order_ui_status import OrderUiStatus
from ..models.picking_config import PickingConfig
from ..models.sale_document import SaleDocument
from ..models.wms_packing_settings import WmsPackingSettings
from ..schemas.order import OrderUiMainGroup
from .cart_display import cart_display_name_for_wms
from .fulfillment_event_service import picked_location_breakdown_for_order_line
from .wms_workflow_phase import compute_wms_workflow_phase
from ..schemas.packaging_intelligence import PackagingSuggestionOut
from ..schemas.wms_packing import (
    OrderSelectCartonResponse,
    WmsLineAvailableLocationRow,
    WmsLinePickedLocationRow,
    WmsOperationalNoteBrief,
    WmsPackingBundleComponentNode,
    WmsPackingBundleTreeNode,
    WmsPackingBasketOrderOut,
    WmsPackingShelfOrderOut,
    WmsPackingCartOrdersOut,
    WmsPackingOrderCard,
    WmsPackingOrderDetailOut,
    WmsPackingOrderLine,
    WmsPackingOrderUiStatusBadge,
    WmsOrderTimelineEvent,
    WmsPackingPostPackStepResult,
    WmsPackingRecommendedCarton,
    WmsPackingTargetStatusItem,
    WmsPackingScanOut,
)
from ..schemas.wms_packing_settings import (
    WmsPackingAutoActions,
    WmsPackingDocumentSettings,
    WmsPackingFallbackLabel,
)
from ..utils.ui_status_color import normalize_stored_color
from ..utils.order_shipping_display import resolve_order_shipping_display
from .packaging_engine import build_packaging_suggestions_for_order
from .receiving_scan_service import resolve_receiving_scan
from .wms_sale_document_service import create_sale_document
from .wms_audit_service import (
    emit_wms_carton_selected_or_changed,
    emit_wms_label_generated,
    emit_wms_packed_item,
    emit_wms_packing_automation_finished,
    emit_wms_packing_finished,
    emit_wms_packing_reopen_acknowledged,
    emit_wms_packing_started,
    last_pack_audit_summaries_for_order_lines,
    last_pick_audit_summaries_for_order_lines,
    resolve_packing_finished_operator_label,
)

logger = logging.getLogger(__name__)

_GROUP_ORDER: tuple[str, ...] = ("NEW", "IN_PROGRESS", "DONE")


def _order_item_active_for_packing(it: OrderItem) -> bool:
    """Linie archiwalne (REPLACED) i qty=0 nie wchodzą do kolejki ani karty pakowania."""
    if order_item_is_replaced_line(it):
        return False
    if int(it.quantity or 0) <= 0:
        return False
    if getattr(it, "is_bundle_parent", False):
        from .bundle_order_item_ops import order_item_is_stock_production_bundle_parent

        return order_item_is_stock_production_bundle_parent(it)
    return True


def _norm_group(raw: object) -> str:
    s = str(raw or "NEW").strip().upper()
    return s if s in frozenset(_GROUP_ORDER) else "NEW"


def _packing_sku_from_item(it: OrderItem) -> Optional[str]:
    p = getattr(it, "product", None)
    if p is None:
        return None
    for attr in ("sku", "symbol"):
        v = getattr(p, attr, None)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


class PackingScanError(Exception):
    """Błąd skanu na ekranie pakowania — ``code`` dla mapowania komunikatów UI."""

    def __init__(
        self,
        code: str,
        *,
        message: str | None = None,
        order_item_id: int | None = None,
    ) -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message
        self.order_item_id = order_item_id


def _order_item_operational_missing_qty(db: Session, order: Order, it: OrderItem) -> float:
    from .order_fulfillment_recompute import compute_line_missing_qty

    return float(compute_line_missing_qty(db, order, it))


def order_item_required_pack_qty(db: Session, order: Order, it: OrderItem) -> int:
    """Ile sztuk linii musi zostać spakowanych — stan biznesowy po brakach / decyzjach OMS."""
    if not _order_item_active_for_packing(it):
        return 0
    ordered = int(it.quantity or 0)
    if ordered <= 0:
        return 0

    from .fulfillment_event_service import line_picked_sum_for_order

    removed = float(getattr(it, "oms_removed_qty", None) or 0.0)
    replaced = float(getattr(it, "oms_replaced_qty", None) or 0.0)
    picked = float(line_picked_sum_for_order(db, int(it.id), order))
    missing = float(_order_item_operational_missing_qty(db, order, it))
    fulfillable = max(0.0, float(ordered) - removed - replaced)

    # Physical packing expectancy: only units actually picked (minus declared shortage).
    # 4 picked + 4 shortage → pack 4; 0 picked + 8 shortage → pack 0;
    # 0 picked without shortage (otwarte zbieranie) → pack 0 (nie udawaj kompletności).
    after_shortage = max(0.0, fulfillable - missing)
    return max(0, int(round(min(after_shortage, picked))))


def _packing_finish_validation_snapshot(db: Session, order: Order, *, log: bool = False) -> dict:
    """Diagnoza gotowości do domknięcia pakowania."""

    items = order.items or []
    active_lines = 0
    removed_lines = 0
    shortage_lines = 0
    replacement_lines = 0
    total_required_qty = 0
    unresolved_lines: list[dict] = []

    for it in items:
        from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops

        if order_item_skip_bundle_commercial_header_for_ops(it):
            continue
        meta_removed = False
        raw_meta = getattr(it, "metadata_json", None)
        if raw_meta and str(raw_meta).strip():
            try:
                m = json.loads(raw_meta)
                meta_removed = isinstance(m, dict) and bool(m.get("oms_line_removed"))
            except json.JSONDecodeError:
                meta_removed = False
        if order_item_is_replaced_line(it):
            removed_lines += 1
            continue
        if int(it.quantity or 0) <= 0 or meta_removed:
            removed_lines += 1
            continue

        rep_oid = getattr(it, "replaced_from_order_item_id", None)
        if rep_oid is not None and int(rep_oid) > 0:
            replacement_lines += 1

        if not _order_item_active_for_packing(it):
            continue
        active_lines += 1

        missing = _order_item_operational_missing_qty(db, order, it)
        if missing > 1e-9:
            shortage_lines += 1
        required = order_item_required_pack_qty(db, order, it)
        packed = int(getattr(it, "packing_quantity_packed", 0) or 0)
        total_required_qty += int(required)

        reason = ""
        if missing > 1e-9:
            reason = "unresolved_shortage"
        elif packed < required:
            reason = "underpacked"

        if reason:
            unresolved_lines.append(
                {
                    "order_item_id": int(it.id),
                    "product_id": int(it.product_id),
                    "reason": reason,
                    "required": required,
                    "packed": packed,
                    "missing_qty": round(missing, 6),
                }
            )

    from .recovery_workflow_service import can_order_be_packed, resolve_order_recovery_state

    rec_state = resolve_order_recovery_state(db, order, log=False)
    u_short, r_pend = rec_state.totals.oms_decision_lines, rec_state.totals.recovery_lines
    # Kompletność linii: realne sztuki do spakowania (required>0) i brak underpack.
    # Otwarta dogrywka / OMS / rozlokowanie NIE może dać „fizycznie spakowane”.
    lines_qty_complete = (
        active_lines > 0
        and total_required_qty > 0
        and len(unresolved_lines) == 0
    )
    recovery_clear = (
        int(u_short) == 0
        and not bool(rec_state.has_recovery_work)
        and not bool(rec_state.has_relocation_work)
    )
    lines_packed_complete = lines_qty_complete and recovery_clear
    packable = lines_packed_complete and can_order_be_packed(db, order, require_physical_pack=False)

    snap = {
        "order_id": int(order.id),
        "total_lines": len(items),
        "active_lines": active_lines,
        "removed_lines": removed_lines,
        "shortage_lines": shortage_lines,
        "replacement_lines": replacement_lines,
        "total_required_qty": total_required_qty,
        "unresolved_lines": unresolved_lines,
        "unresolved_count": len(unresolved_lines),
        "issue_queue_oms": int(u_short),
        "issue_queue_pick": int(r_pend),
        "lines_packed_complete": lines_packed_complete,
        "packable": packable,
    }
    if log:
        logger.info(
            "[wms.packing.finish.validation] order_id=%s total_lines=%s active_lines=%s "
            "removed_lines=%s shortage_lines=%s replacement_lines=%s unresolved_count=%s "
            "issue_queue_oms=%s issue_queue_pick=%s packable=%s",
            snap["order_id"],
            snap["total_lines"],
            snap["active_lines"],
            snap["removed_lines"],
            snap["shortage_lines"],
            snap["replacement_lines"],
            snap["unresolved_count"],
            snap["issue_queue_oms"],
            snap["issue_queue_pick"],
            snap["packable"],
        )
        if unresolved_lines:
            logger.info(
                "[wms.packing.finish.validation.lines] order_id=%s unresolved=%s",
                snap["order_id"],
                unresolved_lines[:12],
            )
    return snap


def _assert_order_packable_for_finish(db: Session, order: Order) -> None:
    from .recovery_workflow_service import (
        can_order_be_packed,
        log_recovery_state_snapshot,
        resolve_order_recovery_state,
    )

    state = resolve_order_recovery_state(db, order, log=False)
    log_recovery_state_snapshot(state, tag="wms.packing.finish.validation")
    snap = _packing_finish_validation_snapshot(db, order, log=True)
    if can_order_be_packed(db, order, require_physical_pack=True):
        return
    recovery_reasons = [
        ln.reason
        for ln in (getattr(state, "lines", None) or [])
        if getattr(ln, "visible_in_recovery_pick", False) or getattr(ln, "active_recovery", False)
    ]
    logger.info(
        "[wms.packing.finish.packable_fail] order_id=%s oms_lines=%s recovery_work=%s "
        "relocation=%s recovery_reasons=%s unresolved_lines=%s",
        int(order.id),
        int(state.totals.oms_decision_lines),
        bool(state.has_recovery_work),
        bool(state.has_relocation_work),
        recovery_reasons[:8],
        (snap.get("unresolved_lines") or [])[:8],
    )
    if int(state.totals.oms_decision_lines) > 0:
        raise PackingScanError(
            "UNRESOLVED_SHORTAGES",
            message="Zamówienie ma nierozwiązane braki — wymagana decyzja przed finalizacją pakowania",
        )
    if state.has_recovery_work:
        raise PackingScanError(
            "UNRESOLVED_SHORTAGES",
            message="Nie zebrano wszystkich pozycji — dokończ zbieranie przed finalizacją pakowania",
        )
    if state.has_relocation_work:
        raise PackingScanError(
            "UNRESOLVED_SHORTAGES",
            message="Zamówienie wymaga dokończenia rozlokowania przed finalizacją pakowania",
        )
    raise PackingScanError(
        "ORDER_NOT_FULLY_PACKED",
        message="Nie można domknąć pakowania — zamówienie nie jest w pełni spakowane",
    )


def _packing_queue_status_ids(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    primary_status_id: int,
) -> List[int]:
    """
    Statusy UI kolejki pakowania dla żądanego ``primary_status_id``.

    Tylko jawnie wybrany status sesji — bez heurystyki po nazwie („pak”/„pack”),
    która wciągała zamówienia spoza konfiguracji procesu.
    """
    _ = (db, tenant_id, warehouse_id)
    sid = int(primary_status_id)
    return [sid] if sid > 0 else []


def _active_packing_eligibility_clauses(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_ids: List[int],
) -> list:
    """
    SSOT: aktywna kolejka pakowania (nie provenance).

    - deleted_at IS NULL
    - nie WMS-finalized (``wms_packing_automation_finished_at``)
    - ``order_ui_status_id`` ∈ skonfigurowanych / wybranych statusów kolejki
    - packing-ready state (fulfillment READY_TO_PACK/PACKING lub legacy NULL)
    - eligibility consolidation / fulfillment_mode
    """
    from .wms_queue_eligibility import (
        wms_queue_fulfillment_mode_clauses,
        wms_queue_consolidation_phase_clauses,
        wms_queue_consolidation_plan_clauses,
        wms_queue_consolidation_packing_clauses,
    )

    sids = [int(x) for x in status_ids if int(x) > 0]
    if not sids:
        # Brak statusu kolejki → pusta lista (nie „wszystkie PACKING”).
        return [Order.id == -1]

    return [
        Order.deleted_at.is_(None),
        Order.wms_packing_automation_finished_at.is_(None),
        Order.order_ui_status_id.in_(sids),
        or_(
            Order.fulfillment_state.in_(("READY_TO_PACK", "PACKING")),
            Order.fulfillment_state.is_(None),
        ),
        *wms_queue_fulfillment_mode_clauses(
            db=db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            queue_name="packing",
        ),
        *wms_queue_consolidation_phase_clauses(),
        *wms_queue_consolidation_plan_clauses(),
        *wms_queue_consolidation_packing_clauses(),
    ]


def _active_basket_custody_clause(*, warehouse_id: int):
    """
    Live BASKET custody: Order.basket_id set AND CartBasket.order_id == Order.id
    (dual SSOT). ``picking_handoff_mode`` alone is provenance — not enough.
    """
    return and_(
        Order.basket_id.isnot(None),
        exists().where(
            CartBasket.id == Order.basket_id,
            CartBasket.order_id == Order.id,
            CartBasket.warehouse_id == int(warehouse_id),
        ),
    )


def _active_packing_scope_clauses(
    *,
    mode: str,
    cart_id: int | None,
    warehouse_id: int,
) -> list:
    """
    Handoff provenance + live custody for CART / BASKET / CARTLESS / shelf / all.
    ``all`` = pełna kolejka statusu (bez filtra handoff) — domyślna lista Pakowania.
    """
    from .picking_handoff_service import HANDOFF_BASKET, HANDOFF_CART, HANDOFF_CARTLESS

    m = (mode or "").strip().lower()
    if m == "all":
        return []
    if m == "bulk":
        if cart_id is None or int(cart_id) < 1:
            raise ValueError("cart_id required for CART packing scope")
        return [
            Order.picking_handoff_mode == HANDOFF_CART,
            Order.cart_id == int(cart_id),
        ]
    if m == "baskets":
        clauses = [
            Order.picking_handoff_mode == HANDOFF_BASKET,
            _active_basket_custody_clause(warehouse_id=int(warehouse_id)),
        ]
        if cart_id is not None and int(cart_id) > 0:
            clauses.append(Order.cart_id == int(cart_id))
        return clauses
    if m == "shelf":
        from .order_consolidation.constants import PLAN_STATUS_COMPLETED
        from ..models.order_consolidation_plan import OrderConsolidationPlan

        completed = select(OrderConsolidationPlan.order_id).where(
            OrderConsolidationPlan.status == PLAN_STATUS_COMPLETED,
            OrderConsolidationPlan.target_warehouse_id == int(warehouse_id),
        )
        return [
            Order.cart_id.is_(None),
            Order.picking_handoff_mode.is_(None),
            Order.id.in_(completed),
        ]
    # CARTLESS
    return [
        Order.picking_handoff_mode == HANDOFF_CARTLESS,
        Order.cart_id.is_(None),
    ]


def _emit_packing_queue_trace(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_ids: List[int],
    eligibility: list,
) -> None:
    """
    Diagnostyka ghost BASKET: handoff=BASKET bez live custody / finalized.
    Loguje per-order PACKING_QUEUE_TRACE (max 30).
    """
    from .picking_handoff_service import HANDOFF_BASKET, normalize_handoff_mode

    try:
        candidates = (
            db.query(Order)
            .filter(
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
                Order.deleted_at.is_(None),
                Order.picking_handoff_mode == HANDOFF_BASKET,
                or_(
                    Order.fulfillment_state.in_(("READY_TO_PACK", "PACKING")),
                    and_(
                        Order.fulfillment_state.is_(None),
                        Order.order_ui_status_id.in_(list(status_ids)),
                    ),
                ),
            )
            .limit(30)
            .all()
        )
    except Exception:
        logger.exception("PACKING_QUEUE_TRACE query failed")
        return

    custody = _active_basket_custody_clause(warehouse_id=int(warehouse_id))
    for o in candidates:
        oid = int(o.id)
        auto_fin = getattr(o, "wms_packing_automation_finished_at", None) is not None
        bid = getattr(o, "basket_id", None)
        cid = getattr(o, "cart_id", None)
        has_custody = False
        rejection = None
        if auto_fin:
            rejection = "AUTOMATION_FINISHED"
        elif bid is None or int(bid or 0) <= 0:
            rejection = "NO_ACTIVE_BASKET_CUSTODY"
        else:
            try:
                has_custody = (
                    db.query(Order.id)
                    .filter(Order.id == oid, custody)
                    .first()
                    is not None
                )
            except Exception:
                has_custody = False
            if not has_custody:
                # distinguish inconsistency vs empty
                slot = db.query(CartBasket).filter(CartBasket.id == int(bid)).first()
                if slot is None:
                    rejection = "NO_ACTIVE_BASKET_CUSTODY"
                elif getattr(slot, "order_id", None) is None or int(slot.order_id) != oid:
                    rejection = "BASKET_CUSTODY_INCONSISTENT"
                else:
                    rejection = "NO_ACTIVE_BASKET_CUSTODY"
        included = (not auto_fin) and has_custody and rejection is None
        if included:
            rejection = None
        msg = (
            f"PACKING_QUEUE_TRACE ORDER_ID={oid} HANDOFF={normalize_handoff_mode(getattr(o, 'picking_handoff_mode', None))} "
            f"CART_ID={cid} BASKET_ID={bid} AUTOMATION_FINISHED={int(auto_fin)} "
            f"QUEUE_INCLUDED={int(included)} REJECTION_REASON={rejection or '-'}"
        )
        logger.info(msg)
        print(msg, flush=True)


def _packing_orders_base_query(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
):
    """
    Kolejka pakowania scoped po immutable handoff + live custody.

    mode (legacy UI labels):
      all      → cała kolejka statusu (bez filtra handoff) — domyślna lista Pakowania
      bulk     → picking_handoff_mode=CART + order.cart_id == cart_id (wymagany)
      baskets  → picking_handoff_mode=BASKET + aktywne basket custody
      no_cart  → picking_handoff_mode=CARTLESS + cart_id IS NULL

    ``picking_handoff_mode`` = provenance; custody = cart_id / basket assignment.
    Finalized (``wms_packing_automation_finished_at``) nigdy w aktywnej kolejce.
    """
    m = (mode or "").strip().lower()
    if m not in ("all", "no_cart", "bulk", "baskets", "shelf"):
        raise ValueError("Parametr mode musi być: all, no_cart, bulk, baskets lub shelf.")
    status_ids = _packing_queue_status_ids(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, primary_status_id=status_id
    )
    eligibility = _active_packing_eligibility_clauses(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_ids=status_ids,
    )
    scope = _active_packing_scope_clauses(
        mode=m,
        cart_id=cart_id,
        warehouse_id=int(warehouse_id),
    )
    return db.query(Order).filter(
        Order.tenant_id == int(tenant_id),
        Order.warehouse_id == int(warehouse_id),
        *eligibility,
        *scope,
    )


def _packing_customer_name_from_order(order: Order) -> str:
    raw = getattr(order, "addresses_json", None) or ""
    if not str(raw).strip():
        return "—"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return "—"
    if not isinstance(data, dict):
        return "—"
    for section in ("billing", "shipping", "customer"):
        block = data.get(section)
        if not isinstance(block, dict):
            continue
        for key in ("Firma", "company", "company_name", "name", "Nazwa"):
            v = block.get(key)
            if v is not None and str(v).strip():
                return str(v).strip()
    billing = data.get("billing")
    if isinstance(billing, dict):
        fn = billing.get("Imię") or billing.get("first_name")
        ln = billing.get("Nazwisko") or billing.get("last_name")
        parts = [str(x).strip() for x in (fn, ln) if x is not None and str(x).strip()]
        if parts:
            return " ".join(parts)
    for section in ("shipping", "billing"):
        block = data.get(section)
        if not isinstance(block, dict):
            continue
        fn = block.get("Imię") or block.get("first_name")
        ln = block.get("Nazwisko") or block.get("last_name")
        parts = [str(x).strip() for x in (fn, ln) if x is not None and str(x).strip()]
        if parts:
            return " ".join(parts)
    return "—"


def _packing_customer_nip_from_order(order: Order) -> Optional[str]:
    raw = getattr(order, "addresses_json", None) or ""
    if not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    def _clean(v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    for section in ("billing", "shipping", "customer", "invoice"):
        block = data.get(section)
        if not isinstance(block, dict):
            continue
        for key in ("NIP", "nip", "tax_id", "vat_id", "VatID"):
            found = _clean(block.get(key))
            if found:
                return found
    for key in ("NIP", "nip", "tax_id"):
        found = _clean(data.get(key))
        if found:
            return found
    return None


def _packing_customer_phone_from_order(order: Order) -> Optional[str]:
    raw = getattr(order, "addresses_json", None) or ""
    if not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    billing = data.get("billing") if isinstance(data.get("billing"), dict) else {}
    shipping = data.get("shipping") if isinstance(data.get("shipping"), dict) else {}
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}

    def _clean(v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    return _clean(
        billing.get("Telefon")
        or shipping.get("Telefon")
        or billing.get("phone")
        or shipping.get("phone")
        or customer.get("Telefon")
        or customer.get("phone")
        or data.get("phone")
        or data.get("phone_number")
        or data.get("tel")
    )


def _format_shipping_address_block(order: Order) -> str:
    raw = getattr(order, "addresses_json", None) or ""
    if not str(raw).strip():
        parts: List[str] = []
        if getattr(order, "city", None):
            parts.append(str(order.city).strip())
        if getattr(order, "country", None):
            parts.append(str(order.country).strip())
        return "\n".join(parts) if parts else "—"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return "—"
    if not isinstance(data, dict):
        return "—"
    ship = data.get("shipping")
    if not isinstance(ship, dict):
        ship = {}
    lines: List[str] = []
    for key in ("Ulica", "street", "address1", "Address1", "line1"):
        v = ship.get(key)
        if v is not None and str(v).strip():
            lines.append(str(v).strip())
            break
    city = ship.get("Miasto") or ship.get("city")
    postal = ship.get("Kod pocztowy") or ship.get("postal_code") or ship.get("zip")
    cc = " ".join(x for x in (postal, city) if x and str(x).strip())
    if cc.strip():
        lines.append(cc.strip())
    country = ship.get("Kraj") or ship.get("country")
    if country and str(country).strip():
        lines.append(str(country).strip())
    if not lines and getattr(order, "city", None):
        lines.append(str(order.city).strip())
    return "\n".join(lines) if lines else "—"


def _cart_basket_display_code(b: CartBasket) -> str:
    nm = (getattr(b, "name", None) or "").strip()
    if nm:
        return nm
    return f"S-{int(b.row)}-{int(b.column)}"


def _wms_operational_logistics_lines_for_order(order: Order) -> List[str]:
    """OMS: linie wózek / koszyk pod blokiem zbierania."""
    lines: List[str] = []
    cart = getattr(order, "cart", None)
    bsk = getattr(order, "basket", None)
    if cart is not None:
        ct = getattr(cart, "type", None)
        is_multi = ct == CartType.MULTI or str(ct).split(".")[-1].upper() == "MULTI"
        cid = int(getattr(cart, "id", 0) or 0)
        if is_multi:
            lines.append(f"Wózek koszykowy: #{cid}" if cid else "Wózek koszykowy")
            if bsk is not None:
                bc = _cart_basket_display_code(bsk).strip()
                if bc:
                    lines.append(f"Koszyk: {bc}")
        else:
            disp = f"#{cid}" if cid > 0 else (cart_display_name_for_wms(cart) or "").strip()
            if disp:
                lines.append(f"Wózek: {disp}")
    elif bsk is not None:
        bc = _cart_basket_display_code(bsk).strip()
        if bc:
            lines.append(f"Koszyk: {bc}")
    return lines


def _basket_code_for_order(order: Order) -> Optional[str]:
    b = getattr(order, "basket", None)
    if b is None:
        return None
    return _cart_basket_display_code(b)


def _order_import_meta(order: Order) -> dict:
    raw = getattr(order, "import_metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else {}
    except json.JSONDecodeError:
        return {}


def _document_prefix_fa_or_pa(order: Order, meta: dict) -> str:
    raw_addr = (getattr(order, "addresses_json", None) or "").strip()
    if raw_addr:
        low = raw_addr.lower()
        if "nip" in low or "company" in low or "firma" in low or "tax_id" in low:
            return "Fa"
    for key in ("invoice_required", "faktura", "invoice", "want_invoice"):
        v = meta.get(key)
        if isinstance(v, bool) and v:
            return "Fa"
        if v is not None and str(v).strip().lower() in ("1", "true", "yes", "tak", "fa"):
            return "Fa"
    return "Pa"


def _order_packing_list_fields(order: Order) -> dict:
    """Uwagi + dokument — wspólne dla listy i szczegółu karty."""
    meta = _order_import_meta(order)
    customer_comment: Optional[str] = None
    for key in ("customer_comment", "uwagi", "Uwagi", "buyer_message", "message_to_seller", "comment", "Komentarz"):
        raw = meta.get(key)
        if raw is not None and str(raw).strip():
            customer_comment = str(raw).strip()
            break
    staff_notes: Optional[str] = None
    for key in ("staff_notes", "notatki", "warehouse_notes", "internal_note"):
        raw = meta.get(key)
        if raw is not None and str(raw).strip():
            staff_notes = str(raw).strip()
            break
    sales_document_label: Optional[str] = None
    sdn = getattr(order, "sales_document_number", None)
    if sdn is not None and str(sdn).strip():
        sales_document_label = str(sdn).strip()
    document_prefix = _document_prefix_fa_or_pa(order, meta)
    return {
        "customer_comment": customer_comment,
        "staff_notes": staff_notes,
        "sales_document_label": sales_document_label,
        "document_prefix": document_prefix,
    }


def _format_pln_amount(val: float) -> str:
    s = f"{val:.2f}".replace(".", ",")
    return f"{s} PLN"


def _product_meta_color(p: object) -> Optional[str]:
    raw = getattr(p, "metadata_json", None) or ""
    if not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    for key in ("Kolor", "color", "Colour"):
        v = data.get(key)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


def _sum_inventory_for_product(db: Session, tenant_id: int, warehouse_id: int, product_id: int) -> int:
    total = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
        )
        .scalar()
    )
    try:
        return int(float(total or 0))
    except (TypeError, ValueError):
        return 0


def _location_type_to_storage_hint(loc_type: Optional[str]) -> Optional[str]:
    """``locations.type`` (pick | reserve | floor) → wartości jak ``normalizeStorageType`` w frontendzie."""
    if loc_type is None:
        return None
    t = str(loc_type).strip().lower()
    if t == "pick":
        return "pick"
    if t == "reserve":
        return "reserve"
    if t == "floor":
        return "primary"
    return None


def _primary_location_for_product(
    db: Session, tenant_id: int, warehouse_id: int, product_id: int
) -> Tuple[Optional[str], int, Optional[str]]:
    rows = (
        db.query(Location.name, Location.type, Inventory.quantity)
        .join(Inventory, Inventory.location_id == Location.id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Location.warehouse_id == int(warehouse_id),
        )
        .all()
    )
    if not rows:
        return None, 0, None
    best_name: Optional[str] = None
    best_q = 0.0
    best_loc_type: Optional[str] = None
    for name, loc_type, qty in rows:
        q = float(qty or 0)
        if q > best_q:
            best_q = q
            best_name = str(name).strip() if name is not None else None
            raw_lt = str(loc_type).strip() if loc_type is not None else ""
            best_loc_type = raw_lt if raw_lt else None
    if best_name is None:
        return None, 0, None
    hint = _location_type_to_storage_hint(best_loc_type)
    return best_name, int(best_q), hint


def _available_stock_locations_for_product(
    db: Session, tenant_id: int, warehouse_id: int, product_id: int
) -> list[WmsLineAvailableLocationRow]:
    """Wszystkie lokalizacje z dodatnim stanem — suma szt. per etykieta, sort malejąco po ilości."""
    rows = (
        db.query(Location.name, Location.type, Inventory.quantity)
        .join(Inventory, Inventory.location_id == Location.id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Location.warehouse_id == int(warehouse_id),
        )
        .all()
    )
    qty_by_name: dict[str, float] = defaultdict(float)
    type_by_name: dict[str, Optional[str]] = {}
    for name, loc_type, qty in rows:
        q = float(qty or 0)
        nm = str(name).strip() if name is not None else ""
        if q <= 1e-9 or not nm:
            continue
        qty_by_name[nm] += q
        if nm not in type_by_name:
            raw_lt = str(loc_type).strip() if loc_type is not None else ""
            type_by_name[nm] = _location_type_to_storage_hint(raw_lt) if raw_lt else None
    scored_list = [(qty_by_name[nm], nm) for nm in qty_by_name]
    scored_list.sort(key=lambda x: (-x[0], x[1]))
    out: list[WmsLineAvailableLocationRow] = []
    for qv, nm in scored_list:
        out.append(
            WmsLineAvailableLocationRow(
                location_label=nm,
                quantity=float(qv),
                storage_type=type_by_name.get(nm),
            )
        )
    return out


def _all_stock_location_labels_for_product(
    db: Session, tenant_id: int, warehouse_id: int, product_id: int
) -> list[str]:
    """Kompatybilność: same etykiety co ``_available_stock_locations_for_product``."""
    return [r.location_label for r in _available_stock_locations_for_product(db, tenant_id, warehouse_id, product_id)]


def _packing_line_from_item(
    db: Optional[Session],
    it: OrderItem,
    *,
    order: Optional[Order] = None,
    tenant_id: int,
    warehouse_id: int,
    enrich: bool,
    pack_qty_from_required: bool = False,
    last_pick_audit_summary: Optional[str] = None,
    last_pack_audit_summary: Optional[str] = None,
) -> WmsPackingOrderLine:
    from ..services.order_fulfillment_recompute import (
        line_shortage_display_kind,
        oms_line_secondary_trace_text,
        oms_replacement_new_product_name,
    )
    q_ord = int(it.quantity or 0)
    raw_packed = int(getattr(it, "packing_quantity_packed", 0) or 0)
    p = it.product
    name = str(p.name) if p is not None else "—"
    ean_v = getattr(p, "ean", None) if p is not None else None
    sku_v = getattr(p, "sku", None) if p is not None else None
    sym_v = getattr(p, "symbol", None) if p is not None else None
    img_v = getattr(p, "image_url", None) if p is not None else None
    ean_s = str(ean_v).strip() if ean_v is not None and str(ean_v).strip() else None
    sku_s = None
    if sku_v is not None and str(sku_v).strip():
        sku_s = str(sku_v).strip()
    elif sym_v is not None and str(sym_v).strip():
        sku_s = str(sym_v).strip()
    img_s = str(img_v).strip() if img_v is not None and str(img_v).strip() else None

    stock_quantity: Optional[int] = None
    location_label: Optional[str] = None
    location_storage_type: Optional[str] = None
    location_bin_qty: Optional[int] = None
    color_name: Optional[str] = None
    catalog_number: Optional[str] = None
    product_symbol: Optional[str] = None
    bundle_name: Optional[str] = None
    bundle_id: Optional[int] = None
    bundle_mode: Optional[str] = None
    bundle_component_index: Optional[int] = None
    bundle_component_count: Optional[int] = None
    is_bundle_component: bool = False
    parent_bundle_order_line_id: Optional[int] = None

    if enrich and db is not None:
        from .bundles.bundle_operational_ux_service import bundle_ux_for_order_item

        ux = bundle_ux_for_order_item(db, it)
        if ux is not None:
            bundle_id = ux.bundle_id
            bundle_mode = ux.bundle_mode
            bundle_component_index = ux.bundle_component_index
            bundle_component_count = ux.bundle_component_count
            is_bundle_component = bool(ux.is_bundle_component)
            parent_bundle_order_line_id = ux.parent_bundle_order_line_id
            if ux.bundle_name and not bundle_name:
                bundle_name = str(ux.bundle_name)

    if p is not None:
        color_name = _product_meta_color(p)
        cn = getattr(p, "catalog_number", None)
        catalog_number = str(cn).strip() if cn is not None and str(cn).strip() else None
        if sym_v is not None and str(sym_v).strip():
            product_symbol = str(sym_v).strip()
        if enrich and db is not None and int(tenant_id) > 0 and int(warehouse_id) > 0:
            pid = int(p.id)
            stock_quantity = _sum_inventory_for_product(db, tenant_id, warehouse_id, pid)
            loc, lq, loc_st = _primary_location_for_product(db, tenant_id, warehouse_id, pid)
            if loc:
                location_label = loc
            if lq > 0:
                location_bin_qty = lq
            if loc_st:
                location_storage_type = loc_st
            legacy_loc = getattr(p, "location", None)
            if not location_label and legacy_loc is not None and str(legacy_loc).strip():
                location_label = str(legacy_loc).strip()
        elif not enrich:
            legacy_loc = getattr(p, "location", None) if p is not None else None
            if legacy_loc is not None and str(legacy_loc).strip():
                location_label = str(legacy_loc).strip()

    product_signature: Optional[str] = None
    unit_price_display: Optional[str] = None
    if p is not None:
        bc = getattr(p, "barcode", None)
        if bc is not None and str(bc).strip():
            product_signature = str(bc).strip()
    raw_price = getattr(it, "unit_price", None)
    if raw_price is None and p is not None:
        raw_price = getattr(p, "sale_price", None)
    if raw_price is not None:
        try:
            unit_price_display = _format_pln_amount(float(raw_price))
        except (TypeError, ValueError):
            unit_price_display = None

    b = getattr(it, "source_bundle", None)
    if b is not None:
        bn = (getattr(b, "name", None) or "").strip()
        bundle_name = bn or None

    raw_miss = getattr(it, "wms_picking_line_missing_qty", None)
    try:
        missing_qty = float(raw_miss) if raw_miss is not None else 0.0
    except (TypeError, ValueError):
        missing_qty = 0.0
    if missing_qty < 0:
        missing_qty = 0.0

    picked_qty = 0.0
    if enrich and db is not None and order is not None:
        from ..services.fulfillment_event_service import line_picked_sum_for_order

        picked_qty = float(line_picked_sum_for_order(db, int(it.id), order))

    rep_oid = getattr(it, "replaced_from_order_item_id", None)
    ols_u = str(getattr(it, "oms_line_status", None) or "").strip().upper()

    qty_required = q_ord
    if (enrich or pack_qty_from_required) and db is not None and order is not None:
        qty_required = order_item_required_pack_qty(db, order, it)
    q_packed = min(max(0, int(qty_required)), max(0, raw_packed)) if int(qty_required) > 0 else 0

    picked_final = float(picked_qty)
    if order is not None and q_ord > 0:
        from .order_fulfillment_recompute import _oms_waiting_for_stock

        pf_o = getattr(order, "picking_finished_at", None) or getattr(order, "picked_at", None)
        removed = float(getattr(it, "oms_removed_qty", None) or 0.0)
        fulfillable = max(0.0, float(q_ord) - removed)
        substitute_pending = (rep_oid is not None and int(rep_oid) > 0) or ols_u == OMS_LINE_STATUS_TO_PICK
        # „Czeka” ≠ zebrano — nigdy nie dopychaj picked_final do fulfillable.
        if _oms_waiting_for_stock(it):
            picked_final = min(fulfillable, float(picked_qty)) if float(picked_qty) > 1e-9 else float(picked_qty)
        elif pf_o is not None:
            if missing_qty > 1e-9:
                picked_final = max(float(picked_qty), fulfillable - float(missing_qty))
            elif substitute_pending:
                picked_final = float(picked_qty)
            elif float(picked_qty) > 1e-9:
                picked_final = min(fulfillable, float(picked_qty))
            else:
                # Nie dopychaj 0 picków do fulfillable po finalize wózka —
                # niezebrane linie (dogrywka) muszą zostać widoczne jako 0.
                picked_final = float(picked_qty)
        elif float(picked_qty) > 1e-9:
            picked_final = min(fulfillable, float(picked_qty))

    pid_out = int(p.id) if p is not None else 0
    rep_name = getattr(it, "replaced_from_product_name", None)
    disp_kind = line_shortage_display_kind(it, missing_qty)
    ols_raw = getattr(it, "oms_line_status", None)
    oms_st = str(ols_raw).strip() if ols_raw is not None and str(ols_raw).strip() else None
    wpl_raw = getattr(it, "wms_picking_line_status", None)
    wpl_st = str(wpl_raw).strip() if wpl_raw is not None and str(wpl_raw).strip() else None
    trace_note: str | None = None
    rep_new_name: str | None = None
    if enrich and db is not None:
        rep_new_name = oms_replacement_new_product_name(it)
        if order is not None:
            trace_note = oms_line_secondary_trace_text(db, order, it)

    avail_locs: list[str] = []
    avail_stock: list[WmsLineAvailableLocationRow] = []
    picked_locs: list[WmsLinePickedLocationRow] = []
    if enrich and db is not None and order is not None and p is not None and int(tenant_id) > 0 and int(warehouse_id) > 0:
        avail_stock = _available_stock_locations_for_product(db, int(tenant_id), int(warehouse_id), int(p.id))
        avail_locs = [r.location_label for r in avail_stock]
        for lbl, qv, batch, exp_iso in picked_location_breakdown_for_order_line(db, order, int(it.id)):
            picked_locs.append(
                WmsLinePickedLocationRow(
                    location_label=lbl,
                    quantity=float(qv),
                    batch_number=batch or None,
                    expiry_date=exp_iso,
                )
            )

    return WmsPackingOrderLine(
        order_item_id=int(it.id),
        product_id=pid_out,
        quantity=q_ord,
        quantity_required=max(0, int(qty_required)),
        quantity_packed=q_packed,
        picked_quantity=picked_qty,
        picked_quantity_final=picked_final,
        missing_quantity=missing_qty,
        shortage_display_kind=disp_kind,
        replaced_from_order_item_id=int(rep_oid) if rep_oid is not None and int(rep_oid) > 0 else None,
        replaced_from_product_name=str(rep_name).strip() if rep_name and str(rep_name).strip() else None,
        oms_line_status=oms_st,
        oms_line_secondary_trace=trace_note,
        replacement_new_product_name=rep_new_name,
        product_name=name,
        ean=ean_s,
        sku=sku_s,
        image_url=img_s,
        stock_quantity=stock_quantity,
        location_label=location_label,
        location_storage_type=location_storage_type,
        wms_picking_line_status=wpl_st,
        location_bin_qty=location_bin_qty,
        available_location_labels=avail_locs,
        available_stock_locations=avail_stock,
        picked_locations=picked_locs,
        color_name=color_name,
        catalog_number=catalog_number,
        product_symbol=product_symbol,
        product_signature=product_signature,
        unit_price_display=unit_price_display,
        bundle_name=bundle_name,
        bundle_id=bundle_id,
        bundle_mode=bundle_mode,
        bundle_component_index=bundle_component_index,
        bundle_component_count=bundle_component_count,
        is_bundle_component=is_bundle_component,
        parent_bundle_order_line_id=parent_bundle_order_line_id,
        last_pick_audit_summary=last_pick_audit_summary,
        last_pack_audit_summary=last_pack_audit_summary,
    )


def _build_packing_order_card(
    order: Order,
    *,
    basket_code: Optional[str] = None,
    db: Optional[Session] = None,
    tenant_id: int = 0,
    warehouse_id: int = 0,
    enrich: bool = False,
    pack_qty_from_required: bool = False,
) -> WmsPackingOrderCard:
    lines_out: List[WmsPackingOrderLine] = []
    total_q = 0
    packed_q = 0
    items = sorted(order.items or [], key=lambda x: int(x.id))
    pick_summaries: dict[int, str] = {}
    pack_summaries: dict[int, str] = {}
    use_required = bool(enrich or pack_qty_from_required) and db is not None
    if enrich and db is not None:
        oi_ids = [int(it.id) for it in items if _order_item_active_for_packing(it)]
        pick_summaries = last_pick_audit_summaries_for_order_lines(db, int(order.id), oi_ids)
        pack_summaries = last_pack_audit_summaries_for_order_lines(db, int(order.id), oi_ids)
    for it in items:
        if not _order_item_active_for_packing(it):
            continue
        q_ord = int(it.quantity or 0)
        q_req = order_item_required_pack_qty(db, order, it) if use_required else q_ord
        raw_packed = int(getattr(it, "packing_quantity_packed", 0) or 0)
        q_packed = min(q_req, max(0, raw_packed)) if q_req > 0 else 0
        total_q += q_req
        packed_q += q_packed
        lines_out.append(
            _packing_line_from_item(
                db if enrich or pack_qty_from_required else None,
                it,
                order=order,
                tenant_id=tenant_id if enrich else 0,
                warehouse_id=warehouse_id if enrich else 0,
                enrich=enrich,
                pack_qty_from_required=pack_qty_from_required,
                last_pick_audit_summary=pick_summaries.get(int(it.id)),
                last_pack_audit_summary=pack_summaries.get(int(it.id)),
            )
        )
    st = order.order_ui_status
    badge: WmsPackingOrderUiStatusBadge | None = None
    if st is not None:
        gkey = _norm_group(st.main_group)
        badge = WmsPackingOrderUiStatusBadge(
            name=str(st.name),
            color=normalize_stored_color(st.color),
            main_group=cast(OrderUiMainGroup, gkey),
        )
    num = str(order.number or "").strip() or str(order.id)
    list_extras = _order_packing_list_fields(order)
    wms_timeline: List[WmsOrderTimelineEvent] = []
    wms_operation_times = None
    logistics_lines: List[str] = []
    if enrich and db is not None:
        from ..services.wms_order_fulfillment_panel_extras import build_wms_timeline_and_operation_times

        wms_timeline, wms_operation_times = build_wms_timeline_and_operation_times(db, order)
        logistics_lines = _wms_operational_logistics_lines_for_order(order)
        packed_by_label = resolve_packing_finished_operator_label(db, int(order.id))
    else:
        packed_by_label = None
    is_completed = total_q > 0 and packed_q >= total_q
    ship_name, ship_logo, _ = resolve_order_shipping_display(
        order,
        db,
        tenant_id=int(tenant_id) if tenant_id else None,
        warehouse_id=int(warehouse_id) if warehouse_id else None,
    )
    raw_sid = getattr(order, "shipping_method_id", None)
    ship_id_out = str(raw_sid).strip() if raw_sid else None
    fs_raw = getattr(order, "fulfillment_state", None)
    wms_fs_out = str(fs_raw).strip() if fs_raw is not None and str(fs_raw).strip() else None
    vehicle_out: Optional[str] = None
    cart = getattr(order, "cart", None)
    if cart is not None:
        vehicle_out = cart_display_name_for_wms(cart)
    if vehicle_out is None:
        bsk = getattr(order, "basket", None)
        if bsk is not None:
            vehicle_out = _cart_basket_display_code(bsk)
    if vehicle_out is None and basket_code:
        vehicle_out = str(basket_code).strip() or None
    wms_phase = compute_wms_workflow_phase(order, db=db)
    cid_out = int(order.cart_id) if getattr(order, "cart_id", None) is not None and int(order.cart_id) > 0 else None
    pfin = getattr(order, "picking_finished_at", None) or getattr(order, "picked_at", None)
    pks = getattr(order, "packing_started_at", None)
    pkf = getattr(order, "packed_at", None)
    pka = getattr(order, "wms_packing_automation_finished_at", None)
    packaging_suggestions: List[PackagingSuggestionOut] = []
    primary_packaging_suggestion: PackagingSuggestionOut | None = None
    packaging_alternatives: List[PackagingSuggestionOut] = []
    packaging_fit_plan = None
    recommended_carton_id: Optional[str] = None
    if enrich and db is not None and int(tenant_id) > 0 and int(warehouse_id) > 0:
        try:
            packaging_suggestions, primary_packaging_suggestion, packaging_alternatives, packaging_fit_plan = (
                build_packaging_suggestions_for_order(
                    db,
                    order,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                )
            )
            recommended_carton_id = (
                packaging_fit_plan.recommended_packaging
                if packaging_fit_plan is not None
                else (primary_packaging_suggestion.suggested_package_id if primary_packaging_suggestion else None)
            )
        except Exception:
            logger.exception("build_packaging_suggestions_for_order order_id=%s", getattr(order, "id", None))
            packaging_suggestions = []
            primary_packaging_suggestion = None
            packaging_alternatives = []
            packaging_fit_plan = None
            recommended_carton_id = None
    selected_carton_id: Optional[str] = None
    selected_carton: Optional[WmsPackingRecommendedCarton] = None
    operational_notes_brief: List[WmsOperationalNoteBrief] = []
    alert_title: Optional[str] = None
    if enrich and db is not None:
        sr = getattr(order, "selected_carton_id", None)
        selected_carton_id = str(sr).strip() if sr else None
        selected_carton = _selected_carton_summary_for_order(db, order)
        from ..models.order_operational_note import OrderOperationalNote

        pack_notes = (
            db.query(OrderOperationalNote)
            .filter(OrderOperationalNote.order_id == int(order.id))
            .order_by(
                desc(func.coalesce(OrderOperationalNote.updated_at, OrderOperationalNote.created_at)),
                desc(OrderOperationalNote.id),
            )
            .all()
        )
        operational_notes_brief = [
            WmsOperationalNoteBrief(
                id=int(n.id),
                content=str(n.content or ""),
                priority=int(n.priority) if getattr(n, "priority", None) is not None else None,
                color_tag=(str(getattr(n, "color_tag", "") or "").strip() or None),
                show_in_picking=bool(getattr(n, "show_in_picking", False)),
                show_in_packing=bool(getattr(n, "show_in_packing", False)),
                show_in_returns=bool(getattr(n, "show_in_returns", False)),
                show_in_complaints=bool(getattr(n, "show_in_complaints", False)),
            )
            for n in pack_notes
        ]
        alert_title = (
            "UWAGA PAKOWANIE"
            if any(bool(getattr(n, "show_in_packing", False)) for n in pack_notes)
            else None
        )
    bundle_trees_out: List[WmsPackingBundleTreeNode] = []
    if enrich and db is not None:
        from .bundles.bundle_operational_ux_service import build_packing_bundle_trees

        for raw in build_packing_bundle_trees(db, order=order, active_lines=lines_out):
            bundle_trees_out.append(
                WmsPackingBundleTreeNode(
                    bundle_id=int(raw["bundle_id"]),
                    bundle_name=str(raw["bundle_name"]),
                    bundle_mode=str(raw["bundle_mode"]),
                    parent_order_line_id=int(raw["parent_order_line_id"]),
                    components_total=int(raw["components_total"]),
                    components_packed=int(raw["components_packed"]),
                    is_complete=bool(raw["is_complete"]),
                    components=[
                        WmsPackingBundleComponentNode(
                            order_item_id=int(c["order_item_id"]),
                            product_id=int(c["product_id"]),
                            product_name=str(c["product_name"]),
                            quantity_required=int(c["quantity_required"]),
                            quantity_packed=int(c["quantity_packed"]),
                            bundle_component_index=int(c["bundle_component_index"]),
                            is_packed=bool(c["is_packed"]),
                        )
                        for c in raw["components"]
                    ],
                )
            )
    return WmsPackingOrderCard(
        order_id=int(order.id),
        number=num,
        packed_quantity=packed_q,
        total_quantity=total_q,
        is_completed=is_completed,
        order_ui_status=badge,
        shipping_method=ship_name,
        shipping_method_logo_url=ship_logo,
        shipping_method_id=ship_id_out,
        lines=lines_out,
        bundle_trees=bundle_trees_out,
        basket_code=basket_code,
        wms_timeline=wms_timeline,
        wms_operation_times=wms_operation_times,
        timeline=wms_timeline,
        operation_times=wms_operation_times,
        wms_fulfillment_state=wms_fs_out,
        wms_vehicle_label=vehicle_out,
        wms_operational_logistics_lines=logistics_lines,
        wms_workflow_phase=wms_phase,
        wms_cart_id=cid_out,
        wms_picking_finished_at=pfin,
        wms_packing_started_at=pks,
        wms_packing_finished_at=pkf,
        wms_packing_automation_finished_at=pka,
        packed_by_label=packed_by_label,
        packaging_suggestions=packaging_suggestions,
        primary_packaging_suggestion=primary_packaging_suggestion,
        packaging_alternatives=packaging_alternatives,
        packaging_fit_plan=packaging_fit_plan,
        recommended_carton_id=recommended_carton_id,
        selected_carton_id=selected_carton_id,
        selected_carton=selected_carton,
        operational_notes_packing=operational_notes_brief,
        wms_operational_alert_title=alert_title,
        **list_extras,
    )


def _first_open_packing_line(card: WmsPackingOrderCard) -> Optional[WmsPackingOrderLine]:
    for line in sorted(card.lines, key=lambda x: int(x.order_item_id)):
        req = int(getattr(line, "quantity_required", None) or line.quantity or 0)
        if int(line.quantity_packed) < req:
            return line
    return None


def packing_resolve_and_scan_ean(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    ean_raw: str,
    operator_user_id: Optional[int] = None,
    handoff_scope: str | None = None,
    order_id: int | None = None,
) -> WmsPackingScanOut:
    """
    Atomowo: scoped wybór zamówienia z EAN + jeden increment packed qty.
    Wymaga jawnego scope (CART / BASKET / CARTLESS) — bez globalnego FIFO.
    """
    from .picking_handoff_service import HANDOFF_BASKET, HANDOFF_CART, HANDOFF_CARTLESS, normalize_handoff_mode

    scope = normalize_handoff_mode(handoff_scope) if handoff_scope else None
    if scope is None:
        # Infer from legacy mode only when unambiguous
        m = (mode or "").strip().lower()
        if m == "bulk":
            scope = HANDOFF_CART
        elif m == "baskets" and order_id is not None and int(order_id) > 0:
            scope = HANDOFF_BASKET
        elif m == "no_cart":
            scope = HANDOFF_CARTLESS
        elif m == "all":
            # Pełna kolejka statusu: znajdź zamówienie, scope z handoff zamówienia.
            oid_probe = find_first_packing_order_id_for_ean(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                status_id=status_id,
                mode="all",
                cart_id=None,
                ean_raw=ean_raw,
            )
            if oid_probe is None:
                raise PackingScanError("PRODUCT_NOT_FOUND")
            order_row = db.query(Order).filter(Order.id == int(oid_probe)).first()
            hm = (
                normalize_handoff_mode(getattr(order_row, "picking_handoff_mode", None))
                if order_row is not None
                else None
            )
            if hm == HANDOFF_CART:
                scope = HANDOFF_CART
                cid = getattr(order_row, "cart_id", None) if order_row is not None else None
                if cid is None or int(cid) < 1:
                    raise PackingScanError(
                        "SCOPE_REQUIRED",
                        message="Zamówienie CART bez wózka — nie można spakować ze skanu listy.",
                    )
                cart_id = int(cid)
            elif hm == HANDOFF_BASKET:
                scope = HANDOFF_BASKET
                order_id = int(oid_probe)
                cid = getattr(order_row, "cart_id", None) if order_row is not None else None
                if cid is not None and int(cid) > 0:
                    cart_id = int(cid)
            elif hm == HANDOFF_CARTLESS:
                scope = HANDOFF_CARTLESS
            else:
                # Legacy NULL handoff: pack in mode=all — never invent CARTLESS / no_cart.
                return packing_scan_increment(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    status_id=status_id,
                    mode="all",
                    cart_id=None,
                    order_id=int(oid_probe),
                    ean_raw=ean_raw,
                    operator_user_id=operator_user_id,
                )
        else:
            raise PackingScanError("SCOPE_REQUIRED", message="handoff_scope required (CART|BASKET|CARTLESS)")

    if scope == HANDOFF_CART:
        if cart_id is None or int(cart_id) < 1:
            raise PackingScanError("SCOPE_REQUIRED", message="cart_id required for CART scope")
        oid = find_first_packing_order_id_for_ean(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status_id,
            mode="bulk",
            cart_id=int(cart_id),
            ean_raw=ean_raw,
        )
    elif scope == HANDOFF_BASKET:
        if order_id is None or int(order_id) < 1:
            raise PackingScanError("SCOPE_REQUIRED", message="order_id required for BASKET scope")
        # Exact order only — no FIFO across baskets
        detail = get_packing_order_detail_for_queue(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status_id,
            mode="baskets",
            cart_id=cart_id,
            order_id=int(order_id),
        )
        if detail is None:
            raise PackingScanError("ORDER_NOT_IN_QUEUE")
        order_row = db.query(Order).filter(Order.id == int(order_id)).first()
        if order_row is None or normalize_handoff_mode(getattr(order_row, "picking_handoff_mode", None)) != HANDOFF_BASKET:
            raise PackingScanError("ORDER_NOT_IN_QUEUE")
        oid = int(order_id)
        # Verify EAN belongs to this order with remaining qty via packing_scan_increment
    elif scope == HANDOFF_CARTLESS:
        oid = find_first_packing_order_id_for_ean(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status_id,
            mode="no_cart",
            cart_id=None,
            ean_raw=ean_raw,
        )
    else:
        raise PackingScanError("SCOPE_REQUIRED")

    if oid is None:
        raise PackingScanError("PRODUCT_NOT_FOUND")
    return packing_scan_increment(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode if (mode or "").strip().lower() in ("no_cart", "bulk", "baskets") else (
            "bulk" if scope == HANDOFF_CART else "baskets" if scope == HANDOFF_BASKET else "no_cart"
        ),
        cart_id=cart_id if scope == HANDOFF_CART else (cart_id if scope == HANDOFF_BASKET else None),
        order_id=int(oid),
        ean_raw=ean_raw,
        operator_user_id=operator_user_id,
    )


def _carton_row_to_recommended(row: Carton, *, is_best: bool) -> WmsPackingRecommendedCarton:
    img = getattr(row, "image_url", None)
    ean_raw = getattr(row, "ean", None)
    sku_raw = getattr(row, "sku", None)
    ean = str(ean_raw).strip() if ean_raw is not None and str(ean_raw).strip() else None
    sku = str(sku_raw).strip() if sku_raw is not None and str(sku_raw).strip() else None
    barcode = ean or sku or str(row.id)
    return WmsPackingRecommendedCarton(
        id=str(row.id),
        name=str(row.name or "").strip(),
        dimensions=(
            f"{float(row.length_cm):g}×{float(row.width_cm):g}×{float(row.height_cm):g} cm"
            if row.length_cm is not None and row.width_cm is not None and row.height_cm is not None
            else ""
        ),
        image_url=(str(img).strip() if img else None) or None,
        is_best=is_best,
        barcode=barcode,
        ean=ean,
    )


def suggestions_to_recommended_cartons(
    suggestions: List[PackagingSuggestionOut],
    *,
    limit: int = 3,
) -> List[WmsPackingRecommendedCarton]:
    """UI pakowania: pierwsze propozycje silnika jako lista kartonów (z fit enrichment)."""
    lim = max(2, min(int(limit), 6))
    out: List[WmsPackingRecommendedCarton] = []
    for i, s in enumerate(suggestions[:lim]):
        warns: list[str] = []
        if s.fit_confidence == "ESTIMATED":
            warns.append("Dopasowanie szacunkowe.")
        if s.reject_reason_label:
            warns.append(s.reject_reason_label)
        pid = str(s.suggested_package_id)
        out.append(
            WmsPackingRecommendedCarton(
                id=pid,
                name=str(s.package_name or "").strip(),
                dimensions=str(s.package_dimensions or "").strip(),
                image_url=s.image_url,
                is_best=bool(s.is_recommended) or (i == 0 and s.fit_status != "REJECTED"),
                barcode=pid,
                usable_dimensions=s.usable_dimensions,
                fill_percentage=s.fill_percentage,
                total_weight_kg=s.total_weight_kg,
                max_payload_kg=s.max_payload_kg,
                fit_status=s.fit_status,
                fit_confidence=s.fit_confidence,
                reject_reason_label=s.reject_reason_label,
                warnings=warns,
            )
        )
    return out


FINISH_WITHOUT_CARTON_PERM = "finish_without_carton"


def list_shipping_compatible_cartons_for_packing(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    shipping_method_id: Optional[str],
) -> List[WmsPackingRecommendedCarton]:
    """Kartony przypisane do metody wysyłki (link); przy braku ``shipping_method_id`` — wszystkie aktywne w magazynie."""
    q = db.query(Carton).filter(
        Carton.tenant_id == int(tenant_id),
        Carton.warehouse_id == int(warehouse_id),
        Carton.is_active.is_(True),
    )
    sid = (shipping_method_id or "").strip()
    if sid:
        q = q.join(carton_shipping_method_links, Carton.id == carton_shipping_method_links.c.carton_id).filter(
            carton_shipping_method_links.c.shipping_method_id == sid
        )
    rows = q.order_by(Carton.name.asc()).all()
    return [_carton_row_to_recommended(r, is_best=(i == 0)) for i, r in enumerate(rows)]


def _user_allow_finish_without_carton(db: Session, user: Optional[AppUser]) -> bool:
    if user is None:
        return False
    if is_super_role(getattr(user, "role", None)):
        return True
    row = db.query(UserWmsProfile).filter(UserWmsProfile.user_id == int(user.id)).first()
    if row is None or not row.packing_permissions_json:
        return False
    try:
        arr = json.loads(row.packing_permissions_json)
    except json.JSONDecodeError:
        return False
    if not isinstance(arr, list):
        return False
    tags = {str(x).strip() for x in arr if x is not None and str(x).strip()}
    return FINISH_WITHOUT_CARTON_PERM in tags


def list_mock_recommended_cartons_for_packing(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    limit: int = 3,
) -> List[WmsPackingRecommendedCarton]:
    """Tymczasowa logika: 2–3 aktywne kartony z magazynu (pierwszy = is_best)."""
    lim = max(2, min(int(limit), 3))
    rows = (
        db.query(Carton)
        .filter(
            Carton.tenant_id == int(tenant_id),
            Carton.warehouse_id == int(warehouse_id),
            Carton.is_active.is_(True),
        )
        .order_by(Carton.name.asc())
        .limit(lim)
        .all()
    )
    return [_carton_row_to_recommended(r, is_best=(i == 0)) for i, r in enumerate(rows)]


def _selected_carton_summary_for_order(db: Session, order: Order) -> Optional[WmsPackingRecommendedCarton]:
    raw = getattr(order, "selected_carton_id", None)
    cid = str(raw).strip() if raw else ""
    if not cid:
        return None
    row = (
        db.query(Carton)
        .filter(
            Carton.id == cid,
            Carton.tenant_id == int(order.tenant_id),
            Carton.warehouse_id == int(order.warehouse_id),
        )
        .first()
    )
    if row is None:
        return None
    return _carton_row_to_recommended(row, is_best=False)


def apply_order_selected_carton(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    carton_id: str,
    operator_user_id: Optional[int] = None,
    warehouse_id: int | None = None,
    status_id: int | None = None,
    mode: str | None = None,
    cart_id: int | None = None,
    confirm_override: bool = False,
    recommended_carton_id: str | None = None,
) -> OrderSelectCartonResponse:
    """
    Ustawia ``orders.selected_carton_id``.

    WMS packing wymaga pełnego scope (warehouse + status + mode + cart_id) —
    ten sam kanoniczny filtr co scan/finish.
    Physical NO FIT → warning; block until confirm_override unless eligible.
    """
    cid = (carton_id or "").strip()
    if not cid:
        raise ValueError("EMPTY_CARTON_ID")

    if (
        warehouse_id is None
        or status_id is None
        or not (mode or "").strip()
    ):
        raise ValueError("PACKING_SCOPE_REQUIRED")

    order = (
        _packing_orders_base_query(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            status_id=int(status_id),
            mode=str(mode).strip().lower(),
            cart_id=int(cart_id) if cart_id is not None and int(cart_id) > 0 else None,
        )
        .filter(Order.id == int(order_id))
        .first()
    )
    if order is None:
        raise ValueError("ORDER_NOT_IN_QUEUE")

    prev_carton = getattr(order, "selected_carton_id", None)
    prev_s = str(prev_carton).strip() if prev_carton else ""
    row = (
        db.query(Carton)
        .filter(
            Carton.id == cid,
            Carton.tenant_id == int(order.tenant_id),
            Carton.warehouse_id == int(order.warehouse_id),
            Carton.is_active.is_(True),
        )
        .first()
    )
    if row is None:
        raise ValueError("INVALID_CARTON")

    # Physical fit check (gate warning — does not mutate until confirmed if rejected)
    physical_ok = True
    warning = None
    override_code = None
    rec_id = (recommended_carton_id or "").strip() or None
    try:
        from .packaging_engine.cartonization_solver import items_from_order, try_fit_order_in_carton
        from .fit_engine.adapters import fit_container_from_carton
        from .packaging_engine.presentation import map_reject_reason_to_operator

        items = items_from_order(order)
        container = fit_container_from_carton(row)
        ok, reason, _ = try_fit_order_in_carton(container, items) if items else (True, None, None)
        if items and not ok:
            physical_ok = False
            override_code = str(reason or "GEOMETRIC_PACKING_FAILED")
            warning = map_reject_reason_to_operator(override_code)
            if not confirm_override:
                summ = _carton_row_to_recommended(row, is_best=False)
                return OrderSelectCartonResponse(
                    selected_carton_id=prev_s or None,
                    selected_carton=_selected_carton_summary_for_order(db, order),
                    recommended_carton_id=rec_id,
                    was_overridden=False,
                    physical_fit_ok=False,
                    physical_fit_warning=warning,
                    override_reason_code=override_code,
                    requires_override_confirmation=True,
                )
    except Exception:
        logger.exception("physical fit check on select-carton order_id=%s", order_id)

    order.selected_carton_id = cid
    db.add(order)
    if prev_s != cid:
        emit_wms_carton_selected_or_changed(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order_id),
            operator_user_id=operator_user_id,
            old_carton_id=prev_s if prev_s else None,
            new_carton_id=cid,
        )
    db.commit()
    summ = _carton_row_to_recommended(row, is_best=False)
    return OrderSelectCartonResponse(
        selected_carton_id=cid,
        selected_carton=summ,
        recommended_carton_id=rec_id,
        was_overridden=bool(not physical_ok and confirm_override),
        physical_fit_ok=physical_ok,
        physical_fit_warning=warning if not physical_ok else None,
        override_reason_code=override_code if not physical_ok else None,
        requires_override_confirmation=False,
    )


def _packing_queue_index_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    order_id: int,
) -> Tuple[int, int]:
    q = _packing_orders_base_query(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
    )
    q = q.order_by(Order.order_date.desc().nullslast(), Order.id.desc())
    rows = q.with_entities(Order.id).limit(2000).all()
    ids = [int(r[0]) for r in rows]
    total = len(ids)
    try:
        idx = ids.index(int(order_id)) + 1
    except ValueError:
        idx = 1
    return idx, max(total, 1)


def build_packing_order_detail_out(
    db: Session,
    order: Order,
    *,
    mode: Optional[str] = None,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    cart_id: int | None,
) -> WmsPackingOrderDetailOut:
    m = (mode or "").strip().lower()
    bc = _basket_code_for_order(order) if m == "baskets" else None
    card = _build_packing_order_card(
        order,
        basket_code=bc,
        db=db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        enrich=True,
    )
    q_idx, q_tot = _packing_queue_index_for_order(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=m or "no_cart",
        cart_id=cart_id,
        order_id=int(order.id),
    )
    customer_name = _packing_customer_name_from_order(order)
    customer_phone = _packing_customer_phone_from_order(order)
    customer_nip = _packing_customer_nip_from_order(order)
    shipping_address_raw = _format_shipping_address_block(order)
    shipping_address = "" if shipping_address_raw in ("", "—") else shipping_address_raw
    ship_name, _, __ = resolve_order_shipping_display(
        order,
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    payment_label: Optional[str] = None
    val = getattr(order, "value", None)
    if val is not None:
        try:
            cur = (getattr(order, "currency", None) or "").strip() or ""
            payment_label = f"{float(val):.2f} {cur}".strip()
        except (TypeError, ValueError):
            payment_label = None

    meta = _order_import_meta(order)
    order_value_display: Optional[str] = None
    if val is not None:
        try:
            order_value_display = _format_pln_amount(float(val))
        except (TypeError, ValueError):
            order_value_display = None

    shipping_fee_display: Optional[str] = None
    for key in ("shipping_price", "koszt_dostawy", "delivery_cost", "delivery_price"):
        raw = meta.get(key)
        if raw is not None and str(raw).strip():
            try:
                shipping_fee_display = f"({float(raw):.2f} dostawa)".replace(".", ",")
            except (TypeError, ValueError):
                shipping_fee_display = f"({str(raw).strip()} dostawa)"
            break
    if shipping_fee_display is None:
        shipping_fee_display = "(0,00 dostawa)"

    payment_method_text: Optional[str] = None
    for key in ("payment_method", "metoda_platnosci", "payment", "sposób płatności", "sposob platnosci"):
        raw = meta.get(key)
        if raw is not None and str(raw).strip():
            payment_method_text = str(raw).strip()
            break

    pickup_point: Optional[bool] = None
    pp = meta.get("pickup_point")
    if isinstance(pp, bool):
        pickup_point = pp
    elif pp is not None and str(pp).strip():
        pickup_point = str(pp).strip().lower() in ("1", "true", "tak", "yes")

    waybill_count = 1
    wc = meta.get("waybill_count") or meta.get("listy_przewozowe")
    if wc is not None:
        try:
            waybill_count = max(1, int(float(wc)))
        except (TypeError, ValueError):
            waybill_count = 1

    cart_display_code: Optional[str] = None
    cart = getattr(order, "cart", None)
    if cart is not None:
        cart_display_code = cart_display_name_for_wms(cart)

    cur_line = _first_open_packing_line(card)
    recommended = (
        suggestions_to_recommended_cartons(card.packaging_suggestions, limit=3)
        if card.packaging_suggestions
        else list_mock_recommended_cartons_for_packing(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), limit=3
        )
    )
    shipping_compatible = list_shipping_compatible_cartons_for_packing(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        shipping_method_id=card.shipping_method_id,
    )
    return WmsPackingOrderDetailOut(
        **card.model_dump(),
        customer_name=customer_name,
        shipping_address=shipping_address,
        customer_nip=customer_nip,
        customer_phone=customer_phone,
        shipping_method_name=ship_name,
        payment_label=payment_label,
        current_line=cur_line,
        queue_index=q_idx,
        queue_total=q_tot,
        order_value_display=order_value_display,
        shipping_fee_display=shipping_fee_display,
        payment_method_text=payment_method_text,
        pickup_point=pickup_point,
        waybill_count=waybill_count,
        cart_display_code=cart_display_code,
        recommended_cartons=recommended,
        shipping_compatible_cartons=shipping_compatible,
    )


def find_first_packing_order_id_for_ean(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    ean_raw: str,
) -> Optional[int]:
    resolved = resolve_receiving_scan(db, int(tenant_id), ean_raw)
    if not resolved.found or resolved.product_id is None:
        return None
    pid = int(resolved.product_id)
    q = _packing_orders_base_query(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
    )
    not_replaced = func.upper(func.coalesce(OrderItem.oms_line_status, "")) != "REPLACED"
    q = (
        q.join(OrderItem, OrderItem.order_id == Order.id)
        .filter(OrderItem.product_id == pid)
        .filter(OrderItem.quantity > 0)
        .filter(not_replaced)
        .filter(OrderItem.quantity > func.coalesce(OrderItem.packing_quantity_packed, 0))
    )
    q = q.order_by(Order.created_at.asc().nulls_last(), Order.id.asc())
    row = q.first()
    return int(row.id) if row is not None else None


def _order_allows_packing_detail_outside_queue(db: Session, order: Order) -> bool:
    """Ponowne otwarcie już spakowanego / zfinalizowanego zamówienia z listy (poza aktywną kolejką)."""
    if getattr(order, "deleted_at", None) is not None:
        return False
    if getattr(order, "wms_packing_automation_finished_at", None) is not None:
        return True
    if getattr(order, "packed_at", None) is not None:
        return True
    fs = str(getattr(order, "fulfillment_state", None) or "").strip().upper()
    if fs in {"PACKED", "SHIPPED", "COMPLETED", "DONE"}:
        return True
    try:
        return _is_order_fully_packed_db(db, int(order.id))
    except Exception:
        return False


def get_packing_order_detail_for_queue(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    order_id: int,
) -> Optional[WmsPackingOrderDetailOut]:
    q = _packing_orders_base_query(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
    ).filter(Order.id == int(order_id))
    load_opts = (
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.items).joinedload(OrderItem.source_bundle),
        joinedload(Order.order_ui_status),
        joinedload(Order.shipping_method_row),
        joinedload(Order.basket),
        joinedload(Order.cart),
    )
    order = q.options(*load_opts).first()
    if order is None:
        order = (
            db.query(Order)
            .filter(
                Order.id == int(order_id),
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
            )
            .options(*load_opts)
            .first()
        )
        if order is None or not _order_allows_packing_detail_outside_queue(db, order):
            return None
    return build_packing_order_detail_out(
        db,
        order,
        mode=mode,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        cart_id=cart_id,
    )


def acknowledge_packing_reopen(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: Optional[int],
) -> None:
    """Zapis logu po świadomym akceptowaniu ostrzeżenia o wcześniej spakowanym zamówieniu."""
    order = (
        db.query(Order)
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if order is None:
        raise ValueError("ORDER_NOT_FOUND")
    emit_wms_packing_reopen_acknowledged(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order=order,
        operator_user_id=operator_user_id,
    )
    db.commit()


def resolve_packed_order_ui_status_id(db: Session, *, tenant_id: int, warehouse_id: int) -> Optional[int]:
    rows = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
            OrderUiStatus.main_group == "DONE",
        )
        .order_by(OrderUiStatus.sort_order.asc(), OrderUiStatus.id.asc())
        .all()
    )
    if not rows:
        return None
    preferred = ("packed", "spakowane", "wysłane", "wyslane", "shipped", "dostarczone")
    for st in rows:
        n = (st.name or "").strip().lower()
        if n in preferred or any(p in n for p in ("spakow", "packed", "wysł", "wysl")):
            return int(st.id)
    return int(rows[0].id)


def _order_has_pending_packing_lines(db: Session, order: Order) -> bool:
    for it in order.items or []:
        if not _order_item_active_for_packing(it):
            continue
        required = order_item_required_pack_qty(db, order, it)
        qp = int(getattr(it, "packing_quantity_packed", 0) or 0)
        if qp < required:
            return True
    return False


def _is_order_fully_packed_db(db: Session, order_id: int) -> bool:
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == int(order_id))
        .first()
    )
    if order is None:
        return False
    snap = _packing_finish_validation_snapshot(db, order, log=False)
    return bool(snap["lines_packed_complete"])


def _load_order_for_packing_mutation(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    order_id: int,
) -> Optional[Order]:
    q = _packing_orders_base_query(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
    ).filter(Order.id == int(order_id))
    return (
        q.options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.items).joinedload(OrderItem.source_bundle),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
            joinedload(Order.basket),
            joinedload(Order.cart),
        ).first()
    )


def _packing_build_scan_out_after_commit(
    db: Session,
    *,
    order_id: int,
    order_fallback: Order,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    fully_packed: bool,
    next_order_id: Optional[int],
    last_packed_order_item_id: Optional[int],
    post_pack_pipeline: Optional[List[WmsPackingPostPackStepResult]],
    packing_after_finish_action: Optional[str] = None,
) -> WmsPackingScanOut:
    order2 = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.items).joinedload(OrderItem.source_bundle),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
            joinedload(Order.basket),
            joinedload(Order.cart),
        )
        .filter(Order.id == int(order_id))
        .first()
    )
    src = order2 if order2 is not None else order_fallback
    detail = build_packing_order_detail_out(
        db,
        src,
        mode=mode,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        cart_id=cart_id,
    )
    action_out: str | None = None
    if packing_after_finish_action is not None:
        u = str(packing_after_finish_action).strip().upper()
        if u == "GO_TO_LIST":
            action_out = "GO_TO_LIST"
        elif u == "NEXT_ORDER":
            action_out = "NEXT_ORDER"
        else:
            action_out = "STAY"
    return WmsPackingScanOut(
        detail=detail,
        fully_packed=fully_packed,
        packing_after_finish_action=action_out,
        next_order_id=next_order_id,
        last_packed_order_item_id=last_packed_order_item_id,
        post_pack_pipeline=post_pack_pipeline,
    )


def _touch_order_wms_packing_timestamps(order: Order, *, fully_packed: bool) -> None:
    """Ustaw ``packing_started_at`` / ``packed_at`` przy pierwszej akcji pakowania i przy domknięciu — bez nadpisywania."""
    now = datetime.utcnow()
    packed_sum = 0
    for it in order.items or []:
        if not _order_item_active_for_packing(it):
            continue
        qp = int(getattr(it, "packing_quantity_packed", 0) or 0)
        packed_sum += qp
    if packed_sum > 0 and getattr(order, "packing_started_at", None) is None:
        order.packing_started_at = now
    if fully_packed and getattr(order, "packed_at", None) is None:
        order.packed_at = now


def _finalize_after_packing_mutations(
    db: Session,
    *,
    order: Order,
    order_id: int,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    last_packed_order_item_id: Optional[int],
    operator_user_id: Optional[int] = None,
    packed_audits: Optional[List[Tuple[int, int, int, Optional[str]]]] = None,
) -> WmsPackingScanOut:
    """
    Zapis ilości spakowanych + commit. **Bez** potoku dokumentów / statusu — to wyłącznie ``packing_finish_order``.
    """
    packing_started_before = getattr(order, "packing_started_at", None)
    packed_before = getattr(order, "packed_at", None)
    db.flush()
    fully = _is_order_fully_packed_db(db, int(order_id))
    _touch_order_wms_packing_timestamps(order, fully_packed=fully)
    queue_meta = {
        "mode": mode,
        "cart_id": cart_id,
        "status_id": status_id,
    }
    if getattr(order, "packing_started_at", None) is not None and packing_started_before is None:
        emit_wms_packing_started(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order=order,
            operator_user_id=operator_user_id,
            queue_meta=queue_meta,
        )
    audits = packed_audits or []
    for oi_id, pid, dq, sku in audits:
        if int(dq) > 0:
            emit_wms_packed_item(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order=order,
                product_id=int(pid),
                order_item_id=int(oi_id),
                quantity=int(dq),
                operator_user_id=operator_user_id,
                sku=sku,
                queue_meta=queue_meta,
            )
    packed_after = getattr(order, "packed_at", None)
    if packed_before is None and packed_after is not None:
        emit_wms_packing_finished(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order=order,
            operator_user_id=operator_user_id,
        )
    next_id: Optional[int] = None
    if fully:
        next_id = find_next_fifo_packing_order_id(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status_id,
            mode=mode,
            cart_id=cart_id,
            exclude_order_id=int(order_id),
        )
    db.commit()
    return _packing_build_scan_out_after_commit(
        db,
        order_id=int(order_id),
        order_fallback=order,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        fully_packed=fully,
        next_order_id=next_id,
        last_packed_order_item_id=last_packed_order_item_id,
        post_pack_pipeline=None,
        packing_after_finish_action=None,
    )


def _load_order_for_packing_finish_retry(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> Optional[Order]:
    """Idempotent retry: order already left packing queue after successful finish."""
    return (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.items).joinedload(OrderItem.source_bundle),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
            joinedload(Order.basket),
            joinedload(Order.cart),
        )
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
        )
        .first()
    )


def _finish_mode_compatible_with_order(
    order: Order,
    *,
    mode: str,
    cart_id: int | None,
) -> bool:
    """
    Soft scope check for finish when order left the active packing queue mid-session
    (e.g. status / fulfillment drift after lines are fully packed).
    """
    from .picking_handoff_service import HANDOFF_BASKET, HANDOFF_CART, HANDOFF_CARTLESS, normalize_handoff_mode

    m = (mode or "").strip().lower()
    if m == "all":
        return True
    hm = normalize_handoff_mode(getattr(order, "picking_handoff_mode", None))
    ocid = getattr(order, "cart_id", None)
    if m == "no_cart":
        if ocid is not None and int(ocid) > 0:
            return False
        # CARTLESS + legacy NULL handoff without cart (list „all” often maps to no_cart in UI).
        return hm in (HANDOFF_CARTLESS, None)
    if m == "bulk":
        if hm != HANDOFF_CART:
            return False
        if cart_id is not None and int(cart_id) > 0 and ocid is not None and int(ocid) > 0:
            return int(cart_id) == int(ocid)
        return True
    if m == "baskets":
        return hm == HANDOFF_BASKET
    if m == "shelf":
        return hm is None and (ocid is None or int(ocid) < 1)
    return False


def _load_order_for_packing_finish(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    order_id: int,
) -> tuple[Order, bool]:
    """
    Load order for finish.

    Returns ``(order, idempotent_replay)``.
    Prefer active queue; if missing, allow finish for fully packed orders still in the
    same warehouse when mode is compatible (detail can already open outside queue).
    """
    order = _load_order_for_packing_mutation(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        order_id=order_id,
    )
    if order is not None:
        return order, False

    order = _load_order_for_packing_finish_retry(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=order_id,
    )
    if order is None:
        raise PackingScanError(
            "ORDER_NOT_IN_QUEUE",
            message=(
                "Nie można sfinalizować tego zamówienia. "
                "Zamówienie nie zostało znalezione w tym magazynie."
            ),
        )
    if getattr(order, "wms_packing_automation_finished_at", None):
        return order, True

    if not _is_order_fully_packed_db(db, int(order.id)):
        _packing_finish_trace(
            stage="scope_miss",
            order=order,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            mode=mode,
            cart_id=cart_id,
            failure_code="ORDER_NOT_IN_QUEUE",
            failure_detail="order not in packing scope and not fully packed",
        )
        raise PackingScanError(
            "ORDER_NOT_IN_QUEUE",
            message=(
                "Nie można sfinalizować tego zamówienia. "
                "Zamówienie nie znajduje się już w kolejce pakowania."
            ),
        )

    if not _finish_mode_compatible_with_order(order, mode=mode, cart_id=cart_id):
        _packing_finish_trace(
            stage="scope_miss",
            order=order,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            mode=mode,
            cart_id=cart_id,
            failure_code="ORDER_NOT_IN_QUEUE",
            failure_detail="fully packed but finish mode incompatible",
        )
        raise PackingScanError(
            "ORDER_NOT_IN_QUEUE",
            message=(
                "Nie można sfinalizować tego zamówienia w wybranym trybie pakowania. "
                "Wróć do listy i otwórz zamówienie ponownie."
            ),
        )

    _packing_finish_trace(
        stage="scope_fallback_fully_packed",
        order=order,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        mode=mode,
        cart_id=cart_id,
        failure_detail="active queue miss; finish allowed for fully packed order",
    )
    return order, False


def _packing_finish_trace(
    *,
    stage: str,
    order: Order | None,
    tenant_id: int,
    warehouse_id: int,
    mode: str,
    cart_id: int | None,
    failure_code: str | None = None,
    failure_detail: str | None = None,
    extra: dict | None = None,
) -> None:
    handoff = None
    oid = None
    order_cart_id = None
    order_basket_id = None
    packing_finished_at = None
    automation_finished_at = None
    selected_carton = None
    order_number = None
    order_ui_status = None
    fulfillment_state = None
    if order is not None:
        oid = int(order.id)
        order_number = _order_business_number(order)
        handoff = getattr(order, "picking_handoff_mode", None)
        order_cart_id = getattr(order, "cart_id", None)
        order_basket_id = getattr(order, "basket_id", None)
        packing_finished_at = getattr(order, "wms_packing_finished_at", None)
        automation_finished_at = getattr(order, "wms_packing_automation_finished_at", None)
        raw_c = getattr(order, "selected_carton_id", None)
        selected_carton = str(raw_c).strip() if raw_c else None
        st = getattr(order, "order_ui_status", None)
        order_ui_status = str(getattr(st, "name", None) or getattr(order, "order_ui_status_id", "") or "") or None
        fulfillment_state = str(getattr(order, "fulfillment_state", None) or "") or None
    payload = {
        "stage": stage,
        "order_id": oid,
        "order_number": order_number,
        "order_ui_status": order_ui_status,
        "fulfillment_state": fulfillment_state,
        "tenant_id": int(tenant_id),
        "warehouse_id": int(warehouse_id),
        "mode": mode,
        "handoff_mode": handoff,
        "request_cart_id": int(cart_id) if cart_id else None,
        "cart_id": int(order_cart_id) if order_cart_id else None,
        "basket_id": int(order_basket_id) if order_basket_id else None,
        "packing_finished_at": str(packing_finished_at) if packing_finished_at else None,
        "automation_finished_at": str(automation_finished_at) if automation_finished_at else None,
        "carton_selected": bool(selected_carton),
        "selected_carton_id": selected_carton,
        "failure_code": failure_code,
        "failure_detail": failure_detail,
    }
    if extra:
        payload.update(extra)
    logger.info("PACKING_FINISH_TRACE %s", json.dumps(payload, ensure_ascii=False, default=str))


def _resolve_cart_row_for_packing_finish(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    request_cart_id: int | None,
) -> Optional[Cart]:
    packed_cart_id = int(order.cart_id) if getattr(order, "cart_id", None) else (
        int(request_cart_id) if request_cart_id else None
    )
    if not packed_cart_id:
        return None
    return (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.id == int(packed_cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )


def _preflight_cart_for_packing_finish(cart_row: Cart, order: Order) -> str:
    """
    Walidacja statusu wózka **przed** mutacjami pipeline.

    Normalny flow z aktywnym custody (order.cart_id → MULTI):
      READY_FOR_PACKING (basket-first, bez startPacking) | PACKING.

    AVAILABLE + nadal przypięte order/basket = breach lifecycle (za wczesny release
    lub orphan) — FAIL przed pipeline. AVAILABLE jest OK tylko na ścieżce
    idempotent_replay (osobno), gdy custody już zdjęte.
    """
    from .cart_picking_lifecycle_service import get_cart_status
    from ..models.enums import CartStatus as _CartStatus

    st = get_cart_status(cart_row)
    if st in (_CartStatus.PACKING, _CartStatus.READY_FOR_PACKING):
        return st.value

    has_custody = getattr(order, "cart_id", None) is not None and int(order.cart_id) == int(cart_row.id)
    if st == _CartStatus.AVAILABLE and has_custody:
        raise PackingScanError(
            "CART_LIFECYCLE_INCONSISTENT",
            message=(
                "Wózek jest AVAILABLE mimo aktywnego przypisania zamówienia "
                "(order.cart_id) — nieprawidłowy stan lifecycle; finalizacja zablokowana."
            ),
        )
    raise PackingScanError(
        "CART_NOT_IN_PACKING",
        message=(
            f"Wózek w statusie {st.value} — nie można finalizować pakowania "
            "(wymagany PACKING lub READY_FOR_PACKING)."
        ),
    )


def _release_cart_after_packing_finish(
    db: Session,
    *,
    cart_row: Cart,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
) -> bool:
    """
    Zwolnij slot koszyka / wózek po udanym finish.
    READY_FOR_PACKING jest OK (basket-first) — finish_packing sam promuje / release.
    """
    from .cart_picking_lifecycle_service import finish_packing

    return bool(
        finish_packing(
            db,
            cart=cart_row,
            packed_order_id=int(order.id),
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
        )
    )


def _normalize_packing_after_finish_action(raw: object | None) -> str:
    u = str(raw or "STAY").strip().upper()
    if u == "GO_TO_LIST":
        return "GO_TO_LIST"
    if u == "NEXT_ORDER":
        return "NEXT_ORDER"
    return "STAY"


def _apply_packing_carton_ids_to_order(order: Order, packaging_carton_ids: list[str] | None) -> None:
    """Zapisuje wybrane paczki do ``packing_consumables_json`` + ostatni karton jako ``selected_carton_id``."""
    ids: list[str] = []
    seen: set[str] = set()
    for raw in packaging_carton_ids or []:
        cid = str(raw or "").strip()
        if not cid or cid in seen:
            continue
        seen.add(cid)
        ids.append(cid)
    if not ids:
        return
    order.selected_carton_id = ids[-1]
    order.packing_consumables_json = json.dumps(
        [{"wm_kind": "carton", "wm_id": cid, "qty": 1} for cid in ids],
        ensure_ascii=False,
    )


def packing_finish_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    order_id: int,
    operator_user_id: Optional[int] = None,
    allow_without_carton: bool = False,
    packaging_carton_ids: list[str] | None = None,
    current_user: Optional[AppUser] = None,
    order_type: str = "all",
) -> WmsPackingScanOut:
    """
    Wywołaj **po** pełnym spakowaniu (skan / line-pack / pack-all już zacommitowane).
    Potok finish: **status „spakowane” → dokument** (gdy włączone; brak serii = ``ValueError`` / HTTP 400),
    potem opcjonalnie przesyłka / druki; commit na końcu tej funkcji.

    Kolejność (atomowość DB w jednej transakcji do commit):
      validate (scope + packable + carton + cart preflight)
      → timestamps / pipeline / shipped
      → release basket/cart
      → commit

    Retry po udanym finish jest idempotentny (automation_finished_at).
    """
    order, idempotent_replay = _load_order_for_packing_finish(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        order_id=order_id,
    )

    if not idempotent_replay:
        _apply_packing_carton_ids_to_order(order, packaging_carton_ids)
        db.flush()

    snap = _packing_finish_validation_snapshot(db, order, log=True)
    raw_sel = getattr(order, "selected_carton_id", None)
    sel = str(raw_sel).strip() if raw_sel else ""
    carton_ok = bool(sel) or allow_without_carton

    cart_row = _resolve_cart_row_for_packing_finish(
        db,
        order=order,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        request_cart_id=cart_id,
    )
    cart_status_pre = None
    if cart_row is not None and not idempotent_replay:
        cart_status_pre = _preflight_cart_for_packing_finish(cart_row, order)

    _packing_finish_trace(
        stage="validated" if not idempotent_replay else "idempotent_replay",
        order=order,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        mode=mode,
        cart_id=cart_id,
        extra={
            "required_qty": snap.get("total_required_qty"),
            "unresolved_count": snap.get("unresolved_count"),
            "lines_complete": snap.get("lines_packed_complete"),
            "packable": snap.get("packable"),
            "carton_selected": bool(sel),
            "allow_without_carton": bool(allow_without_carton),
            "cart_status": cart_status_pre,
            "scope_ok": True,
            "finish_validation_result": "ok" if (snap.get("packable") and carton_ok) or idempotent_replay else "pending",
        },
    )

    if idempotent_replay:
        # Bezpieczny retry: bez ponownego pipeline / dokumentu; dokończ ewentualny release.
        if cart_row is not None:
            try:
                _release_cart_after_packing_finish(
                    db,
                    cart_row=cart_row,
                    order=order,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                )
            except Exception as e:
                logger.info(
                    "PACKING_FINISH_TRACE idempotent release skipped order_id=%s err=%s",
                    int(order.id),
                    str(e)[:200],
                )
        ps_row = _get_or_create_wms_packing_settings_row(db, tenant_id, warehouse_id)
        finish_action = _normalize_packing_after_finish_action(
            getattr(ps_row, "packing_after_finish_action", None)
        )
        next_id = find_next_fifo_packing_order_id(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status_id,
            mode=mode,
            cart_id=cart_id,
            exclude_order_id=int(order_id),
            order_type=order_type,
        )
        db.commit()
        _packing_finish_trace(
            stage="idempotent_ok",
            order=order,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            mode=mode,
            cart_id=cart_id,
        )
        return _packing_build_scan_out_after_commit(
            db,
            order_id=int(order_id),
            order_fallback=order,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status_id,
            mode=mode,
            cart_id=cart_id,
            fully_packed=True,
            next_order_id=next_id,
            last_packed_order_item_id=None,
            post_pack_pipeline=[],
            packing_after_finish_action=finish_action,
        )

    try:
        _assert_order_packable_for_finish(db, order)
    except PackingScanError as e:
        _packing_finish_trace(
            stage="packable_fail",
            order=order,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            mode=mode,
            cart_id=cart_id,
            failure_code=str(e.code),
            failure_detail=getattr(e, "message", None) or str(e.code),
            extra={"lines_complete": snap.get("lines_packed_complete"), "packable": snap.get("packable")},
        )
        raise

    if not sel:
        if allow_without_carton:
            if not _user_allow_finish_without_carton(db, current_user):
                _packing_finish_trace(
                    stage="carton_fail",
                    order=order,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    mode=mode,
                    cart_id=cart_id,
                    failure_code="FORBIDDEN_FINISH_WITHOUT_CARTON",
                )
                raise PackingScanError("FORBIDDEN_FINISH_WITHOUT_CARTON")
        else:
            _packing_finish_trace(
                stage="carton_fail",
                order=order,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                mode=mode,
                cart_id=cart_id,
                failure_code="CARTON_REQUIRED",
                failure_detail="selected_carton_id empty (gabaryt UI ≠ WMS carton)",
            )
            raise PackingScanError("CARTON_REQUIRED")

    # Wszystkie guardy przeszły — dopiero teraz mutacje finalizacji.
    _touch_order_wms_packing_timestamps(order, fully_packed=True)

    # Smart Matching — nauka z rzeczywistego wyboru opakowania przy spakowaniu.
    if sel:
        try:
            from .packaging_engine.smart_matching_store import record_packing_carton_choice

            record_packing_carton_choice(
                db,
                order=order,
                carton_id=str(sel),
                operator_user_id=operator_user_id,
                suggested_carton_id=None,  # reguła aktywna wyliczana w store
            )
        except Exception:
            logger.exception("smart_matching record on finish order_id=%s", getattr(order, "id", None))

    ps_row = _get_or_create_wms_packing_settings_row(db, tenant_id, warehouse_id)
    finish_action = _normalize_packing_after_finish_action(
        getattr(ps_row, "packing_after_finish_action", None)
    )

    post_pack_pipeline = _run_wms_packing_post_pack_pipeline(
        db,
        order=order,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        operator_user_id=operator_user_id,
    )
    db.flush()
    finished_now = datetime.utcnow()
    order.wms_packing_automation_finished_at = finished_now
    from .order_fulfillment_lifecycle_service import on_order_shipped

    on_order_shipped(order, db)
    db.flush()

    cart_released = False
    if cart_row is not None:
        # Odśwież baskets po pipeline (ten sam obiekt / id).
        cart_row = _resolve_cart_row_for_packing_finish(
            db,
            order=order,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            request_cart_id=cart_id,
        ) or cart_row
        cart_released = _release_cart_after_packing_finish(
            db,
            cart_row=cart_row,
            order=order,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
        )

    step_rows = [
        {
            "step": getattr(s, "step", None),
            "ok": getattr(s, "ok", None),
            "message": getattr(s, "message", None),
        }
        for s in (post_pack_pipeline or [])
    ]
    emit_wms_packing_automation_finished(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order=order,
        operator_user_id=operator_user_id,
        post_pack_steps=step_rows,
    )
    next_id = find_next_fifo_packing_order_id(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        exclude_order_id=int(order_id),
        order_type=order_type,
    )
    _packing_finish_trace(
        stage="ok",
        order=order,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        mode=mode,
        cart_id=cart_id,
        extra={
            "cart_released": cart_released,
            "pipeline_steps": len(step_rows),
            "finish_validation_result": "ok",
        },
    )
    db.commit()
    return _packing_build_scan_out_after_commit(
        db,
        order_id=int(order_id),
        order_fallback=order,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        fully_packed=True,
        next_order_id=next_id,
        last_packed_order_item_id=None,
        post_pack_pipeline=post_pack_pipeline,
        packing_after_finish_action=finish_action,
    )


def find_next_fifo_packing_order_id(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    exclude_order_id: int | None,
    order_type: str = "all",
) -> Optional[int]:
    q = _packing_orders_base_query(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
    )
    q = apply_packing_order_type_filter(q, db, order_type=order_type or "all")
    q = q.order_by(Order.created_at.asc().nulls_last(), Order.id.asc())
    orders = q.options(joinedload(Order.items), joinedload(Order.shipping_method_row)).all()
    for o in orders:
        if exclude_order_id is not None and int(o.id) == int(exclude_order_id):
            continue
        if _order_has_pending_packing_lines(db, o):
            return int(o.id)
    return None


def packing_scan_increment(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    order_id: int,
    ean_raw: str,
    operator_user_id: Optional[int] = None,
) -> WmsPackingScanOut:
    resolved = resolve_receiving_scan(db, int(tenant_id), ean_raw)
    if not resolved.found or resolved.product_id is None:
        raise PackingScanError("PRODUCT_NOT_FOUND")

    order = _load_order_for_packing_mutation(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        order_id=order_id,
    )
    if order is None:
        raise PackingScanError("ORDER_NOT_IN_QUEUE")

    pid = int(resolved.product_id)
    items_sorted = sorted(order.items or [], key=lambda x: int(x.id))
    target_item: OrderItem | None = None
    for it in items_sorted:
        if not _order_item_active_for_packing(it):
            continue
        if int(it.product_id) != pid:
            continue
        required = order_item_required_pack_qty(db, order, it)
        qp = int(getattr(it, "packing_quantity_packed", 0) or 0)
        if qp < required:
            target_item = it
            break
    if target_item is None:
        if any(int(it.product_id) == pid for it in items_sorted):
            raise PackingScanError("ALREADY_PACKED")
        raise PackingScanError("WRONG_PRODUCT")

    last_oid = int(target_item.id)
    target_item.packing_quantity_packed = int(getattr(target_item, "packing_quantity_packed", 0) or 0) + 1
    sku_scan = _packing_sku_from_item(target_item)
    return _finalize_after_packing_mutations(
        db,
        order=order,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        last_packed_order_item_id=last_oid,
        operator_user_id=operator_user_id,
        packed_audits=[(last_oid, pid, 1, sku_scan)],
    )


def packing_apply_line_pack(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    order_id: int,
    order_item_id: int,
    quantity: int,
    operator_user_id: Optional[int] = None,
) -> WmsPackingScanOut:
    order = _load_order_for_packing_mutation(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        order_id=order_id,
    )
    if order is None:
        raise PackingScanError("ORDER_NOT_IN_QUEUE")
    item = next((i for i in (order.items or []) if int(i.id) == int(order_item_id)), None)
    if item is None:
        raise PackingScanError("WRONG_PRODUCT")
    if not _order_item_active_for_packing(item):
        raise PackingScanError("WRONG_PRODUCT")
    required = order_item_required_pack_qty(db, order, item)
    qp = int(getattr(item, "packing_quantity_packed", 0) or 0)
    rem = required - qp
    if rem <= 0:
        raise PackingScanError("ALREADY_PACKED")
    q_add = int(quantity)
    if q_add < 1 or q_add > rem:
        raise PackingScanError("INVALID_QUANTITY")
    item.packing_quantity_packed = qp + q_add
    sku_lp = _packing_sku_from_item(item)
    return _finalize_after_packing_mutations(
        db,
        order=order,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        last_packed_order_item_id=int(order_item_id),
        operator_user_id=operator_user_id,
        packed_audits=[(int(order_item_id), int(item.product_id), int(q_add), sku_lp)],
    )


def packing_pack_all_lines(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
    order_id: int,
    operator_user_id: Optional[int] = None,
) -> WmsPackingScanOut:
    order = _load_order_for_packing_mutation(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        order_id=order_id,
    )
    if order is None:
        raise PackingScanError("ORDER_NOT_IN_QUEUE")
    items_sorted = sorted(order.items or [], key=lambda x: int(x.id))
    last_oid: Optional[int] = None
    audits: List[Tuple[int, int, int, Optional[str]]] = []
    for it in items_sorted:
        if not _order_item_active_for_packing(it):
            continue
        required = order_item_required_pack_qty(db, order, it)
        qp = int(getattr(it, "packing_quantity_packed", 0) or 0)
        delta = required - qp
        if delta <= 0:
            continue
        it.packing_quantity_packed = qp + delta
        sku_pa = _packing_sku_from_item(it)
        audits.append((int(it.id), int(it.product_id), int(delta), sku_pa))
        last_oid = int(it.id)
    return _finalize_after_packing_mutations(
        db,
        order=order,
        order_id=int(order_id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
        last_packed_order_item_id=last_oid,
        operator_user_id=operator_user_id,
        packed_audits=audits if audits else None,
    )


def _packing_order_type_line_counts_subquery(db: Session):
    """Liczba aktywnych pozycji zamówienia — jak filtr single/multi w zbieraniu."""
    from .bundle_order_item_ops import sqlalchemy_operational_picking_order_item_clause
    from ..models.order_item import OMS_LINE_STATUS_REPLACED

    ols = OrderItem.oms_line_status
    not_replaced = or_(ols.is_(None), ols != OMS_LINE_STATUS_REPLACED)
    return (
        db.query(OrderItem.order_id, func.count(OrderItem.id).label("cnt"))
        .filter(
            sqlalchemy_operational_picking_order_item_clause(OrderItem),
            not_replaced,
        )
        .group_by(OrderItem.order_id)
        .subquery()
    )


def apply_packing_order_type_filter(q, db: Session, *, order_type: str):
    """Filtr single (1 pozycja) / multi (>1) / all — ta sama definicja co zbieranie."""
    ot = (order_type or "all").strip().lower()
    if ot not in ("single", "multi", "all"):
        raise ValueError("Parametr order_type musi być: single, multi lub all.")
    if ot == "all":
        return q
    line_counts = _packing_order_type_line_counts_subquery(db)
    q = q.join(line_counts, line_counts.c.order_id == Order.id)
    if ot == "single":
        return q.filter(line_counts.c.cnt == 1)
    return q.filter(line_counts.c.cnt > 1)


def packing_mode_distribution(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
) -> Tuple[int, int, int, int, int]:
    """
    Rzeczywiste kohorty handoff + live custody (nie total,total,total):

    returns (cartless/no_cart, cart/bulk, basket/baskets, single_item, multi_item)

    BASKET count wymaga aktywnego basket custody — nie samego ``picking_handoff_mode=BASKET``.
    single/multi = liczba zamówień w statusie (wszystkie handoff) wg liczby pozycji.
    """
    # Safe reconcile only when legacy NULL handoff candidates exist
    from .picking_handoff_service import HANDOFF_BASKET, HANDOFF_CART, HANDOFF_CARTLESS, reconcile_picking_handoff_modes

    try:
        null_candidate = (
            db.query(Order.id)
            .filter(
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
                Order.deleted_at.is_(None),
                Order.fulfillment_state.in_(("READY_TO_PACK", "PACKING")),
                Order.picking_handoff_mode.is_(None),
            )
            .limit(1)
            .first()
        )
        if null_candidate is not None:
            reconcile_picking_handoff_modes(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
            db.flush()
    except Exception:
        logger.exception("reconcile_picking_handoff_modes failed")

    status_ids = _packing_queue_status_ids(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, primary_status_id=status_id
    )
    eligibility = _active_packing_eligibility_clauses(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_ids=status_ids,
    )

    base = [
        Order.tenant_id == int(tenant_id),
        Order.warehouse_id == int(warehouse_id),
        *eligibility,
    ]

    def _count(extra) -> int:
        return int(db.query(func.count(Order.id)).filter(*base, *extra).scalar() or 0)

    cartless = _count(
        [
            Order.picking_handoff_mode == HANDOFF_CARTLESS,
            Order.cart_id.is_(None),
        ]
    )
    cart = _count(
        [
            Order.picking_handoff_mode == HANDOFF_CART,
            Order.cart_id.isnot(None),
        ]
    )
    baskets = _count(
        [
            Order.picking_handoff_mode == HANDOFF_BASKET,
            _active_basket_custody_clause(warehouse_id=int(warehouse_id)),
        ]
    )

    # Ghost detection: handoff=BASKET without custody / finalized still in UI status scope
    try:
        handoff_only = _count([Order.picking_handoff_mode == HANDOFF_BASKET])
        if handoff_only != baskets:
            logger.info(
                "PACKING_QUEUE_TRACE GHOST_BASKET handoff_only=%s active_custody=%s "
                "tenant=%s wh=%s status=%s",
                handoff_only,
                baskets,
                int(tenant_id),
                int(warehouse_id),
                int(status_id),
            )
            _emit_packing_queue_trace(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                status_ids=status_ids,
                eligibility=eligibility,
            )
    except Exception:
        logger.exception("PACKING_QUEUE_TRACE ghost check failed")

    # Single / multi — wśród wszystkich zamówień kwalifikujących się do pakowania w statusie.
    # Fail-soft: lekkie schematy testowe mogą nie mieć ``order_items``.
    single_item = 0
    multi_item = 0
    try:
        line_counts = _packing_order_type_line_counts_subquery(db)
        single_item = int(
            db.query(func.count(Order.id))
            .filter(*base)
            .join(line_counts, line_counts.c.order_id == Order.id)
            .filter(line_counts.c.cnt == 1)
            .scalar()
            or 0
        )
        multi_item = int(
            db.query(func.count(Order.id))
            .filter(*base)
            .join(line_counts, line_counts.c.order_id == Order.id)
            .filter(line_counts.c.cnt > 1)
            .scalar()
            or 0
        )
    except Exception:
        logger.debug("packing_mode_distribution single/multi counts unavailable", exc_info=True)

    return cartless, cart, baskets, single_item, multi_item


def _parse_packing_allowed_start_status_ids(raw: object | None) -> List[int]:
    """Normalize JSON list of status ids from ``WmsPackingSettings.allowed_start_status_ids_json``."""
    if raw is None:
        return []
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw or "[]")
        except json.JSONDecodeError:
            return []
    if not isinstance(data, list):
        return []
    out: List[int] = []
    seen: set[int] = set()
    for item in data:
        try:
            n = int(item)
        except (TypeError, ValueError):
            continue
        if n <= 0 or n in seen:
            continue
        seen.add(n)
        out.append(n)
    return out


def _append_packing_queue_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    seen: set[int],
    out: List[WmsPackingTargetStatusItem],
) -> None:
    sid = int(status_id)
    if sid <= 0 or sid in seen:
        return
    st = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == sid,
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if st is None:
        return
    gkey = _norm_group(st.main_group)
    seen.add(sid)
    out.append(
        WmsPackingTargetStatusItem(
            target_status_id=int(st.id),
            status=str(st.name),
            color=normalize_stored_color(st.color),
            main_group=cast(OrderUiMainGroup, gkey),
            order_count=0,
        )
    )


def list_packing_target_statuses(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> List[WmsPackingTargetStatusItem]:
    """
    Kolejki pakowania:
    - statusy docelowe z konfiguracji zbierania (``picking_config.target_status_id``),
    - oraz statusy startowe z ustawień pakowania (``start_status_id`` + ``allowed_start_status_ids``),
      gdy jeszcze nie na liście (pakowanie bez zbierania — niezależne od reguł zbierania).
    """
    rows: List[PickingConfig] = (
        db.query(PickingConfig)
        .options(joinedload(PickingConfig.target_status))
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
        )
        .order_by(PickingConfig.id.asc())
        .all()
    )
    by_target: dict[int, list[PickingConfig]] = defaultdict(list)
    for pc in rows:
        by_target[int(pc.target_status_id)].append(pc)

    out: List[WmsPackingTargetStatusItem] = []
    seen: set[int] = set()
    for tid, pcs in by_target.items():
        st = pcs[0].target_status
        if st is None:
            st = (
                db.query(OrderUiStatus)
                .filter(
                    OrderUiStatus.id == tid,
                    OrderUiStatus.tenant_id == int(tenant_id),
                    OrderUiStatus.warehouse_id == int(warehouse_id),
                )
                .first()
            )
        if st is None:
            continue
        gkey = _norm_group(st.main_group)
        seen.add(int(st.id))
        out.append(
            WmsPackingTargetStatusItem(
                target_status_id=int(st.id),
                status=str(st.name),
                color=normalize_stored_color(st.color),
                main_group=cast(OrderUiMainGroup, gkey),
                order_count=0,
            )
        )

    # Statusy startowe pakowania (niezależne od konfiguracji zbierania).
    pack_settings = (
        db.query(WmsPackingSettings)
        .filter(
            WmsPackingSettings.tenant_id == int(tenant_id),
            WmsPackingSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if pack_settings is not None:
        start_sid = getattr(pack_settings, "start_status_id", None)
        if start_sid is not None:
            _append_packing_queue_status(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                status_id=int(start_sid),
                seen=seen,
                out=out,
            )
        for sid in _parse_packing_allowed_start_status_ids(
            getattr(pack_settings, "allowed_start_status_ids_json", None)
        ):
            _append_packing_queue_status(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                status_id=int(sid),
                seen=seen,
                out=out,
            )

    target_ids = [int(x.target_status_id) for x in out]
    counts_map: dict[int, int] = {}
    if target_ids:
        # Ten sam zakres co kolejka pakowania: UI status + packing-ready, bez finalized.
        cnt_rows = (
            db.query(Order.order_ui_status_id, func.count(Order.id))
            .filter(
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
                Order.deleted_at.is_(None),
                Order.wms_packing_automation_finished_at.is_(None),
                Order.order_ui_status_id.in_(target_ids),
                or_(
                    Order.fulfillment_state.in_(("READY_TO_PACK", "PACKING")),
                    Order.fulfillment_state.is_(None),
                ),
            )
            .group_by(Order.order_ui_status_id)
            .all()
        )
        counts_map = {int(sid): int(n) for sid, n in cnt_rows}

    for i, row in enumerate(out):
        tid = int(row.target_status_id)
        out[i] = row.model_copy(update={"order_count": int(counts_map.get(tid, 0))})

    gidx = {g: i for i, g in enumerate(_GROUP_ORDER)}
    out.sort(key=lambda x: (gidx.get(str(x.main_group), 0), x.status.lower(), x.target_status_id))
    return out


def _order_business_number(order: Order) -> str:
    """Numer widoczny operatorowi (#number) — nie mylić z orders.id."""
    num = str(getattr(order, "number", None) or "").strip()
    return num if num else str(int(order.id))


def inspect_packing_cart_handoff(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    cart_id: int,
) -> dict:
    """
    Diagnostyka skanu wózka → pakowanie.

    Ekran wózka używa ``list_orders_on_cart`` (custody).
    Kolejka pakowania filtruje dodatkowo ``order_can_show_ready_pack`` —
    przy niedokończonym zbieraniu custody ≠ pusta kolejka (fałszywe „brak zamówienia”).
    """
    from ..models.cart import Cart
    from .braki_order_state_service import order_can_show_ready_pack
    from .cart_picking_lifecycle_service import get_cart_status
    from .cart_stats_service import list_orders_on_cart
    from .recovery_workflow_service import resolve_order_recovery_state

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
        raise PackingScanError("CART_NOT_FOUND", message="Nie znaleziono wózka.")

    raw_type = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    cart_type = raw_type.split(".")[-1].upper()
    packing_mode = "baskets" if cart_type in ("MULTI", "BASKETS") else "bulk"
    cart_code = (
        str(getattr(cart, "code", None) or getattr(cart, "barcode", None) or getattr(cart, "name", None) or "")
        .strip()
        or f"Wózek {int(cart.id)}"
    )
    cart_status = get_cart_status(cart).value

    custody = list_orders_on_cart(db, cart, with_items=True)
    packable_rows = list_packing_orders(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=packing_mode,
        cart_id=int(cart_id),
        order_type="all",
        limit=500,
        offset=0,
    )
    packable_ids = {int(c.order_id) for c in packable_rows}

    custody_out: list[dict] = []
    block_kinds: list[str] = []
    for o in custody:
        oid = int(o.id)
        packable = oid in packable_ids or order_can_show_ready_pack(db, o)
        block_reason: str | None = None
        if not packable:
            st = resolve_order_recovery_state(db, o, log=False)
            if int(st.totals.oms_decision_lines) > 0:
                block_reason = "awaiting_decision"
            elif st.has_recovery_work:
                block_reason = "incomplete_picking"
            elif st.has_relocation_work:
                block_reason = "relocation"
            else:
                block_reason = "other"
            block_kinds.append(block_reason)
        custody_out.append(
            {
                "order_id": oid,
                "order_number": _order_business_number(o),
                "packable": bool(packable),
                "block_reason": block_reason,
            }
        )

    if packable_ids:
        operator_state = "READY"
        operator_message = ""
    elif not custody_out:
        operator_state = "EMPTY"
        operator_message = "Do tego wózka nie przypisano żadnego zamówienia."
    elif "awaiting_decision" in block_kinds:
        operator_state = "AWAITING_DECISION"
        operator_message = (
            "Na wózku jest zamówienie z nierozwiązanymi brakami — najpierw obsłuż braki, "
            "potem wróć do pakowania."
        )
    elif "relocation" in block_kinds:
        operator_state = "RELOCATION"
        operator_message = (
            "Na wózku jest zamówienie wymagające rozlokowania przed pakowaniem."
        )
    elif "incomplete_picking" in block_kinds:
        operator_state = "INCOMPLETE_PICKING"
        operator_message = (
            "Na wózku jest zamówienie, ale zbieranie nie jest dokończone. "
            "Dokończ zbieranie, a potem wróć do pakowania."
        )
    else:
        operator_state = "INCOMPLETE_PICKING"
        operator_message = (
            "Na wózku jest zamówienie, którego nie można jeszcze spakować. "
            "Sprawdź status zbierania i braków."
        )

    logger.info(
        "[wms.packing.cart_handoff] cart_id=%s cart_code=%s cart_type=%s cart_status=%s "
        "mode=%s status_id=%s custody=%s packable=%s operator_state=%s",
        int(cart.id),
        cart_code,
        cart_type,
        cart_status,
        packing_mode,
        int(status_id),
        [
            {
                "order_id": x["order_id"],
                "order_number": x["order_number"],
                "packable": x["packable"],
                "block_reason": x["block_reason"],
            }
            for x in custody_out
        ],
        sorted(packable_ids),
        operator_state,
    )

    return {
        "cart_id": int(cart.id),
        "cart_code": cart_code,
        "cart_type": cart_type,
        "cart_status": cart_status,
        "packing_mode": packing_mode,
        "custody_orders": custody_out,
        "packable_order_ids": sorted(packable_ids),
        "operator_state": operator_state,
        "operator_message": operator_message,
    }


def list_packing_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None = None,
    order_type: str = "all",
    limit: int = 500,
    offset: int = 0,
) -> List[WmsPackingOrderCard]:
    """Lista kart zamówień do pakowania.

    ``limit`` / ``offset`` dotyczą już przefiltrowanej listy (po ``order_can_show_ready_pack``),
    żeby paginacja UI dawała pełne partie o żądanej wielkości.
    """
    q = _packing_orders_base_query(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
    )
    q = apply_packing_order_type_filter(q, db, order_type=order_type)
    q = q.order_by(Order.order_date.desc().nullslast(), Order.id.desc())
    m = (mode or "").strip().lower()
    opts = [
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.order_ui_status),
        joinedload(Order.shipping_method_row),
    ]
    if m == "baskets" or m == "all":
        opts.append(joinedload(Order.basket))

    lim = min(max(int(limit), 1), 2000)
    off = max(int(offset), 0)
    from .braki_order_state_service import order_can_show_ready_pack

    out: List[WmsPackingOrderCard] = []
    skipped = 0
    db_offset = 0
    # Pobieraj szersze okna z DB, aż zbierzemy ``lim`` kart po filtrze (lub skończą się wiersze).
    window = max(lim * 2, 50)
    max_scan = max(off + lim, lim) * 20  # twardy limit skanu — ochrona przed nieskończoną pętlą
    scanned = 0
    while len(out) < lim and scanned < max_scan:
        batch: List[Order] = (
            q.options(*opts)
            .offset(db_offset)
            .limit(window)
            .all()
        )
        if not batch:
            break
        db_offset += len(batch)
        scanned += len(batch)
        for o in batch:
            if not order_can_show_ready_pack(db, o):
                continue
            if skipped < off:
                skipped += 1
                continue
            bc = _basket_code_for_order(o) if m in ("baskets", "all") else None
            out.append(
                _build_packing_order_card(
                    o,
                    basket_code=bc,
                    db=db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    enrich=False,
                    pack_qty_from_required=True,
                )
            )
            if len(out) >= lim:
                break
        if len(batch) < window:
            break
    return out


def _norm_packing_scan(val: object) -> str:
    return (val if val is not None else "").strip()


def _find_cart_by_scan_code(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    code: str,
) -> Optional[Cart]:
    c = _norm_packing_scan(code)
    if not c:
        return None
    from .esp_scan_codes import find_cart_for_tenant_warehouse_scan

    return find_cart_for_tenant_warehouse_scan(db, int(tenant_id), int(warehouse_id), c)


def _cart_type_label_upper(cart: Cart) -> str:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    return raw.split(".")[-1].upper()


def get_packing_cart_orders_by_scan_code(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_code: str,
    status_id: int,
    mode: str,
) -> WmsPackingCartOrdersOut:
    cart = _find_cart_by_scan_code(db, tenant_id=tenant_id, warehouse_id=warehouse_id, code=cart_code)
    if cart is None:
        raise ValueError("Nie znaleziono wózka o podanym kodzie.")
    m = (mode or "").strip().lower()
    if m == "no_cart":
        raise ValueError("W tym trybie nie skanujesz kodu wózka.")
    ct = cart.type
    if m == "bulk" and ct != CartType.BULK:
        raise ValueError("Ten wózek nie jest typu BULK.")
    if m == "baskets" and ct != CartType.MULTI:
        raise ValueError("Ten wózek nie jest typu MULTI (koszyki).")
    orders = list_packing_orders(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=m,
        cart_id=int(cart.id),
    )
    disp = _norm_packing_scan(cart.code) or _norm_packing_scan(getattr(cart, "barcode", None)) or str(cart.id)
    return WmsPackingCartOrdersOut(
        cart_id=int(cart.id),
        cart_code=disp,
        cart_display_name=cart_display_name_for_wms(cart),
        cart_type=_cart_type_label_upper(cart),
        orders=orders,
    )


def _basket_scan_matches(b: CartBasket, scan: str) -> bool:
    s = _norm_packing_scan(scan).upper()
    if not s:
        return False
    if b.barcode and _norm_packing_scan(b.barcode).upper() == s:
        return True
    if b.name and _norm_packing_scan(str(b.name)).upper() == s:
        return True
    slot = f"S-{int(b.row)}-{int(b.column)}"
    if s == slot.upper():
        return True
    return False


def resolve_packing_order_for_shelf_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    shelf_scan: str,
    status_id: int,
    mode: str,
    cart_id: int | None,
) -> WmsPackingShelfOrderOut:
    """
    P5.5 — wejście do pakowania po skanie półki kompletacyjnej.

    Osobna ścieżka od kohort CART/BASKET/CARTLESS (handoff pozostaje NULL).
    ``mode``/``cart_id`` z aktywnej sesji nie filtrują kohorty — walidacja shelf + packing-ready.
    """
    del mode, cart_id  # shelf entry is not cart-handoff scoped
    from .order_consolidation.staging_service import lookup_shelf_assignment

    assignment = lookup_shelf_assignment(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        code=shelf_scan,
    )
    if assignment is None:
        raise PackingScanError("SHELF_NOT_FOUND")

    oid = int(assignment["order_id"])
    order = (
        db.query(Order)
        .filter(
            Order.id == oid,
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if order is None:
        raise PackingScanError("SHELF_NOT_FOUND")

    fs = (getattr(order, "fulfillment_state", None) or "").strip().upper()
    if fs not in ("READY_TO_PACK", "PACKING"):
        raise PackingScanError(
            "SHELF_ORDER_NOT_READY",
            message="Zamówienie nie jest jeszcze kompletne.",
        )

    # Must be on shelf packing path (NULL handoff, not cartless picking marker)
    from .picking_handoff_service import normalize_handoff_mode

    if normalize_handoff_mode(getattr(order, "picking_handoff_mode", None)) is not None:
        raise PackingScanError(
            "SHELF_ORDER_NOT_IN_QUEUE",
            message="Zamówienie ma handoff cart/basket/cartless — użyj odpowiedniej kohorty.",
        )
    if getattr(order, "cart_id", None) is not None:
        raise PackingScanError(
            "SHELF_ORDER_NOT_IN_QUEUE",
            message="Zamówienie ma custody wózka — shelf packing niedostępne.",
        )

    in_queue = get_packing_order_detail_for_queue(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode="shelf",
        cart_id=None,
        order_id=oid,
    )
    if in_queue is None:
        raise PackingScanError("SHELF_ORDER_NOT_IN_QUEUE")

    return WmsPackingShelfOrderOut(
        order_id=oid,
        shelf_label=str(assignment["shelf_label"]),
        packing_mode="shelf",
    )


def resolve_packing_order_for_basket_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int | None,
    basket_scan: str,
    status_id: int,
    mode: str,
) -> WmsPackingBasketOrderOut:
    """
    Warehouse-global basket → exact order (CASE B).
    Nie wymaga wcześniejszego skanu MULTI cart.
    ``cart_id`` opcjonalny — gdy podany, zawęża do tego wózka.
    """
    from .picking_handoff_service import HANDOFF_BASKET, normalize_handoff_mode

    scan = _norm_packing_scan(basket_scan)
    if not scan:
        raise PackingScanError("BASKET_NOT_FOUND")

    q = (
        db.query(CartBasket)
        .join(Cart, Cart.id == CartBasket.cart_id)
        .options(joinedload(CartBasket.cart))
        .filter(
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
            Cart.type == CartType.MULTI,
            CartBasket.warehouse_id == int(warehouse_id),
        )
    )
    if cart_id is not None and int(cart_id) > 0:
        q = q.filter(CartBasket.cart_id == int(cart_id))
    candidates = [b for b in q.all() if _basket_scan_matches(b, scan)]
    if not candidates:
        raise PackingScanError("BASKET_NOT_FOUND")
    if len(candidates) > 1:
        raise PackingScanError(
            "AMBIGUOUS_BASKET_CODE",
            message="Kod koszyka nie jest jednoznaczny w magazynie — nie użyto first().",
        )
    match = candidates[0]

    oid: int | None = int(match.order_id) if match.order_id is not None else None
    if oid is None:
        alt = (
            db.query(Order.id)
            .filter(
                Order.basket_id == int(match.id),
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        oid = int(alt[0]) if alt is not None else None
    if oid is None:
        raise PackingScanError("BASKET_EMPTY")

    order = (
        db.query(Order)
        .filter(
            Order.id == int(oid),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if order is None:
        raise PackingScanError("BASKET_ORDER_NOT_IN_QUEUE")
    if normalize_handoff_mode(getattr(order, "picking_handoff_mode", None)) != HANDOFF_BASKET:
        raise PackingScanError("BASKET_ORDER_NOT_IN_QUEUE")

    # Dual SSOT consistency: Order.basket_id ↔ CartBasket.order_id (required for active queue)
    ob = getattr(order, "basket_id", None)
    if ob is None or int(ob) <= 0 or int(ob) != int(match.id):
        raise PackingScanError(
            "BASKET_ORDER_NOT_IN_QUEUE",
            message="Brak aktywnego custody koszyka (Order.basket_id).",
        )
    if match.order_id is None or int(match.order_id) != int(oid):
        raise PackingScanError(
            "BASKET_ORDER_NOT_IN_QUEUE",
            message="Niespójne przypisanie koszyka (CartBasket.order_id).",
        )
    if getattr(order, "wms_packing_automation_finished_at", None) is not None:
        raise PackingScanError(
            "BASKET_ORDER_NOT_IN_QUEUE",
            message="Zamówienie już finalnie spakowane (automation finished).",
        )

    in_queue = get_packing_order_detail_for_queue(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode="baskets",
        cart_id=int(match.cart_id) if getattr(match, "cart_id", None) else None,
        order_id=int(oid),
    )
    if in_queue is None:
        raise PackingScanError("BASKET_ORDER_NOT_IN_QUEUE")
    return WmsPackingBasketOrderOut(
        order_id=int(oid),
        basket_code=_cart_basket_display_code(match),
    )


def _get_or_create_wms_packing_settings_row(db: Session, tenant_id: int, warehouse_id: int) -> WmsPackingSettings:
    row = (
        db.query(WmsPackingSettings)
        .filter(
            WmsPackingSettings.tenant_id == int(tenant_id),
            WmsPackingSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row:
        return row
    row = WmsPackingSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        allowed_start_status_ids_json="[]",
        auto_actions_json="{}",
        document_settings_json="{}",
        fallback_label_json="{}",
        interface_display_json="{}",
    )
    db.add(row)
    db.flush()
    return row


_SettingsT = TypeVar("_SettingsT", bound=BaseModel)


def _json_settings_merge(cls: Type[_SettingsT], raw: str | None, default: _SettingsT) -> _SettingsT:
    try:
        d = json.loads(raw or "{}")
        if not isinstance(d, dict):
            return default
        merged = {**default.model_dump(), **d}
        return cls.model_validate(merged)
    except Exception:
        return default


def _packing_order_import_meta(order: Order) -> dict:
    raw = getattr(order, "import_metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def _packing_order_set_import_meta(order: Order, meta: dict) -> None:
    if not meta:
        order.import_metadata_json = None
    else:
        order.import_metadata_json = json.dumps(meta, ensure_ascii=False)


def _resolve_post_pack_sale_series_id(order: Order, doc: WmsPackingDocumentSettings) -> tuple[str | None, str, str | None]:
    """
    Jedno źródło: ``invoice_series_id`` / ``receipt_series_id`` z ustawień pakowania.
    Typ: ``preferred_document_type`` (INVOICE|PARAGON) albo FROM_ORDER → ``panel_document_type`` zamówienia.
    Zwraca (series_id lub None, panel_document_type INVOICE|PARAGON, kod_błędu gdy brak serii).
    """
    pref = (getattr(doc, "preferred_document_type", None) or "FROM_ORDER").strip().upper()
    if pref == "INVOICE":
        doc_t = "INVOICE"
    elif pref == "PARAGON":
        doc_t = "PARAGON"
    else:
        meta = _packing_order_import_meta(order)
        doc_t = (meta.get("panel_document_type") or "").strip().upper()
        if doc_t not in ("INVOICE", "PARAGON"):
            doc_t = "INVOICE"
    inv = (doc.invoice_series_id or "").strip()
    rec = (doc.receipt_series_id or "").strip()
    if doc_t == "PARAGON":
        if not rec:
            return (None, "PARAGON", "CREATE_DOCUMENT_MISSING_RECEIPT_SERIES")
        return (rec, "PARAGON", None)
    if not inv:
        return (None, "INVOICE", "CREATE_DOCUMENT_MISSING_INVOICE_SERIES")
    return (inv, "INVOICE", None)


def _packing_create_sale_document_strict(
    db: Session,
    order: Order,
    doc: WmsPackingDocumentSettings,
    tenant_id: int,
    warehouse_id: int,
):
    """
    Tworzy dokument sprzedaży po domknięciu pakowania. **Podnosi ValueError** przy braku serii lub błędzie zapisu
    (brak cichego pominięcia gdy w ustawieniach włączone jest ``create_document``).
    """
    meta = _packing_order_import_meta(order)
    doc_t_raw = (meta.get("panel_document_type") or "").strip().upper()
    inv = (doc.invoice_series_id or "").strip()
    rec = (doc.receipt_series_id or "").strip()

    logger.info(
        "PACKING_FINISH create_document order_id=%s ORDER_PANEL_DOCUMENT_TYPE=%s settings_invoice_series_id=%s settings_receipt_series_id=%s",
        order.id,
        doc_t_raw or "(default INVOICE)",
        inv or None,
        rec or None,
    )

    series_id, panel_doc_type, missing_code = _resolve_post_pack_sale_series_id(order, doc)

    logger.info(
        "PACKING_FINISH SELECTED_SERIES order_id=%s series_id=%s panel_document_type=%s",
        order.id,
        series_id or None,
        panel_doc_type,
    )

    if missing_code:
        logger.error("PACKING_FINISH %s order_id=%s", missing_code, order.id)
        raise ValueError(missing_code)
    if not series_id:
        raise ValueError("CREATE_DOCUMENT_REQUIRES_SERIES_ID")

    try:
        created = create_sale_document(
            db,
            order=order,
            series_id=series_id,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            panel_document_type=panel_doc_type,
        )
    except ValueError:
        logger.exception("DOCUMENT CREATE FAILED (ValueError) order_id=%s", order.id)
        raise
    except Exception as e:
        logger.exception("DOCUMENT CREATE FAILED order_id=%s", order.id)
        raise ValueError(f"DOCUMENT_CREATE_FAILED:{str(e)[:400]}") from e

    db.flush()
    logger.info(
        "DOCUMENT_CREATED order_id=%s sale_document_id=%s number=%s",
        order.id,
        getattr(created, "id", None),
        getattr(created, "document_number", None),
    )
    return created


def _latest_order_document(
    db: Session,
    *,
    order: Order,
    document_type: str,
) -> OrderDocument | None:
    rows = _list_order_documents(db, order=order, document_type=document_type)
    return rows[0] if rows else None


def _list_order_documents(
    db: Session,
    *,
    order: Order,
    document_type: str,
) -> list[OrderDocument]:
    return (
        db.query(OrderDocument)
        .filter(
            OrderDocument.order_id == int(order.id),
            OrderDocument.tenant_id == int(order.tenant_id),
            OrderDocument.warehouse_id == int(order.warehouse_id),
            OrderDocument.document_type == str(document_type),
        )
        .order_by(OrderDocument.id.desc())
        .all()
    )


def _waybill_docs_client_message(
    db: Session,
    *,
    order: Order,
    kind: str,
) -> str | None:
    """Buduje message z listami przewozowymi (file_url + opcjonalnie file_urls=a|b)."""
    docs = [
        d
        for d in _list_order_documents(db, order=order, document_type=OrderDocumentType.LIST_PRZEWOZOWY.value)
        if str(getattr(d, "file_url", None) or "").strip()
    ]
    if not docs:
        return None
    urls = [str(d.file_url).strip() for d in docs]
    msg = _client_doc_message(
        kind=kind,
        order_document_id=int(docs[0].id),
        file_url=urls[0],
    )
    if len(urls) > 1:
        msg += f";file_urls={'|'.join(urls)};waybill_count={len(urls)}"
    else:
        msg += ";waybill_count=1"
    return _append_sales_companion_to_message(db, order=order, message=msg)


def _latest_sale_document_for_order(db: Session, *, order: Order) -> SaleDocument | None:
    return (
        db.query(SaleDocument)
        .filter(
            SaleDocument.order_id == int(order.id),
            SaleDocument.tenant_id == int(order.tenant_id),
        )
        .order_by(SaleDocument.created_at.desc(), SaleDocument.id.desc())
        .first()
    )


def _client_doc_message(*, kind: str, order_document_id: int | None = None, file_url: str | None = None, sale_document_id: str | None = None) -> str:
    parts = [kind]
    if sale_document_id:
        parts.append(f"sale_document_id={sale_document_id}")
    if order_document_id is not None:
        parts.append(f"order_document_id={int(order_document_id)}")
    if file_url:
        parts.append(f"file_url={file_url}")
    return ";".join(parts)


def _append_sales_companion_to_message(db: Session, *, order: Order, message: str) -> str:
    """Dołącz URL pola „Dokument sprzedaży” — klient soft-failuje, gdy brak pliku."""
    sales_attached = _latest_order_document(
        db, order=order, document_type=OrderDocumentType.DOKUMENT_SPRZEDAZY.value
    )
    if sales_attached is None or not str(sales_attached.file_url or "").strip():
        return message
    return (
        f"{message}"
        f";sales_order_document_id={int(sales_attached.id)}"
        f";sales_file_url={str(sales_attached.file_url)}"
    )


def _packing_step_generate_shipment(db: Session, order: Order) -> WmsPackingPostPackStepResult:
    try:
        logger.info("wms_packing post-pack generate_shipment order_id=%s", order.id)
        msg = _waybill_docs_client_message(db, order=order, kind="existing_waybill")
        if msg:
            return WmsPackingPostPackStepResult(
                step="generate_shipment",
                ok=True,
                skipped=False,
                message=msg,
            )
        # Brak listu / connectora — nie kończ „sukcesem”; UI może zaproponować etykietę zastępczą.
        return WmsPackingPostPackStepResult(
            step="generate_shipment",
            ok=False,
            skipped=False,
            message=(
                "courier_label_unavailable:"
                "Nie udało się wygenerować etykiety kurierskiej "
                "(brak listu przewozowego / connector nie skonfigurowany)."
            ),
            offer_replacement_label=True,
        )
    except Exception as e:  # pragma: no cover
        return WmsPackingPostPackStepResult(
            step="generate_shipment",
            ok=False,
            message=f"courier_label_unavailable:{str(e)[:480]}",
            offer_replacement_label=True,
        )


def _packing_step_print_document(db: Session, order: Order) -> WmsPackingPostPackStepResult:
    """Resolve sales document for client print/download — never invent an empty PDF."""
    try:
        try:
            sale = _latest_sale_document_for_order(db, order=order)
        except Exception:
            # Brak tabeli / błąd odczytu SaleDocument — kontynuuj przez pole dodatkowe.
            sale = None
        if sale is not None:
            return WmsPackingPostPackStepResult(
                step="print_document",
                ok=True,
                skipped=False,
                message=_client_doc_message(
                    kind="client_print_sales_doc",
                    sale_document_id=str(sale.id),
                ),
            )
        attached = _latest_order_document(
            db, order=order, document_type=OrderDocumentType.DOKUMENT_SPRZEDAZY.value
        )
        if attached is not None and str(attached.file_url or "").strip():
            return WmsPackingPostPackStepResult(
                step="print_document",
                ok=True,
                skipped=False,
                message=_client_doc_message(
                    kind="client_print_sales_doc",
                    order_document_id=int(attached.id),
                    file_url=str(attached.file_url),
                ),
            )
        logger.info("wms_packing post-pack print_document missing sales doc order_id=%s", order.id)
        return WmsPackingPostPackStepResult(
            step="print_document",
            ok=True,
            skipped=True,
            message="missing_sales_document",
        )
    except Exception as e:  # pragma: no cover
        return WmsPackingPostPackStepResult(step="print_document", ok=False, message=str(e)[:500])


def _packing_step_print_label(
    db: Session,
    *,
    tenant_id: int,
    order: Order,
    fb: WmsPackingFallbackLabel,
    offer_replacement_on_missing: bool = True,
) -> WmsPackingPostPackStepResult:
    """
    Resolve waybill (LIST_PRZEWOZOWY / pole „List przewozowy”) for client print/download.

    Gdy brak listu — nie drukuj szablonu „etykieta zastępcza” jako listu kurierskiego.
    Zamiast tego zwróć błąd z ``offer_replacement_label`` (osobny endpoint / popup).
    """
    _ = fb
    try:
        msg = _waybill_docs_client_message(db, order=order, kind="client_print_waybill")
        if msg:
            logger.info("wms_packing post-pack print_label order_id=%s message=%s", order.id, msg[:200])
            return WmsPackingPostPackStepResult(
                step="print_label",
                ok=True,
                skipped=False,
                message=msg,
            )
        if not offer_replacement_on_missing:
            return WmsPackingPostPackStepResult(
                step="print_label",
                ok=False,
                skipped=False,
                message="missing_waybill",
            )
        return WmsPackingPostPackStepResult(
            step="print_label",
            ok=False,
            skipped=False,
            message=(
                "courier_label_unavailable:"
                "Nie udało się wydrukować etykiety kurierskiej — brak listu przewozowego."
            ),
            offer_replacement_label=True,
        )
    except Exception as e:
        return WmsPackingPostPackStepResult(
            step="print_label",
            ok=False,
            message=f"courier_label_unavailable:{str(e)[:480]}",
            offer_replacement_label=offer_replacement_on_missing,
        )


def _packing_step_apply_packed_status(
    db: Session,
    *,
    order: Order,
    row: WmsPackingSettings,
    actions: WmsPackingAutoActions,
    tenant_id: int,
    warehouse_id: int,
) -> WmsPackingPostPackStepResult:
    """
    Gdy ``change_order_status`` włączone — ustawia ``packed_status_id``.
    Gdy wyłączone — nie zmienia statusu zamówienia tą akcją.
    """
    try:
        if not actions.change_order_status:
            logger.info(
                "PACKING_FINISH order_id=%s change_order_status disabled — leave status unchanged",
                order.id,
            )
            return WmsPackingPostPackStepResult(
                step="change_order_status",
                ok=True,
                skipped=True,
                message="disabled_in_settings",
            )
        pid = row.packed_status_id
        if pid is None:
            return WmsPackingPostPackStepResult(
                step="change_order_status",
                ok=False,
                message="packed_status_id_required_when_change_order_status_enabled",
            )
        st = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.id == int(pid),
                OrderUiStatus.tenant_id == int(tenant_id),
                OrderUiStatus.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        if st is None:
            return WmsPackingPostPackStepResult(
                step="change_order_status",
                ok=False,
                message="invalid_packed_status_id",
            )
        order.order_ui_status_id = int(pid)
        db.flush()
        logger.info(
            "PACKING_FINISH order_id=%s packed_status_id=%s name=%s",
            order.id,
            pid,
            str(st.name or "")[:120],
        )
        return WmsPackingPostPackStepResult(
            step="change_order_status",
            ok=True,
            message=str(st.name or "")[:200],
        )
    except Exception as e:
        logger.exception("PACKING_FINISH change_order_status failed order_id=%s", getattr(order, "id", None))
        return WmsPackingPostPackStepResult(step="change_order_status", ok=False, message=str(e)[:500])


def _run_wms_packing_post_pack_pipeline(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: Optional[int] = None,
) -> List[WmsPackingPostPackStepResult]:
    """Post-pack po ``POST …/finish``: najpierw status „spakowane”, potem dokument (twardy błąd), potem pozostałe kroki."""
    row = _get_or_create_wms_packing_settings_row(db, tenant_id, warehouse_id)
    actions = _json_settings_merge(WmsPackingAutoActions, row.auto_actions_json, WmsPackingAutoActions())
    doc_settings = _json_settings_merge(
        WmsPackingDocumentSettings,
        row.document_settings_json,
        WmsPackingDocumentSettings(),
    )
    fb = _json_settings_merge(WmsPackingFallbackLabel, row.fallback_label_json, WmsPackingFallbackLabel())

    logger.info(
        "PACKING_FINISH PACKING_SETTINGS tenant_id=%s warehouse_id=%s auto_actions=%s document_settings=%s",
        tenant_id,
        warehouse_id,
        json.dumps(actions.model_dump(), ensure_ascii=False),
        json.dumps(doc_settings.model_dump(), ensure_ascii=False),
    )

    out: List[WmsPackingPostPackStepResult] = []

    out.append(
        _packing_step_apply_packed_status(
            db,
            order=order,
            row=row,
            actions=actions,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
        )
    )
    status_step = out[-1]
    if not status_step.ok:
        msg = (status_step.message or "PACKED_STATUS_FAILED").strip()
        logger.error("PACKING_FINISH abort: packed status step failed: %s", msg)
        raise ValueError(msg)

    if actions.create_document:
        created = _packing_create_sale_document_strict(db, order, doc_settings, tenant_id, warehouse_id)
        out.append(
            WmsPackingPostPackStepResult(
                step="create_document",
                ok=True,
                skipped=False,
                message=f"id={created.id};number={created.document_number}",
            )
        )
    else:
        out.append(
            WmsPackingPostPackStepResult(
                step="create_document",
                ok=True,
                skipped=True,
                message="disabled_in_settings",
            )
        )

    # Packaging materials RW (carton + optional consumables) — shared Inventory engine.
    # Brak stanu opakowań NIE może blokować finalizacji pakowania (ostrzeżenie, nie rollback).
    try:
        from .packaging_materials.packing_consume_service import create_packing_packaging_rw

        pkg_rw = create_packing_packaging_rw(
            db,
            order=order,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            operator_user_id=operator_user_id,
            allow_negative=True,
        )
        out.append(
            WmsPackingPostPackStepResult(
                step="packaging_rw",
                ok=True,
                skipped=pkg_rw is None,
                message=(f"id={pkg_rw.id}" if pkg_rw is not None else "no_consumables"),
            )
        )
    except Exception as e:
        logger.exception(
            "PACKING_FINISH packaging_rw soft-fail order_id=%s err=%s",
            getattr(order, "id", None),
            str(e)[:300],
        )
        out.append(
            WmsPackingPostPackStepResult(
                step="packaging_rw",
                ok=False,
                skipped=False,
                message=str(e)[:500],
            )
        )
        # Soft-fail: kontynuuj status / dokumenty / przesyłkę — RW nie abortuje finish.
    if actions.generate_shipment:
        try:
            out.append(_packing_step_generate_shipment(db, order))
        except Exception as e:
            out.append(WmsPackingPostPackStepResult(step="generate_shipment", ok=False, message=str(e)[:500]))
    else:
        out.append(
            WmsPackingPostPackStepResult(
                step="generate_shipment",
                ok=True,
                skipped=True,
                message="disabled_in_settings",
            )
        )

    if actions.print_document:
        try:
            out.append(_packing_step_print_document(db, order))
        except Exception as e:
            out.append(WmsPackingPostPackStepResult(step="print_document", ok=False, message=str(e)[:500]))

    if actions.print_label:
        try:
            # Opóźnienie etykiety zastępczej jest obsługiwane w UI (przycisk po delay_seconds).
            # Nie blokujemy tu wątku worker/API sleepem.
            _ = max(0, min(int(fb.delay_seconds or 0), 120))
            lbl_step = _packing_step_print_label(db, tenant_id=tenant_id, order=order, fb=fb)
            out.append(lbl_step)
            if lbl_step.ok and not lbl_step.skipped:
                ship = getattr(order, "shipping_method_row", None)
                carrier = (getattr(ship, "name", None) or "").strip() or "Przewoźnik"
                emit_wms_label_generated(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    order_id=int(order.id),
                    operator_user_id=operator_user_id,
                    carrier_name=carrier,
                    tracking_number=None,
                    template_hint=str(getattr(fb, "template_id", None) or "") or None,
                )
        except Exception as e:
            out.append(
                WmsPackingPostPackStepResult(
                    step="print_label",
                    ok=False,
                    message=str(e)[:500],
                    offer_replacement_label=True,
                )
            )

    return out


def _infer_packing_mode_for_order(order: Order) -> tuple[str | None, int | None]:
    """Tryb kolejki pakowania z immutable handoff (nie z aktualnego PickingConfig)."""
    from .picking_handoff_service import packing_ui_mode_for_handoff

    cid = int(order.cart_id) if getattr(order, "cart_id", None) is not None and int(order.cart_id) > 0 else None
    return packing_ui_mode_for_handoff(getattr(order, "picking_handoff_mode", None), cid)


def _order_has_completed_consolidation_plan(db: Session, order: Order) -> bool:
    from .order_consolidation.constants import PLAN_STATUS_COMPLETED
    from ..models.order_consolidation_plan import OrderConsolidationPlan

    return (
        db.query(OrderConsolidationPlan.id)
        .filter(
            OrderConsolidationPlan.order_id == int(order.id),
            OrderConsolidationPlan.status == PLAN_STATUS_COMPLETED,
            OrderConsolidationPlan.target_warehouse_id == int(order.warehouse_id),
        )
        .first()
        is not None
    )


def resolve_packing_entry_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    operator_user_id: int | None = None,
    source_workflow: str = "shortage",
    redirected_from: str | None = None,
) -> "WmsPackingEntryOut":
    """
    Wejście bezpośrednio na ekran pakowania zamówienia (bootstrap sesji frontend + DB).
    """
    from ..schemas.wms_packing import WmsPackingEntryOut
    from .recovery_workflow_service import apply_fulfillment_state_from_resolver
    from .wms_audit_service import ensure_wms_packing_session, get_open_wms_packing_session

    order = (
        db.query(Order)
        .options(
            joinedload(Order.order_ui_status),
            joinedload(Order.cart),
        )
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
        )
        .first()
    )
    if order is None:
        raise ValueError("Zamówienie nie znalezione.")
    state = apply_fulfillment_state_from_resolver(db, order, log=True)
    if not state.packing_allowed:
        raise ValueError("Zamówienie nie jest gotowe do pakowania.")

    from .picking_handoff_service import ensure_handoff_from_live_cart_custody, normalize_handoff_mode

    ensure_handoff_from_live_cart_custody(db, order)
    mode, cart_id = _infer_packing_mode_for_order(order)
    if mode is None:
        # Consolidation shelf path — own entry (not CARTLESS)
        if _order_has_completed_consolidation_plan(db, order) and getattr(order, "cart_id", None) is None:
            mode, cart_id = "shelf", None
        else:
            raise ValueError(
                "Brak provenance pakowania (picking_handoff_mode). "
                "Zamówienie nie należy do kohort CART/BASKET/CARTLESS ani ścieżki półki konsolidacji."
            )
    status_candidates: list[int] = []
    if getattr(order, "order_ui_status_id", None) is not None and int(order.order_ui_status_id) > 0:
        status_candidates.append(int(order.order_ui_status_id))
    for row in list_packing_target_statuses(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)):
        status_candidates.append(int(row.target_status_id))
    seen: set[int] = set()
    ordered_status_ids: list[int] = []
    for sid in status_candidates:
        if sid in seen:
            continue
        seen.add(sid)
        ordered_status_ids.append(sid)

    modes_to_try = [mode]
    for alt in ("no_cart", "bulk", "baskets", "shelf"):
        if alt not in modes_to_try:
            modes_to_try.append(alt)

    chosen_status_id: int | None = None
    chosen_mode: str | None = None
    chosen_cart_id: int | None = None
    for sid in ordered_status_ids:
        for m in modes_to_try:
            cid_try = cart_id if m in ("bulk", "baskets") else None
            if m in ("bulk", "baskets") and (cid_try is None or int(cid_try) <= 0):
                continue
            detail = get_packing_order_detail_for_queue(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                status_id=int(sid),
                mode=m,
                cart_id=cid_try,
                order_id=int(order_id),
            )
            if detail is not None:
                chosen_status_id = int(sid)
                chosen_mode = m
                chosen_cart_id = cid_try
                break
        if chosen_status_id is not None:
            break

    if chosen_status_id is None or chosen_mode is None:
        raise ValueError("Zamówienie poza kolejką pakowania (brak pasującego statusu).")

    st = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == int(chosen_status_id),
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if st is None and order.order_ui_status is not None:
        st = order.order_ui_status
    status_name = str(st.name or "").strip() if st is not None else ""
    status_color = normalize_stored_color(st.color) if st is not None else "#94a3b8"
    main_group = cast(OrderUiMainGroup, _norm_group(st.main_group) if st is not None else "NEW")

    had_open = get_open_wms_packing_session(db, int(order.id)) is not None
    sess = ensure_wms_packing_session(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order=order,
        operator_user_id=operator_user_id,
        queue_meta={
            "source_workflow": source_workflow,
            "redirected_from": redirected_from or source_workflow,
            "mode": chosen_mode,
            "status_id": int(chosen_status_id),
            "cart_id": int(chosen_cart_id) if chosen_cart_id is not None else None,
        },
    )
    if had_open:
        logger.info(
            "[wms.packing.session.resume] order_id=%s packing_session_id=%s source_workflow=%s "
            "redirected_from=%s mode=%s status_id=%s",
            int(order.id),
            int(sess.id),
            source_workflow,
            redirected_from or "—",
            chosen_mode,
            chosen_status_id,
        )
    else:
        logger.info(
            "[wms.packing.session.create] order_id=%s packing_session_id=%s source_workflow=%s "
            "redirected_from=%s mode=%s status_id=%s",
            int(order.id),
            int(sess.id),
            source_workflow,
            redirected_from or "—",
            chosen_mode,
            chosen_status_id,
        )
    logger.info(
        "[wms.shortage.to_packing] order_id=%s packing_session_id=%s source_workflow=%s "
        "redirected_from=%s mode=%s status_id=%s cart_id=%s",
        int(order.id),
        int(sess.id),
        source_workflow,
        redirected_from or "—",
        chosen_mode,
        chosen_status_id,
        chosen_cart_id,
    )

    cart_code: str | None = None
    cart_type: str | None = None
    if chosen_cart_id is not None and getattr(order, "cart", None) is not None:
        cart_code = cart_display_name_for_wms(order.cart)
        raw = order.cart.type.value if hasattr(order.cart.type, "value") else str(order.cart.type)
        cart_type = raw.split(".")[-1].upper()

    return WmsPackingEntryOut(
        order_id=int(order.id),
        packing_session_id=int(sess.id),
        packing_session_created=not had_open,
        status_id=int(chosen_status_id),
        status_name=status_name,
        status_color=status_color,
        main_group=main_group,
        mode=cast(Literal["no_cart", "bulk", "baskets"], chosen_mode),
        cart_id=int(chosen_cart_id) if chosen_cart_id is not None else None,
        cart_code=cart_code,
        cart_type=cart_type,
        source_workflow=source_workflow,
    )


def get_oms_order_wms_fulfillment_card(db: Session, order_id: int) -> Optional[WmsPackingOrderCard]:
    """Karta linii magazynowych dla panelu OMS (bez kolejki pakowania WMS): lokalizacja, stany, kompletacja."""
    from ..services.order_fulfillment_recompute import recompute_order_fulfillment
    from ..services.recovery_workflow_service import apply_fulfillment_state_from_resolver

    recompute_order_fulfillment(db, int(order_id), commit=False)

    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.items).joinedload(OrderItem.source_bundle),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
            joinedload(Order.cart),
            joinedload(Order.basket),
        )
        .filter(Order.id == int(order_id))
        .first()
    )
    if order is None:
        return None
    apply_fulfillment_state_from_resolver(db, order, log=False)
    from .braki_order_state_service import log_wms_order_status_compute

    log_wms_order_status_compute(db, order, source="get_oms_order_wms_fulfillment_card")
    return _build_packing_order_card(
        order,
        db=db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        enrich=True,
    )
