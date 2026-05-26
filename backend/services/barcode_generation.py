"""
Universal barcode generation by prefix standard.

PRD-000001, ORD-000123, LOC-{rack}-{level}-{bin}, CART-* (in cart_service), basket = cart-B01 (in cart_service).
"""

import re
from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.order import Order
from ..models.warehouse import Bin, Rack


def next_product_barcode(db: Session, tenant_id: int) -> str:
    """Next PRD-NNNNNN (6 digits) for tenant."""
    rows = db.query(Product.barcode).filter(
        Product.tenant_id == tenant_id,
        Product.barcode != None,
        Product.barcode.like("PRD-%"),
    ).all()
    numbers = []
    for (barcode,) in rows:
        if barcode:
            m = re.match(r"PRD-(\d+)", barcode)
            if m:
                numbers.append(int(m.group(1)))
    n = (max(numbers) + 1) if numbers else 1
    return f"PRD-{n:06d}"


def next_order_barcode(db: Session, tenant_id: int) -> str:
    """Next ORD-NNNNNN (6 digits) for tenant."""
    rows = db.query(Order.barcode).filter(
        Order.tenant_id == tenant_id,
        Order.barcode != None,
        Order.barcode.like("ORD-%"),
    ).all()
    numbers = []
    for (barcode,) in rows:
        if barcode:
            m = re.match(r"ORD-(\d+)", barcode)
            if m:
                numbers.append(int(m.group(1)))
    n = (max(numbers) + 1) if numbers else 1
    return f"ORD-{n:06d}"


def next_internal_order_number(db: Session, tenant_id: int, warehouse_id: int) -> str:
    """
    Wewnętrzny numer zamówienia: prosty sekwencyjny integer jako string (1, 2, 3, ...)
    unikalny per (tenant, warehouse). Nie pochodzi z CSV.
    """
    rows = (
        db.query(Order.number)
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.number != None,  # noqa: E711
        )
        .all()
    )
    max_n = 0
    for (num,) in rows:
        if num is None:
            continue
        s = str(num).strip()
        if not s.isdigit():
            continue
        max_n = max(max_n, int(s))
    return str(max_n + 1)


def location_barcode_for_bin(rack: Rack, level_index: int, segment_index: int) -> str:
    """LOC-{rack}-{level}-{bin} e.g. LOC-A01-03-02. Uses aisle_letter + rack_index for readability; globally unique per (rack_id, level, segment)."""
    letter = (getattr(rack, "aisle_letter", None) or "A").strip().upper()[:1]
    idx = int(getattr(rack, "rack_index", None) or 1)
    return f"LOC-{letter}{idx:02d}-{level_index:02d}-{segment_index:02d}"


def location_barcode_unique(rack_id: int, level_index: int, segment_index: int) -> str:
    """LOC-R{rack_id}-{level}-{segment} – globally unique (no collision across layouts)."""
    return f"LOC-R{rack_id}-{level_index:02d}-{segment_index:02d}"
