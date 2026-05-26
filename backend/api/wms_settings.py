"""
WMS settings: returns mode configuration per tenant + warehouse.
"""

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.order_ui_status import OrderUiStatus
from ..models.label_template import SavedLabelTemplate
from ..models.document_series import DocumentSeries
from ..models.wms_packing_settings import WmsPackingSettings
from ..models.tenant import Tenant
from ..models.wms_settings import WmsSettings
from ..models.wms_picking_shortage_settings import WmsPickingShortageSettings
from ..schemas.wms_packing_settings import (
    WmsPackingAutoActions,
    WmsPackingDocumentSettings,
    WmsPackingFallbackLabel,
    WmsPackingInterfaceDisplay,
    WmsPackingSettingsRead,
    WmsPackingSettingsSave,
)
from ..schemas.wms_return import ReturnsMode, WmsSettingsRead, WmsSettingsSave, WmsSettingsUpsert
from ..schemas.wms_picking_shortage_settings import WmsPickingShortageSettingsRead, WmsPickingShortageSettingsSave
from ..services.tenant_default_warehouse import resolve_tenant_default_warehouse_id
from ..services.wms_picking_shortage_settings_service import (
    get_or_create_wms_picking_shortage_settings,
    touch_wms_picking_shortage_settings_row,
)

router = APIRouter(prefix="/wms/settings", tags=["WMS Settings"])


def _wms_settings_wh_dep(
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> int:
    try:
        return resolve_tenant_default_warehouse_id(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")


def resolve_wms_settings_tenant_id(db: Session, tenant_id: Optional[int]) -> int:
    """Gdy brak tenant_id — preferuj tenant id=1 (spójnie z panelem), inaczej pierwszy tenant."""
    if tenant_id is not None and int(tenant_id) > 0:
        return int(tenant_id)
    t1 = db.query(Tenant).filter(Tenant.id == 1).first()
    if t1 is not None:
        return 1
    row = db.query(Tenant).order_by(Tenant.id.asc()).first()
    if row is None:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego tenanta")
    return int(row.id)


def _derive_flags(mode: ReturnsMode) -> tuple[bool, bool, bool]:
    # simple: RMZ only
    if mode == "simple":
        return False, False, False  # require_photos, require_condition, enable_refund
    # two_step: warehouse decisions + office refund
    if mode == "two_step":
        return False, False, True
    # advanced: warehouse decisions + condition/photos + office refund
    if mode == "advanced":
        return True, True, True
    return False, False, False


def _get_or_create(db: Session, tenant_id: int, warehouse_id: int) -> WmsSettings:
    row = (
        db.query(WmsSettings)
        .filter(WmsSettings.tenant_id == tenant_id, WmsSettings.warehouse_id == warehouse_id)
        .first()
    )
    if row:
        return row
    # default: simple
    row = WmsSettings(tenant_id=tenant_id, warehouse_id=warehouse_id, returns_mode="simple")
    db.add(row)
    db.flush()
    return row


def _row_to_read(row: WmsSettings) -> WmsSettingsRead:
    return WmsSettingsRead(
        tenant_id=row.tenant_id,
        warehouse_id=row.warehouse_id,
        returns_mode=row.returns_mode,  # type: ignore[arg-type]
        require_photos=bool(row.require_photos),
        require_condition=bool(row.require_condition),
        enable_refund=bool(row.enable_refund),
    )


@router.get("", response_model=WmsSettingsRead)
def get_wms_settings(
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(_wms_settings_wh_dep),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db, tenant_id, warehouse_id)
    return _row_to_read(row)


@router.post("", response_model=WmsSettingsRead)
def save_wms_settings(body: WmsSettingsSave, db: Session = Depends(get_db)):
    try:
        wh_id = body.warehouse_id if body.warehouse_id is not None else resolve_tenant_default_warehouse_id(db, body.tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")
    row = _get_or_create(db, body.tenant_id, wh_id)
    row.returns_mode = body.returns_mode
    row.require_photos = bool(body.require_photos)
    row.require_condition = bool(body.require_condition)
    row.enable_refund = bool(body.enable_refund)
    db.commit()
    db.refresh(row)
    return _row_to_read(row)


@router.get("/returns-mode", response_model=WmsSettingsRead)
def get_returns_mode(
    tenant_id: Optional[int] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    tid = resolve_wms_settings_tenant_id(db, tenant_id)
    try:
        if warehouse_id is not None and int(warehouse_id) > 0:
            wh_id = int(warehouse_id)
        else:
            wh_id = resolve_tenant_default_warehouse_id(db, tid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")
    row = _get_or_create(db, tid, wh_id)
    return _row_to_read(row)


@router.put("/returns-mode", response_model=WmsSettingsRead)
def set_returns_mode(
    body: WmsSettingsUpsert,
    db: Session = Depends(get_db),
):
    mode: ReturnsMode = body.returns_mode
    require_photos, require_condition, enable_refund = _derive_flags(mode)
    tid = resolve_wms_settings_tenant_id(db, body.tenant_id)
    try:
        if body.warehouse_id is not None and int(body.warehouse_id) > 0:
            wh_id = int(body.warehouse_id)
        else:
            wh_id = resolve_tenant_default_warehouse_id(db, tid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")
    row = _get_or_create(db, tid, wh_id)

    row.returns_mode = mode
    row.require_photos = require_photos
    row.require_condition = require_condition
    row.enable_refund = enable_refund
    db.commit()
    db.refresh(row)

    return _row_to_read(row)


def _get_or_create_packing_settings(db: Session, tenant_id: int, warehouse_id: int) -> WmsPackingSettings:
    row = (
        db.query(WmsPackingSettings)
        .filter(
            WmsPackingSettings.tenant_id == int(tenant_id),
            WmsPackingSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row:
        return row
    row = WmsPackingSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        auto_actions_json="{}",
        document_settings_json="{}",
        fallback_label_json="{}",
        interface_display_json="{}",
    )
    db.add(row)
    db.flush()
    return row


def _assert_ui_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: Optional[int],
    field: str,
) -> None:
    if status_id is None:
        return
    st = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == int(status_id),
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if st is None:
        raise HTTPException(status_code=400, detail=f"Invalid {field} for this warehouse")


def _assert_sale_series_id(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_id: Optional[str],
    field_label: str,
    allowed_subtypes: Optional[tuple[str, ...]] = None,
) -> None:
    if series_id is None or not str(series_id).strip():
        return
    sid = str(series_id).strip()
    ds = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.id == sid,
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if ds is None:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_label}: document series not found for this warehouse.",
        )
    stype = str(getattr(ds, "series_type", "") or "").strip().upper()
    if stype != "SALE":
        raise HTTPException(status_code=400, detail=f"Invalid {field_label}: series must be SALE type.")
    sub = str(getattr(ds, "subtype", "") or "").strip().upper()
    if allowed_subtypes is not None and sub not in allowed_subtypes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_label}: expected subtype one of {allowed_subtypes}, got {sub}.",
        )


def _packing_row_to_read(row: WmsPackingSettings) -> WmsPackingSettingsRead:
    def _loads(raw: str, default: dict) -> dict:
        try:
            d = json.loads(raw or "{}")
            return d if isinstance(d, dict) else default
        except json.JSONDecodeError:
            return default

    aa = WmsPackingAutoActions.model_validate(
        {**WmsPackingAutoActions().model_dump(), **_loads(row.auto_actions_json, {})}
    )
    ds = WmsPackingDocumentSettings.model_validate(
        {**WmsPackingDocumentSettings().model_dump(), **_loads(row.document_settings_json, {})}
    )
    fb = WmsPackingFallbackLabel.model_validate(
        {**WmsPackingFallbackLabel().model_dump(), **_loads(row.fallback_label_json, {})}
    )
    raw_idisp = getattr(row, "interface_display_json", None)
    ui = WmsPackingInterfaceDisplay.model_validate(
        {**WmsPackingInterfaceDisplay().model_dump(), **_loads(raw_idisp if isinstance(raw_idisp, str) else "{}", {})}
    )
    raw_action = getattr(row, "packing_after_finish_action", None) or "STAY"
    action = "GO_TO_LIST" if str(raw_action).strip().upper() == "GO_TO_LIST" else "STAY"
    return WmsPackingSettingsRead(
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        start_status_id=row.start_status_id,
        packed_status_id=row.packed_status_id,
        missing_status_id=row.missing_status_id,
        packing_after_finish_action=action,
        auto_actions=aa,
        document_settings=ds,
        fallback_label=fb,
        interface_display=ui,
    )


@router.get("/packing", response_model=WmsPackingSettingsRead)
def get_wms_packing_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """``warehouse_id`` z zapytania — ten sam magazyn co lista ``document-series`` (nie magazyn domyślny)."""
    row = _get_or_create_packing_settings(db, tenant_id, warehouse_id)
    return _packing_row_to_read(row)


def _save_wms_packing_settings_impl(body: WmsPackingSettingsSave, db: Session) -> WmsPackingSettingsRead:
    try:
        wh_id = body.warehouse_id if body.warehouse_id is not None else resolve_tenant_default_warehouse_id(db, body.tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu") from None

    _assert_ui_status(db, tenant_id=body.tenant_id, warehouse_id=wh_id, status_id=body.start_status_id, field="start_status_id")
    _assert_ui_status(db, tenant_id=body.tenant_id, warehouse_id=wh_id, status_id=body.packed_status_id, field="packed_status_id")
    _assert_ui_status(db, tenant_id=body.tenant_id, warehouse_id=wh_id, status_id=body.missing_status_id, field="missing_status_id")

    if body.auto_actions.change_order_status and body.packed_status_id is None:
        raise HTTPException(
            status_code=400,
            detail="packed_status_id is required when auto_actions.change_order_status is enabled",
        )

    tid = body.fallback_label.template_id
    if tid is not None:
        tpl = (
            db.query(SavedLabelTemplate)
            .filter(
                SavedLabelTemplate.id == int(tid),
                SavedLabelTemplate.tenant_id == int(body.tenant_id),
            )
            .first()
        )
        if tpl is None:
            raise HTTPException(status_code=400, detail="fallback_label.template_id not found for tenant")

    ds = body.document_settings
    _assert_sale_series_id(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=wh_id,
        series_id=ds.series_id,
        field_label="document_settings.series_id",
        allowed_subtypes=("INVOICE", "RECEIPT", "CORRECTION"),
    )
    _assert_sale_series_id(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=wh_id,
        series_id=ds.invoice_series_id,
        field_label="document_settings.invoice_series_id",
        allowed_subtypes=("INVOICE",),
    )
    _assert_sale_series_id(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=wh_id,
        series_id=ds.receipt_series_id,
        field_label="document_settings.receipt_series_id",
        allowed_subtypes=("RECEIPT",),
    )

    row = _get_or_create_packing_settings(db, body.tenant_id, wh_id)
    row.start_status_id = body.start_status_id
    row.packed_status_id = body.packed_status_id
    row.missing_status_id = body.missing_status_id
    row.packing_after_finish_action = body.packing_after_finish_action
    row.auto_actions_json = json.dumps(body.auto_actions.model_dump(), ensure_ascii=False)
    row.document_settings_json = json.dumps(body.document_settings.model_dump(), ensure_ascii=False)
    row.fallback_label_json = json.dumps(body.fallback_label.model_dump(), ensure_ascii=False)
    if body.interface_display is not None:
        row.interface_display_json = json.dumps(body.interface_display.model_dump(), ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _packing_row_to_read(row)


@router.post("/packing", response_model=WmsPackingSettingsRead)
def save_wms_packing_settings(
    body: WmsPackingSettingsSave,
    db: Session = Depends(get_db),
):
    return _save_wms_packing_settings_impl(body, db)


@router.patch("/packing", response_model=WmsPackingSettingsRead)
def patch_wms_packing_settings(
    body: WmsPackingSettingsSave,
    db: Session = Depends(get_db),
):
    """Pełny zapis jak POST — m.in. ``invoice_series_id`` / ``receipt_series_id`` w ``document_settings``."""
    return _save_wms_packing_settings_impl(body, db)


def _shortage_settings_row_to_read(row: WmsPickingShortageSettings) -> WmsPickingShortageSettingsRead:
    pr = (getattr(row, "priority_after_shortage_resolved", None) or "high").strip().lower()
    if pr not in ("normal", "high", "immediate_picking"):
        pr = "high"
    return WmsPickingShortageSettingsRead(
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        shortage_reported_order_ui_status_id=getattr(row, "shortage_reported_order_ui_status_id", None),
        auto_enqueue_braki=bool(row.auto_enqueue_braki),
        allow_continue_other_lines_after_shortage=bool(row.allow_continue_other_lines_after_shortage),
        priority_after_shortage_resolved=pr,  # type: ignore[arg-type]
        auto_reopen_picking_after_shortage_resolved=bool(row.auto_reopen_picking_after_shortage_resolved),
        recovery_completed_order_ui_status_id=getattr(row, "recovery_completed_order_ui_status_id", None),
    )


@router.get("/picking-shortage", response_model=WmsPickingShortageSettingsRead)
def get_wms_picking_shortage_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_or_create_wms_picking_shortage_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    db.commit()
    db.refresh(row)
    return _shortage_settings_row_to_read(row)


@router.post("/picking-shortage", response_model=WmsPickingShortageSettingsRead)
def save_wms_picking_shortage_settings(
    body: WmsPickingShortageSettingsSave,
    db: Session = Depends(get_db),
):
    try:
        wh_id = (
            body.warehouse_id
            if body.warehouse_id is not None
            else resolve_tenant_default_warehouse_id(db, body.tenant_id)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu") from None

    _assert_ui_status(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=wh_id,
        status_id=body.shortage_reported_order_ui_status_id,
        field="shortage_reported_order_ui_status_id",
    )
    _assert_ui_status(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=wh_id,
        status_id=body.recovery_completed_order_ui_status_id,
        field="recovery_completed_order_ui_status_id",
    )

    row = get_or_create_wms_picking_shortage_settings(db, tenant_id=int(body.tenant_id), warehouse_id=int(wh_id))
    row.shortage_reported_order_ui_status_id = body.shortage_reported_order_ui_status_id
    row.auto_enqueue_braki = bool(body.auto_enqueue_braki)
    row.allow_continue_other_lines_after_shortage = bool(body.allow_continue_other_lines_after_shortage)
    row.priority_after_shortage_resolved = str(body.priority_after_shortage_resolved or "high").strip().lower()
    row.auto_reopen_picking_after_shortage_resolved = bool(body.auto_reopen_picking_after_shortage_resolved)
    row.recovery_completed_order_ui_status_id = body.recovery_completed_order_ui_status_id
    touch_wms_picking_shortage_settings_row(row)
    db.commit()
    db.refresh(row)
    return _shortage_settings_row_to_read(row)
