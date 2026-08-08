"""PPWR domain contract (stage 3A) — shared semantics, no separate PPWR catalog."""

from __future__ import annotations

from typing import Any

# Packaging function under PPWR / internal classification.
PPWR_FUNCTION_SALES = "SALES"
PPWR_FUNCTION_TRANSPORT = "TRANSPORT"
PPWR_FUNCTION_ECOMMERCE = "ECOMMERCE"
PPWR_FUNCTION_AUXILIARY = "AUXILIARY"
PPWR_FUNCTION_FILLER = "FILLER"
PPWR_FUNCTION_OUT_OF_SCOPE = "OUT_OF_SCOPE"

PPWR_FUNCTIONS: frozenset[str] = frozenset(
    {
        PPWR_FUNCTION_SALES,
        PPWR_FUNCTION_TRANSPORT,
        PPWR_FUNCTION_ECOMMERCE,
        PPWR_FUNCTION_AUXILIARY,
        PPWR_FUNCTION_FILLER,
        PPWR_FUNCTION_OUT_OF_SCOPE,
    }
)

# Carton = shipping / e-commerce only (never SALES).
PPWR_FUNCTIONS_CARTON: frozenset[str] = frozenset(
    {
        PPWR_FUNCTION_TRANSPORT,
        PPWR_FUNCTION_ECOMMERCE,
        PPWR_FUNCTION_OUT_OF_SCOPE,
    }
)

# PackagingMaterial = auxiliary / filler / optional e-com envelope; never SALES.
PPWR_FUNCTIONS_PACKAGING_MATERIAL: frozenset[str] = frozenset(
    {
        PPWR_FUNCTION_AUXILIARY,
        PPWR_FUNCTION_FILLER,
        PPWR_FUNCTION_ECOMMERCE,
        PPWR_FUNCTION_TRANSPORT,
        PPWR_FUNCTION_OUT_OF_SCOPE,
    }
)

PPWR_STATUS_NOT_ASSESSED = "NOT_ASSESSED"
PPWR_STATUS_INCOMPLETE = "INCOMPLETE"
PPWR_STATUS_READY = "READY"

PPWR_STATUSES: frozenset[str] = frozenset(
    {
        PPWR_STATUS_NOT_ASSESSED,
        PPWR_STATUS_INCOMPLETE,
        PPWR_STATUS_READY,
    }
)

PPWR_LEVEL_PRIMARY = "PRIMARY"
PPWR_LEVEL_SECONDARY = "SECONDARY"
PPWR_LEVELS: frozenset[str] = frozenset({PPWR_LEVEL_PRIMARY, PPWR_LEVEL_SECONDARY})

# Short format vocabulary (extensible strings; not a hard DB enum).
PPWR_FORMATS_HINT: tuple[str, ...] = (
    "shipper_box",
    "mailer",
    "envelope",
    "bottle",
    "jar",
    "pouch",
    "blister",
    "retail_box",
    "stretch",
    "tape",
    "bubble_wrap",
    "paper_filler",
    "label",
    "other",
)


def normalize_ppwr_function(value: Any, *, allowed: frozenset[str]) -> str | None:
    if value is None:
        return None
    s = str(value).strip().upper()
    if not s:
        return None
    if s not in allowed:
        raise ValueError(f"Niedozwolona funkcja PPWR: {s}")
    return s


def normalize_ppwr_status(value: Any) -> str:
    if value is None or str(value).strip() == "":
        return PPWR_STATUS_NOT_ASSESSED
    s = str(value).strip().upper()
    if s not in PPWR_STATUSES:
        raise ValueError(f"Niedozwolony status PPWR: {s}")
    return s


def normalize_ppwr_level(value: Any) -> str:
    s = str(value or PPWR_LEVEL_PRIMARY).strip().upper()
    if s not in PPWR_LEVELS:
        raise ValueError(f"Niedozwolony poziom opakowania: {s}")
    return s


def validate_pct_0_100(value: Any, *, field: str) -> float | None:
    if value is None or value == "":
        return None
    try:
        f = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} musi być liczbą") from exc
    if f < 0 or f > 100:
        raise ValueError(f"{field} musi być w zakresie 0–100")
    return f


def compute_ppwr_readiness(
    *,
    ppwr_function: str | None,
    ppwr_format: str | None,
    recyclable_pct: float | None,
    recycled_content_pct: float | None,
    is_reusable: bool | None,
    explicit_status: str | None = None,
) -> str:
    """Derive readiness; explicit NOT_ASSESSED wins until user starts filling."""
    if explicit_status == PPWR_STATUS_NOT_ASSESSED and ppwr_function is None and not (ppwr_format or "").strip():
        return PPWR_STATUS_NOT_ASSESSED
    if ppwr_function is None and not (ppwr_format or "").strip() and recyclable_pct is None and recycled_content_pct is None:
        return PPWR_STATUS_NOT_ASSESSED
    if ppwr_function == PPWR_FUNCTION_OUT_OF_SCOPE:
        return PPWR_STATUS_READY
    if ppwr_function and (ppwr_format or "").strip():
        return PPWR_STATUS_READY
    if ppwr_function or (ppwr_format or "").strip() or recyclable_pct is not None or recycled_content_pct is not None:
        return PPWR_STATUS_INCOMPLETE
    return PPWR_STATUS_NOT_ASSESSED
