"""WMS warehouse assignment enforcement (P1)."""

from __future__ import annotations

import os


def wms_warehouse_assignment_enforcement_mode() -> str:
    """
    ``off`` — legacy fallback (all warehouses when no assignments).
    ``log`` — deny legacy fallback; log would-be 403s but allow request.
    ``hard`` — enforce assignments + 403 on unauthorized warehouse (default).
    """
    raw = os.getenv("WMS_ENFORCE_WAREHOUSE_ASSIGNMENTS", "hard").strip().lower()
    if raw in ("0", "false", "off", "legacy", "no"):
        return "off"
    if raw in ("log", "log-only", "log_only"):
        return "log"
    return "hard"


def wms_warehouse_assignment_enforcement_enabled() -> bool:
    return wms_warehouse_assignment_enforcement_mode() != "off"


def wms_warehouse_access_hard_enforcement() -> bool:
    return wms_warehouse_assignment_enforcement_mode() == "hard"
