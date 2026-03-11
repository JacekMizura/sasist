"""
Central barcode parser and scan resolution.

Resolves a scanned barcode to entity type, id, and additional_data using:
- 12–14 digit string → product (lookup by EAN)
- Location pattern (e.g. A1-2-3) → location
- PRD-* -> product, LOC-* -> location (Bin), CART-*-B* -> basket, CART-* -> cart, ORD-* -> order, PAL-* -> pallet (future).
"""

import re
from typing import Any
from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.order import Order
from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.warehouse import Bin

# Location code pattern: e.g. A1-2-3, RackA-2-3
LOCATION_PATTERN = re.compile(r"^[A-Za-z]+\d*-\d+-\d+$")


def parse_barcode_type(barcode: str) -> str | None:
    """
    Determine entity type from barcode prefix.
    Returns: "product" | "location" | "basket" | "cart" | "order" | "pallet" | None
    """
    if not barcode or not isinstance(barcode, str):
        return None
    s = barcode.strip().upper()
    if s.startswith("PRD"):
        return "product"
    if s.startswith("LOC"):
        return "location"
    if s.startswith("CART"):
        if "-B" in s:
            return "basket"
        return "cart"
    if s.startswith("ORD"):
        return "order"
    if s.startswith("PAL"):
        return "pallet"
    return None


def resolve_barcode(db: Session, barcode: str) -> dict[str, Any]:
    """
    Resolve barcode to structured result: { type, id, additional_data }.
    type is one of product, location, cart, basket, order, pallet.
    id is the entity primary key (null for pallet/future).
    additional_data holds type-specific fields (e.g. name, label, number, location_code).
    """
    result: dict[str, Any] = {
        "type": None,
        "id": None,
        "additional_data": {},
    }
    if not barcode or not isinstance(barcode, str):
        return result
    lookup = barcode.strip()

    # EAN: 12–14 digits → product by ean
    if re.fullmatch(r"\d{12,14}", lookup):
        row = db.query(Product).filter(Product.ean == lookup).first()
        if row:
            result["type"] = "product"
            result["id"] = row.id
            result["additional_data"] = {"name": row.name, "symbol": row.symbol, "ean": row.ean}
        return result

    # Location pattern (e.g. A1-2-3) → location
    if LOCATION_PATTERN.match(lookup):
        row = db.query(Bin).filter(Bin.label == lookup).first()
        result["type"] = "location"
        result["additional_data"] = {"location_code": lookup}
        if row:
            result["id"] = row.id
            result["additional_data"]["label"] = row.label
            result["additional_data"]["rack_id"] = row.rack_id
        return result

    t = parse_barcode_type(barcode)
    if not t:
        return result

    result["type"] = t

    if t == "pallet":
        # Future: resolve PAL-* when pallet entity exists
        return result

    if t == "product":
        row = db.query(Product).filter(Product.barcode == lookup).first()
        if row:
            result["id"] = row.id
            result["additional_data"] = {"name": row.name, "symbol": row.symbol, "ean": row.ean}
        return result

    if t == "order":
        row = db.query(Order).filter(Order.barcode == lookup).first()
        if row:
            result["id"] = row.id
            result["additional_data"] = {"number": row.number, "status": row.status}
        return result

    if t == "cart":
        row = db.query(Cart).filter(Cart.barcode == lookup).first()
        if row:
            result["id"] = row.id
            result["additional_data"] = {"name": row.name, "tenant_id": row.tenant_id, "warehouse_id": row.warehouse_id}
        return result

    if t == "basket":
        row = db.query(CartBasket).filter(CartBasket.barcode == lookup).first()
        if row:
            result["id"] = row.id
            result["additional_data"] = {"cart_id": row.cart_id, "name": row.name}
        return result

    if t == "location":
        row = db.query(Bin).filter(Bin.barcode == lookup).first()
        if row:
            result["id"] = row.id
            result["additional_data"] = {"label": row.label, "rack_id": row.rack_id, "level_index": row.level_index, "segment_index": row.segment_index}
        return result

    return result
