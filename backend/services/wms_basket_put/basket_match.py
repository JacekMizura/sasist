"""Basket barcode / slot matching for picking put confirmation."""

from __future__ import annotations

from ...models.cart_basket import CartBasket


def _norm(scan: str | None) -> str:
    return (scan or "").strip().upper().replace(" ", "")


def format_basket_slot_labels(basket: CartBasket) -> list[str]:
    """All accepted human/slot labels for a basket (1-based and 0-based S-row-col)."""
    labels: list[str] = []
    name = (getattr(basket, "name", None) or "").strip()
    if name:
        labels.append(name)
    row = int(getattr(basket, "row", 0) or 0)
    col = int(getattr(basket, "column", 0) or 0)
    labels.append(f"S-{row}-{col}")
    labels.append(f"S-{row + 1}-{col + 1}")
    labels.append(f"Koszyk {row}/{col}")
    labels.append(f"Koszyk {row + 1}/{col + 1}")
    labels.append(f"B{int(basket.id)}")
    # Prefer display: named or 1-based S
    return labels


def primary_basket_label(basket: CartBasket) -> str:
    name = (getattr(basket, "name", None) or "").strip()
    if name:
        return name
    row = int(getattr(basket, "row", 0) or 0)
    col = int(getattr(basket, "column", 0) or 0)
    # Labels on physical baskets are typically 1-based.
    return f"S-{row + 1}-{col + 1}"


def basket_scan_matches(basket: CartBasket, scan: str) -> bool:
    s = _norm(scan)
    if not s:
        return False
    if basket.barcode and _norm(str(basket.barcode)) == s:
        return True
    if getattr(basket, "scan_code", None) and _norm(str(basket.scan_code)) == s:
        return True
    if basket.name and _norm(str(basket.name)) == s:
        return True
    for label in format_basket_slot_labels(basket):
        if _norm(label) == s:
            return True
    return False
