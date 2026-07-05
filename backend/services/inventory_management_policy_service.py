"""SSOT for warehouse inventory update policy (Etap 3B)."""

from __future__ import annotations

from typing import Literal

from sqlalchemy.orm import Session

from ..models.wms_settings import WmsSettings
from .tenant_default_warehouse import assert_tenant_warehouse_scope

InventoryManagementMode = Literal["DOCUMENTS_ONLY", "HYBRID", "EXTERNAL_INVENTORY"]

DEFAULT_INVENTORY_MANAGEMENT_MODE: InventoryManagementMode = "HYBRID"
ACTIVE_UI_MODES: frozenset[str] = frozenset({"DOCUMENTS_ONLY", "HYBRID"})


class InventoryManagementPolicyError(Exception):
    """Business rule violation for inventory write policy."""

    def __init__(self, message: str, *, code: str = "INVENTORY_POLICY_VIOLATION") -> None:
        super().__init__(message)
        self.code = code


def normalize_inventory_management_mode(raw: object | None) -> InventoryManagementMode:
    v = str(raw or "").strip().upper()
    if v == "DOCUMENTS_ONLY":
        return "DOCUMENTS_ONLY"
    if v == "EXTERNAL_INVENTORY":
        return "EXTERNAL_INVENTORY"
    return "HYBRID"


def get_or_create_wms_settings_row(db: Session, *, tenant_id: int, warehouse_id: int) -> WmsSettings:
    assert_tenant_warehouse_scope(db, tenant_id, warehouse_id)
    row = (
        db.query(WmsSettings)
        .filter(
            WmsSettings.tenant_id == int(tenant_id),
            WmsSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row is not None:
        return row
    row = WmsSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        returns_mode="simple",
        inventory_management_mode=DEFAULT_INVENTORY_MANAGEMENT_MODE,
    )
    db.add(row)
    db.flush()
    return row


def get_inventory_management_mode(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> InventoryManagementMode:
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    return normalize_inventory_management_mode(getattr(row, "inventory_management_mode", None))


def is_documents_only(db: Session, *, tenant_id: int, warehouse_id: int) -> bool:
    return get_inventory_management_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id) == "DOCUMENTS_ONLY"


def is_hybrid(db: Session, *, tenant_id: int, warehouse_id: int) -> bool:
    return get_inventory_management_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id) == "HYBRID"


def can_manual_adjust_stock(db: Session, *, tenant_id: int, warehouse_id: int) -> bool:
    return is_hybrid(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


def assert_manual_adjust_stock_allowed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> None:
    if can_manual_adjust_stock(db, tenant_id=tenant_id, warehouse_id=warehouse_id):
        return
    mode = get_inventory_management_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if mode == "DOCUMENTS_ONLY":
        raise InventoryManagementPolicyError(
            "Ręczna korekta stanu jest niedozwolona — stany aktualizuj wyłącznie dokumentami magazynowymi.",
            code="MANUAL_ADJUSTMENT_FORBIDDEN",
        )
    raise InventoryManagementPolicyError(
        "Ręczna korekta stanu nie jest dostępna w tym trybie magazynu.",
        code="MANUAL_ADJUSTMENT_NOT_AVAILABLE",
    )


def assert_no_unaudited_inventory_write(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> None:
    """Block direct inventory API / legacy product stock writes outside document flows."""
    mode = get_inventory_management_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if mode == "DOCUMENTS_ONLY":
        raise InventoryManagementPolicyError(
            "Bezpośrednia zmiana stanu jest niedozwolona — używaj dokumentów magazynowych (PZ, WZ, MM, inwentaryzacja itd.).",
            code="DOCUMENTS_ONLY_INVENTORY_WRITE",
        )
    if mode == "HYBRID":
        raise InventoryManagementPolicyError(
            "Bezpośrednia zmiana stanu jest niedozwolona — użyj korekty stanu z pełnym audytem (dokument RK).",
            code="USE_AUDITED_MANUAL_CORRECTION",
        )
    raise InventoryManagementPolicyError(
        "Zmiana stanu magazynowego nie jest dostępna w tym trybie.",
        code="INVENTORY_WRITE_NOT_AVAILABLE",
    )


def save_inventory_management_mode(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    mode: InventoryManagementMode,
) -> WmsSettings:
    normalized = normalize_inventory_management_mode(mode)
    if normalized not in ACTIVE_UI_MODES:
        raise InventoryManagementPolicyError(
            f"Tryb {normalized} nie jest dostępny do konfiguracji.",
            code="INVENTORY_MODE_NOT_CONFIGURABLE",
        )
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    row.inventory_management_mode = normalized
    return row
