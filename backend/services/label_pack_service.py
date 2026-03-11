"""
Label pack service: load pack, resolve records by quantity_type, render via label_render_service, return single PDF.
"""

import logging
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..models.label_pack import LabelPack, LabelPackItem
from ..models.label_template import SavedLabelTemplate
from ..models.cart import Cart
from .label_render_service import build_label_pdf_multi, template_json_to_dict

logger = logging.getLogger(__name__)


def _cart_record(cart) -> dict[str, Any]:
    """Build label record for a cart. Stable keys: cart_id, cart_number, cart_name, cart_barcode, barcode_data."""
    name = getattr(cart, "name", "") or ""
    barcode = getattr(cart, "barcode", None) or f"CART-{cart.id}"
    n_baskets = len(getattr(cart, "baskets", None) or [])
    cart_number = f"#{cart.id}"
    return {
        "cart_id": str(cart.id),
        "cart_number": cart_number,
        "cart_name": name,
        "cart_barcode": barcode,
        "barcode_data": barcode,
        "cart_capacity": str(round(getattr(cart, "total_volume", 0) or 0, 2)) + " dm³",
        "cart_weight": "",
        "cart_sections": str(n_baskets),
        "{cart_id}": str(cart.id),
        "{cart_number}": cart_number,
        "{cart_name}": name,
        "{cart_barcode}": barcode,
        "{cart_capacity}": str(round(getattr(cart, "total_volume", 0) or 0, 2)) + " dm³",
        "{cart_weight}": "",
        "{cart_sections}": str(n_baskets),
    }


def _basket_record(basket, cart) -> dict[str, Any]:
    """Build label record for a basket. Stable keys: basket_name, basket_barcode, barcode_data."""
    name = (getattr(basket, "name", None) or "").strip()
    code = name or f"S-{getattr(basket, 'row', 0) + 1}-{getattr(basket, 'column', 0) + 1}"
    barcode = getattr(basket, "barcode", None) or f"CART-{cart.id}-B{getattr(basket, 'id', 0):02d}"
    return {
        "basket_id": str(getattr(basket, "id", 0)),
        "basket_name": name or code,
        "basket_code": code,
        "basket_barcode": barcode,
        "barcode_data": barcode,
        "basket_level": str(getattr(basket, "row", 0) + 1),
        "basket_position": str(getattr(basket, "column", 0) + 1),
        "cart_id": str(cart.id),
        "{basket_id}": str(getattr(basket, "id", 0)),
        "{basket_name}": name or code,
        "{basket_code}": code,
        "{basket_barcode}": barcode,
        "{basket_level}": str(getattr(basket, "row", 0) + 1),
        "{basket_position}": str(getattr(basket, "column", 0) + 1),
        "{cart_id}": str(cart.id),
    }


def _location_records(db: Session, tenant_id: int, quantity_type: str) -> list[dict[str, Any]]:
    """
    Get location label records for the tenant. Uses first warehouse (with layout) the tenant has access to.
    Each record has loc_name, loc_barcode, zone, barcode_data and {loc_name}, {loc_barcode}, {zone} for bindings.
    """
    from .warehouse_service import WarehouseService
    from .warehouse_layout_service import WarehouseLayoutService

    warehouses = WarehouseService(db).get_warehouses(tenant_id)
    wh = warehouses[0] if warehouses else None
    if not wh:
        logger.warning("No warehouse for tenant_id=%s; no location records", tenant_id)
        return []
    svc = WarehouseLayoutService(db)
    records = svc.get_location_label_records(tenant_id, wh.id)
    if not records:
        logger.warning("No location records for tenant_id=%s warehouse_id=%s", tenant_id, wh.id)
        return []
    if (quantity_type or "").strip().lower() == "single":
        return [records[0]] if records else []
    return records


def _records_for_pack_item(
    db: Session,
    item: LabelPackItem,
    cart_id: int,
    cart,
    tenant_id: int,
) -> list[dict[str, Any]]:
    """Return list of label records for this pack item given cart_id and loaded cart."""
    obj = (getattr(item, "object_type", None) or "").strip().lower()
    qty = (getattr(item, "quantity_type", None) or "").strip().lower()

    if obj == "cart" and qty == "single":
        return [_cart_record(cart)]

    if obj == "basket" and qty == "per_basket":
        baskets = sorted(
            getattr(cart, "baskets", None) or [],
            key=lambda b: (getattr(b, "row", 0), getattr(b, "column", 0), getattr(b, "id", 0)),
        )
        return [_basket_record(b, cart) for b in baskets]

    if obj == "location" and qty in ("single", "per_location"):
        return _location_records(db, tenant_id, qty)

    if obj == "product" and qty in ("single", "per_product"):
        return []
    return []


def generate_pack_pdf(
    db: Session,
    pack_id: int,
    cart_id: int,
    tenant_id: int,
) -> bytes:
    """
    Load pack and its items, resolve records for body context (cart_id), render each (template, record)
    in order, produce one PDF with one page per label.
    """
    pack = (
        db.query(LabelPack)
        .options(
            joinedload(LabelPack.items).joinedload(LabelPackItem.template),
        )
        .filter(LabelPack.id == pack_id, LabelPack.tenant_id == tenant_id)
        .first()
    )
    if not pack:
        raise ValueError("Pack not found")

    cart = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(Cart.id == cart_id).first()
    )
    if not cart:
        raise ValueError("Cart not found")

    # Ensure cart/baskets have barcodes (reuse cart_service logic via import to avoid duplication)
    from .cart_service import CartService
    svc = CartService(db)
    svc._ensure_cart_barcodes(cart)

    pairs: list[tuple[dict, dict[str, Any]]] = []
    for item in getattr(pack, "items", None) or []:
        template_row = getattr(item, "template", None)
        if not template_row or not getattr(template_row, "template_json", None):
            logger.warning("Pack item %s has no template or template_json", getattr(item, "id"))
            continue
        try:
            template = template_json_to_dict(template_row.template_json)
        except Exception as e:
            logger.warning("Invalid template JSON for pack item %s: %s", getattr(item, "id"), e)
            continue
        records = _records_for_pack_item(db, item, cart_id, cart, tenant_id)
        for rec in records:
            pairs.append((template, rec))

    return build_label_pdf_multi(pairs)