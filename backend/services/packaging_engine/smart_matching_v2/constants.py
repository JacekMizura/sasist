"""Smart Matching engine v2 — product + min_qty rules (Sellasist-like) + COMPOSITION."""

from __future__ import annotations

ENGINE_VERSION = 2

VALID_THRESHOLDS = frozenset({2, 3, 5})

SOURCE_AUTO = "AUTO"
SOURCE_MANUAL = "MANUAL"

STATUS_ACTIVE = "ACTIVE"
STATUS_BROKEN = "BROKEN"
STATUS_AMBIGUOUS = "AMBIGUOUS"

#: Sellasist-like single SKU / variant breakpoints.
PATTERN_SINGLE = "SINGLE_PRODUCT"
#: Exact normalized multi-SKU basket → carton (no min_qty inside composition).
PATTERN_COMPOSITION = "COMPOSITION"

PATTERN_TYPES = frozenset({PATTERN_SINGLE, PATTERN_COMPOSITION})

#: Sentinel min_qty for COMPOSITION rules (not a breakpoint).
COMPOSITION_MIN_QTY_SENTINEL = 0

PACKAGING_STRATEGIES = frozenset(
    {
        "SMART_ONLY",
        "THREE_D_ONLY",
        "SMART_THEN_3D",
        "THREE_D_OVERRIDE_SMART",
    }
)
DEFAULT_PACKAGING_STRATEGY = "SMART_THEN_3D"
