"""SSOT for warehouse inventory update policy (MODEL B — controlled WMS exception)."""

from __future__ import annotations

from typing import Literal

from sqlalchemy.orm import Session

from ..models.wms_settings import WmsSettings
from .tenant_default_warehouse import assert_tenant_warehouse_scope

# Stored in DB (includes legacy values).
StoredInventoryManagementMode = Literal[
    "DOCUMENTS_ONLY",
    "DIRECT_OPERATIONS",
    "HYBRID",
    "EXTERNAL_INVENTORY",
]

# Canonical runtime / UI modes.
CanonicalInventoryManagementMode = Literal[
    "DOCUMENTS_ONLY",
    "DIRECT_OPERATIONS",
    "EXTERNAL_INVENTORY",
]

InventoryManagementModeUi = Literal["DOCUMENTS_ONLY", "DIRECT_OPERATIONS"]

# Legacy alias HYBRID → DIRECT_OPERATIONS at runtime.
DEFAULT_INVENTORY_MANAGEMENT_MODE: StoredInventoryManagementMode = "DIRECT_OPERATIONS"
ACTIVE_UI_MODES: frozenset[str] = frozenset({"DOCUMENTS_ONLY", "DIRECT_OPERATIONS"})

# Phase 2: full WZ/PZ-first ↔ WMS FSW — toggle stays off in UI until True.
FULL_MANUAL_WAREHOUSE_DOCUMENT_FSW_READY = False

# Controlled lifecycles — never gated by inventory_management_mode.
CONTROLLED_INVENTORY_LIFECYCLE_KINDS: frozenset[str] = frozenset(
    {
        "wms_picking_cart",
        "wms_picking_cartless",
        "wms_picking_recovery",
        "wms_receiving",
        "wms_putaway",
        "wms_mm",
        "direct_sale",
        "production_pw_rw",
        "returns_z_pz",
        "inventory_count",
        "owr_atp",
    }
)


class InventoryManagementPolicyError(Exception):
    """Business rule violation for inventory write policy."""

    def __init__(self, message: str, *, code: str = "INVENTORY_POLICY_VIOLATION") -> None:
        super().__init__(message)
        self.code = code


def normalize_inventory_management_mode(raw: object | None) -> CanonicalInventoryManagementMode:
    """Map stored/legacy values to canonical runtime mode."""
    v = str(raw or "").strip().upper()
    if v == "DOCUMENTS_ONLY":
        return "DOCUMENTS_ONLY"
    if v == "EXTERNAL_INVENTORY":
        return "EXTERNAL_INVENTORY"
    if v in ("DIRECT_OPERATIONS", "HYBRID"):
        return "DIRECT_OPERATIONS"
    return "DIRECT_OPERATIONS"


def normalize_inventory_management_mode_ui(raw: object | None) -> InventoryManagementModeUi:
    mode = normalize_inventory_management_mode(raw)
    if mode == "DOCUMENTS_ONLY":
        return "DOCUMENTS_ONLY"
    return "DIRECT_OPERATIONS"


def _canonical_mode(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> CanonicalInventoryManagementMode:
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    return normalize_inventory_management_mode(getattr(row, "inventory_management_mode", None))


def is_controlled_inventory_lifecycle(lifecycle_kind: str) -> bool:
    """True when operation is WMS/domain controlled lifecycle (always allowed)."""
    return str(lifecycle_kind or "").strip().lower() in CONTROLLED_INVENTORY_LIFECYCLE_KINDS


def manual_adjustment_allowed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> bool:
    return _canonical_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id) == "DIRECT_OPERATIONS"


def raw_inventory_write_allowed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> bool:
    """Raw POST /inventory / product.stock_quantity — blocked in all active UI modes."""
    mode = _canonical_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if mode == "EXTERNAL_INVENTORY":
        return False
    return False


def manual_warehouse_document_execution_allowed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> bool:
    """
    True when manual WZ/PZ may execute physical movement (FSW both directions).

    Requires FULL_MANUAL_WAREHOUSE_DOCUMENT_FSW_READY and warehouse toggle ON.
    """
    if not FULL_MANUAL_WAREHOUSE_DOCUMENT_FSW_READY:
        return False
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    return bool(getattr(row, "allow_manual_warehouse_document_execution", False))


def manual_warehouse_document_execution_available() -> bool:
    """UI/backend feature flag — full FSW shipped."""
    return FULL_MANUAL_WAREHOUSE_DOCUMENT_FSW_READY


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
        allow_manual_warehouse_document_execution=False,
    )
    db.add(row)
    db.flush()
    return row


def get_inventory_management_mode(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> CanonicalInventoryManagementMode:
    return _canonical_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


def is_documents_only(db: Session, *, tenant_id: int, warehouse_id: int) -> bool:
    return get_inventory_management_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id) == "DOCUMENTS_ONLY"


def is_hybrid(db: Session, *, tenant_id: int, warehouse_id: int) -> bool:
    """Legacy name — canonical DIRECT_OPERATIONS (HYBRID stored value included)."""
    return get_inventory_management_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id) == "DIRECT_OPERATIONS"


def can_manual_adjust_stock(db: Session, *, tenant_id: int, warehouse_id: int) -> bool:
    return manual_adjustment_allowed(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


def assert_manual_adjust_stock_allowed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> None:
    if manual_adjustment_allowed(db, tenant_id=tenant_id, warehouse_id=warehouse_id):
        return
    mode = get_inventory_management_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if mode == "DOCUMENTS_ONLY":
        raise InventoryManagementPolicyError(
            "Ręczna korekta stanu jest niedozwolona — stany poza procesami WMS aktualizuj wyłącznie dokumentami magazynowymi.",
            code="MANUAL_ADJUSTMENT_FORBIDDEN",
        )
    raise InventoryManagementPolicyError(
        "Ręczna korekta stanu nie jest dostępna w tym trybie magazynu.",
        code="MANUAL_ADJUSTMENT_NOT_AVAILABLE",
    )


def assert_raw_inventory_write_allowed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> None:
    if raw_inventory_write_allowed(db, tenant_id=tenant_id, warehouse_id=warehouse_id):
        return
    mode = get_inventory_management_mode(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if mode == "DOCUMENTS_ONLY":
        raise InventoryManagementPolicyError(
            "Bezpośrednia zmiana stanu jest niedozwolona — używaj dokumentów magazynowych (PZ, WZ, MM, inwentaryzacja itd.).",
            code="DOCUMENTS_ONLY_INVENTORY_WRITE",
        )
    if mode == "DIRECT_OPERATIONS":
        raise InventoryManagementPolicyError(
            "Bezpośrednia zmiana stanu jest niedozwolona — użyj korekty stanu z pełnym audytem (dokument RK).",
            code="USE_AUDITED_MANUAL_CORRECTION",
        )
    raise InventoryManagementPolicyError(
        "Zmiana stanu magazynowego nie jest dostępna w tym trybie.",
        code="INVENTORY_WRITE_NOT_AVAILABLE",
    )


def assert_no_unaudited_inventory_write(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> None:
    """Block direct inventory API / legacy product stock writes outside document flows."""
    assert_raw_inventory_write_allowed(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


def _normalize_mode_for_storage(mode: str) -> StoredInventoryManagementMode:
    v = str(mode or "").strip().upper()
    if v == "DOCUMENTS_ONLY":
        return "DOCUMENTS_ONLY"
    if v in ("DIRECT_OPERATIONS", "HYBRID"):
        return "DIRECT_OPERATIONS"
    if v == "EXTERNAL_INVENTORY":
        return "EXTERNAL_INVENTORY"
    return "DIRECT_OPERATIONS"


def save_inventory_management_mode(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    mode: str,
) -> WmsSettings:
    stored = _normalize_mode_for_storage(mode)
    ui_canonical = normalize_inventory_management_mode(stored)
    if ui_canonical not in ACTIVE_UI_MODES and stored != "EXTERNAL_INVENTORY":
        raise InventoryManagementPolicyError(
            f"Tryb {stored} nie jest dostępny do konfiguracji.",
            code="INVENTORY_MODE_NOT_CONFIGURABLE",
        )
    if stored == "EXTERNAL_INVENTORY":
        raise InventoryManagementPolicyError(
            "Tryb EXTERNAL_INVENTORY nie jest dostępny do konfiguracji.",
            code="INVENTORY_MODE_NOT_CONFIGURABLE",
        )
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    row.inventory_management_mode = stored
    return row
