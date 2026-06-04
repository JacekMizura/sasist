"""Lista kolejki pakowania: status docelowy z picking_config + tryby (bez wózka / BULK / koszyki)."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from collections import defaultdict
from typing import List, Literal, Optional, Tuple, Type, TypeVar, cast

from pydantic import BaseModel
from sqlalchemy import and_, func, or_
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
from ..models.order_item import OMS_LINE_STATUS_TO_PICK, OrderItem, order_item_is_replaced_line
from ..models.order_ui_status import OrderUiStatus
from ..models.label_template import SavedLabelTemplate
from ..models.picking_config import PickingConfig
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
    WmsPackingBasketOrderOut,
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
from ..utils.order_shipping_display import order_shipping_display
from .packaging_engine import build_packaging_suggestions_for_order
from .receiving_scan_service import resolve_receiving_scan
from .wms_sale_document_service import create_sale_document
from .wms_audit_service import (
    emit_wms_carton_selected_or_changed,
    emit_wms_label_generated,
    emit_wms_packed_item,
    emit_wms_packing_automation_finished,
    emit_wms_packing_finished,
    emit_wms_packing_started,
    last_pack_audit_summaries_for_order_lines,
    last_pick_audit_summaries_for_order_lines,
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
        return False
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

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _packing_queue_status_ids(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    primary_status_id: int,
) -> List[int]:
    """Kolejka „gotowe” (``primary_status_id``) + statusy IN_PROGRESS z nazwą sugerującą pakowanie."""
    ids: set[int] = {int(primary_status_id)}
    rows = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
            OrderUiStatus.main_group == "IN_PROGRESS",
        )
        .all()
    )
    for st in rows:
        n = (st.name or "").strip().lower()
        if "pak" in n or "pack" in n:
            ids.add(int(st.id))
    return list(ids)


def _packing_orders_base_query(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None,
):
    """Kolejka pakowania: ``fulfillment_state == READY_TO_PACK`` (źródło prawdy), bez filtrowania po wózku."""
    m = (mode or "").strip().lower()
    if m not in ("no_cart", "bulk", "baskets"):
        raise ValueError("Parametr mode musi być: no_cart, bulk lub baskets.")
    status_ids = _packing_queue_status_ids(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, primary_status_id=status_id
    )
    # cart_id ignorowany — ten sam zestaw zamówień we wszystkich trybach (etykieta trybu tylko w UI).
    _ = cart_id
    q = db.query(Order).filter(
        Order.tenant_id == int(tenant_id),
        Order.warehouse_id == int(warehouse_id),
        or_(
            Order.fulfillment_state == "READY_TO_PACK",
            and_(Order.fulfillment_state.is_(None), Order.order_ui_status_id.in_(status_ids)),
        ),
    )
    return q


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
    q_packed = min(q_ord, max(0, raw_packed))
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

    picked_final = float(picked_qty)
    if order is not None and q_ord > 0:
        pf_o = getattr(order, "picking_finished_at", None) or getattr(order, "picked_at", None)
        if pf_o is not None:
            if missing_qty > 1e-9:
                picked_final = max(float(picked_qty), float(q_ord) - float(missing_qty))
            else:
                # Nowa linia zamiennika (TO_PICK / ślad replaced_from) — nie udawaj pełnej zbiórki po domknięciu sesji.
                substitute_pending = (rep_oid is not None and int(rep_oid) > 0) or ols_u == OMS_LINE_STATUS_TO_PICK
                if float(picked_qty) + 1e-6 >= float(q_ord):
                    picked_final = float(q_ord)
                elif substitute_pending:
                    picked_final = float(picked_qty)
                else:
                    picked_final = float(q_ord)

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
        bundle_name=bundle_name,
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
) -> WmsPackingOrderCard:
    lines_out: List[WmsPackingOrderLine] = []
    total_q = 0
    packed_q = 0
    items = sorted(order.items or [], key=lambda x: int(x.id))
    pick_summaries: dict[int, str] = {}
    pack_summaries: dict[int, str] = {}
    if enrich and db is not None:
        oi_ids = [int(it.id) for it in items if _order_item_active_for_packing(it)]
        pick_summaries = last_pick_audit_summaries_for_order_lines(db, int(order.id), oi_ids)
        pack_summaries = last_pack_audit_summaries_for_order_lines(db, int(order.id), oi_ids)
    for it in items:
        if not _order_item_active_for_packing(it):
            continue
        q_ord = int(it.quantity or 0)
        raw_packed = int(getattr(it, "packing_quantity_packed", 0) or 0)
        q_packed = min(q_ord, max(0, raw_packed))
        total_q += q_ord
        packed_q += q_packed
        lines_out.append(
            _packing_line_from_item(
                db if enrich else None,
                it,
                order=order,
                tenant_id=tenant_id if enrich else 0,
                warehouse_id=warehouse_id if enrich else 0,
                enrich=enrich,
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
    is_completed = total_q > 0 and packed_q >= total_q
    ship_name, ship_logo, _ = order_shipping_display(order)
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
    packaging_suggestions: List[PackagingSuggestionOut] = []
    primary_packaging_suggestion: PackagingSuggestionOut | None = None
    packaging_alternatives: List[PackagingSuggestionOut] = []
    if enrich and db is not None and int(tenant_id) > 0 and int(warehouse_id) > 0:
        try:
            packaging_suggestions, primary_packaging_suggestion, packaging_alternatives = (
                build_packaging_suggestions_for_order(
                    db,
                    order,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                )
            )
        except Exception:
            logger.exception("build_packaging_suggestions_for_order order_id=%s", getattr(order, "id", None))
            packaging_suggestions = []
            primary_packaging_suggestion = None
            packaging_alternatives = []
    selected_carton_id: Optional[str] = None
    selected_carton: Optional[WmsPackingRecommendedCarton] = None
    operational_notes_brief: List[WmsOperationalNoteBrief] = []
    alert_title: Optional[str] = None
    if enrich and db is not None:
        sr = getattr(order, "selected_carton_id", None)
        selected_carton_id = str(sr).strip() if sr else None
        selected_carton = _selected_carton_summary_for_order(db, order)
        from ..services.order_list_communication import operational_notes_for_module

        pack_notes = operational_notes_for_module(db, int(order.id), packing=True)
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
        alert_title = "UWAGA PAKOWANIE" if operational_notes_brief else None
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
        packaging_suggestions=packaging_suggestions,
        primary_packaging_suggestion=primary_packaging_suggestion,
        packaging_alternatives=packaging_alternatives,
        selected_carton_id=selected_carton_id,
        selected_carton=selected_carton,
        operational_notes_packing=operational_notes_brief,
        wms_operational_alert_title=alert_title,
        **list_extras,
    )


def _first_open_packing_line(card: WmsPackingOrderCard) -> Optional[WmsPackingOrderLine]:
    for line in sorted(card.lines, key=lambda x: int(x.order_item_id)):
        if int(line.quantity_packed) < int(line.quantity):
            return line
    return None


def _carton_row_to_recommended(row: Carton, *, is_best: bool) -> WmsPackingRecommendedCarton:
    img = getattr(row, "image_url", None)
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
    )


def suggestions_to_recommended_cartons(
    suggestions: List[PackagingSuggestionOut],
    *,
    limit: int = 3,
) -> List[WmsPackingRecommendedCarton]:
    """UI pakowania (kompatybilność): pierwsze propozycje silnika jako lista kartonów."""
    lim = max(2, min(int(limit), 6))
    out: List[WmsPackingRecommendedCarton] = []
    for i, s in enumerate(suggestions[:lim]):
        out.append(
            WmsPackingRecommendedCarton(
                id=str(s.suggested_package_id),
                name=str(s.package_name or "").strip(),
                dimensions=str(s.package_dimensions or "").strip(),
                image_url=s.image_url,
                is_best=(i == 0),
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
) -> OrderSelectCartonResponse:
    """Ustawia ``orders.selected_carton_id`` — walidacja tenant + magazyn zamówienia i kartonu."""
    cid = (carton_id or "").strip()
    if not cid:
        raise ValueError("EMPTY_CARTON_ID")
    order = db.query(Order).filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id)).first()
    if order is None:
        raise ValueError("ORDER_NOT_FOUND")
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
    db.refresh(order)
    summ = _carton_row_to_recommended(row, is_best=False)
    return OrderSelectCartonResponse(selected_carton_id=cid, selected_carton=summ)


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
    ship_name, _, __ = order_shipping_display(order)
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
        shipping_address="",
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
    order = (
        q.options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.items).joinedload(OrderItem.source_bundle),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
            joinedload(Order.basket),
            joinedload(Order.cart),
        ).first()
    )
    if order is None:
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


def _order_has_pending_packing_lines(order: Order) -> bool:
    for it in order.items or []:
        if not _order_item_active_for_packing(it):
            continue
        qo = int(it.quantity or 0)
        qp = int(getattr(it, "packing_quantity_packed", 0) or 0)
        if qp < qo:
            return True
    return False


def _is_order_fully_packed_db(db: Session, order_id: int) -> bool:
    not_replaced = func.upper(func.coalesce(OrderItem.oms_line_status, "")) != "REPLACED"
    pending = (
        db.query(func.count(OrderItem.id))
        .filter(
            OrderItem.order_id == int(order_id),
            OrderItem.quantity > 0,
            not_replaced,
            OrderItem.quantity > func.coalesce(OrderItem.packing_quantity_packed, 0),
        )
        .scalar()
        or 0
    )
    return int(pending) == 0


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
        action_out = "GO_TO_LIST" if u == "GO_TO_LIST" else "STAY"
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
        qo = int(it.quantity or 0)
        qp = min(qo, int(getattr(it, "packing_quantity_packed", 0) or 0))
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
    current_user: Optional[AppUser] = None,
) -> WmsPackingScanOut:
    """
    Wywołaj **po** pełnym spakowaniu (skan / line-pack / pack-all już zacommitowane).
    Potok finish: **status „spakowane” → dokument** (gdy włączone; brak serii = ``ValueError`` / HTTP 400),
    potem opcjonalnie przesyłka / druki; commit na końcu tej funkcji.
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
    if order is None:
        raise PackingScanError("ORDER_NOT_IN_QUEUE")
    if not _is_order_fully_packed_db(db, int(order_id)):
        raise PackingScanError("ORDER_NOT_FULLY_PACKED")

    raw_sel = getattr(order, "selected_carton_id", None)
    sel = str(raw_sel).strip() if raw_sel else ""
    if not sel:
        if allow_without_carton:
            if not _user_allow_finish_without_carton(db, current_user):
                raise PackingScanError("FORBIDDEN_FINISH_WITHOUT_CARTON")
        else:
            raise PackingScanError("CARTON_REQUIRED")

    _touch_order_wms_packing_timestamps(order, fully_packed=True)

    ps_row = _get_or_create_wms_packing_settings_row(db, tenant_id, warehouse_id)
    raw_finish = getattr(ps_row, "packing_after_finish_action", None) or "STAY"
    finish_action = "GO_TO_LIST" if str(raw_finish).strip().upper() == "GO_TO_LIST" else "STAY"

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
    db.flush()
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
) -> Optional[int]:
    q = _packing_orders_base_query(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
    )
    q = q.order_by(Order.created_at.asc().nulls_last(), Order.id.asc())
    orders = q.options(joinedload(Order.items), joinedload(Order.shipping_method_row)).all()
    for o in orders:
        if exclude_order_id is not None and int(o.id) == int(exclude_order_id):
            continue
        if _order_has_pending_packing_lines(o):
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
        qo = int(it.quantity or 0)
        qp = int(getattr(it, "packing_quantity_packed", 0) or 0)
        if qp < qo:
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
    qo = int(item.quantity or 0)
    qp = int(getattr(item, "packing_quantity_packed", 0) or 0)
    rem = qo - qp
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
        qo = int(it.quantity or 0)
        qp = int(getattr(it, "packing_quantity_packed", 0) or 0)
        delta = qo - qp
        if delta <= 0:
            continue
        it.packing_quantity_packed = qo
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


def packing_mode_distribution(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
) -> Tuple[int, int, int]:
    """Zwraca (no_cart, bulk, baskets) — po ``fulfillment_state`` ta sama liczba w każdym trybie (bez wózka w zapytaniu)."""
    status_ids = _packing_queue_status_ids(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, primary_status_id=status_id
    )
    total = int(
        db.query(func.count(Order.id))
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            or_(
                Order.fulfillment_state == "READY_TO_PACK",
                and_(Order.fulfillment_state.is_(None), Order.order_ui_status_id.in_(status_ids)),
            ),
        )
        .scalar()
        or 0
    )
    return total, total, total


def list_packing_target_statuses(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> List[WmsPackingTargetStatusItem]:
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
        out.append(
            WmsPackingTargetStatusItem(
                target_status_id=int(st.id),
                status=str(st.name),
                color=normalize_stored_color(st.color),
                main_group=cast(OrderUiMainGroup, gkey),
                order_count=0,
            )
        )

    target_ids = [int(x.target_status_id) for x in out]
    counts_map: dict[int, int] = {}
    if target_ids:
        cnt_rows = (
            db.query(Order.order_ui_status_id, func.count(Order.id))
            .filter(
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
                Order.order_ui_status_id.in_(target_ids),
                or_(
                    Order.fulfillment_state == "READY_TO_PACK",
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


def list_packing_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
    mode: str,
    cart_id: int | None = None,
    limit: int = 500,
) -> List[WmsPackingOrderCard]:
    q = _packing_orders_base_query(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=mode,
        cart_id=cart_id,
    )
    q = q.order_by(Order.order_date.desc().nullslast(), Order.id.desc())
    m = (mode or "").strip().lower()
    opts = [
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.order_ui_status),
        joinedload(Order.shipping_method_row),
    ]
    if m == "baskets":
        opts.append(joinedload(Order.basket))
    orders: List[Order] = (
        q.options(*opts)
        .limit(min(max(limit, 1), 2000))
        .all()
    )
    if not orders:
        return []
    from .braki_order_state_service import order_can_show_ready_pack

    out: List[WmsPackingOrderCard] = []
    for o in orders:
        if not order_can_show_ready_pack(db, o):
            continue
        bc = _basket_code_for_order(o) if m == "baskets" else None
        out.append(_build_packing_order_card(o, basket_code=bc))
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


def resolve_packing_order_for_basket_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    basket_scan: str,
    status_id: int,
    mode: str,
) -> WmsPackingBasketOrderOut:
    m = (mode or "").strip().lower()
    if m != "baskets":
        raise ValueError("Skan koszyka dotyczy tylko trybu z koszykami.")
    cart = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
            Cart.id == int(cart_id),
            Cart.type == CartType.MULTI,
        )
        .first()
    )
    if cart is None:
        raise ValueError("Nie znaleziono wózka MULTI dla kontekstu pakowania.")
    baskets = sorted(
        getattr(cart, "baskets", None) or [],
        key=lambda x: (int(getattr(x, "row", 0)), int(getattr(x, "column", 0)), int(getattr(x, "id", 0))),
    )
    match: CartBasket | None = None
    for b in baskets:
        if _basket_scan_matches(b, basket_scan):
            match = b
            break
    if match is None:
        raise PackingScanError("BASKET_NOT_FOUND")
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
    in_queue = get_packing_order_detail_for_queue(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status_id=status_id,
        mode=m,
        cart_id=int(cart_id),
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
    Typ dokumentu z metadanych zamówienia: INVOICE → faktura, PARAGON → paragon (bez zgadywania / bez series_id).
    Zwraca (series_id lub None, panel_document_type INVOICE|PARAGON, kod_błędu gdy brak serii).
    """
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


def _packing_step_generate_shipment(db: Session, order: Order) -> WmsPackingPostPackStepResult:
    _ = db
    try:
        logger.info("wms_packing post-pack generate_shipment order_id=%s", order.id)
        return WmsPackingPostPackStepResult(
            step="generate_shipment",
            ok=True,
            skipped=True,
            message="no_shipment_connector_configured",
        )
    except Exception as e:  # pragma: no cover
        return WmsPackingPostPackStepResult(step="generate_shipment", ok=False, message=str(e)[:500])


def _packing_step_print_document(db: Session, order: Order) -> WmsPackingPostPackStepResult:
    _ = db
    try:
        logger.info("wms_packing post-pack print_document order_id=%s", order.id)
        return WmsPackingPostPackStepResult(
            step="print_document",
            ok=True,
            skipped=True,
            message="print_delegated_to_client_qz",
        )
    except Exception as e:  # pragma: no cover
        return WmsPackingPostPackStepResult(step="print_document", ok=False, message=str(e)[:500])


def _packing_step_print_label(
    db: Session,
    *,
    tenant_id: int,
    order: Order,
    fb: WmsPackingFallbackLabel,
) -> WmsPackingPostPackStepResult:
    try:
        tid = fb.template_id
        if tid is None:
            return WmsPackingPostPackStepResult(
                step="print_label",
                ok=True,
                skipped=True,
                message="no_fallback_template",
            )
        tpl = (
            db.query(SavedLabelTemplate)
            .filter(
                SavedLabelTemplate.id == int(tid),
                SavedLabelTemplate.tenant_id == int(tenant_id),
            )
            .first()
        )
        if tpl is None:
            return WmsPackingPostPackStepResult(
                step="print_label",
                ok=False,
                skipped=False,
                message="template_not_found_for_tenant",
            )
        logger.info(
            "wms_packing post-pack print_label order_id=%s template_id=%s name=%s",
            order.id,
            tid,
            getattr(tpl, "name", ""),
        )
        return WmsPackingPostPackStepResult(
            step="print_label",
            ok=True,
            skipped=True,
            message="label_render_stub",
        )
    except Exception as e:
        return WmsPackingPostPackStepResult(step="print_label", ok=False, message=str(e)[:500])


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
    Ustawia status panelu „spakowane” (konfiguracja lub heurystyka). Wywoływane **najpierw** w potoku finish,
    zanim utworzymy dokument sprzedaży (wymóg kolejności zapisów).
    """
    try:
        if actions.change_order_status:
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
        packed_sid = resolve_packed_order_ui_status_id(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        if packed_sid is not None:
            order.order_ui_status_id = int(packed_sid)
        db.flush()
        logger.info(
            "PACKING_FINISH order_id=%s packed_status_heuristic=%s",
            order.id,
            packed_sid,
        )
        return WmsPackingPostPackStepResult(
            step="change_order_status",
            ok=True,
            skipped=packed_sid is None,
            message="default_heuristic" if packed_sid is not None else "no_done_substatus",
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

    if actions.generate_shipment:
        try:
            out.append(_packing_step_generate_shipment(db, order))
        except Exception as e:
            out.append(WmsPackingPostPackStepResult(step="generate_shipment", ok=False, message=str(e)[:500]))

    if actions.print_document:
        try:
            out.append(_packing_step_print_document(db, order))
        except Exception as e:
            out.append(WmsPackingPostPackStepResult(step="print_document", ok=False, message=str(e)[:500]))

    if actions.print_label:
        try:
            delay = max(0, min(int(fb.delay_seconds or 0), 120))
            if delay > 0:
                time.sleep(float(delay))
            lbl_step = _packing_step_print_label(db, tenant_id=tenant_id, order=order, fb=fb)
            out.append(lbl_step)
            if lbl_step.ok:
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
            out.append(WmsPackingPostPackStepResult(step="print_label", ok=False, message=str(e)[:500]))

    return out


def _infer_packing_mode_for_order(order: Order) -> tuple[str, int | None]:
    """Tryb kolejki pakowania + opcjonalny cart_id (etykieta UI)."""
    cid = getattr(order, "cart_id", None)
    if cid is None or int(cid) <= 0:
        return "no_cart", None
    cart = getattr(order, "cart", None)
    if cart is None:
        return "no_cart", None
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    t = raw.split(".")[-1].upper()
    if t == "BULK":
        return "bulk", int(cid)
    if t in ("MULTI", "BASKETS"):
        return "baskets", int(cid)
    return "no_cart", None


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
    from .braki_order_state_service import order_can_show_ready_pack
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
    if not order_can_show_ready_pack(db, order):
        raise ValueError("Zamówienie nie jest gotowe do pakowania.")

    mode, cart_id = _infer_packing_mode_for_order(order)
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
    for alt in ("no_cart", "bulk", "baskets"):
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

    recompute_order_fulfillment(db, int(order_id), commit=True)
    from .braki_order_state_service import log_wms_order_status_compute

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
    log_wms_order_status_compute(db, order, source="get_oms_order_wms_fulfillment_card")
    return _build_packing_order_card(
        order,
        db=db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        enrich=True,
    )
