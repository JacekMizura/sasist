"""
WMS settings: returns mode configuration per tenant + warehouse.
"""

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from ..auth.deps import get_current_user
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.app_user import AppUser
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
    WmsPackingMultiParcelSettings,
    WmsPackingSettingsRead,
    WmsPackingSettingsSave,
)
from ..schemas.wms_return import ReturnsMode, WmsSettingsRead, WmsSettingsSave, WmsSettingsUpsert
from ..schemas.wms_picking_shortage_settings import WmsPickingShortageSettingsRead, WmsPickingShortageSettingsSave
from ..schemas.wms_picking_terminal_settings import (
    WmsPickingListDisplay,
    WmsPickingTerminalSettingsRead,
    WmsPickingTerminalSettingsSave,
)
from ..schemas.wms_general_settings import (
    WmsGeneralSettingsRead,
    WmsGeneralSettingsSave,
)
from ..services.tenant_default_warehouse import resolve_tenant_default_warehouse_id, assert_tenant_warehouse_scope
from ..services.wms_picking_shortage_settings_service import (
    get_or_create_wms_picking_shortage_settings,
    touch_wms_picking_shortage_settings_row,
)
from ..services.wms_picking_terminal_settings_service import (
    get_or_create_wms_picking_terminal_settings,
    touch_wms_picking_terminal_settings_row,
)
from ..services.wms_general_settings_service import (
    get_or_create_wms_general_settings,
    normalize_wms_font_size_px,
    touch_wms_general_settings_row,
)
from ..services.inventory_management_policy_service import (
    get_or_create_wms_settings_row,
    normalize_inventory_management_mode,
)
from ..schemas.wms_product_validation_settings import (
    WmsProductValidationSettingsRead,
    WmsProductValidationSettingsSave,
)
from ..schemas.direct_sales_settings import DirectSalesSettingsRead, DirectSalesSettingsSave
from ..services.direct_sales_settings_service import (
    resolve_direct_sales_settings,
    save_direct_sales_settings,
)

router = APIRouter(prefix="/wms/settings", tags=["WMS Settings"])


def _wms_settings_wh_dep(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> int:
    if warehouse_id is not None and int(warehouse_id) > 0:
        return int(warehouse_id)
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
    return get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))


def _row_to_read(row: WmsSettings) -> WmsSettingsRead:
    from ..services.returns.manufactured_component_recovery_service import (
        normalize_receipt_mode,
        normalize_recovery_mode,
    )

    return WmsSettingsRead(
        tenant_id=row.tenant_id,
        warehouse_id=row.warehouse_id,
        returns_mode=row.returns_mode,  # type: ignore[arg-type]
        require_photos=bool(row.require_photos),
        require_condition=bool(row.require_condition),
        enable_refund=bool(row.enable_refund),
        z_pz_print_label_on_close=bool(getattr(row, "z_pz_print_label_on_close", False)),
        z_pz_label_template_id=getattr(row, "z_pz_label_template_id", None),
        inventory_management_mode=normalize_inventory_management_mode(
            getattr(row, "inventory_management_mode", None)
        ),
        manufactured_component_recovery_mode=normalize_recovery_mode(  # type: ignore[arg-type]
            getattr(row, "manufactured_component_recovery_mode", None)
        ),
        manufactured_recovery_receipt_mode=normalize_receipt_mode(  # type: ignore[arg-type]
            getattr(row, "manufactured_recovery_receipt_mode", None)
        ),
        manufactured_recovery_location_id=getattr(row, "manufactured_recovery_location_id", None),
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
    if body.z_pz_print_label_on_close is not None:
        row.z_pz_print_label_on_close = bool(body.z_pz_print_label_on_close)
    if body.z_pz_label_template_id is not None:
        tpl = int(body.z_pz_label_template_id)
        row.z_pz_label_template_id = tpl if tpl > 0 else None
    if body.manufactured_component_recovery_mode is not None:
        from ..services.returns.manufactured_component_recovery_service import (
            RECEIPT_DEFAULT_LOCATION,
            assert_recovery_location_in_warehouse,
            normalize_receipt_mode,
            normalize_recovery_mode,
        )

        row.manufactured_component_recovery_mode = normalize_recovery_mode(
            body.manufactured_component_recovery_mode
        )
    if body.manufactured_recovery_receipt_mode is not None:
        from ..services.returns.manufactured_component_recovery_service import (
            RECEIPT_DEFAULT_LOCATION,
            assert_recovery_location_in_warehouse,
            normalize_receipt_mode,
        )

        row.manufactured_recovery_receipt_mode = normalize_receipt_mode(
            body.manufactured_recovery_receipt_mode
        )
    if body.manufactured_recovery_location_id is not None:
        lid = int(body.manufactured_recovery_location_id)
        row.manufactured_recovery_location_id = lid if lid > 0 else None
    # Clear location when not using default-location mode
    receipt_mode = str(getattr(row, "manufactured_recovery_receipt_mode", "") or "")
    if receipt_mode != "DEFAULT_LOCATION":
        if body.manufactured_recovery_receipt_mode is not None:
            row.manufactured_recovery_location_id = None
    elif str(getattr(row, "manufactured_recovery_receipt_mode", "") or "") == "DEFAULT_LOCATION":
        from ..services.returns.manufactured_component_recovery_service import (
            assert_recovery_location_in_warehouse,
        )

        loc_id = getattr(row, "manufactured_recovery_location_id", None)
        if loc_id is None or int(loc_id) <= 0:
            raise HTTPException(status_code=400, detail="Wybierz lokalizację odzysków")
        try:
            assert_recovery_location_in_warehouse(
                db, warehouse_id=wh_id, location_id=int(loc_id), tenant_id=int(tid)
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    db.refresh(row)

    return _row_to_read(row)


def _get_or_create_packing_settings(db: Session, tenant_id: int, warehouse_id: int) -> WmsPackingSettings:
    assert_tenant_warehouse_scope(db, tenant_id, warehouse_id)
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
        allowed_start_status_ids_json="[]",
        auto_actions_json="{}",
        document_settings_json="{}",
        fallback_label_json="{}",
        interface_display_json="{}",
        multi_parcel_json="{}",
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


def _parse_allowed_start_status_ids(raw: object | None) -> list[int]:
    if raw is None:
        return []
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw or "[]")
        except json.JSONDecodeError:
            return []
    if not isinstance(data, list):
        return []
    out: list[int] = []
    seen: set[int] = set()
    for item in data:
        try:
            n = int(item)
        except (TypeError, ValueError):
            continue
        if n <= 0 or n in seen:
            continue
        seen.add(n)
        out.append(n)
    return out


def _normalize_packing_after_finish_action_read(raw: object | None) -> str:
    u = str(raw or "STAY").strip().upper()
    if u == "GO_TO_LIST":
        return "GO_TO_LIST"
    if u == "NEXT_ORDER":
        return "NEXT_ORDER"
    return "STAY"


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
    raw_mp = getattr(row, "multi_parcel_json", None)
    mp = WmsPackingMultiParcelSettings.model_validate(
        {**WmsPackingMultiParcelSettings().model_dump(), **_loads(raw_mp if isinstance(raw_mp, str) else "{}", {})}
    )
    action = _normalize_packing_after_finish_action_read(getattr(row, "packing_after_finish_action", None))
    allowed_ids = _parse_allowed_start_status_ids(getattr(row, "allowed_start_status_ids_json", None))
    return WmsPackingSettingsRead(
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        start_status_id=row.start_status_id,
        packed_status_id=row.packed_status_id,
        missing_status_id=row.missing_status_id,
        allowed_start_status_ids=allowed_ids,
        packing_after_finish_action=action,  # type: ignore[arg-type]
        auto_actions=aa,
        document_settings=ds,
        fallback_label=fb,
        interface_display=ui,
        multi_parcel=mp,
    )


@router.get("/packing", response_model=WmsPackingSettingsRead)
def get_wms_packing_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
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
    allowed_start_ids = _parse_allowed_start_status_ids(body.allowed_start_status_ids)
    for sid in allowed_start_ids:
        _assert_ui_status(
            db,
            tenant_id=body.tenant_id,
            warehouse_id=wh_id,
            status_id=sid,
            field="allowed_start_status_ids",
        )

    if body.auto_actions.change_order_status and body.packed_status_id is None:
        raise HTTPException(
            status_code=400,
            detail="packed_status_id is required when auto_actions.change_order_status is enabled",
        )

    tid = body.fallback_label.template_id
    if tid is not None:
        from ..domain.label_templates.constants import is_order_replacement_template_type

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
        if not is_order_replacement_template_type(getattr(tpl, "template_type", None)):
            raise HTTPException(
                status_code=400,
                detail=(
                    "fallback_label.template_id must be a template of type "
                    "„Etykieta zastępcza” (order_replacement) in family Zamówienia"
                ),
            )

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
    row.allowed_start_status_ids_json = json.dumps(allowed_start_ids, ensure_ascii=False)
    row.packing_after_finish_action = _normalize_packing_after_finish_action_read(body.packing_after_finish_action)
    row.auto_actions_json = json.dumps(body.auto_actions.model_dump(), ensure_ascii=False)
    row.document_settings_json = json.dumps(body.document_settings.model_dump(), ensure_ascii=False)
    row.fallback_label_json = json.dumps(body.fallback_label.model_dump(), ensure_ascii=False)
    if body.interface_display is not None:
        row.interface_display_json = json.dumps(body.interface_display.model_dump(), ensure_ascii=False)
    if body.multi_parcel is not None:
        row.multi_parcel_json = json.dumps(body.multi_parcel.model_dump(), ensure_ascii=False)
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
        wms_validation_failed_order_ui_status_id=getattr(row, "wms_validation_failed_order_ui_status_id", None),
        disable_auto_detach_missing_orders_from_carts=bool(
            getattr(row, "disable_auto_detach_missing_orders_from_carts", False)
        ),
    )


@router.get("/picking-shortage", response_model=WmsPickingShortageSettingsRead)
def get_wms_picking_shortage_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
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
    _assert_ui_status(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=wh_id,
        status_id=body.wms_validation_failed_order_ui_status_id,
        field="wms_validation_failed_order_ui_status_id",
    )

    row = get_or_create_wms_picking_shortage_settings(db, tenant_id=int(body.tenant_id), warehouse_id=int(wh_id))
    row.shortage_reported_order_ui_status_id = body.shortage_reported_order_ui_status_id
    row.auto_enqueue_braki = bool(body.auto_enqueue_braki)
    row.allow_continue_other_lines_after_shortage = bool(body.allow_continue_other_lines_after_shortage)
    row.priority_after_shortage_resolved = str(body.priority_after_shortage_resolved or "high").strip().lower()
    row.auto_reopen_picking_after_shortage_resolved = bool(body.auto_reopen_picking_after_shortage_resolved)
    row.recovery_completed_order_ui_status_id = body.recovery_completed_order_ui_status_id
    row.wms_validation_failed_order_ui_status_id = body.wms_validation_failed_order_ui_status_id
    row.disable_auto_detach_missing_orders_from_carts = bool(
        getattr(body, "disable_auto_detach_missing_orders_from_carts", False)
    )
    touch_wms_picking_shortage_settings_row(row)
    db.commit()
    db.refresh(row)
    return _shortage_settings_row_to_read(row)


def _parse_picking_list_display(raw: object | None) -> WmsPickingListDisplay:
    defaults = WmsPickingListDisplay().model_dump()
    if not isinstance(raw, str) or not raw.strip():
        return WmsPickingListDisplay()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return WmsPickingListDisplay()
    if not isinstance(parsed, dict):
        return WmsPickingListDisplay()
    return WmsPickingListDisplay.model_validate({**defaults, **parsed})


def _terminal_settings_row_to_read(row) -> WmsPickingTerminalSettingsRead:
    return WmsPickingTerminalSettingsRead(
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        require_product_scan_at_least_once=bool(row.require_product_scan_at_least_once),
        require_location_scan=bool(row.require_location_scan),
        disable_force_location_scan_when_many_locations=bool(
            row.disable_force_location_scan_when_many_locations
        ),
        allow_reserve_location_picking=bool(row.allow_reserve_location_picking),
        allow_products_without_ean=bool(getattr(row, "allow_products_without_ean", False)),
        list_display=_parse_picking_list_display(getattr(row, "list_display_json", None)),
    )


@router.get("/picking-terminal", response_model=WmsPickingTerminalSettingsRead)
def get_wms_picking_terminal_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """Same auth gate as other operable WMS routes (Bearer via require_operable_warehouse)."""
    row = get_or_create_wms_picking_terminal_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    db.commit()
    db.refresh(row)
    return _terminal_settings_row_to_read(row)


@router.post("/picking-terminal", response_model=WmsPickingTerminalSettingsRead)
def save_wms_picking_terminal_settings(
    body: WmsPickingTerminalSettingsSave,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Persist terminal scan policy — authenticated; warehouse access enforced like GET."""
    try:
        wh_id = (
            int(body.warehouse_id)
            if body.warehouse_id is not None
            else resolve_tenant_default_warehouse_id(db, body.tenant_id)
        )
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu") from None
    enforce_warehouse_access(db, user, int(wh_id))

    row = get_or_create_wms_picking_terminal_settings(
        db, tenant_id=int(body.tenant_id), warehouse_id=int(wh_id)
    )
    row.require_product_scan_at_least_once = bool(body.require_product_scan_at_least_once)
    row.require_location_scan = bool(body.require_location_scan)
    row.disable_force_location_scan_when_many_locations = bool(
        body.disable_force_location_scan_when_many_locations
    )
    row.allow_reserve_location_picking = bool(body.allow_reserve_location_picking)
    row.allow_products_without_ean = bool(body.allow_products_without_ean)
    if body.list_display is not None:
        row.list_display_json = json.dumps(body.list_display.model_dump(), ensure_ascii=False)
    touch_wms_picking_terminal_settings_row(row)
    db.commit()
    db.refresh(row)
    return _terminal_settings_row_to_read(row)


def _general_settings_row_to_read(row) -> WmsGeneralSettingsRead:
    return WmsGeneralSettingsRead(
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        font_size_base_px=normalize_wms_font_size_px(row.font_size_base_px),
        font_size_location_px=normalize_wms_font_size_px(row.font_size_location_px),
        font_size_quantity_px=normalize_wms_font_size_px(row.font_size_quantity_px),
    )


@router.get("/general", response_model=WmsGeneralSettingsRead)
def get_wms_general_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """Shared WMS settings for the warehouse (typography for new mode views)."""
    row = get_or_create_wms_general_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    db.commit()
    db.refresh(row)
    return _general_settings_row_to_read(row)


@router.post("/general", response_model=WmsGeneralSettingsRead)
def save_wms_general_settings(
    body: WmsGeneralSettingsSave,
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

    row = get_or_create_wms_general_settings(
        db, tenant_id=int(body.tenant_id), warehouse_id=int(wh_id)
    )
    row.font_size_base_px = normalize_wms_font_size_px(body.font_size_base_px)
    row.font_size_location_px = normalize_wms_font_size_px(body.font_size_location_px)
    row.font_size_quantity_px = normalize_wms_font_size_px(body.font_size_quantity_px)
    touch_wms_general_settings_row(row)
    db.commit()
    db.refresh(row)
    return _general_settings_row_to_read(row)


@router.get("/direct-sales", response_model=DirectSalesSettingsRead)
def get_wms_direct_sales_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    return resolve_direct_sales_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.put("/direct-sales", response_model=DirectSalesSettingsRead)
def put_wms_direct_sales_settings(
    body: DirectSalesSettingsSave,
    db: Session = Depends(get_db),
):
    result = save_direct_sales_settings(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
        settings=body.settings,
    )
    db.commit()
    return result


def _product_validation_row_to_read(row: WmsSettings) -> WmsProductValidationSettingsRead:
    return WmsProductValidationSettingsRead(
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        validation_policy_migrated=bool(getattr(row, "validation_policy_migrated", False)),
        require_dimensions=bool(getattr(row, "validation_require_dimensions", False)),
        require_weight=bool(getattr(row, "validation_require_weight", False)),
        require_batch=bool(getattr(row, "validation_require_batch", False)),
        require_expiry=bool(getattr(row, "validation_require_expiry", False)),
        require_serial=bool(getattr(row, "validation_require_serial", False)),
        require_master_carton=bool(getattr(row, "validation_require_master_carton", False)),
        require_master_carton_ean=bool(getattr(row, "validation_require_master_carton_ean", False)),
        require_master_carton_qty=bool(getattr(row, "validation_require_master_carton_qty", False)),
        require_master_carton_dims=bool(getattr(row, "validation_require_master_carton_dims", False)),
        require_master_carton_weight=bool(getattr(row, "validation_require_master_carton_weight", False)),
    )


@router.get("/product-validation", response_model=WmsProductValidationSettingsRead)
def get_wms_product_validation_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(_wms_settings_wh_dep),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db, tenant_id, warehouse_id)
    return _product_validation_row_to_read(row)


@router.put("/product-validation", response_model=WmsProductValidationSettingsRead)
def save_wms_product_validation_settings(
    body: WmsProductValidationSettingsSave,
    db: Session = Depends(get_db),
):
    try:
        wh_id = (
            body.warehouse_id
            if body.warehouse_id is not None
            else resolve_tenant_default_warehouse_id(db, body.tenant_id)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")
    row = _get_or_create(db, body.tenant_id, wh_id)
    row.validation_require_dimensions = bool(body.require_dimensions)
    row.validation_require_weight = bool(body.require_weight)
    row.validation_require_batch = bool(body.require_batch)
    row.validation_require_expiry = bool(body.require_expiry)
    row.validation_require_serial = bool(body.require_serial)
    row.validation_require_master_carton = bool(body.require_master_carton)
    row.validation_require_master_carton_ean = bool(body.require_master_carton_ean)
    row.validation_require_master_carton_qty = bool(body.require_master_carton_qty)
    row.validation_require_master_carton_dims = bool(body.require_master_carton_dims)
    row.validation_require_master_carton_weight = bool(body.require_master_carton_weight)
    row.validation_policy_migrated = True
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _product_validation_row_to_read(row)


from ..schemas.wms_production_settings import (
    WmsProductionSettingsRead,
    WmsProductionSettingsSave,
    forecast_settings_from_row,
    production_settings_from_row,
    reservation_settings_from_row,
)


def _production_row_to_read(row) -> WmsProductionSettingsRead:
    disp, req = production_settings_from_row(row)
    return WmsProductionSettingsRead(
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        terminal_display=disp,
        terminal_required=req,
        forecast=forecast_settings_from_row(row),
        reservation=reservation_settings_from_row(row),
    )


@router.get("/production", response_model=WmsProductionSettingsRead)
def get_wms_production_settings(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(_wms_settings_wh_dep),
    db: Session = Depends(get_db),
):
    row = _get_or_create(db, tenant_id, warehouse_id)
    return _production_row_to_read(row)


@router.put("/production", response_model=WmsProductionSettingsRead)
def save_wms_production_settings(
    body: WmsProductionSettingsSave,
    db: Session = Depends(get_db),
):
    try:
        wh_id = (
            body.warehouse_id
            if body.warehouse_id is not None
            else resolve_tenant_default_warehouse_id(db, body.tenant_id)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")
    row = _get_or_create(db, body.tenant_id, wh_id)
    row.production_terminal_display_json = json.dumps(body.terminal_display.model_dump())
    row.production_terminal_required_json = json.dumps(body.terminal_required.model_dump())
    row.production_forecast_json = json.dumps(body.forecast.model_dump())
    row.production_reservation_json = json.dumps(body.reservation.model_dump())
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _production_row_to_read(row)
