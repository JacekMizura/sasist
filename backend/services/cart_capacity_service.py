"""
Walidacja pojemności wózka (capacity_mode=orders) — SSOT przed każdym przypisaniem.

if capacity_mode == ORDERS:
  current_orders + new_orders <= max_orders
else: no-op

Przekroczenie → HTTP 409 CART_CAPACITY_EXCEEDED.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.cart import Cart
from ..models.order import Order


def normalize_capacity_mode(val: Any) -> str:
    if val is None:
        return "volume"
    if hasattr(val, "value"):
        val = val.value
    s = str(val).strip().lower()
    if s in ("volume", "orders", "mixed"):
        return s
    return "volume"


def count_orders_on_cart(db: Session, cart_id: int) -> int:
    """Liczba zamówień z Order.cart_id == cart_id (SSOT)."""
    return int(
        db.query(Order)
        .filter(Order.cart_id == int(cart_id), Order.deleted_at.is_(None))
        .count()
    )


@dataclass
class CartCapacityExceeded(Exception):
    current_orders: int
    max_orders: int
    attempted: int

    @property
    def code(self) -> str:
        return "CART_CAPACITY_EXCEEDED"

    def to_detail(self) -> dict:
        return {
            "code": self.code,
            "current_orders": int(self.current_orders),
            "max_orders": int(self.max_orders),
            "attempted": int(self.attempted),
        }


def assert_cart_orders_capacity(
    cart: Cart,
    *,
    current_orders: int,
    incoming_orders: int,
) -> None:
    """
    Gdy capacity_mode = orders i max_orders jest ustawione:
    current_orders + incoming_orders <= max_orders.
    """
    if incoming_orders <= 0:
        return
    mode = normalize_capacity_mode(getattr(cart, "capacity_mode", None))
    if mode != "orders":
        return
    max_orders = getattr(cart, "max_orders", None)
    if max_orders is None:
        return
    max_ord = int(max_orders)
    cur = int(current_orders)
    inc = int(incoming_orders)
    if cur + inc > max_ord:
        raise CartCapacityExceeded(
            current_orders=cur,
            max_orders=max_ord,
            attempted=inc,
        )


def http_exception_cart_capacity_exceeded(exc: CartCapacityExceeded) -> HTTPException:
    return HTTPException(status_code=409, detail=exc.to_detail())


def enforce_cart_orders_capacity(
    db: Session,
    cart: Cart,
    *,
    new_orders: int,
) -> None:
    """
    SSOT przed przypisaniem zamówień do wózka.

    if cart.capacity_mode == \"orders\":
        current + new_orders > max_orders → HTTP 409 CART_CAPACITY_EXCEEDED
    """
    if int(new_orders) <= 0:
        return
    current_orders = count_orders_on_cart(db, int(cart.id))
    try:
        assert_cart_orders_capacity(
            cart,
            current_orders=current_orders,
            incoming_orders=int(new_orders),
        )
    except CartCapacityExceeded as exc:
        raise http_exception_cart_capacity_exceeded(exc) from exc
