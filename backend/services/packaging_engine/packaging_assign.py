"""Assign policy for packaging workflow — single selected_carton_id writer rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ...models.order import Order

CARTON_SOURCE_SMART = "SMART"
CARTON_SOURCE_THREE_D = "THREE_D"
CARTON_SOURCE_MANUAL = "MANUAL"

VALID_CARTON_SOURCES = frozenset(
    {CARTON_SOURCE_SMART, CARTON_SOURCE_THREE_D, CARTON_SOURCE_MANUAL}
)


@dataclass(frozen=True)
class AssignDecision:
    assign: bool
    carton_id: Optional[str]
    source: Optional[str]
    reason: str


def normalize_carton_source(raw: object) -> Optional[str]:
    s = str(raw or "").strip().upper()
    return s if s in VALID_CARTON_SOURCES else None


def existing_carton_id(order: Order) -> Optional[str]:
    sel = getattr(order, "selected_carton_id", None)
    s = str(sel).strip() if sel else ""
    return s or None


def existing_carton_source(order: Order) -> Optional[str]:
    return normalize_carton_source(getattr(order, "selected_carton_source", None))


def is_protected_existing_carton(order: Order) -> bool:
    """MANUAL or unknown (NULL) source must not be auto-overwritten."""
    if not existing_carton_id(order):
        return False
    src = existing_carton_source(order)
    return src is None or src == CARTON_SOURCE_MANUAL


def set_order_selected_carton(
    order: Order,
    *,
    carton_id: str,
    source: str,
) -> None:
    cid = str(carton_id or "").strip()
    src = normalize_carton_source(source) or CARTON_SOURCE_MANUAL
    order.selected_carton_id = cid or None
    order.selected_carton_source = src if cid else None


def decide_status_triggered_assignment(
    order: Order,
    *,
    strategy: str,
    primary_carton_id: Optional[str],
    outcome_source: str,
) -> AssignDecision:
    """
    Frozen assign policy for status-triggered packaging:

    - empty carton → assign primary (engine source)
    - MANUAL / unknown source → never overwrite
    - THREE_D_OVERRIDE_SMART + THREE_D MATCHED → may overwrite SMART (or THREE_D)
    - SMART_THEN_3D / others → never overwrite existing
    - 3D NO_FIT (no primary) → keep existing
    """
    primary = str(primary_carton_id or "").strip() or None
    out_src = normalize_carton_source(outcome_source)
    st = str(strategy or "").strip().upper()
    existing = existing_carton_id(order)
    existing_src = existing_carton_source(order)

    if primary is None or out_src is None:
        return AssignDecision(False, None, None, "no_primary")

    if not existing:
        return AssignDecision(True, primary, out_src, "assign_empty")

    if existing_src is None or existing_src == CARTON_SOURCE_MANUAL:
        return AssignDecision(False, None, None, "protected_manual_or_unknown")

    if st == "THREE_D_OVERRIDE_SMART" and out_src == CARTON_SOURCE_THREE_D:
        if primary == existing:
            return AssignDecision(False, None, None, "same_carton")
        return AssignDecision(True, primary, CARTON_SOURCE_THREE_D, "override_smart_with_3d")

    return AssignDecision(False, None, None, "keep_existing")
