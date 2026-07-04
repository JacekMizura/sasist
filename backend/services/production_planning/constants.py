"""Production demand planning (MRP-lite) — constants and extension hooks."""

from __future__ import annotations

# Order demand: exclude terminal lifecycle states.
TERMINAL_ORDER_STATUS = frozenset(
    {
        "SHIPPED",
        "COMPLETED",
        "CANCELLED",
        "CANCELLED_RETURN",
        "DELIVERED",
        "RETURNED",
        "ARCHIVED",
        "ZAKONCZONE",
        "ANULOWANE",
    }
)

TERMINAL_FULFILLMENT_STATE = frozenset(
    {
        "DELIVERED",
        "SHIPPED",
        "CANCELLED",
        "COMPLETED",
        "RETURNED",
        "ARCHIVED",
    }
)

# Pipeline: batch/MO not yet on shelf (exclude draft/cancelled/completed).
PIPELINE_BATCH_MO_STATUSES = frozenset({"planned", "collecting", "in_progress", "putaway"})

DEFAULT_SALES_LOOKBACK_DAYS = 30
DEFAULT_COVERAGE_DAYS = 21

COVERAGE_DAY_PRESETS = (7, 14, 21, 30, 45, 60, 90)

MIN_COVERAGE_DAYS = 1
MAX_COVERAGE_DAYS = 365
MIN_SALES_LOOKBACK_DAYS = 7
MAX_SALES_LOOKBACK_DAYS = 365

ProductionPriority = str  # CRITICAL | HIGH | MEDIUM | LOW

PRIORITY_CRITICAL = "CRITICAL"
PRIORITY_HIGH = "HIGH"
PRIORITY_MEDIUM = "MEDIUM"
PRIORITY_LOW = "LOW"

COVERAGE_COLOR_CRITICAL = "red"  # <7
COVERAGE_COLOR_WARNING = "orange"  # 7-14
COVERAGE_COLOR_OK = "green"  # 14-30
COVERAGE_COLOR_COMFORT = "blue"  # >30
