"""SSOT: returns workflow settings + per-RMZ snapshot (not returns_mode)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from sqlalchemy.orm import Session

from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_settings import WmsSettings
from ...schemas.wms_return import ReturnsMode
from ..inventory_management_policy_service import get_or_create_wms_settings_row
from .manufactured_component_recovery_service import (
    normalize_receipt_mode,
    normalize_recovery_mode,
)

RefundProcessing = Literal["disabled", "warehouse", "office"]
ManufacturedRecoveryMode = Literal["OFF", "OPTIONAL", "REQUIRED"]
ManufacturedReceiptMode = Literal["STANDARD_PUTAWAY", "DEFAULT_LOCATION"]
#: v2 adds manufactured_* snapshot fields on WmsOrderReturn.
RETURNS_WORKFLOW_VERSION = 2


@dataclass(frozen=True)
class RmzWorkflowSnapshot:
    version: int
    require_condition: bool
    require_photos: bool
    refund_processing: RefundProcessing
    manufactured_component_recovery_mode: ManufacturedRecoveryMode
    manufactured_recovery_receipt_mode: ManufacturedReceiptMode
    manufactured_recovery_location_id: Optional[int]


@dataclass
class RmzLineValidationSettings:
    """Subset passed to line split / finalize validation (from snapshot)."""

    require_photos: bool
    require_condition: bool


def normalize_refund_processing(raw: object | None) -> RefundProcessing:
    v = str(raw or "").strip().lower()
    if v in ("disabled", "warehouse", "office"):
        return v  # type: ignore[return-value]
    return "disabled"


def derive_refund_processing_from_legacy(row: WmsSettings) -> RefundProcessing:
    stored = getattr(row, "refund_processing", None)
    if stored is not None and str(stored).strip():
        return normalize_refund_processing(stored)
    mode = str(getattr(row, "returns_mode", "simple") or "simple").strip().lower()
    enable = bool(getattr(row, "enable_refund", False))
    if mode == "simple" or not enable:
        return "disabled"
    # two_step / advanced → warehouse (never auto-map to office)
    return "warehouse"


def _mfg_from_settings(row: WmsSettings) -> tuple[ManufacturedRecoveryMode, ManufacturedReceiptMode, Optional[int]]:
    mode = normalize_recovery_mode(getattr(row, "manufactured_component_recovery_mode", None))
    receipt = normalize_receipt_mode(getattr(row, "manufactured_recovery_receipt_mode", None))
    loc_raw = getattr(row, "manufactured_recovery_location_id", None)
    loc_id: Optional[int] = None
    if loc_raw is not None and int(loc_raw) > 0:
        loc_id = int(loc_raw)
    if receipt != "DEFAULT_LOCATION":
        loc_id = None
    return mode, receipt, loc_id  # type: ignore[return-value]


def read_returns_settings_ssot(row: WmsSettings) -> RmzWorkflowSnapshot:
    mfg_mode, mfg_receipt, mfg_loc = _mfg_from_settings(row)
    return RmzWorkflowSnapshot(
        version=RETURNS_WORKFLOW_VERSION,
        require_condition=bool(getattr(row, "require_condition", False)),
        require_photos=bool(getattr(row, "require_photos", False)),
        refund_processing=derive_refund_processing_from_legacy(row),
        manufactured_component_recovery_mode=mfg_mode,
        manufactured_recovery_receipt_mode=mfg_receipt,
        manufactured_recovery_location_id=mfg_loc,
    )


def project_legacy_settings_columns(
    row: WmsSettings,
    *,
    require_condition: bool,
    require_photos: bool,
    refund_processing: RefundProcessing,
) -> None:
    """Compatibility projection — legacy columns must not become a second SSOT."""
    row.require_condition = bool(require_condition)
    row.require_photos = bool(require_photos)
    row.refund_processing = refund_processing
    row.enable_refund = refund_processing != "disabled"
    if refund_processing == "disabled":
        row.returns_mode = "simple"
    elif refund_processing == "office":
        row.returns_mode = "two_step"
    elif require_photos and require_condition:
        row.returns_mode = "advanced"
    else:
        row.returns_mode = "two_step"


def resolve_returns_settings(db: Session, *, tenant_id: int, warehouse_id: int) -> WmsSettings:
    return get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))


def snapshot_from_settings(row: WmsSettings) -> RmzWorkflowSnapshot:
    return read_returns_settings_ssot(row)


def _apply_snapshot_to_row(row: WmsOrderReturn, snap: RmzWorkflowSnapshot) -> None:
    row.returns_workflow_version = snap.version
    row.require_condition = snap.require_condition
    row.require_photos = snap.require_photos
    row.refund_processing = snap.refund_processing
    row.manufactured_component_recovery_mode = snap.manufactured_component_recovery_mode
    row.manufactured_recovery_receipt_mode = snap.manufactured_recovery_receipt_mode
    row.manufactured_recovery_location_id = snap.manufactured_recovery_location_id


def stamp_rmz_snapshot_on_create(row: WmsOrderReturn, settings: WmsSettings) -> None:
    _apply_snapshot_to_row(row, snapshot_from_settings(settings))


def _rmz_has_refund_snapshot(row: WmsOrderReturn) -> bool:
    return getattr(row, "refund_processing", None) is not None and str(row.refund_processing).strip() != ""


def _rmz_has_mfg_snapshot(row: WmsOrderReturn) -> bool:
    return (
        getattr(row, "manufactured_component_recovery_mode", None) is not None
        and str(getattr(row, "manufactured_component_recovery_mode", "") or "").strip() != ""
    )


def read_rmz_workflow_snapshot(row: WmsOrderReturn) -> Optional[RmzWorkflowSnapshot]:
    if not _rmz_has_refund_snapshot(row) or not _rmz_has_mfg_snapshot(row):
        return None
    loc_raw = getattr(row, "manufactured_recovery_location_id", None)
    loc_id = int(loc_raw) if loc_raw is not None and int(loc_raw) > 0 else None
    receipt = normalize_receipt_mode(getattr(row, "manufactured_recovery_receipt_mode", None))
    if receipt != "DEFAULT_LOCATION":
        loc_id = None
    return RmzWorkflowSnapshot(
        version=int(getattr(row, "returns_workflow_version", None) or RETURNS_WORKFLOW_VERSION),
        require_condition=bool(getattr(row, "require_condition", False)),
        require_photos=bool(getattr(row, "require_photos", False)),
        refund_processing=normalize_refund_processing(getattr(row, "refund_processing", None)),
        manufactured_component_recovery_mode=normalize_recovery_mode(  # type: ignore[arg-type]
            getattr(row, "manufactured_component_recovery_mode", None)
        ),
        manufactured_recovery_receipt_mode=receipt,  # type: ignore[arg-type]
        manufactured_recovery_location_id=loc_id,
    )


def ensure_rmz_workflow_snapshot(db: Session, row: WmsOrderReturn) -> RmzWorkflowSnapshot:
    existing = read_rmz_workflow_snapshot(row)
    if existing is not None:
        return existing
    settings = resolve_returns_settings(
        db, tenant_id=int(row.tenant_id), warehouse_id=int(row.warehouse_id)
    )
    live = snapshot_from_settings(settings)
    # Partial legacy: keep already-stamped refund_* ; stamp only missing mfg once.
    if _rmz_has_refund_snapshot(row) and not _rmz_has_mfg_snapshot(row):
        row.returns_workflow_version = max(
            int(getattr(row, "returns_workflow_version", None) or 1),
            RETURNS_WORKFLOW_VERSION,
        )
        row.manufactured_component_recovery_mode = live.manufactured_component_recovery_mode
        row.manufactured_recovery_receipt_mode = live.manufactured_recovery_receipt_mode
        row.manufactured_recovery_location_id = live.manufactured_recovery_location_id
        db.flush()
        out = read_rmz_workflow_snapshot(row)
        assert out is not None
        return out
    _apply_snapshot_to_row(row, live)
    db.flush()
    return live


def line_validation_settings(snapshot: RmzWorkflowSnapshot) -> RmzLineValidationSettings:
    return RmzLineValidationSettings(
        require_photos=snapshot.require_photos,
        require_condition=snapshot.require_condition,
    )


def resolve_warehouse_commit_transition(
    snapshot: RmzWorkflowSnapshot,
    rmz_lines,
    *,
    all_rejected: bool,
) -> str:
    if all_rejected:
        return "rejected"
    rp = snapshot.refund_processing
    if rp == "office":
        return "office_pending"
    return "success"


def validate_warehouse_commit_refund_payload(
    snapshot: RmzWorkflowSnapshot,
    *,
    process_refund: bool,
    refund_type: str | None,
) -> None:
    from .errors import RmzFinalizeError

    eff_type = str(refund_type or "NONE").strip().upper()
    if snapshot.refund_processing == "disabled":
        if process_refund or eff_type not in ("", "NONE"):
            raise RmzFinalizeError(
                "Financial refund is disabled for this return — omit refund from warehouse commit."
            )
        return
    if snapshot.refund_processing == "office":
        if process_refund or eff_type not in ("", "NONE"):
            raise RmzFinalizeError(
                "Refund is not allowed during warehouse commit — complete warehouse step, then use office refund."
            )
        return
    # warehouse: refund optional in same commit (NONE allowed)


def legacy_returns_mode_label(refund_processing: RefundProcessing, require_photos: bool, require_condition: bool) -> ReturnsMode:
    if refund_processing == "disabled":
        return "simple"
    if require_photos and require_condition:
        return "advanced"
    return "two_step"
