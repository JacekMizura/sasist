"""
Central barcode parser and scan resolution.

Resolves a scanned barcode to entity type, id, and additional_data using:
- ESP:shpcart:|ESP:brck:|ESP:bsh:|ESP:sh:|ESP:O:|ESP:carrier: + PK
  → cart / basket / location / order / warehouse carrier
- 12–14 digit string → product (lookup by EAN)
- Location pattern (e.g. A1-2-3) → location
- PRD-* -> product, LOC-* -> location (Bin), CART-*-B* -> basket, CART-* -> cart,
  ORD-* -> order, PAL-/BOX-/BIN-/CRT-/MIX-* -> warehouse carrier (legacy).
"""

import re
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.order import Order
from ..models.cart import Cart
from ..models.cart_basket import CartBasket
from ..models.warehouse import Bin
from ..models.warehouse_carrier import WarehouseCarrier
from .esp_scan_codes import carrier_scan_code, cart_type_is_multi, parse_esp_scan

# Location code pattern: e.g. A1-2-3, RackA-2-3
LOCATION_PATTERN = re.compile(r"^[A-Za-z]+\d*-\d+-\d+$")


def parse_barcode_type(barcode: str) -> str | None:
    """
    Determine entity type from barcode prefix.
    Returns: "product" | "location" | "basket" | "cart" | "order" | "carrier" | "pallet" | None
    """
    if not barcode or not isinstance(barcode, str):
        return None
    raw = barcode.strip()
    if raw.upper().startswith("ESP:"):
        esp = parse_esp_scan(raw)
        if not esp:
            return None
        kind, _eid = esp
        if kind == "order":
            return "order"
        if kind in ("cart_bulk", "cart_multi"):
            return "cart"
        if kind == "basket":
            return "basket"
        if kind == "location":
            return "location"
        if kind == "carrier":
            return "carrier"
        return None
    s = raw.upper()
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
    if s.startswith("RPL"):
        return "replacement_label"
    for pref in ("PAL-", "BOX-", "BIN-", "CRT-", "MIX-"):
        if s.startswith(pref):
            return "carrier"
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
    low = lookup.lower()

    # ESP:… — resolve by primary key + entity kind (no collision with product codes)
    esp = parse_esp_scan(lookup)
    if esp:
        kind, eid = esp
        if kind == "order":
            row = db.query(Order).filter(Order.id == int(eid)).first()
            if row:
                result["type"] = "order"
                result["id"] = row.id
                result["additional_data"] = {"number": row.number, "status": row.status}
            return result
        if kind == "cart_bulk":
            row = db.query(Cart).filter(Cart.id == int(eid)).first()
            if row and not cart_type_is_multi(row.type):
                result["type"] = "cart"
                result["id"] = row.id
                result["additional_data"] = {
                    "name": row.name,
                    "tenant_id": row.tenant_id,
                    "warehouse_id": row.warehouse_id,
                }
            return result
        if kind == "cart_multi":
            row = db.query(Cart).filter(Cart.id == int(eid)).first()
            if row and cart_type_is_multi(row.type):
                result["type"] = "cart"
                result["id"] = row.id
                result["additional_data"] = {
                    "name": row.name,
                    "tenant_id": row.tenant_id,
                    "warehouse_id": row.warehouse_id,
                }
            return result
        if kind == "basket":
            row = db.query(CartBasket).filter(CartBasket.id == int(eid)).first()
            if row:
                result["type"] = "basket"
                result["id"] = row.id
                result["additional_data"] = {"cart_id": row.cart_id, "name": row.name}
            return result
        if kind == "location":
            row = db.query(Bin).filter(Bin.id == int(eid)).first()
            result["type"] = "location"
            if row:
                result["id"] = row.id
                result["additional_data"] = {
                    "location_code": row.label,
                    "label": row.label,
                    "rack_id": row.rack_id,
                    "level_index": row.level_index,
                    "segment_index": row.segment_index,
                }
            else:
                result["additional_data"] = {"location_code": lookup}
            return result
        if kind == "carrier":
            row = db.query(WarehouseCarrier).filter(
                WarehouseCarrier.id == int(eid),
                WarehouseCarrier.deleted_at.is_(None),
            ).first()
            result["type"] = "carrier"
            if row:
                result["id"] = row.id
                result["additional_data"] = {
                    "code": (row.code or "").strip(),
                    "barcode": (row.barcode or "").strip(),
                    "scan_code": carrier_scan_code(int(row.id)),
                    "tenant_id": int(row.tenant_id),
                    "name": (row.name or "").strip() or None,
                }
            return result
        return result

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
        # Legacy stub — prefer ``carrier`` for PAL-/BOX-/… prefixes.
        return result

    if t == "carrier":
        row = (
            db.query(WarehouseCarrier)
            .filter(
                WarehouseCarrier.deleted_at.is_(None),
                or_(
                    func.lower(WarehouseCarrier.barcode) == low,
                    func.lower(WarehouseCarrier.code) == low,
                ),
            )
            .order_by(WarehouseCarrier.id.asc())
            .first()
        )
        if row:
            result["id"] = row.id
            result["additional_data"] = {
                "code": (row.code or "").strip(),
                "barcode": (row.barcode or "").strip(),
                "scan_code": carrier_scan_code(int(row.id)),
                "tenant_id": int(row.tenant_id),
                "name": (row.name or "").strip() or None,
            }
        return result

    if t == "product":
        row = db.query(Product).filter(Product.barcode == lookup).first()
        if row:
            result["id"] = row.id
            result["additional_data"] = {"name": row.name, "symbol": row.symbol, "ean": row.ean}
        return result

    if t == "order":
        row = (
            db.query(Order)
            .filter(or_(Order.barcode == lookup, func.lower(Order.scan_code) == low))
            .first()
        )
        if row:
            result["id"] = row.id
            result["additional_data"] = {"number": row.number, "status": row.status}
        return result

    if t == "replacement_label":
        from ..models.wms_packing_replacement_label import WmsPackingReplacementLabel

        repl = (
            db.query(WmsPackingReplacementLabel)
            .filter(func.upper(WmsPackingReplacementLabel.barcode) == lookup.upper())
            .first()
        )
        if repl is not None:
            result["id"] = int(repl.id)
            result["additional_data"] = {
                "order_id": int(repl.order_id),
                "barcode": repl.barcode,
                "status": repl.status,
                "warehouse_id": int(repl.warehouse_id),
                "tenant_id": int(repl.tenant_id),
            }
        return result

    if t == "cart":
        row = (
            db.query(Cart)
            .filter(or_(Cart.barcode == lookup, Cart.code == lookup, func.lower(Cart.scan_code) == low))
            .first()
        )
        if row:
            result["id"] = row.id
            result["additional_data"] = {"name": row.name, "tenant_id": row.tenant_id, "warehouse_id": row.warehouse_id}
        return result

    if t == "basket":
        row = (
            db.query(CartBasket)
            .filter(or_(CartBasket.barcode == lookup, func.lower(CartBasket.scan_code) == low))
            .first()
        )
        if row:
            result["id"] = row.id
            result["additional_data"] = {"cart_id": row.cart_id, "name": row.name}
        return result

    if t == "location":
        row = (
            db.query(Bin)
            .filter(or_(Bin.barcode == lookup, func.lower(Bin.scan_code) == low))
            .first()
        )
        if row:
            result["id"] = row.id
            result["additional_data"] = {
                "label": row.label,
                "rack_id": row.rack_id,
                "level_index": row.level_index,
                "segment_index": row.segment_index,
                "location_code": row.label,
            }
        return result

    return result
