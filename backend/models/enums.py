"""
ENUMY SYSTEMOWE
Oddzielamy je od modeli, żeby uniknąć duplikacji
"""

import enum


class CartType(enum.Enum):
    MULTI = "multi"
    BULK = "bulk"


class CartStatus(enum.Enum):
    """
    Cykl życia wózka (SSOT — ``cart_picking_lifecycle_service``):

    AVAILABLE → ASSIGNED → PICKING → READY_FOR_PACKING → PACKING → AVAILABLE

    ``IN_PROGRESS`` jest aliasem ``PICKING`` (kompatybilność wsteczna w kodzie).
    Wartości legacy PL („pusty”, …) mapowane przy odczycie / migracji schema_upgrade.
    """

    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    PICKING = "PICKING"
    IN_PROGRESS = "PICKING"  # alias → PICKING
    READY_FOR_PACKING = "READY_FOR_PACKING"
    PACKING = "PACKING"
    FULL = "FULL"
    SERVICE = "SERVICE"


# Mapowanie starych wartości PL → kanoniczne (DB / API).
CART_STATUS_LEGACY_MAP: dict[str, str] = {
    "pusty": CartStatus.AVAILABLE.value,
    "w trakcie zbierania": CartStatus.PICKING.value,
    "pełny": CartStatus.FULL.value,
    "w serwisie": CartStatus.SERVICE.value,
}


def normalize_cart_status_value(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s:
        return CartStatus.AVAILABLE.value
    mapped = CART_STATUS_LEGACY_MAP.get(s)
    if mapped:
        return mapped
    up = s.upper().replace(" ", "_")
    for st in CartStatus:
        if st.value == up or st.name == up:
            return st.value
    return CartStatus.AVAILABLE.value
