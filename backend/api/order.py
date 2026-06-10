"""
API: Orders

Endpointy do pobierania zamówień.
Lista zwraca total_volume (suma L×W×H/1000 po pozycjach), is_multi_item, total_items.
Obsługa filtrów status/order_type oraz paginacji limit/offset.
"""

import json
import logging
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Set, Tuple
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.bundle import Bundle
from ..models.carton import Carton
from ..models.document_series import DocumentSeries
from ..models.complaint import Complaint
from ..models.customer import Customer
from ..models.order import Order
from ..models.order_activity_log import OrderActivityLog
from ..models.order_note import OrderNote
from ..models.order_operational_note import OrderOperationalNote
from ..models.order_document import OrderDocument
from ..models.order_item import OMS_LINE_STATUS_REPLACED, OMS_LINE_STATUS_TO_PICK, OrderItem, order_item_is_replaced_line
from ..models.order_ui_status import OrderUiStatus
from ..models.product import Product
from ..models.shipping_method import ShippingMethod
from ..schemas.order_bulk import (
    BulkOrderPanelStatusPayload,
    BulkOrdersDeleteBody,
    BulkOrdersDeleteResult,
    BulkOrdersPatchBody,
    BulkOrdersSelection,
)
from ..services.delete_service import delete_orders_bulk
from ..services.order_default_new_panel_status import assign_default_new_panel_status_to_order
from ..schemas.order import (
    OrderDocumentRead,
    OrderOperationalNoteCreateBody,
    OrderOperationalNoteRead,
    OrderRead,
    OrderActivityLogRead,
    OrderListRead,
    OrderListItemPreview,
    OrderNoteRead,
    OrderItemRead,
    OrderUiStatusBrief,
    PanelFulfillmentHistoryEntry,
    ProductInOrder,
    OrderAddLineBody,
    OrderItemPanelPatchBody,
    OrderCreateBody,
    OrderCreateResponse,
    OrderPatchBody,
    OrderPriorityPatchBody,
    OrderSelectedCartonBrief,
    SourceBundleBrief,
)
from ..schemas.customer import CustomerBriefOut
from ..schemas.wms_packing import OrderSelectCartonBody, OrderSelectCartonResponse, WmsPackingOrderCard
from ..models.fulfillment_event import FE_PICK, FE_REPLACED, FE_WAITING
from ..services.fulfillment_event_service import append_event, delete_line_events_of_type, sum_line_events
from ..services.order_fulfillment_recompute import compute_line_missing_qty, recompute_order_fulfillment
from ..services.recovery_workflow_service import apply_fulfillment_state_from_resolver
from ..services.wms_recovery_pick_service import ensure_recovery_pick_task
from ..services.order_fulfillment_state import touch_picking_in_progress
from ..services.wms_packing_service import apply_order_selected_carton, get_oms_order_wms_fulfillment_card
from ..utils.order_shipping_display import order_shipping_display


def _customer_names_for_order_display(order: Order) -> Tuple[Optional[str], Optional[str]]:
    from ..services.direct_sale.order_display import (
        RETAIL_CUSTOMER_LABEL,
        direct_sale_customer_names,
        is_direct_sale_order,
    )
    from .wms_returns import _customer_names_from_order

    ds_fn, ds_ln = direct_sale_customer_names(order)
    if ds_fn:
        return ds_fn, ds_ln
    fn, ln = _customer_names_from_order(order)
    if is_direct_sale_order(order) and not fn and not ln:
        return RETAIL_CUSTOMER_LABEL, None
    return fn, ln


def _source_display_for_order(order: Order) -> Optional[str]:
    from ..services.direct_sale.order_display import direct_sale_source_display

    ds = direct_sale_source_display(order)
    if ds:
        return ds
    raw_src = getattr(order, "source", None)
    source_raw = str(raw_src).strip() if raw_src is not None and str(raw_src).strip() else None
    from .wms_returns import _normalize_order_source

    return _normalize_order_source(source_raw)


def _shipping_display_for_order(order: Order) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    from ..services.direct_sale.order_display import direct_sale_shipping_display

    ds = direct_sale_shipping_display(order)
    if ds[0] is not None:
        return ds
    return order_shipping_display(order)
from ..services.bundle_explosion import (
    BundleExplosionError,
    explode_bundle_line,
    explode_product_line,
    merge_resolved_lines,
    resolve_order_create_lines,
    vat_percent_from_product,
)
from ..api.complaint_shipment import ensure_complaint_outbound_shipment
from ..services.complaint_audit import append_complaint_audit_event
from ..services.barcode_generation import next_internal_order_number, next_order_barcode
from ..services.esp_scan_codes import assign_order_scan_code
from ..utils.panel_ui_status_tokens import resolve_panel_status_tokens
from ..utils.ui_status_color import normalize_stored_color
from ..schemas.office_dashboard import OfficeDashboardKpiOut
from ..auth.deps import get_current_user, get_optional_current_user
from ..models.app_user import AppUser
from ..models.order_custom_field import OrderCustomField, OrderCustomFieldValue
from ..schemas.order_custom_field import (
    OrderCustomFieldValueState,
    OrderCustomFieldValuesPutBody,
    OrderCustomFieldWithValueRead,
)
from ..services.order_custom_field_service import normalize_value_for_storage, parse_settings, serialize_field_definition
from ..services.order_custom_field_upload import save_order_custom_field_upload
from ..models.order_document_type_enum import OrderDocumentType
from ..services.order_custom_field_value_files_sync import (
    ensure_attachment_json_links_order_documents,
    sync_custom_field_attached_files,
    sync_files_value_order_documents,
)
from ..services.order_list_communication import batch_order_list_communication_fields
from ..services.order_list_financial import batch_order_list_profit_metrics
from ..database import engine
from ..services.order_list_service import (
    build_order_list_read_row,
    ensure_orders_list_schema,
    log_orders_list_error,
    sort_built_order_rows,
)

router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)
logger = logging.getLogger(__name__)

FALLBACK_VOLUME_DM3 = 0.001


def _bundle_qty_from_meta(metadata_json: Optional[str]) -> Optional[int]:
    if not metadata_json or not str(metadata_json).strip():
        return None
    try:
        d = json.loads(metadata_json)
        q = d.get("bundle_qty")
        return int(q) if q is not None else None
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


def _finalize_complaint_replacement_order(db: Session, complaint_row: Complaint, order: Order) -> None:
    """Po utworzeniu zamówienia EXCHANGE/REPLACEMENT z reklamacji — domknięcie rozliczenia wymiany."""
    complaint_row.resolution_type = "REPLACEMENT"
    complaint_row.resolution_status = "COMPLETED"
    complaint_row.financial_decision = "replace"
    complaint_row.resolution_amount = None
    complaint_row.resolution_currency = None
    db.add(complaint_row)
    append_complaint_audit_event(
        db,
        int(complaint_row.id),
        "replacement_order_created",
        f"Utworzono zamówienie wymiany #{order.number}",
        meta={"order_id": order.id, "order_number": order.number},
    )


def _complaint_pickup_from_create_body(body: OrderCreateBody) -> tuple[str, str, str, Optional[str]]:
    """Adres klienta dla przesyłki OUTBOUND (dostawa / wymiana) z pól formularza zamówienia."""
    fn = (body.first_name or "").strip()
    ln = (body.last_name or "").strip()
    name = f"{fn} {ln}".strip() or "—"
    ship_st = (body.shipping_street or body.billing_street or "").strip()
    ship_city = (body.shipping_city or body.billing_city or "").strip()
    ship_pc = (body.shipping_postal_code or body.billing_postal_code or "").strip()
    ship_co = (body.shipping_country or body.billing_country or "").strip()
    line_city = f"{ship_pc} {ship_city}".strip()
    parts = [p for p in [ship_st, line_city, ship_co] if p]
    address = ", ".join(parts) if parts else "—"
    phone = (body.phone or "").strip() or "000000000"
    email = (body.email or "").strip() or None
    return name, address, phone, email


def _order_import_meta_dict(order: Order) -> dict:
    raw = getattr(order, "import_metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def _order_set_import_meta(order: Order, meta: dict) -> None:
    if not meta:
        order.import_metadata_json = None
    else:
        order.import_metadata_json = json.dumps(meta, ensure_ascii=False)


def _append_panel_fulfillment_history(
    order: Order,
    lines: list[str],
    *,
    snapshot: Optional[dict] = None,
) -> None:
    """Dopisuje wpis do historii panelu (``import_metadata_json.panel_fulfillment_history``)."""
    meta = _order_import_meta_dict(order)
    hist = meta.get("panel_fulfillment_history")
    if not isinstance(hist, list):
        hist = []
    cleaned = [str(x).strip() for x in lines if x and str(x).strip()]
    snap = {k: v for k, v in (snapshot or {}).items() if v is not None}
    if not cleaned and not snap:
        return
    entry: dict = {
        "at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "lines": cleaned,
    }
    entry.update(snap)
    hist.append(entry)
    meta["panel_fulfillment_history"] = hist[-120:]
    _order_set_import_meta(order, meta)


def _order_addresses_dict(order: Order) -> dict:
    raw = getattr(order, "addresses_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def _patch_order_billing_identity(order: Order, body: OrderPatchBody, fields_set: Set[str]) -> None:
    if not fields_set.intersection({"first_name", "last_name", "phone", "email", "company_name", "nip"}):
        return
    data = _order_addresses_dict(order)
    bill = data.get("billing") if isinstance(data.get("billing"), dict) else {}

    def _apply_str_key(fs_key: str, json_keys: tuple[str, ...]) -> None:
        if fs_key not in fields_set:
            return
        val = getattr(body, fs_key, None)
        if val is None:
            for k in json_keys:
                bill.pop(k, None)
            return
        s = str(val).strip()
        if not s:
            for k in json_keys:
                bill.pop(k, None)
            return
        for k in json_keys:
            bill[k] = s

    _apply_str_key("first_name", ("first_name", "Imię"))
    _apply_str_key("last_name", ("last_name", "Nazwisko"))
    _apply_str_key("phone", ("phone", "mobile", "tel"))
    _apply_str_key("email", ("email", "mail"))

    if "company_name" in fields_set:
        val = getattr(body, "company_name", None)
        if val is None or (isinstance(val, str) and not str(val).strip()):
            for k in ("company_name", "Firma"):
                bill.pop(k, None)
        else:
            s = str(val).strip()
            bill["company_name"] = s
            bill["Firma"] = s
    if "nip" in fields_set:
        val = getattr(body, "nip", None)
        if val is None or (isinstance(val, str) and not str(val).strip()):
            for k in ("nip", "NIP", "tax_id"):
                bill.pop(k, None)
        else:
            s = str(val).strip()
            bill["nip"] = s
            bill["NIP"] = s
            bill["tax_id"] = s

    data["billing"] = bill
    order.addresses_json = json.dumps(data, ensure_ascii=False)


def _patch_order_shipping_address(order: Order, body: OrderPatchBody, fields_set: Set[str]) -> None:
    ship_fs = {
        "shipping_name",
        "shipping_street",
        "shipping_city",
        "shipping_postal_code",
        "shipping_country",
    }
    if not fields_set.intersection(ship_fs):
        return
    full = _order_addresses_dict(order)
    ship: dict = dict(full.get("shipping") or {}) if isinstance(full.get("shipping"), dict) else {}

    def apply_str(fs: str, json_keys: tuple[str, ...]) -> None:
        if fs not in fields_set:
            return
        val = getattr(body, fs, None)
        if val is None or (isinstance(val, str) and not str(val).strip()):
            for k in json_keys:
                ship.pop(k, None)
            return
        s = str(val).strip()
        for k in json_keys:
            ship[k] = s

    apply_str("shipping_name", ("name",))
    apply_str("shipping_street", ("street", "Ulica"))
    apply_str("shipping_city", ("city", "Miejscowość"))
    apply_str("shipping_postal_code", ("postal_code", "Kod pocztowy"))
    apply_str("shipping_country", ("country", "Kraj"))
    if not ship:
        full.pop("shipping", None)
    else:
        full["shipping"] = ship
    order.addresses_json = json.dumps(full, ensure_ascii=False)


def _recompute_order_value_and_volume(order: Order, db: Optional[Session] = None) -> None:
    if db is not None:
        from ..services.order_shipping_fk_service import sanitize_order_orphan_shipping_method_id

        sanitize_order_orphan_shipping_method_id(db, order)
    goods = 0.0
    for it in order.items or []:
        qty = int(it.quantity or 0)
        tp = getattr(it, "total_price", None)
        if tp is not None:
            goods += float(tp)
        else:
            goods += round(float(it.unit_price or 0) * qty, 2)
    meta = _order_import_meta_dict(order)
    try:
        sc = float(meta.get("shipping_cost") or 0)
    except (TypeError, ValueError):
        sc = 0.0
    order.value = round(goods + sc, 2)
    tv, _, _, _ = _order_total_volume_and_multi(order)
    order.total_volume_dm3 = tv


def _brief_order_ui_status(ous: Optional[OrderUiStatus]) -> Optional[OrderUiStatusBrief]:
    if ous is None:
        return None
    mg = str(getattr(ous, "main_group", None) or "NEW").strip().upper()
    if mg not in ("NEW", "IN_PROGRESS", "DONE"):
        mg = "NEW"
    _, badge, bg, tx = resolve_panel_status_tokens(ous)
    gn = getattr(ous, "group_name", None)
    sn = getattr(ous, "subgroup_name", None)
    img = getattr(ous, "image_url", None)
    return OrderUiStatusBrief(
        id=ous.id,
        name=ous.name,
        color=normalize_stored_color(ous.color),
        main_group=mg,  # type: ignore[arg-type]
        group_name=str(gn).strip()[:128] if gn is not None and str(gn).strip() else None,
        subgroup_name=str(sn).strip()[:128] if sn is not None and str(sn).strip() else None,
        badge_color=badge,
        background_color=bg,
        text_color=tx,
        image_url=str(img).strip()[:512] if img is not None and str(img).strip() else None,
        is_active=bool(getattr(ous, "is_active", True)),
    )


def _unit_volume_dm3(product: Product) -> float:
    """Objętość jednej sztuki w dm³: product.volume lub (L×W×H)/1000."""
    if product.volume is not None and product.volume > 0:
        return float(product.volume)
    l_, w_, h_ = product.length or 0, product.width or 0, product.height or 0
    if l_ and w_ and h_:
        return (l_ * w_ * h_) / 1000.0
    return FALLBACK_VOLUME_DM3


def _order_total_volume_and_multi(order: Order) -> tuple[float, bool, int, int]:
    """
    total_volume (dm³) = suma (L×W×H/1000) * quantity po pozycjach,
    is_multi_item = True tylko gdy liczba unikalnych EAN/SKU > 1 (2+ różnych produktów).
    Single-item = 1 unikalny SKU (np. 10× ten sam produkt),
    Multi-item = 2+ różnych SKU.
    total_items = suma quantity (sztuk),
    position_count = liczba pozycji (unikalnych SKU).
    """
    total_volume = 0.0
    total_qty = 0
    for item in order.items:
        if getattr(item, "is_bundle_parent", False):
            continue
        product = item.product
        qty = item.quantity or 0
        if qty <= 0:
            continue
        vol = _unit_volume_dm3(product) if product else FALLBACK_VOLUME_DM3
        total_volume += vol * qty
        total_qty += qty
    position_count = len(order.items)
    is_multi = position_count > 1
    return round(total_volume, 4), is_multi, total_qty, position_count


def _order_items_active_for_list_display(order: Order) -> list[OrderItem]:
    """Linie widoczne na liście zamówień: bez archiwum REPLACED i bez qty=0."""
    return [
        it
        for it in sorted(order.items or [], key=lambda x: int(x.id))
        if not order_item_is_replaced_line(it) and int(it.quantity or 0) > 0
    ]


def _totals_for_order_list_lines(active: Sequence[OrderItem]) -> tuple[float, bool, int, int]:
    """Wolumen / multi / suma sztuk / liczba pozycji — tylko z aktywnych linii listy."""
    total_volume = 0.0
    total_qty = 0
    keys: set[str] = set()
    pos = 0
    for item in active:
        qty = int(item.quantity or 0)
        if qty <= 0:
            continue
        pos += 1
        product = item.product
        pid = int(item.product_id) if getattr(item, "product_id", None) else 0
        vol = _unit_volume_dm3(product) if product else FALLBACK_VOLUME_DM3
        total_volume += vol * qty
        total_qty += qty
        ean = (product.ean if product and product.ean else "") or ""
        sku = ""
        if product is not None:
            sku = (str(product.symbol).strip() if getattr(product, "symbol", None) else "") or (
                str(product.sku).strip() if getattr(product, "sku", None) else ""
            )
        key = (ean or sku or f"id:{pid}").strip().lower() or f"id:{pid}"
        keys.add(key)
    is_multi = len(keys) > 1
    return round(total_volume, 4), is_multi, total_qty, pos


def _order_list_item_preview_from_line(it: OrderItem) -> OrderListItemPreview:
    p = it.product
    return OrderListItemPreview(
        quantity=int(it.quantity or 0),
        name=p.name if p else None,
        ean=p.ean if p else None,
        sku=(p.symbol or p.sku) if p else None,
        image_url=getattr(p, "image_url", None) if p else None,
    )


# ==========================================================
# GET LIST
# ==========================================================


def _panel_payment_bucket(meta: dict) -> str:
    ps = (meta.get("panel_payment_status") or "").strip().lower()
    if not ps:
        return "unknown"
    paid_kw = ("paid", "opłac", "oplac", "zapłac", "zaplac", "completed", "done", "yes", "tak", "1")
    unpaid_kw = ("unpaid", "nieopłac", "nieoplac", "pending", "wait", "no", "nie", "0", "false")
    if any(k in ps for k in paid_kw):
        return "paid"
    if any(k in ps for k in unpaid_kw):
        return "unpaid"
    return "unknown"


def _order_has_sales_document(order: Order, meta: dict) -> bool:
    sdn = getattr(order, "sales_document_number", None)
    if sdn and str(sdn).strip():
        return True
    if (meta.get("panel_document_type") or "").strip():
        return True
    if (meta.get("panel_document_series_id") or "").strip():
        return True
    return False


def _collect_order_list_built_rows(
    db: Session,
    *,
    tenant_id: Optional[int],
    warehouse_id: Optional[int],
    status: Optional[str] = None,
    order_type: Optional[str] = None,
    order_id: Optional[str] = None,
    volume_min: Optional[float] = None,
    volume_max: Optional[float] = None,
    search: Optional[str] = None,
    panel_order_ui_status_id: Optional[int] = None,
    panel_order_ui_unassigned: bool = False,
    panel_order_ui_main_group: Optional[str] = None,
    panel_order_ui_status_ids: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    filter_shipping_method_id: Optional[str] = None,
    source_contains: Optional[str] = None,
    order_value_min: Optional[float] = None,
    order_value_max: Optional[float] = None,
    payment_status: Optional[str] = None,
    paid_only: bool = False,
    unpaid_only: bool = False,
    with_document: bool = False,
    without_document: bool = False,
    include_archived_orders: bool = False,
    order_channel: Optional[str] = None,
    fulfillment_mode: Optional[str] = None,
) -> List[Tuple[Order, float, bool, int, int, List[OrderItem]]]:
    """Same filtering as GET /orders/ before sort / pagination — single source of truth."""
    q = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
        )
    )
    if tenant_id is not None:
        q = q.filter(Order.tenant_id == tenant_id)
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == warehouse_id)
    if not include_archived_orders:
        q = q.filter(Order.deleted_at.is_(None))
    if date_from and str(date_from).strip():
        ds = str(date_from).strip()[:10]
        try:
            df = datetime.fromisoformat(ds + "T00:00:00")
            q = q.filter(Order.order_date.isnot(None)).filter(Order.order_date >= df)
        except ValueError:
            pass
    if date_to and str(date_to).strip():
        ds = str(date_to).strip()[:10]
        try:
            dt_end = datetime.fromisoformat(ds + "T23:59:59.999999")
            q = q.filter(Order.order_date.isnot(None)).filter(Order.order_date <= dt_end)
        except ValueError:
            pass
    if filter_shipping_method_id and str(filter_shipping_method_id).strip():
        q = q.filter(Order.shipping_method_id == str(filter_shipping_method_id).strip())
    if source_contains and str(source_contains).strip():
        q = q.filter(Order.source.ilike(f"%{str(source_contains).strip()}%"))
    if order_channel and str(order_channel).strip():
        q = q.filter(Order.order_channel == str(order_channel).strip().upper())
    if fulfillment_mode and str(fulfillment_mode).strip():
        q = q.filter(Order.fulfillment_mode == str(fulfillment_mode).strip().upper())
    if order_value_min is not None:
        q = q.filter(Order.value.isnot(None)).filter(Order.value >= float(order_value_min))
    if order_value_max is not None:
        q = q.filter(Order.value.isnot(None)).filter(Order.value <= float(order_value_max))
    panel_ids_parsed: Optional[List[int]] = None
    if panel_order_ui_status_ids and str(panel_order_ui_status_ids).strip():
        tmp_ids: List[int] = []
        for part in str(panel_order_ui_status_ids).split(","):
            p = part.strip()
            if p.isdigit():
                tmp_ids.append(int(p))
        panel_ids_parsed = list(dict.fromkeys(tmp_ids)) if tmp_ids else None

    if panel_ids_parsed:
        q = q.filter(Order.order_ui_status_id.in_(panel_ids_parsed))
    elif panel_order_ui_unassigned:
        q = q.filter(Order.order_ui_status_id.is_(None))
    elif panel_order_ui_status_id is not None:
        q = q.filter(Order.order_ui_status_id == panel_order_ui_status_id)
    elif panel_order_ui_main_group:
        mg = (panel_order_ui_main_group or "").strip().upper()
        if mg not in ("NEW", "IN_PROGRESS", "DONE"):
            raise HTTPException(status_code=400, detail="Invalid panel_order_ui_main_group")
        q = q.join(OrderUiStatus, OrderUiStatus.id == Order.order_ui_status_id).filter(OrderUiStatus.main_group == mg)
    if status and status.strip():
        q = q.filter(Order.status == status.strip())
    if order_id and order_id.strip():
        oid = order_id.strip()
        if oid.isdigit():
            q = q.filter(Order.id == int(oid))
        else:
            q = q.filter(
                or_(
                    Order.number.ilike(f"%{oid}%"),
                    Order.external_id.ilike(f"%{oid}%"),
                    Order.sales_document_number.ilike(f"%{oid}%"),
                )
            )
    if search and search.strip():
        term = search.strip()
        q = q.outerjoin(OrderItem, Order.id == OrderItem.order_id).outerjoin(Product, OrderItem.product_id == Product.id)
        like = f"%{term}%"
        if term.isdigit():
            q = q.filter(
                or_(
                    Order.id == int(term),
                    Order.number.ilike(like),
                    Order.external_id.ilike(like),
                    Order.sales_document_number.ilike(like),
                    Product.name.ilike(like),
                    Product.sku.ilike(like),
                    Product.symbol.ilike(like),
                    Order.city.ilike(like),
                    Order.addresses_json.ilike(like),
                )
            )
        else:
            q = q.filter(
                or_(
                    Order.number.ilike(like),
                    Order.external_id.ilike(like),
                    Order.sales_document_number.ilike(like),
                    Product.name.ilike(like),
                    Product.sku.ilike(like),
                    Product.symbol.ilike(like),
                    Order.city.ilike(like),
                    Order.addresses_json.ilike(like),
                )
            )
        q = q.distinct()
    orders = q.all()

    if payment_status and payment_status.strip():
        sub = payment_status.strip().lower()
        orders = [
            o
            for o in orders
            if sub in (str(_order_import_meta_dict(o).get("panel_payment_status") or "").lower())
        ]

    if paid_only and not unpaid_only:
        orders = [o for o in orders if _panel_payment_bucket(_order_import_meta_dict(o)) == "paid"]
    elif unpaid_only and not paid_only:
        orders = [o for o in orders if _panel_payment_bucket(_order_import_meta_dict(o)) != "paid"]

    if with_document and without_document:
        orders = []
    elif with_document:
        orders = [o for o in orders if _order_has_sales_document(o, _order_import_meta_dict(o))]
    elif without_document:
        orders = [o for o in orders if not _order_has_sales_document(o, _order_import_meta_dict(o))]

    built: List[Tuple[Order, float, bool, int, int, List[OrderItem]]] = []
    for o in orders:
        list_active = _order_items_active_for_list_display(o)
        total_volume, is_multi_item, total_items, position_count = _totals_for_order_list_lines(list_active)
        built.append((o, total_volume, is_multi_item, total_items, position_count, list_active))

    if order_type and order_type.strip():
        ot = order_type.strip().lower()
        built = [(o, tv, im, ti, pc, la) for o, tv, im, ti, pc, la in built if (im is True) == (ot == "multi")]

    if volume_min is not None:
        built = [(o, tv, im, ti, pc, la) for o, tv, im, ti, pc, la in built if tv >= volume_min]
    if volume_max is not None:
        built = [(o, tv, im, ti, pc, la) for o, tv, im, ti, pc, la in built if tv <= volume_max]

    return built


def _resolve_bulk_order_ids(db: Session, tenant_id: int, warehouse_id: int, selection: BulkOrdersSelection) -> List[int]:
    if selection.mode == "explicit_ids":
        return sorted({int(i) for i in selection.ids if isinstance(i, int) and i > 0})
    assert selection.filters is not None
    f = selection.filters
    built = _collect_order_list_built_rows(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status=f.status,
        order_type=f.order_type,
        order_id=f.order_id,
        volume_min=f.volume_min,
        volume_max=f.volume_max,
        search=f.search,
        panel_order_ui_status_id=f.panel_order_ui_status_id,
        panel_order_ui_unassigned=f.panel_order_ui_unassigned,
        panel_order_ui_main_group=f.panel_order_ui_main_group,
        panel_order_ui_status_ids=f.panel_order_ui_status_ids,
        date_from=f.date_from,
        date_to=f.date_to,
        filter_shipping_method_id=f.filter_shipping_method_id,
        source_contains=f.source_contains,
        order_value_min=f.order_value_min,
        order_value_max=f.order_value_max,
        payment_status=f.payment_status,
        paid_only=f.paid_only,
        unpaid_only=f.unpaid_only,
        with_document=f.with_document,
        without_document=f.without_document,
        include_archived_orders=bool(f.include_archived_orders),
    )
    return [int(b[0].id) for b in built]


@router.get("/", response_model=List[OrderListRead])
def get_orders(
    response: Response,
    tenant_id: Optional[int] = Query(None, description="Filter by tenant; if omitted, no tenant filter"),
    warehouse_id: Optional[int] = Query(None, description="Filter by warehouse; if omitted, no warehouse filter"),
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    order_type: Optional[str] = None,
    order_id: Optional[str] = None,
    volume_min: Optional[float] = None,
    volume_max: Optional[float] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    sort_direction: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    search: Optional[str] = Query(None, description="Search by order number, product name, or SKU"),
    panel_order_ui_status_id: Optional[int] = Query(
        None,
        description="Panel filter: order_ui_statuses.id (sub-status)",
    ),
    panel_order_ui_unassigned: bool = Query(
        False,
        description="Panel filter: orders with no panel sub-status",
    ),
    panel_order_ui_main_group: Optional[str] = Query(
        None,
        description="Panel filter: NEW | IN_PROGRESS | DONE",
    ),
    panel_order_ui_status_ids: Optional[str] = Query(
        None,
        description="Comma-separated panel sub-status ids (order_ui_statuses.id); overrides single id / group when set",
    ),
    date_from: Optional[str] = Query(None, description="ISO date YYYY-MM-DD — order_date lower bound"),
    date_to: Optional[str] = Query(None, description="ISO date YYYY-MM-DD — order_date upper bound"),
    filter_shipping_method_id: Optional[str] = Query(None, description="UUID of shipping_methods.id"),
    source_contains: Optional[str] = Query(None, description="Case-insensitive substring on orders.source"),
    order_value_min: Optional[float] = Query(None, ge=0),
    order_value_max: Optional[float] = Query(None, ge=0),
    payment_status: Optional[str] = Query(None, description="Substring match on panel_payment_status in import metadata"),
    paid_only: bool = Query(False),
    unpaid_only: bool = Query(False),
    with_document: bool = Query(False),
    without_document: bool = Query(False),
    include_archived: bool = Query(
        False,
        description="Gdy true — uwzględnij zamówienia zarchiwizowane (orders.deleted_at)",
    ),
    order_channel: Optional[str] = Query(
        None,
        description="Filtr kanału: DIRECT_SALE, ONLINE, …",
    ),
    fulfillment_mode: Optional[str] = Query(
        None,
        description="Filtr realizacji: IMMEDIATE, WMS, …",
    ),
):
    """
    Zamówienia z total_volume (dm³), is_multi_item, total_items.
    Filtry: tenant_id, warehouse_id (opcjonalne – bez nich zwracane są wszystkie zamówienia), status, order_type, volume_min, volume_max.
    Sortowanie: sort_by (id|status|total_volume|total_items), sort_dir lub sort_direction (asc|desc).
    """
    from .wms_returns import _customer_names_from_order

    logger.info(
        "[orders.list] query tenant_id=%s warehouse_id=%s sort_by=%s limit=%s offset=%s",
        tenant_id,
        warehouse_id,
        sort_by,
        limit,
        offset,
    )
    try:
        ensure_orders_list_schema(engine)
    except Exception as exc:
        log_orders_list_error(phase="schema_ensure", exc=exc)

    try:
        built = _collect_order_list_built_rows(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status=status,
            order_type=order_type,
            order_id=order_id,
            volume_min=volume_min,
            volume_max=volume_max,
            search=search,
            panel_order_ui_status_id=panel_order_ui_status_id,
            panel_order_ui_unassigned=panel_order_ui_unassigned,
            panel_order_ui_main_group=panel_order_ui_main_group,
            panel_order_ui_status_ids=panel_order_ui_status_ids,
            date_from=date_from,
            date_to=date_to,
            filter_shipping_method_id=filter_shipping_method_id,
            source_contains=source_contains,
            order_value_min=order_value_min,
            order_value_max=order_value_max,
            payment_status=payment_status,
            paid_only=paid_only,
            unpaid_only=unpaid_only,
            with_document=with_document,
            without_document=without_document,
            include_archived_orders=include_archived,
            order_channel=order_channel,
            fulfillment_mode=fulfillment_mode,
        )
    except HTTPException:
        raise
    except Exception as exc:
        log_orders_list_error(phase="repository_query", exc=exc)
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Nie udało się wczytać listy zamówień. Spróbuj ponownie za chwilę.",
                "code": "ORDERS_LIST_QUERY_FAILED",
            },
        )

    sort_d = sort_dir or sort_direction
    profit_sort_map: dict[int, tuple[Optional[float], Optional[float]]] = {}
    if sort_by in ("gross_profit", "margin_percent"):
        try:
            profit_sort_map = batch_order_list_profit_metrics(db, built)
        except Exception as exc:
            log_orders_list_error(phase="profit_metrics", exc=exc)
            profit_sort_map = {}

    try:
        built = sort_built_order_rows(
            built,
            sort_by=sort_by,
            sort_dir=sort_d,
            profit_sort_map=profit_sort_map,
        )
    except Exception as exc:
        log_orders_list_error(phase="sort", exc=exc, field=sort_by)

    total_count = len(built)
    if offset is not None and offset > 0:
        built = built[offset:]
    if limit is not None and limit > 0:
        built = built[:limit]

    page_order_objs = [row[0] for row in built]
    comm_by_id: dict = {}
    try:
        comm_by_id = batch_order_list_communication_fields(db, page_order_objs)
    except Exception as exc:
        log_orders_list_error(phase="communication_batch", exc=exc)

    profit_map: dict[int, tuple[Optional[float], Optional[float]]] = profit_sort_map
    if sort_by not in ("gross_profit", "margin_percent"):
        try:
            profit_map = batch_order_list_profit_metrics(db, built)
        except Exception as exc:
            log_orders_list_error(phase="profit_metrics", exc=exc)
            profit_map = {}

    result: list[OrderListRead] = []
    skipped = 0
    for o, total_volume, is_multi_item, total_items, position_count, list_active in built:
        row = build_order_list_read_row(
            db,
            order=o,
            total_volume=total_volume,
            is_multi_item=is_multi_item,
            total_items=total_items,
            position_count=position_count,
            list_active=list_active,
            comm_by_id=comm_by_id,
            profit_map=profit_map,
            customer_names_fn=_customer_names_for_order_display,
            item_preview_fn=_order_list_item_preview_from_line,
            brief_ui_status_fn=_brief_order_ui_status,
            shipping_display_fn=_shipping_display_for_order,
            import_meta_fn=_order_import_meta_dict,
        )
        if row is None:
            skipped += 1
            continue
        result.append(row)

    if limit is not None or offset is not None:
        response.headers["X-Total-Count"] = str(total_count)
    logger.info(
        "[orders.list] returned=%s skipped=%s total=%s tenant_id=%s warehouse_id=%s",
        len(result),
        skipped,
        total_count,
        tenant_id,
        warehouse_id,
    )
    return result


# Debug: raw DB check (call GET /orders/debug/db to verify orders table)
@router.get("/debug/db")
def orders_debug_db(db: Session = Depends(get_db)):
    """Returns total count and last 10 orders (id, tenant_id, warehouse_id, number) for debugging."""
    total = db.query(func.count(Order.id)).scalar() or 0
    rows = (
        db.query(Order.id, Order.tenant_id, Order.warehouse_id, Order.number)
        .order_by(Order.id.desc())
        .limit(10)
        .all()
    )
    return {
        "total_count": total,
        "sample": [{"id": r.id, "tenant_id": r.tenant_id, "warehouse_id": r.warehouse_id, "number": r.number} for r in rows],
    }


def _commit_or_rollback_bulk_orders(db: Session, result: dict) -> None:
    """Przy błędzie zachowaj commit, jeśli coś zapisano (archiwizacja przed nieudanym twardym usunięciem)."""
    errs = list(result.get("errors") or [])
    de = int(result.get("deleted_count") or result.get("deleted") or 0)
    so = int(result.get("soft_deleted_count") or 0)
    if errs and de == 0 and so == 0:
        db.rollback()
    else:
        db.commit()


def _execute_orders_bulk_delete(db: Session, tenant_id: int, warehouse_id: int, id_list: List[int]) -> dict:
    """Zwraca słownik jak ``BulkOrdersDeleteResult`` (m.in. deleted, blocked, errors)."""
    r = delete_orders_bulk(db, tenant_id, warehouse_id, id_list)
    dc = int(r.get("deleted_count") or r.get("deleted") or 0)
    return {
        "deleted": dc,
        "deleted_count": dc,
        "success_count": int(r.get("success_count", dc)),
        "soft_deleted_count": int(r.get("soft_deleted_count", 0)),
        "blocked_count": int(r.get("blocked_count", 0)),
        "blocked": list(r.get("blocked") or []),
        "errors": list(r.get("errors") or []),
        "skipped_not_found": int(r.get("skipped_not_found", 0)),
        "messages": list(r.get("messages") or []),
    }


@router.delete("/bulk", response_model=BulkOrdersDeleteResult)
def bulk_delete_orders(
    tenant_id: int,
    warehouse_id: int,
    ids: str,
    db: Session = Depends(get_db),
):
    """Usuwa wiele zamówień po ID (ids=1,2,3). Usuwa też powiązane OrderItem."""
    if not ids or not ids.strip():
        return BulkOrdersDeleteResult()
    id_list = []
    for s in ids.split(","):
        s = s.strip()
        if s.isdigit():
            id_list.append(int(s))
    if not id_list:
        return BulkOrdersDeleteResult()
    result = _execute_orders_bulk_delete(db, tenant_id, warehouse_id, id_list)
    _commit_or_rollback_bulk_orders(db, result)
    return result


@router.post("/bulk-delete", response_model=BulkOrdersDeleteResult)
def bulk_delete_orders_by_selection(body: BulkOrdersDeleteBody, db: Session = Depends(get_db)):
    """Bulk delete by explicit ids or by replaying list filters (tenant + warehouse scoped)."""
    id_list = _resolve_bulk_order_ids(db, body.tenant_id, body.warehouse_id, body.selection)
    result = _execute_orders_bulk_delete(db, body.tenant_id, body.warehouse_id, id_list)
    _commit_or_rollback_bulk_orders(db, result)
    return result


@router.post("/bulk-status")
def orders_bulk_panel_status(
    body: BulkOrderPanelStatusPayload,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Set the same panel ``order_ui_status`` on many orders (does not change ``Order.status``)."""
    if body.selection_mode == "filtered_query":
        assert body.filters is not None
        unique_ids = _resolve_bulk_order_ids(
            db,
            tenant_id,
            warehouse_id,
            BulkOrdersSelection(mode="filtered_query", filters=body.filters),
        )
    else:
        raw_ids: List[int] = []
        for x in body.ids:
            s = str(x).strip()
            if s.isdigit():
                raw_ids.append(int(s))
        unique_ids = list(dict.fromkeys(raw_ids))
    if not unique_ids:
        return {"updated": 0}
    sid: Optional[int] = None
    st = (body.status or "").strip()
    if st != "":
        try:
            sid = int(st)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid status id") from e
        us = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.id == sid,
                OrderUiStatus.tenant_id == tenant_id,
                OrderUiStatus.warehouse_id == warehouse_id,
            )
            .first()
        )
        if not us:
            raise HTTPException(status_code=400, detail="Unknown panel sub-status for this warehouse")
    rows = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.id.in_(unique_ids),
            Order.deleted_at.is_(None),
        )
        .all()
    )
    if body.selection_mode == "explicit_ids":
        found: Set[int] = {int(r.id) for r in rows}
        if found != set(unique_ids):
            raise HTTPException(status_code=400, detail="Some order ids were not found in this warehouse")
    for row in rows:
        row.order_ui_status_id = sid
    db.commit()
    return {"updated": len(rows)}


@router.post("/bulk-patch")
def orders_bulk_patch(body: BulkOrdersPatchBody, db: Session = Depends(get_db)):
    """Apply the same panel-oriented patch fields to many orders (ids or filtered_query)."""
    id_list = _resolve_bulk_order_ids(db, body.tenant_id, body.warehouse_id, body.selection)
    if not id_list:
        return {"updated": 0}
    raw = body.model_dump(exclude_unset=True)
    patch_kw = {
        k: raw[k]
        for k in (
            "document_type",
            "shipping_method_id",
            "internal_note_append",
            "priority_color",
            "customer_note_append",
            "operational_note_append",
            "payment_method",
            "payment_status",
        )
        if k in raw
    }
    patch_body = OrderPatchBody(**patch_kw)
    updated = 0
    chunk = 250
    for i in range(0, len(id_list), chunk):
        part = id_list[i : i + chunk]
        rows = (
            db.query(Order)
            .options(joinedload(Order.shipping_method_row))
            .filter(
                Order.tenant_id == body.tenant_id,
                Order.warehouse_id == body.warehouse_id,
                Order.id.in_(part),
                Order.deleted_at.is_(None),
            )
            .all()
        )
        for row in rows:
            _apply_order_patch_to_order(db, row, patch_body)
            updated += 1
    db.commit()
    return {"updated": updated}


# ==========================================================
# PENDING STATS (dla dashboardu: NEW orders)
# ==========================================================

@router.get("/pending-stats/")
def get_pending_order_stats(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    """
    Statystyki zamówień do realizacji (status NEW):
    orders_to_pick, total_items (suma quantity), total_volume (dm³).
    """
    q = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.status == "NEW",
            Order.deleted_at.is_(None),
        )
    )
    orders = q.all()
    orders_to_pick = len(orders)
    total_items = 0
    total_volume = 0.0
    for o in orders:
        tv, _, ti, _ = _order_total_volume_and_multi(o)
        total_volume += tv
        total_items += ti
    return {
        "orders_to_pick": orders_to_pick,
        "total_items": total_items,
        "total_volume": round(total_volume, 4),
    }


@router.get("/office-dashboard-kpis/", response_model=OfficeDashboardKpiOut)
def get_office_dashboard_kpis(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Orders KPI for main panel: today vs yesterday (UTC calendar day), revenue from ``order.value``."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    yesterday_start = today_start - timedelta(days=1)

    eff = func.coalesce(Order.created_at, Order.order_date)

    def bucket(start: datetime, end: datetime) -> tuple[int, float]:
        r = (
            db.query(
                func.count(Order.id),
                func.coalesce(func.sum(Order.value), 0.0),
            )
            .filter(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.deleted_at.is_(None),
                eff >= start,
                eff < end,
            )
            .one()
        )
        return int(r[0] or 0), float(r[1] or 0.0)

    orders_today, revenue_today = bucket(today_start, today_end)
    orders_yesterday, revenue_yesterday = bucket(yesterday_start, today_start)

    avg_order_value_today = round((revenue_today / orders_today), 2) if orders_today > 0 else 0.0

    def pct_int(cur: int, prev: int) -> float | None:
        if prev > 0:
            return round((cur - prev) / prev * 100.0, 1)
        if cur > 0:
            return 100.0
        return None

    def pct_float(cur: float, prev: float) -> float | None:
        if prev > 1e-9:
            return round((cur - prev) / prev * 100.0, 1)
        if cur > 1e-9:
            return 100.0
        return None

    return OfficeDashboardKpiOut(
        orders_today=orders_today,
        orders_yesterday=orders_yesterday,
        revenue_today=round(revenue_today, 2),
        revenue_yesterday=round(revenue_yesterday, 2),
        avg_order_value_today=avg_order_value_today,
        orders_change_pct=pct_int(orders_today, orders_yesterday),
        revenue_change_pct=pct_float(revenue_today, revenue_yesterday),
    )


# ==========================================================
# CREATE (manual UI)
# ==========================================================


@router.post("/", response_model=OrderCreateResponse, status_code=201)
def create_order(body: OrderCreateBody, db: Session = Depends(get_db)):
    """Create order with lines from catalog products and/or bundles (bundles exploded to real products)."""
    try:
        resolved = resolve_order_create_lines(
            db,
            tenant_id=body.tenant_id,
            warehouse_id=body.warehouse_id,
            raw_lines=body.items,
            check_bundle_stock=bool(body.check_bundle_stock),
        )
    except BundleExplosionError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    origin_up = (body.origin or "").strip().upper() or None
    cot_raw = (body.complaint_order_type or "").strip().upper() if body.complaint_order_type else None
    complaint_ref: Optional[Complaint] = None
    if origin_up == "COMPLAINT":
        if body.complaint_id is None:
            raise HTTPException(status_code=400, detail="complaint_id is required when origin is COMPLAINT")
        if cot_raw not in ("EXCHANGE", "REPLACEMENT"):
            raise HTTPException(
                status_code=400,
                detail="complaint_order_type must be EXCHANGE or REPLACEMENT when origin is COMPLAINT",
            )
        complaint_ref = (
            db.query(Complaint)
            .filter(
                Complaint.id == int(body.complaint_id),
                Complaint.tenant_id == body.tenant_id,
                Complaint.warehouse_id == body.warehouse_id,
                Complaint.deleted_at.is_(None),
            )
            .first()
        )
        if not complaint_ref:
            raise HTTPException(status_code=400, detail="Complaint not found for this tenant/warehouse")
        rt0 = str(getattr(complaint_ref, "resolution_type", "") or "").strip().upper()
        rs0 = str(getattr(complaint_ref, "resolution_status", "") or "").strip().upper()
        if rt0 in ("REFUND", "PARTIAL_REFUND", "REJECTION") and rs0 == "COMPLETED":
            raise HTTPException(
                status_code=400,
                detail="Reklamacja ma zakończone rozliczenie finansowe — nie można utworzyć zamówienia wymiany.",
            )
    if body.customer_id is not None:
        cu = (
            db.query(Customer)
            .filter(Customer.id == int(body.customer_id), Customer.tenant_id == int(body.tenant_id))
            .first()
        )
        if cu is None:
            raise HTTPException(status_code=400, detail="customer_id not found for this tenant")

    if body.original_order_id is not None:
        oo = (
            db.query(Order)
            .filter(
                Order.id == int(body.original_order_id),
                Order.tenant_id == body.tenant_id,
                Order.warehouse_id == body.warehouse_id,
            )
            .first()
        )
        if not oo:
            raise HTTPException(status_code=400, detail="original_order_id not found for this tenant/warehouse")

    goods_total = sum(float(x.total_price) for x in resolved)
    order_vol = sum(float(x.line_volume) for x in resolved)

    shipping = round(float(body.shipping_cost or 0), 2)
    order_value = round(goods_total + shipping, 2)

    barcode = next_order_barcode(db, body.tenant_id)
    number = next_internal_order_number(db, body.tenant_id, body.warehouse_id)

    def _merge_address_lines(
        target: dict,
        street: Optional[str],
        city: Optional[str],
        postal: Optional[str],
        country: Optional[str],
    ) -> None:
        """Zapis jak w imporcie: polskie klucze + angielskie (czytelne dla _address_line_from_block)."""
        if street and str(street).strip():
            s = str(street).strip()
            target["street"] = s
            target["Ulica"] = s
        if city and str(city).strip():
            c = str(city).strip()
            target["city"] = c
            target["Miejscowość"] = c
        if postal and str(postal).strip():
            z = str(postal).strip()
            target["postal_code"] = z
            target["Kod pocztowy"] = z
        if country and str(country).strip():
            co = str(country).strip()
            target["country"] = co
            target["Kraj"] = co

    billing: dict = {}
    if body.first_name and str(body.first_name).strip():
        billing["first_name"] = str(body.first_name).strip()
    if body.last_name and str(body.last_name).strip():
        billing["last_name"] = str(body.last_name).strip()
    if body.phone and str(body.phone).strip():
        billing["phone"] = str(body.phone).strip()
    if body.email and str(body.email).strip():
        billing["email"] = str(body.email).strip()
    if body.login and str(body.login).strip():
        billing["login"] = str(body.login).strip()
    _merge_address_lines(
        billing,
        body.billing_street,
        body.billing_city,
        body.billing_postal_code,
        body.billing_country,
    )
    if body.company_name and str(body.company_name).strip():
        cn = str(body.company_name).strip()
        billing["company_name"] = cn
        billing["Firma"] = cn
    if body.nip and str(body.nip).strip():
        nip = str(body.nip).strip()
        billing["nip"] = nip
        billing["NIP"] = nip
        billing["tax_id"] = nip

    shipping: dict = {}
    _merge_address_lines(
        shipping,
        body.shipping_street,
        body.shipping_city,
        body.shipping_postal_code,
        body.shipping_country,
    )

    addresses: dict = {"billing": billing}
    if shipping:
        addresses["shipping"] = shipping
    meta = {
        "manual_create": True,
        "note": (body.note or "").strip() or None,
        "comment": (body.comment or "").strip() or None,
        "shipping_cost": shipping,
    }
    if body.document_type and str(body.document_type).strip():
        meta["panel_document_type"] = str(body.document_type).strip().upper()
    if body.payment_method is not None and str(body.payment_method).strip():
        meta["panel_payment_method"] = str(body.payment_method).strip()[:128]
    if body.payment_status is not None and str(body.payment_status).strip():
        meta["panel_payment_status"] = str(body.payment_status).strip()[:128]

    sales_num: Optional[str] = None
    if body.sales_document_number is not None:
        sales_num = str(body.sales_document_number).strip() or None

    now = datetime.utcnow()
    ship_id: Optional[str] = None
    ship_label: Optional[str] = None
    raw_sid = getattr(body, "shipping_method_id", None)
    if raw_sid and str(raw_sid).strip():
        sid = str(raw_sid).strip()
        sm = (
            db.query(ShippingMethod)
            .filter(
                ShippingMethod.id == sid,
                ShippingMethod.tenant_id == int(body.tenant_id),
                ShippingMethod.warehouse_id == int(body.warehouse_id),
            )
            .first()
        )
        if not sm:
            raise HTTPException(status_code=400, detail="Nieprawidłowa metoda dostawy (shipping_method_id).")
        ship_id = str(sm.id)
        ship_label = (sm.name or "").strip() or None

    order = Order(
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
        number=number,
        barcode=barcode,
        status="NEW",
        order_date=now,
        created_at=now,
        source=(body.source or "").strip() or None,
        value=order_value,
        currency="PLN",
        total_volume_dm3=round(order_vol, 4),
        sales_document_number=sales_num,
        addresses_json=json.dumps(addresses, ensure_ascii=False),
        import_metadata_json=json.dumps(meta, ensure_ascii=False),
        order_origin=origin_up,
        complaint_id=int(body.complaint_id) if body.complaint_id is not None else None,
        original_order_id=int(body.original_order_id) if body.original_order_id is not None else None,
        complaint_order_type=cot_raw if origin_up == "COMPLAINT" else None,
        shipping_method_id=ship_id,
        shipping_method=ship_label,
        customer_id=int(body.customer_id) if body.customer_id is not None else None,
    )
    db.add(order)
    db.flush()
    assign_order_scan_code(order)
    assign_default_new_panel_status_to_order(db, order)

    inst_to_parent_item_id: dict[str, int] = {}
    for r in resolved:
        if r.is_bundle_parent:
            oi = OrderItem(
                order_id=order.id,
                product_id=r.product_id,
                quantity=r.quantity,
                unit_price=r.unit_price,
                total_price=r.total_price,
                list_price=r.list_price,
                total_volume=round(r.line_volume, 4) if r.line_volume else None,
                source_bundle_id=r.source_bundle_id,
                bundle_instance_id=r.bundle_instance_id,
                metadata_json=r.metadata_json,
                vat_percent=r.vat_percent,
                is_bundle_parent=True,
                parent_bundle_order_item_id=None,
            )
            db.add(oi)
            db.flush()
            if r.bundle_instance_id:
                inst_to_parent_item_id[str(r.bundle_instance_id)] = int(oi.id)
            continue
        pb_id = None
        if r.bundle_instance_id:
            pb_id = inst_to_parent_item_id.get(str(r.bundle_instance_id))
        oi = OrderItem(
            order_id=order.id,
            product_id=r.product_id,
            quantity=r.quantity,
            unit_price=r.unit_price,
            total_price=r.total_price,
            list_price=r.list_price,
            total_volume=round(r.line_volume, 4) if r.line_volume else None,
            source_bundle_id=r.source_bundle_id,
            bundle_instance_id=r.bundle_instance_id,
            metadata_json=r.metadata_json,
            vat_percent=r.vat_percent,
            is_bundle_parent=False,
            parent_bundle_order_item_id=pb_id,
        )
        db.add(oi)

    if origin_up == "COMPLAINT" and cot_raw is not None:
        pname, paddr, pphone, pemail = _complaint_pickup_from_create_body(body)
        fulfillment_mode = "DELIVERY_AND_PICKUP" if cot_raw == "EXCHANGE" else "DELIVERY_ONLY"
        ensure_complaint_outbound_shipment(
            db,
            int(body.complaint_id),
            pickup_name=pname,
            pickup_address=paddr,
            pickup_phone=pphone,
            pickup_email=pemail,
            business_type=cot_raw,
            fulfillment_mode=fulfillment_mode,
        )

    if complaint_ref is not None:
        _finalize_complaint_replacement_order(db, complaint_ref, order)

    db.commit()
    db.refresh(order)
    logger.info("ORDER CREATE id=%s number=%s tenant=%s wh=%s", order.id, order.number, body.tenant_id, body.warehouse_id)
    return OrderCreateResponse(id=order.id, number=order.number)


# ==========================================================
# GET DETAILS (z pozycjami i produktami)
# ==========================================================


def _order_item_meta_dict(item: OrderItem) -> dict:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def _oms_waiting_from_meta(item: OrderItem) -> bool:
    return bool(_order_item_meta_dict(item).get("oms_waiting_for_stock"))


def _oms_waiting_missing_qty_from_meta(item: OrderItem) -> Optional[float]:
    raw = _order_item_meta_dict(item).get("oms_waiting_missing_qty")
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if v <= 1e-9:
        return None
    return round(v, 6)


def _oms_replacement_qty_snap_from_meta(item: OrderItem) -> tuple[Optional[int], Optional[int]]:
    """(original_quantity, transferred_quantity) z ``metadata_json.oms_replacement``."""
    rep = _order_item_meta_dict(item).get("oms_replacement")
    if not isinstance(rep, dict):
        return None, None
    oq: Optional[int] = None
    tq: Optional[int] = None
    raw_o = rep.get("original_quantity")
    raw_t = rep.get("transferred_quantity")
    if raw_o is not None:
        try:
            oq = int(float(raw_o))
        except (TypeError, ValueError):
            oq = None
    if raw_t is not None:
        try:
            tq = int(float(raw_t))
        except (TypeError, ValueError):
            tq = None
    return oq, tq


def _sum_picks_for_order_item(db: Session, order_item_id: int) -> float:
    """Łączna ilość zdarzeń PICK na linii (źródło prawdy: fulfillment_events)."""
    return float(sum_line_events(db, int(order_item_id), FE_PICK))


def _order_item_active_for_financial_totals(item: OrderItem) -> bool:
    try:
        q = int(item.quantity or 0)
    except (TypeError, ValueError):
        return False
    if q <= 0:
        return False
    if order_item_is_replaced_line(item):
        return False
    # Komponent zestawu — wartość komercyjna na nagłówku (linia ma total_price 0).
    if getattr(item, "parent_bundle_order_item_id", None) is not None:
        return False
    return True


def _order_item_include_in_purchase_cost_total(item: OrderItem) -> bool:
    """Nagłówek zestawu nie ma sensownego kosztu zakupu „jednego produktu”; liczą się komponenty."""
    if order_item_is_replaced_line(item):
        return False
    if int(item.quantity or 0) <= 0:
        return False
    if getattr(item, "is_bundle_parent", False):
        return False
    return True


def _compute_order_line_financials(
    item: OrderItem,
    product: Optional[Product],
    *,
    fifo_purchase_net: Optional[float] = None,
) -> Dict[str, Optional[float]]:
    """Delegate to sale_document_financials — single source of truth for line totals."""
    from ..services.sale_document_financials import compute_order_line_financials_with_margin

    return compute_order_line_financials_with_margin(
        item,
        product,
        fifo_purchase_net=fifo_purchase_net,
    )


def build_order_read(db: Session, order: Order) -> OrderRead:
    """Serialize one order to OrderRead (list/detail/patch reuse)."""
    total_volume, is_multi_item, _, _ = _order_total_volume_and_multi(order)
    meta = _order_import_meta_dict(order)
    panel_shipping_cost: Optional[float] = None
    panel_shipping_cost_display: Optional[str] = None
    raw_ship_top = meta.get("shipping_cost")
    if raw_ship_top is not None and str(raw_ship_top).strip() != "":
        try:
            panel_shipping_cost = max(0.0, float(str(raw_ship_top).replace(",", ".")))
        except (TypeError, ValueError):
            pass
    if panel_shipping_cost is None:
        scd_top = meta.get("shipping_cost_display")
        if scd_top is not None and str(scd_top).strip():
            panel_shipping_cost_display = str(scd_top).strip()[:64]

    bids = list({i.source_bundle_id for i in order.items if getattr(i, "source_bundle_id", None)})
    bundles_by_id = {}
    if bids:
        bundles_by_id = {b.id: b for b in db.query(Bundle).filter(Bundle.id.in_(bids)).all()}
    from ..services.product_cost_service import get_products_current_costs

    product_ids_for_cost = {
        int(item.product_id)
        for item in order.items
        if _order_item_include_in_purchase_cost_total(item) and getattr(item, "product_id", None) is not None
    }
    costs_by_pid: Dict[int, Dict] = (
        get_products_current_costs(db, int(order.tenant_id), product_ids_for_cost)
        if product_ids_for_cost
        else {}
    )

    sum_line_net_active = 0.0
    sum_purchase_active = 0.0
    items_out = []
    for item in order.items:
        product = item.product
        unit_vol = _unit_volume_dm3(product) if product else FALLBACK_VOLUME_DM3
        line_weight = (item.quantity or 0) * (product.weight or 0) if product else None
        sb_id = getattr(item, "source_bundle_id", None)
        biid = getattr(item, "bundle_instance_id", None)
        bqty = _bundle_qty_from_meta(getattr(item, "metadata_json", None))
        meta_it = _order_item_meta_dict(item)
        par_oid = getattr(item, "parent_bundle_order_item_id", None)
        is_bp = bool(getattr(item, "is_bundle_parent", False))
        from_bundle = par_oid is not None or bool(meta_it.get("from_bundle"))
        sb_brief = None
        br = bundles_by_id.get(int(sb_id)) if sb_id is not None else None
        if sb_id is not None and br is not None:
            sb_brief = SourceBundleBrief(id=br.id, name=br.name or "", sku=br.sku)
        rep_oid = getattr(item, "replaced_from_order_item_id", None)
        rep_name = getattr(item, "replaced_from_product_name", None)
        ols = getattr(item, "oms_line_status", None)
        rep_oq, rep_tq = _oms_replacement_qty_snap_from_meta(item)
        tp_raw = getattr(item, "total_price", None)
        total_price_out: Optional[float] = None
        if tp_raw is not None:
            try:
                total_price_out = round(float(tp_raw), 2)
            except (TypeError, ValueError):
                total_price_out = None
        fifo_purchase_net: Optional[float] = None
        if item.product_id is not None:
            cost_row = costs_by_pid.get(int(item.product_id))
            if cost_row is not None:
                raw_pur = cost_row.get("purchase_net")
                if raw_pur is not None:
                    try:
                        fifo_purchase_net = float(raw_pur)
                    except (TypeError, ValueError):
                        fifo_purchase_net = None
        fin = _compute_order_line_financials(item, product, fifo_purchase_net=fifo_purchase_net)
        if _order_item_active_for_financial_totals(item):
            ln = fin.get("line_net_total")
            if ln is not None:
                sum_line_net_active += float(ln)
        if _order_item_include_in_purchase_cost_total(item):
            lpur = fin.get("line_purchase_total_net")
            if lpur is not None:
                sum_purchase_active += float(lpur)
        unit_raw = getattr(item, "unit", None)
        unit_s = str(unit_raw).strip() if unit_raw is not None and str(unit_raw).strip() else None
        prod_out = ProductInOrder.model_validate(product) if product else ProductInOrder(id=0)
        if is_bp and br is not None:
            prod_out = prod_out.model_copy(
                update={
                    "name": str(br.name or prod_out.name or "")[:512] or prod_out.name,
                    "sku": (br.sku or prod_out.sku or prod_out.symbol or "")[:128] or prod_out.sku,
                    "ean": (br.ean or prod_out.ean or "")[:64] if getattr(br, "ean", None) else prod_out.ean,
                    "image_url": (str(br.image_url).strip()[:512] if getattr(br, "image_url", None) else None)
                    or prod_out.image_url,
                }
            )
        bd_u = meta_it.get("bundle_display_unit_price")
        bd_t = meta_it.get("bundle_display_line_total")
        bundle_display_unit_price: Optional[float] = None
        bundle_display_line_total: Optional[float] = None
        try:
            if bd_u is not None:
                bundle_display_unit_price = round(float(bd_u), 4)
        except (TypeError, ValueError):
            pass
        try:
            if bd_t is not None:
                bundle_display_line_total = round(float(bd_t), 2)
        except (TypeError, ValueError):
            pass
        items_out.append(
            OrderItemRead(
                id=item.id,
                quantity=item.quantity,
                product=prod_out,
                unit_volume_dm3=round(unit_vol, 4),
                line_total_weight=round(line_weight, 4) if line_weight is not None else None,
                unit_price=float(item.unit_price) if getattr(item, "unit_price", None) is not None else None,
                vat_percent=fin.get("vat_percent"),
                unit_price_net=fin.get("unit_price_net"),
                unit_price_gross=fin.get("unit_price_gross"),
                unit=unit_s,
                list_price=float(item.list_price) if getattr(item, "list_price", None) is not None else None,
                total_price=total_price_out,
                line_net_total=fin.get("line_net_total"),
                line_vat_amount=fin.get("line_vat_amount"),
                line_gross_total=fin.get("line_gross_total"),
                line_purchase_total_net=fin.get("line_purchase_total_net"),
                line_margin_amount=fin.get("line_margin_amount"),
                line_margin_percent=fin.get("line_margin_percent"),
                source_bundle_id=int(sb_id) if sb_id is not None else None,
                bundle_instance_id=str(biid) if biid else None,
                bundle_qty=bqty,
                from_bundle=from_bundle,
                source_bundle=sb_brief,
                is_bundle_parent=is_bp,
                parent_bundle_order_item_id=int(par_oid) if par_oid is not None and int(par_oid) > 0 else None,
                bundle_display_unit_price=bundle_display_unit_price,
                bundle_display_line_total=bundle_display_line_total,
                oms_waiting_for_stock=_oms_waiting_from_meta(item),
                oms_waiting_missing_qty=_oms_waiting_missing_qty_from_meta(item),
                replaced_from_order_item_id=int(rep_oid) if rep_oid is not None and int(rep_oid) > 0 else None,
                replaced_from_product_name=str(rep_name).strip() if rep_name and str(rep_name).strip() else None,
                oms_line_status=str(ols).strip() if ols and str(ols).strip() else None,
                oms_replacement_original_quantity=rep_oq,
                oms_replacement_transferred_quantity=rep_tq,
            )
        )

    dt_raw = getattr(order, "discount_type", None)
    dt_norm = str(dt_raw).strip().lower() if dt_raw is not None and str(dt_raw).strip() else None
    if dt_norm not in ("percent", "amount"):
        dt_norm = None
    dv_raw = getattr(order, "discount_value", None)
    discount_amount = 0.0
    if sum_line_net_active > 1e-9 and dv_raw is not None and dt_norm is not None:
        try:
            dvf = float(dv_raw)
            if dt_norm == "percent":
                discount_amount = round(sum_line_net_active * dvf / 100.0, 2)
            else:
                discount_amount = min(round(dvf, 2), sum_line_net_active)
        except (TypeError, ValueError):
            discount_amount = 0.0

    total_products_value: Optional[float] = None
    if sum_line_net_active > 1e-9:
        total_products_value = round(sum_line_net_active - discount_amount, 2)

    shipping_revenue_net: Optional[float] = panel_shipping_cost if panel_shipping_cost is not None else None

    total_revenue_net: Optional[float] = None
    if total_products_value is not None:
        ship_part = float(shipping_revenue_net or 0.0)
        total_revenue_net = round(total_products_value + ship_part, 2)

    total_purchase_cost_out: Optional[float] = (
        round(sum_purchase_active, 2) if sum_purchase_active > 1e-9 else None
    )
    gross_profit_out: Optional[float] = None
    margin_out: Optional[float] = None
    if total_products_value is not None and sum_purchase_active > 1e-9:
        gross_profit_out = round(float(total_products_value) - sum_purchase_active, 2)
        if total_products_value > 1e-9:
            margin_out = round(float(gross_profit_out) / float(total_products_value) * 100.0, 2)

    from ..services.direct_sale.order_display import (
        direct_sale_panel_payment_status,
        is_direct_sale_order,
        linked_documents_for_order,
    )

    fn, ln = _customer_names_for_order_display(order)
    source_disp = _source_display_for_order(order)

    ui_row = getattr(order, "order_ui_status", None)
    if ui_row is None and getattr(order, "order_ui_status_id", None):
        ui_row = db.query(OrderUiStatus).filter(OrderUiStatus.id == order.order_ui_status_id).first()

    ship_name, ship_logo, ship_id = _shipping_display_for_order(order)

    raw_doc = meta.get("panel_document_type")
    panel_document_type: Optional[str] = None
    if isinstance(raw_doc, str) and raw_doc.strip().upper() in ("PARAGON", "INVOICE"):
        panel_document_type = raw_doc.strip().upper()
    pm_raw = meta.get("panel_payment_method")
    panel_payment_method = str(pm_raw).strip()[:128] if isinstance(pm_raw, str) and str(pm_raw).strip() else None
    ps_raw = meta.get("panel_payment_status")
    panel_payment_status = str(ps_raw).strip()[:128] if isinstance(ps_raw, str) and str(ps_raw).strip() else None
    if is_direct_sale_order(order):
        ds_pay = direct_sale_panel_payment_status(order, db)
        if ds_pay:
            panel_payment_status = ds_pay
    pap_raw = meta.get("panel_amount_paid")
    panel_amount_paid = str(pap_raw).strip()[:128] if pap_raw is not None and str(pap_raw).strip() else None
    ptn_raw = meta.get("panel_tracking_numbers")
    panel_tracking_numbers = str(ptn_raw).strip()[:512] if ptn_raw is not None and str(ptn_raw).strip() else None
    raw_pds = meta.get("panel_document_series_id")
    panel_document_series_id = (
        str(raw_pds).strip() if isinstance(raw_pds, str) and str(raw_pds).strip() else None
    )

    hist_out: list[PanelFulfillmentHistoryEntry] = []
    hf = meta.get("panel_fulfillment_history")
    if isinstance(hf, list):
        for e in hf:
            if not isinstance(e, dict):
                continue
            at_e = str(e.get("at") or "").strip()
            if not at_e:
                continue
            raw_lines = e.get("lines")
            ls: list[str] = []
            if isinstance(raw_lines, list):
                ls = [str(x).strip() for x in raw_lines if x is not None and str(x).strip()]
            kind_e = str(e.get("kind") or "").strip() or None
            pn_raw = e.get("product_name")
            product_name_hist = str(pn_raw).strip() if pn_raw is not None and str(pn_raw).strip() else None

            def _hist_float(key: str) -> Optional[float]:
                v = e.get(key)
                if v is None:
                    return None
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return None

            qo = _hist_float("quantity_ordered")
            up = _hist_float("unit_price")
            lt = _hist_float("line_total")
            qb = _hist_float("quantity_before")
            qa = _hist_float("quantity_affected")
            oid_raw = e.get("order_item_id")
            try:
                order_item_id_hist = int(oid_raw) if oid_raw is not None else None
            except (TypeError, ValueError):
                order_item_id_hist = None
            if order_item_id_hist is not None and order_item_id_hist < 1:
                order_item_id_hist = None
            ps_raw = e.get("product_sku")
            product_sku_hist = str(ps_raw).strip() if ps_raw is not None and str(ps_raw).strip() else None
            pe_raw = e.get("product_ean")
            product_ean_hist = str(pe_raw).strip() if pe_raw is not None and str(pe_raw).strip() else None
            if not ls and not product_name_hist and not kind_e:
                continue
            hist_out.append(
                PanelFulfillmentHistoryEntry(
                    at=at_e,
                    lines=ls,
                    kind=kind_e,
                    order_item_id=order_item_id_hist,
                    product_name=product_name_hist,
                    product_sku=product_sku_hist,
                    product_ean=product_ean_hist,
                    quantity_ordered=qo,
                    quantity_before=qb,
                    quantity_affected=qa,
                    unit_price=up,
                    line_total=lt,
                )
            )

    sc_id = getattr(order, "selected_carton_id", None)
    sc_id_s = str(sc_id).strip() if sc_id else None
    selected_carton_brief: Optional[OrderSelectedCartonBrief] = None
    if sc_id_s:
        ctn = (
            db.query(Carton)
            .filter(
                Carton.id == sc_id_s,
                Carton.tenant_id == int(order.tenant_id),
                Carton.warehouse_id == int(order.warehouse_id),
            )
            .first()
        )
        if ctn is not None:
            selected_carton_brief = OrderSelectedCartonBrief(
                id=str(ctn.id),
                name=(ctn.name or "").strip() or "Karton",
                dimensions=f"{float(ctn.length_cm):g}×{float(ctn.width_cm):g}×{float(ctn.height_cm):g} cm",
                image_url=(ctn.image_url or None),
            )

    cust_brief: Optional[CustomerBriefOut] = None
    cust_id = getattr(order, "customer_id", None)
    if cust_id is not None:
        try:
            cu = (
                db.query(Customer)
                .filter(Customer.id == int(cust_id), Customer.tenant_id == int(order.tenant_id))
                .first()
            )
            if cu is not None:
                comp = (cu.company_name or "").strip()
                if comp:
                    dn = comp
                else:
                    dn = f"{(cu.first_name or '').strip()} {(cu.last_name or '').strip()}".strip() or f"#{cu.id}"
                cust_brief = CustomerBriefOut(id=int(cu.id), display_name=dn)
        except Exception:
            logger.exception(
                "[orders.detail] customer brief failed order_id=%s tenant_id=%s customer_id=%s",
                order.id,
                order.tenant_id,
                cust_id,
            )

    op_rows = (
        db.query(OrderOperationalNote)
        .filter(OrderOperationalNote.order_id == int(order.id))
        .order_by(OrderOperationalNote.created_at.desc(), OrderOperationalNote.id.desc())
        .all()
    )
    operational_notes_out = [
        OrderOperationalNoteRead(
            id=int(n.id),
            order_id=int(n.order_id),
            author_user_id=int(n.author_user_id) if getattr(n, "author_user_id", None) else None,
            content=str(n.content or ""),
            show_in_picking=bool(getattr(n, "show_in_picking", False)),
            show_in_packing=bool(getattr(n, "show_in_packing", False)),
            show_in_returns=bool(getattr(n, "show_in_returns", False)),
            show_in_complaints=bool(getattr(n, "show_in_complaints", False)),
            priority=int(n.priority) if getattr(n, "priority", None) is not None else None,
            color_tag=(str(getattr(n, "color_tag", "") or "").strip() or None),
            created_at=getattr(n, "created_at", None),
            updated_at=getattr(n, "updated_at", None),
        )
        for n in op_rows
    ]
    comm_one = batch_order_list_communication_fields(db, [order]).get(int(order.id))

    act_rows = (
        db.query(OrderActivityLog)
        .filter(OrderActivityLog.order_id == int(order.id))
        .order_by(OrderActivityLog.created_at.desc(), OrderActivityLog.id.desc())
        .limit(500)
        .all()
    )
    activity_logs_out = [
        OrderActivityLogRead(
            id=int(r.id),
            event_type=str(r.event_type or ""),
            message=str(r.message or ""),
            created_at=getattr(r, "created_at", None),
        )
        for r in act_rows
    ]

    order_doc_rows = (
        db.query(OrderDocument)
        .filter(OrderDocument.order_id == int(order.id))
        .order_by(OrderDocument.id.desc())
        .limit(500)
        .all()
    )
    order_documents_out = [
        OrderDocumentRead(
            id=int(d.id),
            document_type=str(d.document_type or ""),
            original_filename=str(d.original_filename or ""),
            file_url=str(d.file_url or ""),
            created_at=getattr(d, "created_at", None),
        )
        for d in order_doc_rows
    ]

    from ..schemas.order import OrderLinkedDocumentRead

    linked_docs_out = [
        OrderLinkedDocumentRead(**row)
        for row in linked_documents_for_order(db, order)
    ]

    return OrderRead(
        id=order.id,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        number=order.number,
        external_id=getattr(order, "external_id", None),
        sales_document_number=getattr(order, "sales_document_number", None),
        order_origin=getattr(order, "order_origin", None),
        complaint_id=getattr(order, "complaint_id", None),
        original_order_id=getattr(order, "original_order_id", None),
        complaint_order_type=getattr(order, "complaint_order_type", None),
        city=order.city,
        country=order.country,
        status=order.status,
        scan_code=getattr(order, "scan_code", None),
        first_name=fn,
        last_name=ln,
        source=source_disp,
        items=items_out,
        total_volume=total_volume,
        is_multi_item=is_multi_item,
        order_date=getattr(order, "order_date", None),
        created_at=getattr(order, "created_at", None),
        value=float(order.value) if getattr(order, "value", None) is not None else None,
        discount_type=dt_norm,
        discount_value=float(dv_raw) if dv_raw is not None else None,
        discount_amount=discount_amount,
        total_products_value=total_products_value,
        shipping_revenue_net=shipping_revenue_net,
        total_revenue_net=total_revenue_net,
        total_purchase_cost=total_purchase_cost_out,
        gross_profit=gross_profit_out,
        margin=margin_out,
        shipping_method_id=ship_id,
        shipping_method=ship_name,
        shipping_method_logo_url=ship_logo,
        currency=getattr(order, "currency", None),
        addresses_json=getattr(order, "addresses_json", None),
        order_ui_status=_brief_order_ui_status(ui_row),
        panel_document_type=panel_document_type,
        panel_payment_method=panel_payment_method,
        panel_payment_status=panel_payment_status,
        panel_amount_paid=panel_amount_paid,
        panel_shipping_cost=panel_shipping_cost,
        panel_shipping_cost_display=panel_shipping_cost_display,
        panel_tracking_numbers=panel_tracking_numbers,
        selected_carton_id=sc_id_s,
        selected_carton=selected_carton_brief,
        panel_document_series_id=panel_document_series_id,
        customer_id=int(cust_id) if cust_id is not None else None,
        customer=cust_brief,
        panel_fulfillment_history=hist_out,
        order_activity_logs=activity_logs_out,
        operational_notes=operational_notes_out,
        has_internal_note=comm_one.has_internal_note if comm_one else False,
        has_customer_comment=comm_one.has_customer_comment if comm_one else False,
        latest_internal_note_preview=comm_one.latest_internal_note_preview if comm_one else None,
        latest_customer_comment_preview=comm_one.latest_customer_comment_preview if comm_one else None,
        order_documents=order_documents_out,
        order_channel=str(getattr(order, "order_channel", None) or "").strip() or None,
        fulfillment_mode=str(getattr(order, "fulfillment_mode", None) or "").strip() or None,
        linked_documents=linked_docs_out,
    )


def _apply_order_patch_to_order(db: Session, order: Order, body: OrderPatchBody) -> None:
    """Apply ``OrderPatchBody`` to a loaded ``Order`` (no commit)."""
    _patch_fields: Set[str] = getattr(body, "model_fields_set", None) or getattr(body, "__fields_set__", set())
    if "priority_color" in _patch_fields:
        v = body.priority_color
        if v is None or (isinstance(v, str) and not str(v).strip()):
            order.priority_color = None
        else:
            order.priority_color = str(v).strip().lower()
    if "shipping_method_id" in _patch_fields:
        raw = body.shipping_method_id
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            order.shipping_method_id = None
        else:
            sid = str(raw).strip()
            sm = (
                db.query(ShippingMethod)
                .filter(
                    ShippingMethod.id == sid,
                    ShippingMethod.tenant_id == int(order.tenant_id),
                    ShippingMethod.warehouse_id == int(order.warehouse_id),
                )
                .first()
            )
            if not sm:
                raise HTTPException(status_code=400, detail="Nieprawidłowa metoda dostawy.")
            order.shipping_method_id = str(sm.id)
            order.shipping_method = (sm.name or "").strip() or None

    if "customer_id" in _patch_fields:
        if body.customer_id is None:
            order.customer_id = None
        else:
            cu = (
                db.query(Customer)
                .filter(Customer.id == int(body.customer_id), Customer.tenant_id == int(order.tenant_id))
                .first()
            )
            if cu is None:
                raise HTTPException(status_code=400, detail="customer_id not found for this tenant")
            order.customer_id = int(body.customer_id)

    if "sales_document_number" in _patch_fields:
        sdn = body.sales_document_number
        if sdn is None:
            order.sales_document_number = None
        else:
            s = str(sdn).strip()
            order.sales_document_number = s or None

    meta = _order_import_meta_dict(order)
    meta_changed = False
    if "document_type" in _patch_fields:
        v = body.document_type
        if v is None or v == "":
            meta.pop("panel_document_type", None)
            meta_changed = True
        else:
            meta["panel_document_type"] = str(v).strip().upper()
            meta_changed = True

    if "payment_method" in _patch_fields:
        pm = body.payment_method
        if pm is None:
            meta.pop("panel_payment_method", None)
            meta_changed = True
        else:
            s = str(pm).strip()
            if not s:
                meta.pop("panel_payment_method", None)
            else:
                meta["panel_payment_method"] = s[:128]
            meta_changed = True

    if "payment_status" in _patch_fields:
        ps = body.payment_status
        if ps is None:
            meta.pop("panel_payment_status", None)
            meta_changed = True
        else:
            s = str(ps).strip()
            if not s:
                meta.pop("panel_payment_status", None)
            else:
                meta["panel_payment_status"] = s[:128]
            meta_changed = True

    if "document_series_id" in _patch_fields:
        v = body.document_series_id
        if v is None or v == "":
            meta.pop("panel_document_series_id", None)
            meta_changed = True
        else:
            sid = str(v).strip()
            ds = (
                db.query(DocumentSeries)
                .filter(
                    DocumentSeries.id == sid,
                    DocumentSeries.tenant_id == int(order.tenant_id),
                    DocumentSeries.warehouse_id == int(order.warehouse_id),
                )
                .first()
            )
            if not ds:
                raise HTTPException(status_code=400, detail="Nieprawidłowa seria dokumentów.")
            meta["panel_document_series_id"] = sid
            meta_changed = True

    if "internal_note_append" in _patch_fields:
        s = str(body.internal_note_append or "").strip()
        if s:
            notes = meta.get("panel_internal_notes")
            if not isinstance(notes, list):
                notes = []
            notes.append(
                {
                    "at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
                    "text": s[:2000],
                }
            )
            meta["panel_internal_notes"] = notes[-50:]
            meta_changed = True

    if "customer_note_append" in _patch_fields:
        s = str(body.customer_note_append or "").strip()
        if s:
            now = datetime.utcnow()
            db.add(
                OrderNote(
                    order_id=int(order.id),
                    tenant_id=int(order.tenant_id),
                    warehouse_id=int(order.warehouse_id),
                    type="customer",
                    content=s[:8000],
                    created_at=now,
                )
            )

    if "operational_note_append" in _patch_fields:
        s = str(body.operational_note_append or "").strip()
        if s:
            now = datetime.utcnow()
            db.add(
                OrderOperationalNote(
                    order_id=int(order.id),
                    author_user_id=None,
                    content=s[:8000],
                    show_in_picking=True,
                    show_in_packing=True,
                    show_in_returns=False,
                    show_in_complaints=False,
                    priority=None,
                    color_tag=None,
                    created_at=now,
                    updated_at=now,
                )
            )

    if meta_changed:
        _order_set_import_meta(order, meta)

    _patch_order_billing_identity(order, body, _patch_fields)
    _patch_order_shipping_address(order, body, _patch_fields)


@router.patch("/{order_id}/", response_model=OrderRead)
def patch_order(order_id: int, body: OrderPatchBody, db: Session = Depends(get_db)):
    order = (
        db.query(Order)
        .options(joinedload(Order.shipping_method_row))
        .filter(Order.id == int(order_id))
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _apply_order_patch_to_order(db, order, body)

    db.commit()
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
        )
        .filter(Order.id == int(order_id))
        .first()
    )
    assert order is not None
    return build_order_read(db, order)


@router.patch("/{order_id}/priority", response_model=OrderRead)
def patch_order_priority(order_id: int, body: OrderPriorityPatchBody, db: Session = Depends(get_db)):
    """Ustawienie koloru priorytetu (flame); ta sama semantyka co ``priority_color`` w ``OrderPatchBody``."""
    order = (
        db.query(Order)
        .options(joinedload(Order.shipping_method_row))
        .filter(Order.id == int(order_id))
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _apply_order_patch_to_order(db, order, OrderPatchBody(priority_color=body.priority_color))
    db.commit()
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
        )
        .filter(Order.id == int(order_id))
        .first()
    )
    assert order is not None
    return build_order_read(db, order)


@router.post("/{order_id}/items/", response_model=OrderRead)
def add_order_line(order_id: int, body: OrderAddLineBody, db: Session = Depends(get_db)):
    """Append a catalog product line (merge po produkcie) lub zestaw z eksplozją i nagłówkiem komercyjnym."""
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == int(order_id))
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    qty = int(body.quantity)
    unit_str = (body.unit or "").strip() or None

    if body.bundle_id is not None:
        try:
            raw_lines = explode_bundle_line(
                db,
                tenant_id=int(order.tenant_id),
                bundle_id=int(body.bundle_id),
                bundle_order_qty=qty,
                line_unit_price_override=body.unit_price,
            )
            merged = merge_resolved_lines(raw_lines)
        except BundleExplosionError as e:
            raise HTTPException(status_code=400, detail=e.detail)
        inst_to_parent_item_id: dict[str, int] = {}
        for r in merged:
            vat_opt = float(body.vat_percent) if body.vat_percent is not None else None
            vat_final: Optional[float] = vat_opt if vat_opt is not None else r.vat_percent
            if r.is_bundle_parent:
                oi = OrderItem(
                    order_id=order.id,
                    product_id=r.product_id,
                    quantity=r.quantity,
                    unit_price=r.unit_price,
                    total_price=r.total_price,
                    list_price=r.list_price,
                    total_volume=round(r.line_volume, 4) if r.line_volume else None,
                    unit=unit_str,
                    vat_percent=vat_final,
                    metadata_json=r.metadata_json,
                    source_bundle_id=r.source_bundle_id,
                    bundle_instance_id=r.bundle_instance_id,
                    is_bundle_parent=True,
                    parent_bundle_order_item_id=None,
                )
                db.add(oi)
                db.flush()
                if r.bundle_instance_id:
                    inst_to_parent_item_id[str(r.bundle_instance_id)] = int(oi.id)
                continue
            pb_id = inst_to_parent_item_id.get(str(r.bundle_instance_id)) if r.bundle_instance_id else None
            oi = OrderItem(
                order_id=order.id,
                product_id=r.product_id,
                quantity=r.quantity,
                unit_price=r.unit_price,
                total_price=r.total_price,
                list_price=r.list_price,
                total_volume=round(r.line_volume, 4) if r.line_volume else None,
                unit=unit_str,
                vat_percent=vat_final,
                metadata_json=r.metadata_json,
                source_bundle_id=r.source_bundle_id,
                bundle_instance_id=r.bundle_instance_id,
                is_bundle_parent=False,
                parent_bundle_order_item_id=pb_id,
            )
            db.add(oi)
        db.flush()
        _recompute_order_value_and_volume(order, db)
        db.commit()
    else:
        assert body.product_id is not None
        product = (
            db.query(Product)
            .filter(Product.id == int(body.product_id), Product.tenant_id == int(order.tenant_id))
            .first()
        )
        if not product:
            raise HTTPException(status_code=400, detail="Product not found for this tenant")
        resolved = explode_product_line(
            product=product,
            quantity=qty,
            line_unit_price_override=body.unit_price,
        )
        existing = (
            db.query(OrderItem)
            .filter(
                OrderItem.order_id == order.id,
                OrderItem.product_id == product.id,
                OrderItem.source_bundle_id.is_(None),
                OrderItem.bundle_instance_id.is_(None),
                OrderItem.parent_bundle_order_item_id.is_(None),
            )
            .first()
        )
        vat_opt = float(body.vat_percent) if body.vat_percent is not None else None
        vat_final: Optional[float] = vat_opt if vat_opt is not None else resolved.vat_percent
        if existing:
            old_qty = int(existing.quantity or 0)
            new_qty = old_qty + qty
            old_total = (
                float(existing.total_price)
                if existing.total_price is not None
                else round(float(existing.unit_price or 0) * old_qty, 2)
            )
            add_total = float(resolved.total_price)
            ttot = round(old_total + add_total, 2)
            existing.quantity = new_qty
            existing.unit_price = round(ttot / new_qty, 4) if new_qty else 0.0
            existing.total_price = ttot
            if existing.list_price is None and resolved.list_price is not None:
                existing.list_price = resolved.list_price
            if unit_str is not None:
                existing.unit = unit_str
            if vat_final is not None:
                existing.vat_percent = vat_final
            prev_vol = float(existing.total_volume) if existing.total_volume is not None else 0.0
            existing.total_volume = round(prev_vol + float(resolved.line_volume), 4)
        else:
            oi = OrderItem(
                order_id=order.id,
                product_id=resolved.product_id,
                quantity=resolved.quantity,
                unit_price=resolved.unit_price,
                total_price=resolved.total_price,
                list_price=resolved.list_price,
                total_volume=round(resolved.line_volume, 4) if resolved.line_volume else None,
                unit=unit_str,
                vat_percent=vat_final,
                metadata_json=resolved.metadata_json,
                is_bundle_parent=False,
                parent_bundle_order_item_id=None,
            )
            db.add(oi)
        db.flush()
        _recompute_order_value_and_volume(order, db)
        db.commit()
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
        )
        .filter(Order.id == int(order_id))
        .first()
    )
    assert order is not None
    return build_order_read(db, order)


@router.delete("/{order_id}/items/{item_id}", response_model=OrderRead)
def delete_order_item_line(order_id: int, item_id: int, db: Session = Depends(get_db)):
    """Usuwa pojedynczą linię zamówienia (OMS). Nie dotyczy linii rozbitych z zestawu."""
    import traceback

    from ..services.order_item_delete_service import (
        order_item_delete_audit_context,
        purge_order_item_wms_dependents,
        soft_remove_order_item,
    )
    from ..services.wms_audit_service import (
        emit_order_item_removed,
        emit_order_line_removed,
        emit_replacement_item_removed,
    )

    logger.info(
        "[order.item.delete] ENTER order_id=%s item_id=%s",
        order_id,
        item_id,
    )
    try:
        order = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id == int(order_id))
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        item = (
            db.query(OrderItem)
            .options(joinedload(OrderItem.product))
            .filter(OrderItem.id == int(item_id), OrderItem.order_id == int(order_id))
            .first()
        )
        if not item:
            raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
        if getattr(item, "parent_bundle_order_item_id", None) is not None:
            raise HTTPException(
                status_code=400,
                detail="To jest składnik zestawu — usuń nagłówek zestawu (linia „Zestaw”), aby usunąć całość.",
            )

        audit_ctx = order_item_delete_audit_context(item)
        logger.info(
            "[order.item.delete] order_id=%s item_id=%s is_replacement=%s replacement_parent_id=%s source_line_id=%s",
            order_id,
            item_id,
            audit_ctx.get("is_replacement"),
            audit_ctx.get("replacement_parent_id"),
            audit_ctx.get("source_line_id"),
        )

        nm = ""
        if item.product is not None and getattr(item.product, "name", None):
            nm = str(item.product.name).strip()
        elif item.product_id:
            nm = f"Produkt #{int(item.product_id)}"
        qty_line = int(item.quantity or 0)
        orig_name = (getattr(item, "replaced_from_product_name", None) or "").strip() or None
        from ..services.order_item_removal_service import (
            REMOVAL_TYPE_MANUAL_OMS,
            REMOVAL_TYPE_SHORTAGE,
            removal_ui_labels,
        )

        had_shortage = float(getattr(item, "wms_picking_line_missing_qty", 0) or 0) > 1e-6
        if not had_shortage:
            try:
                had_shortage = float(compute_line_missing_qty(db, order, item)) > 1e-6
            except Exception:
                had_shortage = False
        removal_type = REMOVAL_TYPE_SHORTAGE if had_shortage else REMOVAL_TYPE_MANUAL_OMS
        ui = removal_ui_labels(removal_type)
        lines_hist = [
            "Usunięto produkt z zamówienia:",
            f"- {nm} ({qty_line} szt.)",
            f"Powód: {ui['reason_default']}.",
        ]
        if had_shortage:
            lines_hist.append("Rozwiązano brak przez usunięcie produktu.")
        rm_unit = float(item.unit_price or 0) if getattr(item, "unit_price", None) is not None else 0.0
        rm_tot = (
            float(item.total_price)
            if getattr(item, "total_price", None) is not None
            else round(rm_unit * qty_line, 2)
        )
        _append_panel_fulfillment_history(
            order,
            lines_hist,
            snapshot={
                "kind": "order_line_removed",
                "removal_type": removal_type,
                "product_name": nm[:512],
                "quantity_ordered": float(qty_line),
                "unit_price": round(rm_unit, 4) if rm_unit else None,
                "line_total": round(rm_tot, 2),
            },
        )
        from ..services.recovery_workflow_service import (
            resolve_order_recovery_state,
            sync_relocation_tasks_from_recovery_state,
        )

        _reloc_state = resolve_order_recovery_state(db, order, log=False)
        sync_relocation_tasks_from_recovery_state(
            db,
            order,
            _reloc_state,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            source_event_id=f"order_line_removed:{int(item.id)}",
        )
        purge_order_item_wms_dependents(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_item_id=int(item.id),
        )
        if audit_ctx.get("is_replacement"):
            emit_replacement_item_removed(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                order_id=int(order.id),
                order_item_id=int(item.id),
                product_id=int(item.product_id) if item.product_id else None,
                product_name=nm,
                original_product_name=orig_name,
                original_order_item_id=audit_ctx.get("replacement_parent_id"),
                quantity=float(qty_line),
                reason="usunięto linię zamiennika (OMS)",
            )
        else:
            emit_order_item_removed(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                order_id=int(order.id),
                order_item_id=int(item.id),
                product_id=int(item.product_id) if item.product_id else None,
                product_name=nm,
                quantity=float(qty_line),
                reason="usunięto linię z zamówienia (OMS)",
            )
        emit_order_line_removed(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order.id),
            order_item_id=int(item.id),
            product_id=int(item.product_id) if item.product_id else None,
            product_name=nm,
            quantity=float(qty_line),
            reason="usunięto linię z zamówienia (OMS)",
        )
        soft_remove_order_item(
            db,
            item,
            reason=ui["reason_default"],
            removal_type=removal_type,
        )
        _recompute_order_value_and_volume(order, db)
        apply_fulfillment_state_from_resolver(db, order, log=True)
        db.commit()
        order = (
            db.query(Order)
            .options(
                joinedload(Order.items).joinedload(OrderItem.product),
                joinedload(Order.order_ui_status),
                joinedload(Order.shipping_method_row),
            )
            .filter(Order.id == int(order_id))
            .first()
        )
        assert order is not None
        return build_order_read(db, order)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.error(
            "[order.item.delete] ERROR order_id=%s item_id=%s traceback=%s",
            order_id,
            item_id,
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=500,
            detail="Nie udało się usunąć produktu z zamówienia.",
        ) from exc


@router.patch("/{order_id}/items/{item_id}", response_model=OrderRead)
def patch_order_item_line(
    order_id: int,
    item_id: int,
    body: OrderItemPanelPatchBody,
    db: Session = Depends(get_db),
):
    """Akcje na wyliczonym braku: zamiana tylko brakującej ilości, zmniejszenie zamówionej o brak, „czeka na towar`` tylko dla braku (metadane). Pobrań nie zmieniamy."""
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == int(order_id))
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    item = (
        db.query(OrderItem)
        .filter(OrderItem.id == int(item_id), OrderItem.order_id == int(order_id))
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    if body.line_edit is not None and getattr(item, "parent_bundle_order_item_id", None) is not None:
        raise HTTPException(
            status_code=400,
            detail="Składnik zestawu — edycja ilości/ceny jest na nagłówku zestawu; tu dostępne są akcje braków.",
        )

    _MISS_EPS = 1e-6

    if body.replace_product_id is not None:
        m = compute_line_missing_qty(db, order, item)
        if m <= _MISS_EPS:
            raise HTTPException(
                status_code=400,
                detail="Brak wyliczonego braku na linii — akcja niedostępna (wymagane zgłoszenie braku z WMS i dodatni brak operacyjny).",
            )
        picked = _sum_picks_for_order_item(db, int(item.id))
        orig_qty = int(item.quantity or 0)
        if orig_qty < 1:
            raise HTTPException(status_code=400, detail="Nieprawidłowa ilość na linii.")
        if (getattr(item, "oms_line_status", None) or "").strip().upper() == OMS_LINE_STATUS_REPLACED:
            raise HTTPException(status_code=400, detail="Ta linia została już zamieniona — użyj bieżącej linii produktu.")
        product = (
            db.query(Product)
            .filter(Product.id == int(body.replace_product_id), Product.tenant_id == int(order.tenant_id))
            .first()
        )
        if not product:
            raise HTTPException(status_code=400, detail="Produkt nie znaleziony dla tego tenanta")
        if int(product.id) == int(item.product_id):
            raise HTTPException(status_code=400, detail="Wybierz inny produkt niż bieżący na linii.")

        old_name = ""
        if item.product is not None and getattr(item.product, "name", None):
            old_name = str(item.product.name).strip()
        elif item.product_id:
            old_name = f"Produkt #{int(item.product_id)}"

        qty_kept = min(orig_qty, max(0, int(math.ceil(picked - 1e-9))))
        max_transfer = orig_qty - qty_kept
        qty_new = min(int(math.ceil(m - 1e-9)), max_transfer)
        if qty_new < 1:
            raise HTTPException(
                status_code=400,
                detail="Brak ilości do przeniesienia na nowy produkt — linia jest już w pełni skompletowana w magazynie lub brak jest zerowy.",
            )

        meta_old = _order_item_meta_dict(item)
        new_product_name = str(product.name or "").strip() or f"Produkt #{int(product.id)}"
        meta_old["oms_replacement"] = {
            "original_quantity": orig_qty,
            "picked_snapshot": round(float(picked), 6),
            "missing_qty_snapshot": round(float(m), 6),
            "transferred_quantity": qty_new,
            "new_product_id": int(product.id),
            "new_product_name": new_product_name,
        }
        item.metadata_json = json.dumps(meta_old, ensure_ascii=False) if meta_old else None
        append_event(
            db,
            order_item_id=int(item.id),
            event_type=FE_REPLACED,
            quantity=float(qty_new),
            metadata={"new_product_id": int(product.id)},
        )
        item.quantity = 0 if qty_kept <= 0 else (orig_qty - qty_new)
        item.oms_line_status = OMS_LINE_STATUS_REPLACED
        item.wms_shortage_declared_qty = 0.0
        item.oms_removed_qty = 0.0
        item.oms_replaced_qty = 0.0
        item.wms_picking_line_missing_qty = 0.0
        item.wms_picking_line_status = None
        item.replaced_from_order_item_id = None
        item.replaced_from_product_name = None

        resolved = explode_product_line(product=product, quantity=qty_new, line_unit_price_override=None)
        meta_new_item = {
            "oms_substitute_line": True,
            "oms_substitute_for_product_name": old_name[:255] if old_name else None,
        }
        new_item = OrderItem(
            order_id=int(order.id),
            product_id=resolved.product_id,
            quantity=resolved.quantity,
            packing_quantity_packed=0,
            unit_price=resolved.unit_price,
            total_price=resolved.total_price,
            list_price=resolved.list_price,
            total_volume=round(resolved.line_volume, 4) if resolved.line_volume else None,
            wms_picking_line_missing_qty=0.0,
            wms_picking_line_status="to_pick",
            wms_shortage_declared_qty=0.0,
            oms_removed_qty=0.0,
            oms_replaced_qty=0.0,
            oms_line_status=OMS_LINE_STATUS_TO_PICK,
            replaced_from_order_item_id=int(item.id),
            replaced_from_product_name=old_name[:255] if old_name else None,
            metadata_json=json.dumps(meta_new_item, ensure_ascii=False),
        )
        db.add(new_item)
        # Rekordy Pick dla nowej linii powstają przy zbieraniu (wózek + alokacja lokalizacji), nie tutaj.
        touch_picking_in_progress(order)
        from ..services.wms_audit_service import emit_order_line_replaced

        emit_order_line_replaced(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order.id),
            order_item_id=int(item.id),
            old_product_name=old_name,
            new_product_id=int(product.id),
            new_product_name=new_product_name,
            quantity=float(qty_new),
        )

    elif body.remove_missing is True:
        m = compute_line_missing_qty(db, order, item)
        if m <= _MISS_EPS:
            raise HTTPException(
                status_code=400,
                detail="Brak wyliczonego braku na linii — nie można zmniejszyć zamówionej.",
            )
        if (getattr(item, "oms_line_status", None) or "").strip().upper() == OMS_LINE_STATUS_REPLACED:
            raise HTTPException(status_code=400, detail="Ta linia jest zarchiwizowana po zamianie — użyj bieżącej linii.")
        picked = _sum_picks_for_order_item(db, int(item.id))
        orig_qty = int(item.quantity or 0)
        if orig_qty < 1:
            raise HTTPException(status_code=400, detail="Nieprawidłowa ilość na linii.")
        qty_kept_min = min(orig_qty, max(0, int(math.ceil(picked - 1e-9))))
        max_reduction = orig_qty - qty_kept_min
        reduction = min(int(math.ceil(m - 1e-9)), max_reduction)
        if reduction < 1:
            raise HTTPException(
                status_code=400,
                detail="Nie można zmniejszyć zamówionej — brak wolnej ilości ponad zebrane pobrań.",
            )
        new_qty = orig_qty - reduction
        rm_nm = ""
        if item.product is not None and getattr(item.product, "name", None):
            rm_nm = str(item.product.name).strip()
        elif item.product_id:
            rm_nm = f"Produkt #{int(item.product_id)}"
        rm_unit = float(item.unit_price or 0) if getattr(item, "unit_price", None) is not None else 0.0
        tp_before = getattr(item, "total_price", None)
        if tp_before is not None and orig_qty > 0:
            removed_total = round(float(tp_before) * (float(reduction) / float(orig_qty)), 2)
        else:
            removed_total = round(rm_unit * float(reduction), 2) if rm_unit else None
        tp = getattr(item, "total_price", None)
        if tp is not None and orig_qty > 0:
            item.total_price = round(float(tp) * (float(new_qty) / float(orig_qty)), 2)
        item.quantity = new_qty
        rm_sku = ""
        rm_ean = ""
        if item.product is not None:
            rm_sku = str(getattr(item.product, "symbol", None) or getattr(item.product, "sku", None) or "").strip()
            rm_ean = str(getattr(item.product, "ean", None) or "").strip()
        _append_panel_fulfillment_history(
            order,
            [
                "Usunięto produkt z zamówienia:",
                f"- {rm_nm} ({int(reduction)} szt.)",
                "Powód: brak magazynowy",
                "Rozwiązano brak przez usunięcie produktu.",
            ],
            snapshot={
                "kind": "shortage_reduced",
                "order_item_id": int(item.id),
                "product_name": rm_nm[:512],
                "product_sku": rm_sku[:128] if rm_sku else None,
                "product_ean": rm_ean[:64] if rm_ean else None,
                "quantity_before": float(orig_qty),
                "quantity_affected": float(reduction),
                "quantity_ordered": float(reduction),
                "unit_price": round(rm_unit, 4) if rm_unit else None,
                "line_total": removed_total,
            },
        )
        touch_picking_in_progress(order)
        from ..services.recovery_workflow_service import (
            resolve_order_recovery_state,
            sync_relocation_tasks_from_recovery_state,
        )
        from ..services.wms_audit_service import emit_oms_decision_accepted

        if float(picked) > float(new_qty) + 1e-9:
            _reloc_state = resolve_order_recovery_state(db, order, log=False)
            sync_relocation_tasks_from_recovery_state(
                db,
                order,
                _reloc_state,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                source_event_id=f"remove_missing_reloc:{int(item.id)}",
            )
        emit_oms_decision_accepted(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order.id),
            order_item_id=int(item.id),
            product_id=int(item.product_id) if item.product_id else None,
            product_name=rm_nm,
            quantity=float(reduction),
            action="Usunięto brakującą ilość z zamówienia",
        )

    elif body.waiting_for_stock is not None:
        meta = _order_item_meta_dict(item)
        delete_line_events_of_type(db, int(item.id), FE_WAITING)
        if body.waiting_for_stock:
            m = compute_line_missing_qty(db, order, item)
            if m <= _MISS_EPS:
                raise HTTPException(
                    status_code=400,
                    detail="Brak wyliczonego braku na linii — nie można oznaczyć „czeka na towar”.",
                )
            meta["oms_waiting_for_stock"] = True
            meta["oms_waiting_missing_qty"] = round(float(m), 6)
            append_event(
                db,
                order_item_id=int(item.id),
                event_type=FE_WAITING,
                quantity=float(m),
                metadata=None,
            )
        else:
            meta.pop("oms_waiting_for_stock", None)
            meta.pop("oms_waiting_missing_qty", None)
        item.metadata_json = json.dumps(meta, ensure_ascii=False) if meta else None
        if body.waiting_for_stock:
            from ..services.wms_audit_service import emit_oms_decision_wait

            emit_oms_decision_wait(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                order_id=int(order.id),
                order_item_id=int(item.id),
                product_id=int(item.product_id) if item.product_id else None,
                quantity=float(m),
            )

    elif body.line_edit is not None:
        le = body.line_edit
        if le.quantity is not None:
            item.quantity = int(le.quantity)
        if le.unit_price is not None:
            item.unit_price = float(le.unit_price)
        if le.vat_percent is not None:
            item.vat_percent = float(le.vat_percent)
        if le.unit is not None:
            u = str(le.unit).strip()
            item.unit = u[:64] if u else None
        qn = max(0, int(item.quantity or 0))
        up = getattr(item, "unit_price", None)
        if up is not None and qn > 0:
            item.total_price = round(float(up) * float(qn), 2)
        touch_picking_in_progress(order)

    _recompute_order_value_and_volume(order, db)
    db.flush()
    apply_fulfillment_state_from_resolver(db, order, log=True)
    ord2 = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == int(order_id))
        .first()
    )
    if ord2 is not None:
        if body.replace_product_id is not None:
            ensure_recovery_pick_task(
                db,
                tenant_id=int(ord2.tenant_id),
                warehouse_id=int(ord2.warehouse_id),
                order=ord2,
                kind="replace_product",
            )
        elif body.remove_missing is True:
            ensure_recovery_pick_task(
                db,
                tenant_id=int(ord2.tenant_id),
                warehouse_id=int(ord2.warehouse_id),
                order=ord2,
                kind="remove_missing",
            )
        elif body.waiting_for_stock is not None:
            ensure_recovery_pick_task(
                db,
                tenant_id=int(ord2.tenant_id),
                warehouse_id=int(ord2.warehouse_id),
                order=ord2,
                kind="waiting_for_stock",
            )
    db.commit()
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.order_ui_status),
            joinedload(Order.shipping_method_row),
        )
        .filter(Order.id == int(order_id))
        .first()
    )
    assert order is not None
    return build_order_read(db, order)


@router.patch("/{order_id}/select-carton", response_model=OrderSelectCartonResponse)
def patch_order_select_carton(
    order_id: int,
    body: OrderSelectCartonBody,
    tenant_id: int = Query(..., ge=1, description="Tenant zamówienia (jak w WMS)"),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """Wybór kartonu na pakowaniu — zapis ``selected_carton_id`` bez zmiany logiki pakowania linii."""
    try:
        return apply_order_selected_carton(
            db,
            tenant_id=int(tenant_id),
            order_id=int(order_id),
            carton_id=body.carton_id,
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
    except ValueError as e:
        code = str(e)
        if code == "ORDER_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Order not found") from e
        if code in ("INVALID_CARTON", "EMPTY_CARTON_ID"):
            raise HTTPException(status_code=400, detail="Invalid carton") from e
        raise HTTPException(status_code=400, detail=str(e)) from e


def _serialize_operational_note_row(n: OrderOperationalNote) -> OrderOperationalNoteRead:
    return OrderOperationalNoteRead(
        id=int(n.id),
        order_id=int(n.order_id),
        author_user_id=int(n.author_user_id) if getattr(n, "author_user_id", None) else None,
        content=str(n.content or ""),
        show_in_picking=bool(getattr(n, "show_in_picking", False)),
        show_in_packing=bool(getattr(n, "show_in_packing", False)),
        show_in_returns=bool(getattr(n, "show_in_returns", False)),
        show_in_complaints=bool(getattr(n, "show_in_complaints", False)),
        priority=int(n.priority) if getattr(n, "priority", None) is not None else None,
        color_tag=(str(getattr(n, "color_tag", "") or "").strip() or None),
        created_at=getattr(n, "created_at", None),
        updated_at=getattr(n, "updated_at", None),
    )


@router.get("/{order_id}/notes", response_model=List[OrderNoteRead])
def list_order_notes(order_id: int, db: Session = Depends(get_db)):
    """Notatki zamówienia (``order_notes``) — używane przez OMS szczegół zamówienia."""
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    rows = (
        db.query(OrderNote)
        .filter(OrderNote.order_id == int(order_id))
        .order_by(OrderNote.created_at.desc(), OrderNote.id.desc())
        .all()
    )
    return [
        OrderNoteRead(
            id=int(n.id),
            type=str(n.type or "internal"),
            content=str(n.content or ""),
            created_at=getattr(n, "created_at", None),
        )
        for n in rows
    ]


@router.get("/{order_id}/operational-notes", response_model=List[OrderOperationalNoteRead])
def list_order_operational_notes(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    rows = (
        db.query(OrderOperationalNote)
        .filter(OrderOperationalNote.order_id == int(order_id))
        .order_by(OrderOperationalNote.created_at.desc(), OrderOperationalNote.id.desc())
        .all()
    )
    return [_serialize_operational_note_row(n) for n in rows]


@router.post("/{order_id}/operational-notes", response_model=OrderOperationalNoteRead)
def create_order_operational_note(
    order_id: int,
    body: OrderOperationalNoteCreateBody,
    db: Session = Depends(get_db),
    user: Optional[AppUser] = Depends(get_optional_current_user),
):
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    now = datetime.utcnow()
    row = OrderOperationalNote(
        order_id=int(order_id),
        author_user_id=int(user.id) if user is not None else None,
        content=str(body.content).strip()[:8000],
        show_in_picking=bool(body.show_in_picking),
        show_in_packing=bool(body.show_in_packing),
        show_in_returns=bool(body.show_in_returns),
        show_in_complaints=bool(body.show_in_complaints),
        priority=int(body.priority) if body.priority is not None else None,
        color_tag=(str(body.color_tag).strip()[:32] if body.color_tag else None),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_operational_note_row(row)


@router.get("/{order_id}/wms-fulfillment", response_model=WmsPackingOrderCard)
def get_order_wms_fulfillment(order_id: int, db: Session = Depends(get_db)):
    """OMS: jeden widok magazynowy (linie z lokalizacją i statusem zbierania) bez kontekstu kolejki pakowania WMS."""
    card = get_oms_order_wms_fulfillment_card(db, order_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return card


def _value_state_from_row(field_type: str, val_row: Optional[OrderCustomFieldValue]) -> Optional[OrderCustomFieldValueState]:
    if val_row is None:
        return None
    ft = (field_type or "").strip().upper()
    j = None
    if val_row.value_json:
        try:
            j = json.loads(val_row.value_json)
        except json.JSONDecodeError:
            j = None
    if ft == "TEXT":
        return OrderCustomFieldValueState(field_id=int(val_row.field_id), string_value=val_row.value_string)
    if ft == "NUMBER":
        return OrderCustomFieldValueState(field_id=int(val_row.field_id), number_value=val_row.value_number)
    if ft == "FILES":
        return OrderCustomFieldValueState(field_id=int(val_row.field_id), json_value=j)
    if ft == "SELECT_SINGLE":
        sv = val_row.value_string
        ov = int(sv) if sv and sv.isdigit() else j
        return OrderCustomFieldValueState(field_id=int(val_row.field_id), string_value=sv, json_value=ov)
    if ft == "SELECT_MULTI":
        return OrderCustomFieldValueState(field_id=int(val_row.field_id), json_value=j)
    if ft in ("SALES_DOCUMENT", "SHIPPING_LABEL"):
        return OrderCustomFieldValueState(field_id=int(val_row.field_id), json_value=j)
    return OrderCustomFieldValueState(field_id=int(val_row.field_id))


@router.get("/{order_id}/custom-fields/", response_model=List[OrderCustomFieldWithValueRead])
def get_order_custom_fields_with_values(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    defs = (
        db.query(OrderCustomField)
        .options(joinedload(OrderCustomField.options))
        .filter(
            OrderCustomField.tenant_id == int(order.tenant_id),
            OrderCustomField.warehouse_id == int(order.warehouse_id),
            OrderCustomField.is_active.is_(True),
        )
        .order_by(OrderCustomField.sort_order.asc(), OrderCustomField.id.asc())
        .all()
    )
    vals = (
        db.query(OrderCustomFieldValue)
        .filter(OrderCustomFieldValue.order_id == int(order_id))
        .all()
    )
    by_field = {int(v.field_id): v for v in vals}
    out: List[OrderCustomFieldWithValueRead] = []
    for d in defs:
        vr = by_field.get(int(d.id))
        out.append(
            OrderCustomFieldWithValueRead(
                field=serialize_field_definition(d),
                value=_value_state_from_row(str(d.type), vr),
            )
        )
    return out


@router.put("/{order_id}/custom-fields/")
def put_order_custom_fields_values(
    order_id: int,
    body: OrderCustomFieldValuesPutBody,
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    errors: List[str] = []
    staged: List[Tuple[OrderCustomField, Optional[str], Optional[float], Optional[str], bool]] = []
    for entry in body.values:
        field = (
            db.query(OrderCustomField)
            .options(joinedload(OrderCustomField.options))
            .filter(
                OrderCustomField.id == int(entry.field_id),
                OrderCustomField.tenant_id == tid,
                OrderCustomField.warehouse_id == wid,
            )
            .first()
        )
        if not field:
            errors.append(f"Pole {entry.field_id}: nie znaleziono.")
            continue
        vs, vn, vj, err = normalize_value_for_storage(db, field, entry, int(order_id), tid, wid)
        if err:
            errors.append(f"{field.name}: {err}")
            continue
        ft_enrich = (field.type or "").strip().upper()
        if vj and ft_enrich in ("FILES", "SALES_DOCUMENT", "SHIPPING_LABEL"):
            vj = ensure_attachment_json_links_order_documents(
                db,
                order_id=int(order_id),
                tenant_id=tid,
                warehouse_id=wid,
                field_type_upper=ft_enrich,
                value_json_str=vj,
            )
        clear = vs is None and vn is None and vj is None
        staged.append((field, vs, vn, vj, clear))
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})
    for field, vs, vn, vj, clear in staged:
        existing = (
            db.query(OrderCustomFieldValue)
            .filter(
                OrderCustomFieldValue.order_id == int(order_id),
                OrderCustomFieldValue.field_id == int(field.id),
            )
            .first()
        )
        ft_upper = (field.type or "").strip().upper()
        if ft_upper == "FILES":
            old_j = existing.value_json if existing else None
            new_j = None if clear else vj
            sync_files_value_order_documents(
                db,
                order_id=int(order_id),
                tenant_id=tid,
                warehouse_id=wid,
                old_json_str=old_j,
                new_json_str=new_j,
            )
        elif ft_upper in ("SALES_DOCUMENT", "SHIPPING_LABEL"):
            old_j = existing.value_json if existing else None
            new_j = None if clear else vj
            sync_custom_field_attached_files(
                db,
                order_id=int(order_id),
                tenant_id=tid,
                warehouse_id=wid,
                old_json_str=old_j,
                new_json_str=new_j,
            )
        if clear:
            if existing:
                db.delete(existing)
            continue
        if existing:
            existing.value_string = vs
            existing.value_number = vn
            existing.value_json = vj
            existing.updated_at = datetime.utcnow()
        else:
            db.add(
                OrderCustomFieldValue(
                    order_id=int(order_id),
                    field_id=int(field.id),
                    tenant_id=tid,
                    warehouse_id=wid,
                    value_string=vs,
                    value_number=vn,
                    value_json=vj,
                    updated_at=datetime.utcnow(),
                )
            )
    db.commit()
    return {"ok": True}


@router.post("/{order_id}/custom-fields/{field_id}/files/")
async def post_order_custom_field_file(
    order_id: int,
    field_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    field = (
        db.query(OrderCustomField)
        .filter(
            OrderCustomField.id == int(field_id),
            OrderCustomField.tenant_id == int(order.tenant_id),
            OrderCustomField.warehouse_id == int(order.warehouse_id),
        )
        .first()
    )
    ft = (field.type or "").strip().upper() if field else ""
    if not field or ft not in ("FILES", "SALES_DOCUMENT", "SHIPPING_LABEL"):
        raise HTTPException(status_code=404, detail="Field not found or does not accept file uploads")
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Plik za duży (max 15 MB).")
    settings = parse_settings(field.settings_json)
    meta, err = save_order_custom_field_upload(
        order_id=int(order_id),
        field_id=int(field_id),
        original_filename=file.filename or "upload",
        data=raw,
        settings=settings,
    )
    if err or not meta:
        raise HTTPException(status_code=400, detail=err or "Upload failed")
    out = dict(meta)
    if ft == "FILES":
        doc_type = OrderDocumentType.ZALACZNIK.value
    elif ft == "SALES_DOCUMENT":
        doc_type = OrderDocumentType.DOKUMENT_SPRZEDAZY.value
    elif ft == "SHIPPING_LABEL":
        doc_type = OrderDocumentType.LIST_PRZEWOZOWY.value
    else:
        doc_type = OrderDocumentType.ZALACZNIK.value
    if ft in ("FILES", "SALES_DOCUMENT", "SHIPPING_LABEL"):
        doc_row = OrderDocument(
            order_id=int(order_id),
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            document_type=doc_type,
            original_filename=str(meta.get("original_filename") or "file")[:512],
            stored_filename=str(meta.get("stored_filename") or "")[:512],
            file_url=str(meta.get("file_url") or "")[:512],
        )
        db.add(doc_row)
        db.flush()
        out["order_document_id"] = int(doc_row.id)
    db.commit()
    return out


@router.get("/{order_id}/", response_model=OrderRead)
def get_order_details(
    order_id: int,
    db: Session = Depends(get_db)
):
    logger.info("ORDERS GET order_id=%s", order_id)
    try:
        order = (
            db.query(Order)
            .options(
                joinedload(Order.items).joinedload(OrderItem.product),
                joinedload(Order.order_ui_status),
                joinedload(Order.shipping_method_row),
            )
            .filter(Order.id == order_id)
            .first()
        )

        if not order:
            logger.warning("ORDERS GET order_id=%s not found", order_id)
            raise HTTPException(status_code=404, detail="Order not found")

        return build_order_read(db, order)
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "[orders.detail] failed order_id=%s",
            order_id,
        )
        raise