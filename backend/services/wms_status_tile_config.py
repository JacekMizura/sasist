"""Wspólna logika kafelka statusu WMS: wymóg wózka + ikona BULK vs koszyki (z picking_config)."""

from __future__ import annotations

from typing import Literal, Optional, Tuple

CartTypeHint = Optional[Literal["BULK", "BASKETS"]]


def wms_tile_cart_config(single_mode: str | None, multi_mode: str | None) -> Tuple[bool, CartTypeHint]:
    """
    Zwraca ``(require_cart, cart_type)`` dla jednego wiersza ``picking_config``.

    - ``require_cart``: True gdy ``scanned`` lub ``baskets`` w single/multi.
    - ``cart_type``: ``BASKETS`` gdy którykolwiek tryb to koszyki; w przeciwnym razie przy
      ``require_cart`` tylko ze skanem — ``BULK``; przy braku wymogu — ``None``.
    """
    sm = (single_mode or "").strip().lower()
    mm = (multi_mode or "").strip().lower()

    def needs_cart(m: str) -> bool:
        return m in ("scanned", "baskets")

    require = needs_cart(sm) or needs_cart(mm)
    if not require:
        return False, None
    if "baskets" in (sm, mm):
        return True, "BASKETS"
    return True, "BULK"


def merge_wms_tile_cart_configs(
    mode_pairs: list[Tuple[str | None, str | None]],
) -> Tuple[bool, CartTypeHint]:
    """Łączy wiele reguł (np. wiele źródeł na ten sam status docelowy pakowania)."""
    req = False
    has_baskets = False
    has_bulk = False
    for sm, mm in mode_pairs:
        r, ct = wms_tile_cart_config(sm, mm)
        if r:
            req = True
            if ct == "BASKETS":
                has_baskets = True
            elif ct == "BULK":
                has_bulk = True
    if not req:
        return False, None
    if has_baskets:
        return True, "BASKETS"
    return True, "BULK"
