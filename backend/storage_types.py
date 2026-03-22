ALLOWED_STORAGE_TYPES = {"primary", "reserve", "store", "buffer", "damaged"}
NON_PICKABLE_STORAGE_TYPES = {"reserve", "buffer", "damaged"}
NON_PICKABLE_STORAGE_TYPE_ALIASES = NON_PICKABLE_STORAGE_TYPES | {"reserved", "reservation"}
PICKABLE_STORAGE_TYPES = {"primary", "store"}


def normalize_storage_type(value) -> str:
    if value is None:
        return "primary"
    lower = str(value).strip().lower()
    if lower in ("reserve", "reserved", "reservation"):
        return "reserve"
    if lower in ALLOWED_STORAGE_TYPES:
        return lower
    return "primary"


def is_pickable(storage_type) -> bool:
    # Reserve is only for replenishment, never direct picking.
    # Future feature may allow override per warehouse.
    return normalize_storage_type(storage_type) in PICKABLE_STORAGE_TYPES


def get_storage_priority(storage_type) -> int | None:
    normalized = normalize_storage_type(storage_type)
    if normalized == "primary":
        return 1
    if normalized == "store":
        return 2
    return None
