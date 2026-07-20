import json
import logging
import re
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.cart_group import CartGroup
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.order_item import order_item_is_replaced_line
from ..models.pick import Pick
from ..models.pick_task import PickTask
from ..models.product import Product
from ..models.tenant import Tenant
from ..models.label_template import SavedLabelTemplate
from ..models.enums import CartType, CartStatus, normalize_cart_status_value
from ..models.wms_operation_session import WmsOperationSession
from ..models.wms_packing_session import WmsPackingSession
from ..models.app_user import AppUser
from ..schemas.cart import CartBulkCreate, CartUpdate
from .barcode_pdf_service import build_barcodes_pdf
from .esp_scan_codes import (
    assign_basket_scan_code,
    assign_cart_scan_code,
    find_cart_for_tenant_warehouse_scan,
)
from .label_pdf_generation_log import log_label_pdf_flow, log_label_pdf_stage
from .label_render_service import build_label_pdf, template_json_to_dict
from .cart_capacity import build_capacity_snapshot
from .cart_capacity.profile import normalize_capacity_strategy

logger = logging.getLogger(__name__)

# Fallback volume per unit when product volume is missing (avoid 0% fill for assigned orders)


_ORDER_VOLUME_FALLBACK_DM3 = 0.05


def _cart_capacity_fields(db: Session, cart: Cart) -> dict:
    snap = build_capacity_snapshot(db, cart).to_dict()
    return {
        "capacity": snap,
        "capacity_strategy": getattr(cart, "capacity_strategy", None),
        "capacity_orders": getattr(cart, "capacity_orders", None),
        "capacity_volume": getattr(cart, "capacity_volume", None),
    }


def _wms_pick_stats_for_cart(db: Session, cart_id: int) -> dict:
    """Agregat kompletacji WMS: zamówienia / SKU / szt. z tabeli picks (picked_at IS NOT NULL)."""
    row = (
        db.query(
            func.count(func.distinct(Pick.order_id)),
            func.count(func.distinct(Pick.product_id)),
            func.coalesce(func.sum(Pick.quantity), 0.0),
        )
        .filter(Pick.cart_id == int(cart_id), Pick.picked_at.isnot(None))
        .first()
    )
    if not row:
        return {"wms_picking_order_count": 0, "wms_picking_product_count": 0, "wms_picking_quantity": 0.0}
    return {
        "wms_picking_order_count": int(row[0] or 0),
        "wms_picking_product_count": int(row[1] or 0),
        "wms_picking_quantity": round(float(row[2] or 0.0), 4),
    }


def _order_used_volume_dm3_from_items(order) -> float:
    """Sum of (volume_dm3 * quantity) per operational line only (P4.15B — skip ON_DEMAND parent)."""
    from .bundle_order_item_ops import order_item_is_operational_picking_line

    total = 0.0
    for item in getattr(order, "items", []) or []:
        if not order_item_is_operational_picking_line(item):
            continue
        product = getattr(item, "product", None)
        qty = int(item.quantity or 0)
        if qty <= 0:
            continue
        vol_per_unit = None
        if getattr(item, "total_volume", None) is not None and float(item.total_volume or 0) > 0:
            vol_per_unit = float(item.total_volume)
        if vol_per_unit is None and product and getattr(product, "volume", None) is not None and float(product.volume or 0) > 0:
            vol_per_unit = float(product.volume)
        if vol_per_unit is None and product:
            l_ = float(getattr(product, "length", None) or 0)
            w_ = float(getattr(product, "width", None) or 0)
            h_ = float(getattr(product, "height", None) or 0)
            if l_ and w_ and h_:
                vol_per_unit = (l_ * w_ * h_) / 1000.0
        if vol_per_unit is None or vol_per_unit <= 0:
            logger.warning(
                "Basket fill: product volume missing or zero (order_id=%s, product_id=%s); using fallback %.2f dm³",
                getattr(order, "id", None),
                getattr(product, "id", None) if product else None,
                _ORDER_VOLUME_FALLBACK_DM3,
            )
            vol_per_unit = _ORDER_VOLUME_FALLBACK_DM3
        total += vol_per_unit * qty
    if total <= 0 and getattr(order, "items", None):
        total = _ORDER_VOLUME_FALLBACK_DM3
    return round(total, 2)


def _wms_pick_volume_dm3_for_cart(db: Session, cart_id: int) -> float:
    """
    Estimated picked volume for a cart from Pick rows.
    Uses: order_item.total_volume OR product.volume OR fallback.
    """
    row = (
        db.query(
            func.coalesce(
                func.sum(
                    Pick.quantity
                    * func.coalesce(
                        OrderItem.total_volume,
                        Product.volume,
                        _ORDER_VOLUME_FALLBACK_DM3,
                    )
                ),
                0.0,
            )
        )
        .outerjoin(OrderItem, OrderItem.id == Pick.order_item_id)
        .outerjoin(Product, Product.id == Pick.product_id)
        .filter(Pick.cart_id == int(cart_id), Pick.picked_at.isnot(None))
        .first()
    )
    return round(float((row[0] if row else 0.0) or 0.0), 3)


def _order_customer_name(order) -> str | None:
    raw = getattr(order, "addresses_json", None)
    if not raw:
        return None
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None
    shipping = data.get("shipping") if isinstance(data, dict) else None
    billing = data.get("billing") if isinstance(data, dict) else None
    src = shipping if isinstance(shipping, dict) and shipping else (billing if isinstance(billing, dict) else {})
    company = str(src.get("company") or src.get("company_name") or "").strip()
    if company:
        return company
    fn = str(src.get("first_name") or "").strip()
    ln = str(src.get("last_name") or "").strip()
    full = f"{fn} {ln}".strip()
    return full or None


def _order_display_customer(order) -> str:
    """Customer label for cart order preview (company preferred)."""
    cust = getattr(order, "customer", None)
    if cust is not None:
        company = (getattr(cust, "company_name", None) or "").strip()
        if company:
            return company
        name = f"{getattr(cust, 'first_name', '') or ''} {getattr(cust, 'last_name', '') or ''}".strip()
        if name:
            return name
    return _order_customer_name(order) or "—"


def _order_display_status(order) -> str:
    ui = getattr(order, "order_ui_status", None)
    if ui is not None:
        label = (getattr(ui, "name", None) or "").strip()
        if label:
            return label
    return str(getattr(order, "status", None) or "—")


def _serialize_cart_order_product_lines(order) -> list[dict]:
    from .bundle_order_item_ops import order_item_is_operational_picking_line

    lines: list[dict] = []
    for item in getattr(order, "items", None) or []:
        if not order_item_is_operational_picking_line(item):
            continue
        qty = int(getattr(item, "quantity", 0) or 0)
        if qty <= 0:
            continue
        prod = getattr(item, "product", None)
        name = (
            (getattr(prod, "name", None) or "").strip()
            if prod is not None
            else ""
        )
        if not name:
            name = (getattr(item, "offer_name_snapshot", None) or "").strip()
        if not name:
            pid = getattr(item, "product_id", None)
            name = f"Produkt #{pid}" if pid else "Produkt"
        sku = ""
        ean = ""
        if prod is not None:
            sku = str(getattr(prod, "sku", None) or getattr(prod, "symbol", None) or "").strip()
            ean = str(getattr(prod, "ean", None) or getattr(prod, "barcode", None) or "").strip()
        lines.append({"name": name, "quantity": qty, "sku": sku or None, "ean": ean or None})
    return lines


def _order_ids_with_picks(db: Session, order_ids: list[int], *, cart_id: int | None = None) -> set[int]:
    if not order_ids:
        return set()
    from ..models.pick import Pick

    q = db.query(Pick.order_id).filter(Pick.order_id.in_([int(x) for x in order_ids]))
    if cart_id is not None:
        q = q.filter(Pick.cart_id == int(cart_id))
    return {int(r[0]) for r in q.distinct().all() if r[0] is not None}


def _order_picking_shortage_projection(order) -> dict:
    """
    Read-only projection of operational shortage on cart UI.
    Does not mutate order lifecycle / fulfillment_state.
    Only flags INCOMPLETE when declared shortage exists on any line.
    """
    shortage_units = 0.0
    for oi in getattr(order, "items", None) or []:
        if order_item_is_replaced_line(oi):
            continue
        q = float(getattr(oi, "quantity", 0) or 0)
        if q <= 1e-12:
            continue
        raw = float(getattr(oi, "wms_picking_line_missing_qty", 0) or 0)
        shortage_units += min(max(0.0, raw), q)
    shortage_units = round(shortage_units, 6)
    if shortage_units > 1e-9:
        return {
            "picking_shortage_qty": shortage_units,
            "picking_status": "INCOMPLETE",
            "picking_status_label": "NIEKOMPLETNE",
        }
    return {
        "picking_shortage_qty": 0.0,
        "picking_status": "READY",
        "picking_status_label": "GOTOWE",
    }


def _serialize_assigned_order_row(
    order,
    *,
    can_detach: bool = False,
    detach_block_reason: str | None = None,
) -> dict:
    """Rich row for admin „Przypisane zamówienia” section."""
    number = getattr(order, "number", None)
    products = _serialize_cart_order_product_lines(order)
    items_count = len(products) or len(
        [i for i in (getattr(order, "items", None) or []) if float(getattr(i, "quantity", 0) or 0) > 0]
    )
    vol = getattr(order, "total_volume_dm3", None)
    if vol is None or float(vol or 0) <= 0:
        vol = _order_used_volume_dm3_from_items(order)
    weight = _order_total_weight_kg(order)
    shortage_proj = _order_picking_shortage_projection(order)
    return {
        "order_id": int(order.id),
        "number": str(number) if number not in (None, "") else str(order.id),
        "status": _order_display_status(order),
        "customer_name": _order_display_customer(order),
        "items_count": int(items_count),
        "total_volume_dm3": round(float(vol or 0), 2),
        "total_weight_kg": float(weight),
        "products": products,
        "can_detach": bool(can_detach),
        "detach_block_reason": detach_block_reason,
        **shortage_proj,
    }


def _assigned_orders_payload(db: Session, cart, orders: list) -> list[dict]:
    from .cart_picking_lifecycle_service import (
        ORDER_DETACH_BLOCKED_MSG,
        get_cart_status,
    )
    from ..models.enums import CartStatus

    st = get_cart_status(cart)
    packing_like = st in (CartStatus.READY_FOR_PACKING, CartStatus.PACKING)
    with_picks = _order_ids_with_picks(
        db,
        [int(o.id) for o in orders],
        cart_id=int(cart.id),
    )
    out: list[dict] = []
    for o in orders:
        blocked = packing_like or int(o.id) in with_picks
        out.append(
            _serialize_assigned_order_row(
                o,
                can_detach=not blocked,
                detach_block_reason=ORDER_DETACH_BLOCKED_MSG if blocked else None,
            )
        )
    return out


def _serialize_cart_order_preview(order, *, order_id: int | None = None) -> dict:
    """
    One order entry for cart content hover.
    Missing / soft-deleted order → exists=False („Zamówienie nie istnieje”).
    """
    oid = int(order_id) if order_id is not None else (int(order.id) if order is not None else None)
    if order is None or getattr(order, "deleted_at", None) is not None:
        return {
            "exists": False,
            "order_id": oid,
            "number": None,
            "customer_name": None,
            "status": None,
            "products": [],
            "missing_label": "Zamówienie nie istnieje",
        }
    number = getattr(order, "number", None)
    return {
        "exists": True,
        "order_id": int(order.id),
        "number": str(number) if number not in (None, "") else str(order.id),
        "customer_name": _order_display_customer(order),
        "status": _order_display_status(order),
        "products": _serialize_cart_order_product_lines(order),
        "missing_label": None,
    }


def _build_cart_orders_preview(assigned, baskets_iter) -> list[dict]:
    """Unique orders from assigned_orders + basket.order_id (eager-loaded)."""
    by_id: dict[int, object | None] = {}
    for o in assigned or []:
        oid = getattr(o, "id", None)
        if oid is None:
            continue
        by_id[int(oid)] = o
    for b in baskets_iter or []:
        oid = getattr(b, "order_id", None)
        if oid is None:
            continue
        oid_i = int(oid)
        if oid_i not in by_id:
            by_id[oid_i] = getattr(b, "order", None)
    return [_serialize_cart_order_preview(o, order_id=oid) for oid, o in sorted(by_id.items())]


_CART_ORDER_EAGER = (
    joinedload(Order.customer),
    joinedload(Order.order_ui_status),
    joinedload(Order.items).joinedload(OrderItem.product),
)

_PICKING_SESSION_KINDS = ("picking_active", "picking_recovery_active")


def _empty_cart_assignment() -> dict:
    return {
        "assigned_user_id": None,
        "assigned_user_name": None,
        "assignment_type": None,
        "assignment_since": None,
    }


def _session_activity_ts(started_at, last_activity_at):
    return last_activity_at or started_at


def _batch_cart_assignments(db: Session, cart_ids: list[int]) -> dict[int, dict]:
    """
    Live cart ownership from open WMS sessions (no new tables).

    Priority per cart: packing (open WmsPackingSession via order.cart_id)
    → collecting (open WmsOperationSession picking_*) → unassigned.
    """
    ids = sorted({int(cid) for cid in cart_ids if cid is not None and int(cid) > 0})
    out: dict[int, dict] = {cid: _empty_cart_assignment() for cid in ids}
    if not ids:
        return out

    collecting_best: dict[int, tuple] = {}
    packing_best: dict[int, tuple] = {}

    picking_rows = (
        db.query(
            WmsOperationSession.cart_id,
            WmsOperationSession.operator_user_id,
            WmsOperationSession.started_at,
            WmsOperationSession.last_activity_at,
        )
        .filter(
            WmsOperationSession.completed_at.is_(None),
            WmsOperationSession.cart_id.in_(ids),
            WmsOperationSession.session_kind.in_(_PICKING_SESSION_KINDS),
            WmsOperationSession.operator_user_id.isnot(None),
        )
        .all()
    )
    for cart_id, user_id, started_at, last_activity_at in picking_rows:
        if cart_id is None or user_id is None:
            continue
        cid = int(cart_id)
        ts = _session_activity_ts(started_at, last_activity_at)
        prev = collecting_best.get(cid)
        if prev is None or (ts is not None and (prev[2] is None or ts > prev[2])):
            collecting_best[cid] = (int(user_id), started_at, ts)

    packing_rows = (
        db.query(
            Order.cart_id,
            WmsPackingSession.operator_user_id,
            WmsPackingSession.started_at,
            WmsPackingSession.last_activity_at,
        )
        .join(Order, Order.id == WmsPackingSession.order_id)
        .filter(
            WmsPackingSession.completed_at.is_(None),
            Order.cart_id.in_(ids),
            WmsPackingSession.operator_user_id.isnot(None),
        )
        .all()
    )
    for cart_id, user_id, started_at, last_activity_at in packing_rows:
        if cart_id is None or user_id is None:
            continue
        cid = int(cart_id)
        ts = _session_activity_ts(started_at, last_activity_at)
        prev = packing_best.get(cid)
        if prev is None or (ts is not None and (prev[2] is None or ts > prev[2])):
            packing_best[cid] = (int(user_id), started_at, ts)

    user_ids = sorted(
        {
            *(uid for uid, _, _ in collecting_best.values()),
            *(uid for uid, _, _ in packing_best.values()),
        }
    )
    name_by_id: dict[int, str] = {}
    if user_ids:
        for u in db.query(AppUser).filter(AppUser.id.in_(user_ids)).all():
            fn = (getattr(u, "first_name", None) or "").strip()
            ln = (getattr(u, "last_name", None) or "").strip()
            full = f"{fn} {ln}".strip()
            name_by_id[int(u.id)] = full or (getattr(u, "login", None) or "").strip() or f"Użytkownik #{u.id}"
    for cid in ids:
        if cid in packing_best:
            uid, started_at, _ = packing_best[cid]
            out[cid] = {
                "assigned_user_id": uid,
                "assigned_user_name": name_by_id.get(uid) or f"Użytkownik #{uid}",
                "assignment_type": "packing",
                "assignment_since": started_at.isoformat() if started_at is not None else None,
            }
        elif cid in collecting_best:
            uid, started_at, _ = collecting_best[cid]
            out[cid] = {
                "assigned_user_id": uid,
                "assigned_user_name": name_by_id.get(uid) or f"Użytkownik #{uid}",
                "assignment_type": "collecting",
                "assignment_since": started_at.isoformat() if started_at is not None else None,
            }
    return out

def _cart_stats(db: Session, cart_id: int, assigned, baskets_iter):
    """
    SSOT: agregat z orders.cart_id / picking_session_id (cart_stats_service).
    Parametry assigned/baskets_iter zachowane dla kompatybilności wywołań — nieużywane do liczników.
    """
    from .cart_stats_service import get_cart_stats_or_404, list_orders_on_cart
    from ..models.cart import Cart

    s = get_cart_stats_or_404(db, int(cart_id))
    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    orders = list_orders_on_cart(db, cart) if cart else []
    return {
        "total_orders": s["orders_count"],
        "total_products": s["products_count"],
        "baskets_used": s["occupied_sections"],
        "used_volume_dm3": s["volume_used"],
        "used_weight_kg": round(sum(_order_total_weight_kg(o) for o in orders), 3),
        "sections_count": s["sections_count"],
        "percent_used": s["percent_used"],
    }


def _orders_for_cart_preview(db: Session, cart) -> list:
    from .cart_stats_service import list_orders_on_cart

    return list_orders_on_cart(db, cart, with_items=True)


def _order_total_weight_kg(order) -> float:
    """Sum of (quantity * product.weight) for all items; product.weight in kg (CSV comma-to-dot)."""
    total = 0.0
    for item in getattr(order, "items", []) or []:
        product = getattr(item, "product", None)
        w = float(product.weight or 0) if product else 0
        qty = int(item.quantity or 0)
        total += w * qty
    return round(total, 3)


def _generate_cart_barcode(db: Session, tenant_id: int, warehouse_id: int) -> str:
    """Next CART-NNNN for tenant/warehouse (e.g. CART-0001), scanning ``code`` and legacy ``barcode``."""
    numbers: list[int] = []
    for col in (Cart.code, Cart.barcode):
        rows = (
            db.query(col)
            .filter(
                Cart.tenant_id == tenant_id,
                Cart.warehouse_id == warehouse_id,
                col != None,  # noqa: E711
                col.like("CART-%"),
            )
            .all()
        )
        for (val,) in rows:
            if val:
                m = re.match(r"CART-(\d+)", str(val))
                if m:
                    numbers.append(int(m.group(1)))
    next_num = (max(numbers) + 1) if numbers else 1
    return f"CART-{next_num:04d}"


def _norm_cart_code(val) -> str:
    return (val if val is not None else "").strip()


def _cart_code_taken(db: Session, tenant_id: int, warehouse_id: int, code: str, *, exclude_cart_id: int | None = None) -> bool:
    q = db.query(Cart.id).filter(
        Cart.tenant_id == int(tenant_id),
        Cart.warehouse_id == int(warehouse_id),
        Cart.code == code,
    )
    if exclude_cart_id is not None:
        q = q.filter(Cart.id != int(exclude_cart_id))
    return q.first() is not None


def _resolve_new_cart_code(db: Session, tenant_id: int, warehouse_id: int, explicit: str | None) -> str:
    s = _norm_cart_code(explicit)
    if s:
        if _cart_code_taken(db, tenant_id, warehouse_id, s):
            raise HTTPException(status_code=422, detail="Kod wózka jest już użyty w tym magazynie.")
        return s
    return _generate_cart_barcode(db, tenant_id, warehouse_id)


def _assign_basket_barcodes(cart):
    """Set basket.barcode = cart primary code + '-B' + index (01, 02, ...) by row, column, id."""
    base = _norm_cart_code(getattr(cart, "code", None)) or _norm_cart_code(getattr(cart, "barcode", None))
    if not base:
        return
    baskets = sorted(
        getattr(cart, "baskets", None) or [],
        key=lambda b: (getattr(b, "row", 0), getattr(b, "column", 0), getattr(b, "id", 0)),
    )
    for i, basket in enumerate(baskets, 1):
        basket.barcode = f"{base}-B{i:02d}"
    for basket in baskets:
        assign_basket_scan_code(basket)


class CartService:
    def __init__(self, db: Session):
        self.db = db

    def create_bulk_cart(self, data: CartBulkCreate):
        vol = getattr(data, "max_volume_dm3", None)
        if vol is None:
            vol = (data.length * data.width * data.height) / 1000
        code_val = _resolve_new_cart_code(
            self.db,
            data.tenant_id,
            data.warehouse_id,
            getattr(data, "code", None),
        )
        new_cart = Cart(
            name=data.name.upper(),
            code=code_val,
            barcode=code_val,
            tenant_id=data.tenant_id,
            warehouse_id=data.warehouse_id,
            group_id=getattr(data, 'group_id', None),
            image_url=getattr(data, 'image_url', None),
            length=data.length,
            width=data.width,
            height=data.height,
            total_volume=round(vol, 2),
            type=CartType.BULK,
            status=CartStatus.AVAILABLE.value,
            capacity_strategy=normalize_capacity_strategy(
                getattr(data, "capacity_strategy", None),
                cart_type="BULK",
            ).value,
            capacity_orders=getattr(data, "capacity_orders", None),
            capacity_volume=getattr(data, "capacity_volume", None),
        )
        self.db.add(new_cart)
        self.db.flush()
        assign_cart_scan_code(new_cart)
        try:
            self.db.commit()
            self.db.refresh(new_cart)
            logger.info("create_bulk_cart committed cart id=%s tenant_id=%s warehouse_id=%s", new_cart.id, data.tenant_id, data.warehouse_id)
            return new_cart
        except IntegrityError as e:
            self.db.rollback()
            logger.exception("create_bulk_cart IntegrityError (e.g. missing tenant_id/warehouse_id): %s", e)
            raise HTTPException(status_code=422, detail=f"Błąd zapisu wózka: {str(e.orig)}")

    def create_multi_cart(self, data):
        code_val = _resolve_new_cart_code(
            self.db,
            data.tenant_id,
            data.warehouse_id,
            getattr(data, "code", None),
        )
        cart = Cart(
            name=data.name.upper(),
            code=code_val,
            barcode=code_val,
            tenant_id=data.tenant_id,
            warehouse_id=data.warehouse_id,
            group_id=getattr(data, 'group_id', None),
            image_url=getattr(data, 'image_url', None),
            type=CartType.MULTI,
            total_volume=0,
            status=CartStatus.AVAILABLE.value,
            capacity_strategy=normalize_capacity_strategy(
                getattr(data, "capacity_strategy", None),
                cart_type="MULTI",
            ).value,
            capacity_orders=getattr(data, "capacity_orders", None),
            capacity_volume=getattr(data, "capacity_volume", None),
        )
        self.db.add(cart)
        self.db.flush()
        assign_cart_scan_code(cart)

        baskets_data = data.baskets if hasattr(data, 'baskets') else data.get('baskets', [])
        for b_info in baskets_data:
            get_val = lambda obj, key, default: getattr(obj, key, default) if hasattr(obj, key) else obj.get(key, default)
            l = get_val(b_info, 'length', 0)
            w = get_val(b_info, 'width', 0)
            h = get_val(b_info, 'height', 0)
            vol_cm3 = (l * w * h)

            basket = CartBasket(
                cart_id=cart.id,
                warehouse_id=int(cart.warehouse_id),
                name=get_val(b_info, 'name', f"S-{get_val(b_info, 'row', 0)}/{get_val(b_info, 'column', 0)}"),
                row=get_val(b_info, 'row', 0),
                column=get_val(b_info, 'column', 0),
                inner_length=l,
                inner_width=w,
                inner_height=h,
                usable_volume=vol_cm3
            )
            self.db.add(basket)

        self.db.flush()
        _assign_basket_barcodes(cart)
        cart.recalculate_total_volume()
        if getattr(data, "max_volume_dm3", None) is not None:
            try:
                mv = float(data.max_volume_dm3)
                if mv > 0:
                    cart.total_volume = round(mv, 2)
            except (TypeError, ValueError):
                pass
        try:
            self.db.commit()
            self.db.refresh(cart)
            logger.info("create_multi_cart committed cart id=%s tenant_id=%s warehouse_id=%s", cart.id, cart.tenant_id, cart.warehouse_id)
            return cart
        except IntegrityError as e:
            self.db.rollback()
            logger.exception("create_multi_cart IntegrityError (e.g. missing tenant_id/warehouse_id): %s", e)
            raise HTTPException(status_code=422, detail=f"Błąd zapisu wózka: {str(e.orig)}")

    def get_groups(self, tenant_id: int, cart_type: str):
        """
        Lightweight group listing for dropdowns. `cart_type` must be BULK or MULTI.
        """
        ct = CartType[cart_type.upper()]
        groups = (
            self.db.query(CartGroup)
            .filter(CartGroup.tenant_id == tenant_id, CartGroup.cart_type == ct)
            .all()
        )
        return [
            {"id": g.id, "tenant_id": g.tenant_id, "cart_type": cart_type.upper(), "name": g.name, "description": g.description}
            for g in groups
        ]

    def get_all(self, tenant_id: int, cart_type: str | None = None):
        ct = CartType[cart_type.upper()] if cart_type else None

        groups_q = (
            self.db.query(CartGroup)
            .filter(CartGroup.tenant_id == tenant_id)
            .options(
                joinedload(CartGroup.carts).joinedload(Cart.baskets).joinedload(CartBasket.order).options(*_CART_ORDER_EAGER),
                joinedload(CartGroup.carts).joinedload(Cart.assigned_orders).options(*_CART_ORDER_EAGER),
            )
        )
        if ct is not None:
            groups_q = groups_q.filter(CartGroup.cart_type == ct)
        groups = groups_q.all()

        carts_q = self.db.query(Cart).filter(Cart.tenant_id == tenant_id, Cart.group_id == None)
        if ct is not None:
            carts_q = carts_q.filter(Cart.type == ct)
        unassigned_carts = carts_q.options(
            joinedload(Cart.baskets).joinedload(CartBasket.order).options(*_CART_ORDER_EAGER),
            joinedload(Cart.assigned_orders).options(*_CART_ORDER_EAGER),
        ).all()

        all_carts: list = []
        for g in groups:
            for c in g.carts or []:
                if (ct is None or c.type == ct) and (not hasattr(g, "cart_type") or c.type == g.cart_type):
                    all_carts.append(c)
        all_carts.extend(unassigned_carts)
        assignment_by_cart = _batch_cart_assignments(self.db, [int(c.id) for c in all_carts])
        from .cart_stats_service import batch_cart_stats

        stats_by_cart = batch_cart_stats(self.db, all_carts)

        def format_item(cart):
            cart.recalculate_total_volume()
            raw_type = cart.type.value if hasattr(cart.type, 'value') else str(cart.type)
            clean_type = raw_type.split('.')[-1].upper()
            raw_status = cart.status.value if hasattr(cart.status, 'value') else str(cart.status)
            clean_status = normalize_cart_status_value(raw_status.split('.')[-1])
            orders_ssot = _orders_for_cart_preview(self.db, cart)
            s = stats_by_cart.get(int(cart.id)) or {
                "orders_count": 0,
                "products_count": 0,
                "sections_count": 1 if clean_type != "MULTI" else 0,
                "occupied_sections": 0,
                "volume_used": 0.0,
                "percent_used": 0.0,
            }
            pick_extra = _wms_pick_stats_for_cart(self.db, cart.id)
            orders_preview = [_serialize_cart_order_preview(o, order_id=int(o.id)) for o in orders_ssot]
            assigned_orders = _assigned_orders_payload(self.db, cart, orders_ssot)
            order_numbers = [str(o.number) for o in orders_ssot if getattr(o, "number", None) not in (None, "")]
            assignment = assignment_by_cart.get(int(cart.id)) or _empty_cart_assignment()
            return {
                "id": cart.id,
                "name": cart.name,
                "code": getattr(cart, "code", None) or getattr(cart, "barcode", None),
                "barcode": getattr(cart, "barcode", None),
                "scan_code": getattr(cart, "scan_code", None),
                "type": clean_type,
                "status": clean_status,
                "group_id": cart.group_id,
                "image_url": cart.image_url,
                "total_baskets": len(cart.baskets) if clean_type == "MULTI" else 1,
                "total_volume_dm3": round(cart.total_volume or 0, 2),
                "max_volume_dm3": round(cart.total_volume or 0, 2),
                "used_volume": s["volume_used"],
                "assigned_orders": assigned_orders,
                "order_numbers": order_numbers,
                "orders_preview": orders_preview,
                "total_weight_kg": round(sum(_order_total_weight_kg(o) for o in orders_ssot), 3),
                "width": cart.width or 0,
                "length": cart.length or 0,
                "height": cart.height or 0,
                "total_orders": s["orders_count"],
                "total_products": s["products_count"],
                "baskets_used": s["occupied_sections"],
                "sections_count": s["sections_count"],
                "occupied_sections": s["occupied_sections"],
                "percent_used": s["percent_used"],
                **_cart_capacity_fields(self.db, cart),
                **assignment,
                **pick_extra,
            }

        result = []
        for g in groups:
            result.append({
                "id": g.id,
                "name": g.name,
                "is_group": True,
                "cart_type": (g.cart_type.name.upper() if hasattr(g.cart_type, "name") else str(g.cart_type).split(".")[-1].upper()),
                "items": [
                    format_item(c)
                    for c in g.carts
                    if (ct is None or c.type == ct) and (not hasattr(g, "cart_type") or c.type == g.cart_type)
                ]
            })

        if unassigned_carts:
            result.append({
                "id": 999,
                "name": "WÓZKI NIEPRZYPISANE",
                "is_group": True,
                "items": [format_item(c) for c in unassigned_carts]
            })
        return result

    def get_details(self, cart_id: int):
        cart = self.db.query(Cart).options(
            joinedload(Cart.baskets).joinedload(CartBasket.order).options(*_CART_ORDER_EAGER),
            joinedload(Cart.assigned_orders).options(*_CART_ORDER_EAGER),
        ).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")

        changed = False
        if not _norm_cart_code(getattr(cart, "code", None)):
            bc = _norm_cart_code(getattr(cart, "barcode", None))
            cart.code = bc if bc else _generate_cart_barcode(self.db, cart.tenant_id, cart.warehouse_id)
            changed = True
        if not _norm_cart_code(getattr(cart, "barcode", None)):
            cart.barcode = cart.code
            changed = True
        if not (getattr(cart, "scan_code", None) or "").strip():
            assign_cart_scan_code(cart)
            changed = True
        if changed:
            _assign_basket_barcodes(cart)
            self.db.commit()
            self.db.refresh(cart)

        raw_type = cart.type.value if hasattr(cart.type, 'value') else str(cart.type)
        clean_type = raw_type.split('.')[-1].upper()
        orders_ssot = _orders_for_cart_preview(self.db, cart)
        stats = _cart_stats(self.db, int(cart.id), orders_ssot, getattr(cart, "baskets", None) or [])
        pick_extra = _wms_pick_stats_for_cart(self.db, cart.id)
        order_numbers = [str(o.number) for o in orders_ssot if getattr(o, "number", None) not in (None, "")]
        orders_preview = [_serialize_cart_order_preview(o, order_id=int(o.id)) for o in orders_ssot]
        assigned_orders = _assigned_orders_payload(self.db, cart, orders_ssot)
        assignment = _batch_cart_assignments(self.db, [int(cart.id)]).get(int(cart.id)) or _empty_cart_assignment()
        if assignment.get("assigned_user_id") is None:
            lifecycle_uid = getattr(cart, "assigned_user_id", None) or getattr(cart, "packing_user_id", None)
            if lifecycle_uid is not None:
                assignment = {
                    **assignment,
                    "assigned_user_id": int(lifecycle_uid),
                    "assigned_user_name": assignment.get("assigned_user_name")
                    or f"Użytkownik #{int(lifecycle_uid)}",
                }

        baskets_out = []
        for b in cart.baskets or []:
            o = getattr(b, "order", None)
            w = round(_order_total_weight_kg(o), 3) if o else 0.0
            if o:
                used_dm3 = _order_used_volume_dm3_from_items(o)
            else:
                used_dm3 = round(getattr(b, "used_volume", None) or 0, 2)
            baskets_out.append({
                "id": b.id,
                "name": b.name,
                "barcode": getattr(b, "barcode", None),
                "scan_code": getattr(b, "scan_code", None),
                "row": b.row,
                "column": b.column,
                "length": b.inner_length,
                "width": b.inner_width,
                "height": b.inner_height,
                "order_id": b.order_id,
                "order_number": o.number if o else None,
                "order_customer_name": _order_customer_name(o) if o else None,
                "used_volume_dm3": used_dm3,
                "total_weight_kg": w,
                **(
                    _order_picking_shortage_projection(o)
                    if o is not None
                    else {
                        "picking_shortage_qty": 0.0,
                        "picking_status": "EMPTY",
                        "picking_status_label": None,
                    }
                ),
            })

        return {
            "id": cart.id,
            "name": cart.name,
            "code": getattr(cart, "code", None) or getattr(cart, "barcode", None),
            "barcode": getattr(cart, "barcode", None),
            "scan_code": getattr(cart, "scan_code", None),
            "type": clean_type,
            "status": normalize_cart_status_value(
                cart.status.value if hasattr(cart.status, "value") else str(cart.status)
            ),
            "current_session_id": getattr(cart, "current_session_id", None),
            "tenant_id": cart.tenant_id,
            "warehouse_id": cart.warehouse_id,
            "group_id": cart.group_id,
            "image_url": cart.image_url,
            "length": cart.length or 0,
            "width": cart.width or 0,
            "height": cart.height or 0,
            "baskets": baskets_out,
            "used_volume": stats["used_volume_dm3"],
            "total_volume_dm3": round(cart.total_volume or 0, 2),
            "max_volume_dm3": round(cart.total_volume or 0, 2),
            "order_numbers": order_numbers,
            "assigned_orders": assigned_orders,
            "orders_preview": orders_preview,
            "total_weight_kg": stats["used_weight_kg"],
            "total_orders": stats["total_orders"],
            "total_products": stats["total_products"],
            "baskets_used": stats["baskets_used"],
            "sections_count": stats.get("sections_count"),
            "occupied_sections": stats.get("baskets_used"),
            "percent_used": stats.get("percent_used"),
            **_cart_capacity_fields(self.db, cart),
            **assignment,
            **pick_extra,
        }

    def get_details_by_code(self, tenant_id: int, warehouse_id: int, code: str):
        c = (code or "").strip()
        if not c:
            raise HTTPException(status_code=422, detail="Podaj kod wózka.")
        row = find_cart_for_tenant_warehouse_scan(self.db, tenant_id, warehouse_id, c)
        if not row:
            raise HTTPException(status_code=404, detail="Nie znaleziono wózka o podanym kodzie.")
        return self.get_details(int(row.id))

    def _ensure_cart_barcodes(self, cart) -> None:
        """Ensure cart code/barcode and basket barcodes; commit if updated."""
        changed = False
        if not _norm_cart_code(getattr(cart, "code", None)):
            bc = _norm_cart_code(getattr(cart, "barcode", None))
            cart.code = bc if bc else _generate_cart_barcode(self.db, cart.tenant_id, cart.warehouse_id)
            changed = True
        if not _norm_cart_code(getattr(cart, "barcode", None)):
            cart.barcode = cart.code
            changed = True
        if not (getattr(cart, "scan_code", None) or "").strip():
            assign_cart_scan_code(cart)
            changed = True
        if changed:
            _assign_basket_barcodes(cart)
            self.db.commit()
            self.db.refresh(cart)

    def get_cart_barcode_pdf(self, cart_id: int) -> bytes:
        """Return PDF bytes with Code128: cart barcode only (one label)."""
        cart = self.db.query(Cart).options(joinedload(Cart.baskets)).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        self._ensure_cart_barcodes(cart)
        w_mm, h_mm = self._legacy_barcode_pdf_page_mm(int(cart.tenant_id), "cart")
        log_label_pdf_flow(
            "cart_service",
            template_id=None,
            template_json=None,
            width_mm=w_mm,
            height_mm=h_mm,
            detail="get_cart_barcode_pdf -> barcode_pdf_service.build_barcodes_pdf",
        )
        log_label_pdf_stage(
            source="cart_service.get_cart_barcode_pdf",
            width_mm=w_mm,
            height_mm=h_mm,
            detail=f"cart_id={cart_id} tenant_id={cart.tenant_id} -> build_barcodes_pdf",
        )
        label = (getattr(cart, "scan_code", None) or "").strip() or (cart.barcode or "")
        return build_barcodes_pdf([label], width_mm=w_mm, height_mm=h_mm)

    def get_basket_barcodes_pdf(self, cart_id: int) -> bytes:
        """Return PDF bytes with Code128: basket barcodes only (no cart)."""
        cart = self.db.query(Cart).options(joinedload(Cart.baskets)).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        self._ensure_cart_barcodes(cart)
        baskets = sorted(
            getattr(cart, "baskets", None) or [],
            key=lambda b: (getattr(b, "row", 0), getattr(b, "column", 0), getattr(b, "id", 0)),
        )
        labels = []
        for b in baskets:
            lab = (getattr(b, "scan_code", None) or "").strip() or (getattr(b, "barcode", None) or "")
            if lab:
                labels.append(lab)
        w_mm, h_mm = self._legacy_barcode_pdf_page_mm(int(cart.tenant_id), "basket")
        log_label_pdf_flow(
            "cart_service",
            template_id=None,
            template_json=None,
            width_mm=w_mm,
            height_mm=h_mm,
            detail="get_basket_barcodes_pdf -> barcode_pdf_service.build_barcodes_pdf",
        )
        log_label_pdf_stage(
            source="cart_service.get_basket_barcodes_pdf",
            width_mm=w_mm,
            height_mm=h_mm,
            detail=f"cart_id={cart_id} labels={len(labels)} -> build_barcodes_pdf",
        )
        return build_barcodes_pdf(labels, width_mm=w_mm, height_mm=h_mm) if labels else build_barcodes_pdf([], width_mm=w_mm, height_mm=h_mm)

    def get_barcodes_pdf(self, cart_id: int) -> bytes:
        """Return PDF bytes with Code128 barcodes: cart barcode + all basket barcodes."""
        cart = self.db.query(Cart).options(joinedload(Cart.baskets)).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        self._ensure_cart_barcodes(cart)
        labels = [(getattr(cart, "scan_code", None) or "").strip() or (cart.barcode or "")]
        baskets = sorted(
            getattr(cart, "baskets", None) or [],
            key=lambda b: (getattr(b, "row", 0), getattr(b, "column", 0), getattr(b, "id", 0)),
        )
        for b in baskets:
            lab = (getattr(b, "scan_code", None) or "").strip() or (getattr(b, "barcode", None) or "")
            if lab:
                labels.append(lab)
        w_mm, h_mm = self._legacy_barcode_pdf_page_mm(int(cart.tenant_id), "cart")
        log_label_pdf_flow(
            "cart_service",
            template_id=None,
            template_json=None,
            width_mm=w_mm,
            height_mm=h_mm,
            detail="get_barcodes_pdf -> barcode_pdf_service.build_barcodes_pdf",
        )
        log_label_pdf_stage(
            source="cart_service.get_barcodes_pdf",
            width_mm=w_mm,
            height_mm=h_mm,
            detail=f"cart_id={cart_id} labels={len(labels)} -> build_barcodes_pdf",
        )
        return build_barcodes_pdf(labels, width_mm=w_mm, height_mm=h_mm)

    def _get_default_template(self, tenant_id: int, template_type: str):
        """Load default template for tenant by type (cart, basket, location). Returns SavedLabelTemplate or None."""
        tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            return None
        template_id = None
        if template_type == "cart":
            template_id = getattr(tenant, "default_cart_template_id", None)
        elif template_type == "basket":
            template_id = getattr(tenant, "default_basket_template_id", None)
        elif template_type == "location":
            template_id = getattr(tenant, "default_location_template_id", None)
        if not template_id:
            return None
        return self.db.query(SavedLabelTemplate).filter(
            SavedLabelTemplate.id == template_id,
            SavedLabelTemplate.tenant_id == tenant_id,
        ).first()

    def _legacy_barcode_pdf_page_mm(self, tenant_id: int, template_type: str) -> tuple[float, float]:
        """Media box for legacy Code128-only cart/basket PDFs: default template mm if set, else 100×60."""
        row = self._get_default_template(tenant_id, template_type)
        if not row or not getattr(row, "template_json", None):
            return (100.0, 60.0)
        d = template_json_to_dict(row.template_json)
        w = max(0.01, float(d.get("widthMm") or 100))
        h = max(0.01, float(d.get("heightMm") or 60))
        return (w, h)

    def _cart_record(self, cart) -> dict:
        """Build label record dict for a cart (variables for cart template)."""
        barcode = _norm_cart_code(getattr(cart, "code", None)) or getattr(cart, "barcode", None) or f"CART-{cart.id}"
        n_baskets = len(getattr(cart, "baskets", None) or [])
        return {
            "cart_id": str(cart.id),
            "cart_name": getattr(cart, "name", "") or "",
            "cart_barcode": barcode,
            "barcode_data": barcode,
            "cart_capacity": str(round(getattr(cart, "total_volume", 0) or 0, 2)) + " dm³",
            "cart_weight": "",
            "cart_sections": str(n_baskets),
            "{cart_id}": str(cart.id),
            "{cart_name}": getattr(cart, "name", "") or "",
            "{cart_barcode}": barcode,
            "{cart_capacity}": str(round(getattr(cart, "total_volume", 0) or 0, 2)) + " dm³",
            "{cart_weight}": "",
            "{cart_sections}": str(n_baskets),
        }

    def _basket_record(self, basket, cart) -> dict:
        """Build label record dict for a basket (variables for basket template)."""
        code = (getattr(basket, "name", None) or "").strip() or f"S-{getattr(basket, 'row', 0) + 1}-{getattr(basket, 'column', 0) + 1}"
        barcode = getattr(basket, "barcode", None) or f"CART-{cart.id}-B{getattr(basket, 'id', 0):02d}"
        return {
            "basket_id": str(getattr(basket, "id", 0)),
            "basket_code": code,
            "basket_barcode": barcode,
            "basket_level": str(getattr(basket, "row", 0) + 1),
            "basket_position": str(getattr(basket, "column", 0) + 1),
            "cart_id": str(cart.id),
            "barcode_data": barcode,
            "{basket_id}": str(getattr(basket, "id", 0)),
            "{basket_code}": code,
            "{basket_barcode}": barcode,
            "{basket_level}": str(getattr(basket, "row", 0) + 1),
            "{basket_position}": str(getattr(basket, "column", 0) + 1),
            "{cart_id}": str(cart.id),
        }

    def get_cart_labels_pdf(self, cart_id: int, tenant_id: int) -> bytes:
        """Return PDF with cart label using default cart template, or legacy barcode-only PDF if no template."""
        cart = self.db.query(Cart).options(joinedload(Cart.baskets)).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        self._ensure_cart_barcodes(cart)
        template_row = self._get_default_template(tenant_id, "cart")
        if not template_row or not getattr(template_row, "template_json", None):
            log_label_pdf_flow(
                "cart_service",
                template_id=None,
                template_json=None,
                width_mm=None,
                height_mm=None,
                detail="get_cart_labels_pdf no template -> get_cart_barcode_pdf (barcode_pdf_service)",
            )
            log_label_pdf_stage(
                source="cart_service.get_cart_labels_pdf",
                template_id=None,
                template_json_present=False,
                detail=f"cart_id={cart_id} tenant_id={tenant_id} branch=fallback_get_cart_barcode_pdf_no_template",
            )
            return self.get_cart_barcode_pdf(cart_id)
        try:
            template = template_json_to_dict(template_row.template_json)
        except Exception as e:
            logger.warning("Invalid cart template JSON for template id=%s: %s", getattr(template_row, "id", None), e)
            log_label_pdf_flow(
                "cart_service",
                template_id=int(getattr(template_row, "id", 0) or 0) or None,
                template_json=str(getattr(template_row, "template_json", "") or ""),
                width_mm=None,
                height_mm=None,
                detail=f"get_cart_labels_pdf invalid JSON -> barcode_pdf_service err={e!r}",
            )
            log_label_pdf_stage(
                source="cart_service.get_cart_labels_pdf",
                template_id=int(getattr(template_row, "id", 0) or 0) or None,
                template_json_present=bool(getattr(template_row, "template_json", None)),
                detail=f"cart_id={cart_id} branch=fallback_get_cart_barcode_pdf_invalid_json err={e!r}",
            )
            return self.get_cart_barcode_pdf(cart_id)
        record = self._cart_record(cart)
        tid = int(getattr(template_row, "id", 0) or 0) or None
        _wm, _hm = template.get("widthMm"), template.get("heightMm")
        log_label_pdf_flow(
            "cart_service",
            template_id=tid,
            template_json=str(getattr(template_row, "template_json", "") or ""),
            width_mm=float(_wm) if _wm is not None else None,
            height_mm=float(_hm) if _hm is not None else None,
            detail="get_cart_labels_pdf -> label_render_service.build_label_pdf (not barcode_pdf_service)",
        )
        log_label_pdf_stage(
            source="cart_service.get_cart_labels_pdf",
            template_id=tid,
            template_json_present=True,
            width_mm=float(_wm) if _wm is not None else None,
            height_mm=float(_hm) if _hm is not None else None,
            detail=f"cart_id={cart_id} branch=build_label_pdf",
        )
        return build_label_pdf(template, [record], one_page_per_label=True)

    def get_basket_labels_pdf(self, cart_id: int, tenant_id: int) -> bytes:
        """Return PDF with one page per basket using default basket template, or legacy barcode-only PDF if no template."""
        cart = self.db.query(Cart).options(joinedload(Cart.baskets)).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        self._ensure_cart_barcodes(cart)
        template_row = self._get_default_template(tenant_id, "basket")
        if not template_row or not getattr(template_row, "template_json", None):
            log_label_pdf_flow(
                "cart_service",
                template_id=None,
                template_json=None,
                width_mm=None,
                height_mm=None,
                detail="get_basket_labels_pdf no template -> get_basket_barcodes_pdf (barcode_pdf_service)",
            )
            log_label_pdf_stage(
                source="cart_service.get_basket_labels_pdf",
                template_id=None,
                template_json_present=False,
                detail=f"cart_id={cart_id} tenant_id={tenant_id} branch=fallback_get_basket_barcodes_pdf_no_template",
            )
            return self.get_basket_barcodes_pdf(cart_id)
        try:
            template = template_json_to_dict(template_row.template_json)
        except Exception as e:
            logger.warning("Invalid basket template JSON for template id=%s: %s", getattr(template_row, "id", None), e)
            log_label_pdf_flow(
                "cart_service",
                template_id=int(getattr(template_row, "id", 0) or 0) or None,
                template_json=str(getattr(template_row, "template_json", "") or ""),
                width_mm=None,
                height_mm=None,
                detail=f"get_basket_labels_pdf invalid JSON -> barcode_pdf_service err={e!r}",
            )
            log_label_pdf_stage(
                source="cart_service.get_basket_labels_pdf",
                template_id=int(getattr(template_row, "id", 0) or 0) or None,
                template_json_present=bool(getattr(template_row, "template_json", None)),
                detail=f"cart_id={cart_id} branch=fallback_get_basket_barcodes_pdf_invalid_json err={e!r}",
            )
            return self.get_basket_barcodes_pdf(cart_id)
        baskets = sorted(
            getattr(cart, "baskets", None) or [],
            key=lambda b: (getattr(b, "row", 0), getattr(b, "column", 0), getattr(b, "id", 0)),
        )
        records = [self._basket_record(b, cart) for b in baskets]
        tid = int(getattr(template_row, "id", 0) or 0) or None
        _wm, _hm = template.get("widthMm"), template.get("heightMm")
        log_label_pdf_flow(
            "cart_service",
            template_id=tid,
            template_json=str(getattr(template_row, "template_json", "") or ""),
            width_mm=float(_wm) if _wm is not None else None,
            height_mm=float(_hm) if _hm is not None else None,
            detail=f"get_basket_labels_pdf -> label_render_service.build_label_pdf records={len(records)}",
        )
        log_label_pdf_stage(
            source="cart_service.get_basket_labels_pdf",
            template_id=tid,
            template_json_present=True,
            width_mm=float(_wm) if _wm is not None else None,
            height_mm=float(_hm) if _hm is not None else None,
            detail=f"cart_id={cart_id} branch=build_label_pdf records={len(records)}",
        )
        if not records:
            return build_label_pdf(template, [{"barcode_data": "", "{basket_code}": "No baskets"}], one_page_per_label=True)
        return build_label_pdf(template, records, one_page_per_label=True)

    def clear_cart(self, cart_id: int) -> dict:
        """
        Odepnij wszystkie zamówienia i zwolnij wózek — wyłącznie przez CartLifecycle
        (``admin_release_cart``). Legacy API bez actora → System (admin_user_id=0).
        """
        cart = self.db.query(Cart).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        from .cart_picking_lifecycle_service import admin_release_cart

        out = admin_release_cart(
            self.db,
            cart_id=int(cart_id),
            tenant_id=int(cart.tenant_id),
            warehouse_id=int(cart.warehouse_id),
            admin_user_id=0,
            acknowledge=True,
        )
        self.db.commit()
        return {
            "status": "OK",
            "orders_cleared": int(out.get("orders_detached") or 0),
            "cart_status": out.get("cart_status"),
            "picking_cancelled": bool(out.get("picking_cancelled")),
            "via": "cart_lifecycle.admin_release_cart",
        }

    def clear_basket(self, basket_id: int) -> dict:
        """Odłącz zamówienie z koszyka MULTI — CartLifecycle.detach_order_from_cart."""
        basket = self.db.query(CartBasket).filter(CartBasket.id == basket_id).first()
        if not basket:
            raise HTTPException(status_code=404, detail="Koszyk nie istnieje")
        order_id = basket.order_id
        cart_id = basket.cart_id
        if order_id and cart_id:
            cart = self.db.query(Cart).filter(Cart.id == int(cart_id)).first()
            if cart is None:
                raise HTTPException(status_code=404, detail="Wózek nie istnieje")
            from .cart_picking_lifecycle_service import CartLifecycleError, detach_order_from_cart

            try:
                detach_order_from_cart(
                    self.db,
                    cart_id=int(cart_id),
                    order_id=int(order_id),
                    tenant_id=int(cart.tenant_id),
                    warehouse_id=int(cart.warehouse_id),
                    operator_user_id=None,
                    reason="Odłączenie zamówienia z koszyka (clear_basket).",
                )
            except CartLifecycleError as e:
                raise HTTPException(status_code=409, detail=str(e)) from e
        else:
            basket.order_id = None
            basket.used_volume = 0
            self.db.add(basket)
        self.db.commit()
        return {"status": "OK", "order_cleared": order_id, "via": "cart_lifecycle.detach_order_from_cart"}

    def reset_cart(self, cart_id: int) -> dict:
        """Alias for clear_cart: clear assignments for this cart."""
        return self.clear_cart(cart_id)

    def delete_cart(self, cart_id: int):
        cart = self.db.query(Cart).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")
        
        self.db.delete(cart)
        self.db.commit()
        return {"status": "deleted"}

    def create_group(self, tenant_id: int, cart_type, name: str, description: str = None):
        # cart_type can be a Pydantic Enum (value/name like "MULTI") or a plain string.
        if hasattr(cart_type, "name") and str(cart_type.name).upper() in ("MULTI", "BULK"):
            ct = CartType[str(cart_type.name).upper()]
        elif hasattr(cart_type, "value") and str(cart_type.value).upper() in ("MULTI", "BULK"):
            ct = CartType[str(cart_type.value).upper()]
        else:
            ct = CartType[str(cart_type).upper()]
        new_group = CartGroup(
            tenant_id=tenant_id,
            cart_type=ct,
            name=name.upper(),
            description=description
        )
        self.db.add(new_group)
        self.db.commit()
        self.db.refresh(new_group)
        return new_group

    def update_group(self, group_id: int, name: str | None = None, description: str | None = None):
        group = self.db.query(CartGroup).filter(CartGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Grupa nie istnieje")

        changed = False
        if name is not None and group.name != name.upper():
            logger.info("[update_group] name: %s -> %s", group.name, name.upper())
            group.name = name.upper()
            changed = True
        if description is not None and group.description != description:
            logger.info("[update_group] description: %s -> %s", group.description, description)
            group.description = description
            changed = True

        if changed:
            self.db.commit()
            self.db.refresh(group)

        return group

    def delete_group(self, group_id: int):
        group = self.db.query(CartGroup).filter(CartGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Grupa nie istnieje")

        # Odczepiamy wózki od grupy zamiast je usuwać
        carts = self.db.query(Cart).filter(Cart.group_id == group_id).all()
        for cart in carts:
            logger.info("[delete_group] odpinam wózek %s od grupy %s", cart.id, group_id)
            cart.group_id = None

        self.db.delete(group)
        self.db.commit()
        return {"status": "deleted"}

    def update_cart(self, cart_id: int, data: CartUpdate):
        """
        Update cart from Pydantic CartUpdate model.
        - Explicitly updates group_id
        - Updates scalar fields (name, warehouse_id, length, width, height, total_volume)
        - Replaces basket structure when `baskets` is provided (for MULTI carts)
        """
        cart = self.db.query(Cart).filter(Cart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Wózek nie istnieje")

        # Normalize to dict (Pydantic v1 or v2)
        if hasattr(data, "model_dump"):
            update_data = data.model_dump(exclude_unset=True)
        else:
            update_data = data.dict(exclude_unset=True)

        logger.info("[update_cart] cart_id=%s payload_keys=%s", cart_id, list(update_data.keys()))

        changes = []

        if "code" in update_data and update_data["code"] is not None:
            new_code = _norm_cart_code(update_data["code"])
            if not new_code:
                raise HTTPException(status_code=422, detail="Kod wózka nie może być pusty.")
            old_code = _norm_cart_code(getattr(cart, "code", None))
            if new_code != old_code:
                if _cart_code_taken(self.db, cart.tenant_id, cart.warehouse_id, new_code, exclude_cart_id=cart.id):
                    raise HTTPException(status_code=409, detail="Kod wózka jest już użyty w tym magazynie.")
                cart.code = new_code
                cart.barcode = new_code
                _assign_basket_barcodes(cart)
                changes.append(("code", old_code, new_code))

        # --- group_id: explicit update (frontend sends null to unassign) ---
        if "group_id" in update_data:
            new_group_id = update_data["group_id"]
            if new_group_id == 999:
                new_group_id = None
            old_group_id = cart.group_id
            if old_group_id != new_group_id:
                logger.info("[update_cart] group_id: %s -> %s", old_group_id, new_group_id)
                cart.group_id = new_group_id
                changes.append(("group_id", old_group_id, new_group_id))

        # --- Scalar fields allowed on Cart model (both BULK and MULTI) ---
        scalar_updates = {
            "name": ("name", lambda v: (v or "").upper() if v else v),
            "warehouse_id": ("warehouse_id", lambda v: v),
            "image_url": ("image_url", lambda v: v),
            "length": ("length", float),
            "width": ("width", float),
            "height": ("height", float),
        }
        for payload_key, (model_attr, normalize) in scalar_updates.items():
            if payload_key not in update_data:
                continue
            if not hasattr(cart, model_attr):
                continue
            raw_val = update_data[payload_key]
            if raw_val is None:
                continue
            try:
                new_val = normalize(raw_val)
            except (TypeError, ValueError):
                logger.warning("[update_cart] cannot normalize %s=%r", payload_key, raw_val)
                continue
            old_val = getattr(cart, model_attr)
            if old_val != new_val:
                logger.info("[update_cart] %s: %s -> %s", model_attr, old_val, new_val)
                setattr(cart, model_attr, new_val)
                changes.append((model_attr, old_val, new_val))

        # total_volume_dm3 / max_volume_dm3 from payload -> cart.total_volume
        for key in ("total_volume_dm3", "max_volume_dm3"):
            if key in update_data:
                new_vol = update_data[key]
                if new_vol is not None:
                    try:
                        new_vol = float(new_vol)
                    except (TypeError, ValueError):
                        logger.warning("[update_cart] cannot parse %s=%r", key, new_vol)
                    else:
                        old_vol = cart.total_volume
                        if old_vol != new_vol:
                            logger.info("[update_cart] total_volume: %s -> %s", old_vol, new_vol)
                            cart.total_volume = new_vol
                            changes.append(("total_volume", old_vol, new_vol))
                break

        # capacity_strategy, capacity_orders, capacity_volume
        if "capacity_strategy" in update_data:
            val = update_data["capacity_strategy"]
            if val is not None:
                raw_type = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
                clean_type = str(raw_type).split(".")[-1].upper()
                new_s = normalize_capacity_strategy(val, cart_type=clean_type).value
                old_s = getattr(cart, "capacity_strategy", None)
                if old_s != new_s:
                    cart.capacity_strategy = new_s
                    changes.append(("capacity_strategy", old_s, new_s))
        if "capacity_orders" in update_data:
            val = update_data["capacity_orders"]
            old_cap_ord = getattr(cart, "capacity_orders", None)
            if val is not None:
                try:
                    n = int(val)
                    if n >= 0 and old_cap_ord != n:
                        cart.capacity_orders = n
                        changes.append(("capacity_orders", old_cap_ord, n))
                except (TypeError, ValueError):
                    pass
            else:
                if old_cap_ord is not None:
                    cart.capacity_orders = None
                    changes.append(("capacity_orders", old_cap_ord, None))
        if "capacity_volume" in update_data:
            val = update_data["capacity_volume"]
            old_cap_vol = getattr(cart, "capacity_volume", None)
            if val is not None:
                try:
                    v = float(val)
                    if v >= 0 and old_cap_vol != v:
                        cart.capacity_volume = v
                        changes.append(("capacity_volume", old_cap_vol, v))
                except (TypeError, ValueError):
                    pass
            else:
                if old_cap_vol is not None:
                    cart.capacity_volume = None
                    changes.append(("capacity_volume", old_cap_vol, None))

        # --- Replace basket structure when provided (MULTI carts) ---
        if "baskets" in update_data and update_data["baskets"] is not None:
            new_baskets = update_data["baskets"]
            logger.info("[update_cart] replacing baskets for cart_id=%s, count=%s", cart_id, len(new_baskets))

            # Remove existing baskets
            self.db.query(CartBasket).filter(CartBasket.cart_id == cart_id).delete(synchronize_session=False)

            # Add new baskets
            for b in new_baskets:
                # b can be Pydantic model or dict
                if hasattr(b, "model_dump"):
                    b_data = b.model_dump()
                elif hasattr(b, "dict"):
                    b_data = b.dict()
                else:
                    b_data = dict(b)

                length = float(b_data.get("length", 0) or 0)
                width = float(b_data.get("width", 0) or 0)
                height = float(b_data.get("height", 0) or 0)
                vol_cm3 = length * width * height

                basket = CartBasket(
                    cart_id=cart.id,
                    warehouse_id=int(cart.warehouse_id),
                    name=b_data.get(
                        "name",
                        f"S-{b_data.get('row', 0)}/{b_data.get('column', 0)}",
                    ),
                    row=int(b_data.get("row", 0) or 0),
                    column=int(b_data.get("column", 0) or 0),
                    inner_length=length,
                    inner_width=width,
                    inner_height=height,
                    usable_volume=vol_cm3,
                )
                self.db.add(basket)

            self.db.flush()
            self.db.refresh(cart)
            if not _norm_cart_code(getattr(cart, "code", None)):
                cart.code = _norm_cart_code(getattr(cart, "barcode", None)) or _generate_cart_barcode(
                    self.db, cart.tenant_id, cart.warehouse_id
                )
            if not _norm_cart_code(getattr(cart, "barcode", None)):
                cart.barcode = cart.code
            _assign_basket_barcodes(cart)
            cart.recalculate_total_volume()
            changes.append(("baskets", "replaced", f"{len(new_baskets)} items"))

        if changes:
            self.db.commit()
            self.db.refresh(cart)
            logger.info("[update_cart] cart_id=%s saved %s change(s)", cart_id, len(changes))
        else:
            logger.info("[update_cart] cart_id=%s no changes", cart_id)

        return cart