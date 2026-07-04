"""Production execution UI interface — WMS terminal vs ERP forms. Same backend workflow."""

from __future__ import annotations

from typing import Any

WMS_INTERFACE = "WMS"
ERP_INTERFACE = "ERP"

_LEGACY_PAPER = "PAPER"


def normalized_execution_interface(entity: Any) -> str | None:
    raw = getattr(entity, "execution_interface", None) or getattr(entity, "execution_mode", None)
    if raw is None or str(raw).strip() == "":
        return None
    value = str(raw).upper().strip()
    if value == _LEGACY_PAPER:
        return ERP_INTERFACE
    if value in (WMS_INTERFACE, ERP_INTERFACE):
        return value
    return None


def is_erp_interface(entity: Any) -> bool:
    return normalized_execution_interface(entity) == ERP_INTERFACE


def is_wms_interface(entity: Any) -> bool:
    return normalized_execution_interface(entity) == WMS_INTERFACE
