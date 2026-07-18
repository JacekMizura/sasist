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

    PostgreSQL enum ``cartstatus`` must match these five values exactly
    (``backend.db.cartstatus_enum.migrate_cartstatus_enum_clean``).
    """

    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    PICKING = "PICKING"
    READY_FOR_PACKING = "READY_FOR_PACKING"
    PACKING = "PACKING"


def normalize_cart_status_value(raw: str | None) -> str:
    """
    Normalize a raw DB/API string to a canonical ``CartStatus`` value.

    Legacy labels (IN_PROGRESS / FULL / SERVICE / PL) are mapped for read safety
    during/after migration — they are not members of ``CartStatus``.
    """
    from ..db.cartstatus_enum import CARTSTATUS_LEGACY_TO_CANONICAL

    s = (raw or "").strip()
    if not s:
        return CartStatus.AVAILABLE.value
    mapped = CARTSTATUS_LEGACY_TO_CANONICAL.get(s)
    if mapped:
        return mapped
    up = s.upper().replace(" ", "_")
    mapped_up = CARTSTATUS_LEGACY_TO_CANONICAL.get(up)
    if mapped_up:
        return mapped_up
    for st in CartStatus:
        if st.value == up or st.name == up:
            return st.value
    return CartStatus.AVAILABLE.value
