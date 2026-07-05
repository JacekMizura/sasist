"""Production material shortage analysis — shared across planning, batches, MO, reservations."""

from __future__ import annotations

from typing import Literal

MaterialProductionStatus = Literal["OK", "PARTIAL", "BLOCKED"]

STATUS_OK: MaterialProductionStatus = "OK"
STATUS_PARTIAL: MaterialProductionStatus = "PARTIAL"
STATUS_BLOCKED: MaterialProductionStatus = "BLOCKED"

NEED_STATUS_OPEN = "open"
NEED_STATUS_LINKED = "linked"
NEED_STATUS_PARTIAL = "partial"
NEED_STATUS_FULFILLED = "fulfilled"
NEED_STATUS_CANCELLED = "cancelled"
