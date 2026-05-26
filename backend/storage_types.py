"""Canonical storage bin types (layout + inventory). Legacy DB/API may still use `store` → normalized to `pick`."""

# Canonical types (single source of truth)
ALLOWED_STORAGE_TYPES = frozenset({"primary", "pick", "buffer", "reserve", "damaged"})
UNKNOWN_STORAGE_TYPE = "unknown"

# Legacy alias
_LEGACY_STORE_TO_PICK = "store"

NON_PICKABLE_STORAGE_TYPES = frozenset({"reserve", "buffer", "damaged"})
NON_PICKABLE_STORAGE_TYPE_ALIASES = NON_PICKABLE_STORAGE_TYPES | {"reserved", "reservation"}
PICKABLE_STORAGE_TYPES = frozenset({"primary", "pick"})


def normalize_storage_type(value) -> str:
    """
    Normalize free-form / DB value to a canonical type or UNKNOWN.
    None, empty string, and unrecognized values → UNKNOWN (never default to primary).
    Legacy `store` → `pick`.
    """
    if value is None:
        return UNKNOWN_STORAGE_TYPE
    lower = str(value).strip().lower()
    if not lower:
        return UNKNOWN_STORAGE_TYPE
    if lower in ("reserve", "reserved", "reservation"):
        return "reserve"
    if lower == _LEGACY_STORE_TO_PICK:
        return "pick"
    if lower in ALLOWED_STORAGE_TYPES:
        return lower
    return UNKNOWN_STORAGE_TYPE


def layout_bin_storage_type(raw) -> str:
    """
    When saving layout bin JSON: missing field defaults to primary (new grid bins).
    Explicit values are normalized; unknown strings stay unknown.
    """
    if raw is None:
        return "primary"
    n = normalize_storage_type(raw)
    return n


def is_pickable(storage_type) -> bool:
    return normalize_storage_type(storage_type) in PICKABLE_STORAGE_TYPES


def get_storage_priority(storage_type) -> int | None:
    normalized = normalize_storage_type(storage_type)
    if normalized == UNKNOWN_STORAGE_TYPE:
        return None
    if normalized == "primary":
        return 1
    if normalized == "pick":
        return 2
    return None
