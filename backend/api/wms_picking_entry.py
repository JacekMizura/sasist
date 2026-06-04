"""WMS picking — entry: workload (legacy) + flow: statusy z konfiguracji i normalizowany config."""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..auth.deps import get_current_user, get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..models.order_ui_status import OrderUiStatus
from ..models.picking_config import PickingConfig
from ..schemas.order import OrderUiMainGroup
from ..schemas.wms_picking_entry import WmsPickingStatusWorkloadResponse, WmsPickingStatusWorkloadRow
from ..schemas.picking_config import PickingConfigListResponse, PickingConfigOrderSort, PickingConfigPickUnit
from ..schemas.wms_picking_flow import (
    PickingFlowMode,
    PickingFlowStrategy,
    WmsPickingConfiguredStatusItem,
    WmsPickingConfigReplaceBody,
    WmsPickingFlowConfigRead,
    WmsPickingFlowLimits,
)
from ..schemas.wms_picking_products import (
    WmsPickingFinalizeCartResponse,
    WmsPickingOrderTypeFilter,
    WmsPickingProductDetailResponse,
    WmsPickingProductLinesResponse,
    WmsPickingQuickPickBody,
    WmsPickingRecoveryFinalizeBody,
    WmsPickingRecoveryFinalizeResponse,
    WmsPickingReportShortageBody,
    WmsPickingReportShortageResponse,
    WmsPickingResolveCartResponse,
)
from ..services.cart_display import cart_display_name_for_wms
from ..services.picking_config_service import (
    list_picking_configs,
    picking_config_to_read,
    replace_all_picking_configs_for_warehouse,
)
from ..services.wms_status_tile_config import wms_tile_cart_config
from ..services.tenant_default_warehouse import resolve_quick_pick_warehouse_for_tenant
from ..services.warehouse_service import WarehouseService
from ..services.wms_picking_product_list_service import (
    build_wms_picking_product_detail,
    build_wms_picking_product_lines,
    finalize_wms_picking_cart,
    finalize_wms_recovery_picking_cart,
    record_wms_quick_pick,
    report_wms_picking_product_shortage,
    resolve_default_bulk_cart_for_warehouse,
    resolve_wms_picking_cart_row,
)
from ..services.wms_recovery_pick_service import get_open_recovery_task_for_order
from ..services.wms_audit_service import complete_wms_operation_session, touch_wms_operation_session
from ..utils.ui_status_color import normalize_stored_color

router = APIRouter(prefix="/wms", tags=["WMS picking"])

logger = logging.getLogger(__name__)

_GROUP_ORDER: tuple[str, ...] = ("NEW", "IN_PROGRESS", "DONE")
_VALID_GROUP = frozenset(_GROUP_ORDER)


def _picking_session_progress_metadata(resp: WmsPickingProductLinesResponse, *, source_status_id: int, order_type: str) -> dict:
    total = round(sum(float(p.total_quantity or 0) for p in resp.products), 6)
    picked = round(sum(float(p.picked_quantity or 0) for p in resp.products), 6)
    missing = round(sum(float(p.missing_quantity or 0) for p in resp.products), 6)
    return {
        "screen": "picking_product_lines",
        "source_status_id": int(source_status_id),
        "order_type": str(order_type),
        "cohort_order_count": int(resp.cohort_order_count or 0),
        "progress_done": picked,
        "progress_total": total,
        "missing_quantity": missing,
        "progress_percent": int(round((picked / total) * 100)) if total > 0 else 0,
    }


def _norm_group(raw: object) -> str:
    s = str(raw or "NEW").strip().upper()
    return s if s in _VALID_GROUP else "NEW"


def _db_mode_to_flow_mode(raw: str | None) -> PickingFlowMode:
    """Mapowanie DB ``bulk|scanned|baskets|mobile`` → kontrakt UI."""
    m = (raw or "").strip().lower()
    if m == "bulk":
        return "cart_no_scan"
    if m == "scanned":
        return "cart_scan"
    if m == "baskets":
        return "baskets"
    if m == "mobile":
        return "mobile"
    logger.warning("Unknown picking_config mode %r — default cart_no_scan", raw)
    return "cart_no_scan"


def _db_strategy_to_flow_strategy(raw: str | None) -> PickingFlowStrategy:
    s = (raw or "").strip().lower()
    if s == "orders":
        return "by_date"
    if s == "locations":
        return "by_location"
    logger.warning("Unknown picking_config strategy %r — default by_date", raw)
    return "by_date"


def _flow_strategy_from_picking_row(row: PickingConfig) -> PickingFlowStrategy:
    """Strategia UI (kolejność zadań) z ``pick_unit`` + ``order_sort``; fallback na samą kolumnę ``strategy``."""
    pu = (getattr(row, "pick_unit", None) or "").strip().lower()
    if not pu:
        return _db_strategy_to_flow_strategy(getattr(row, "strategy", None))
    osrt = (getattr(row, "order_sort", None) or "date").strip().lower()
    if pu == "products":
        return "by_location"
    if osrt == "location":
        return "by_location"
    return "by_date"


def _norm_pick_unit_for_api(row: PickingConfig) -> str:
    pu = (getattr(row, "pick_unit", None) or "").strip().lower()
    if pu in ("orders", "products"):
        return pu
    s = (getattr(row, "strategy", None) or "").strip().lower()
    return "products" if s == "locations" else "orders"


def _norm_order_sort_for_api(row: PickingConfig) -> str:
    o = (getattr(row, "order_sort", None) or "date").strip().lower()
    if o in ("date", "location", "courier"):
        return o
    return "date"


def _resolve_source_order_ui_status(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    picking_row: PickingConfig,
) -> OrderUiStatus | None:
    st = picking_row.source_status
    if st is not None:
        return st
    return (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == int(picking_row.source_status_id),
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .first()
    )


@router.post("/picking/config", response_model=PickingConfigListResponse)
def post_picking_config_replace(
    body: WmsPickingConfigReplaceBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Zastępuje całą konfigurację zbierania dla magazynu (transakcja: DELETE istniejących + INSERT nowych).
    Ciało: pełna lista reguł — minimum jeden ``source_status_id`` (status do zbierania).
    """
    try:
        replace_all_picking_configs_for_warehouse(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            items=body.items,
        )
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_picking_config_replace: database error")
        raise HTTPException(status_code=503, detail="Zapis konfiguracji nie powiódł się.") from None
    rows = list_picking_configs(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    return PickingConfigListResponse(items=[picking_config_to_read(r) for r in rows])


@router.get("/picking/configured-statuses", response_model=list[WmsPickingConfiguredStatusItem])
def get_picking_configured_statuses(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Lista statusów **do zbierania** wyłącznie z ``picking_config.source_status_id``
    (etykiety z ``order_ui_statuses``). Bez rekordów konfiguracji lista jest pusta.
    """
    try:
        pc_rows: List[PickingConfig] = (
            db.query(PickingConfig)
            .options(joinedload(PickingConfig.source_status))
            .filter(
                PickingConfig.tenant_id == int(tenant_id),
                PickingConfig.warehouse_id == int(warehouse_id),
            )
            .order_by(PickingConfig.id.asc())
            .all()
        )
        valid: List[tuple[PickingConfig, OrderUiStatus]] = []
        for pc in pc_rows:
            st = _resolve_source_order_ui_status(db, tenant_id, warehouse_id, pc)
            if st is None:
                logger.warning(
                    "picking_config id=%s: brak order_ui_status dla source_status_id=%s",
                    pc.id,
                    pc.source_status_id,
                )
                continue
            valid.append((pc, st))

        status_ids = [int(st.id) for _, st in valid]
        counts_map: Dict[int, int] = {}
        if status_ids:
            cnt_rows = (
                db.query(Order.order_ui_status_id, func.count(Order.id))
                .filter(
                    Order.tenant_id == int(tenant_id),
                    Order.warehouse_id == int(warehouse_id),
                    Order.order_ui_status_id.in_(status_ids),
                )
                .group_by(Order.order_ui_status_id)
                .all()
            )
            counts_map = {int(sid): int(n) for sid, n in cnt_rows}

        out: List[WmsPickingConfiguredStatusItem] = []
        for pc, st in valid:
            gkey = _norm_group(st.main_group)
            req, ct = wms_tile_cart_config(getattr(pc, "single_mode", None), getattr(pc, "multi_mode", None))
            out.append(
                WmsPickingConfiguredStatusItem(
                    source_status_id=int(st.id),
                    status=str(st.name),
                    color=normalize_stored_color(st.color),
                    main_group=cast(OrderUiMainGroup, gkey),
                    order_count=int(counts_map.get(int(st.id), 0)),
                    require_cart=req,
                    cart_type=ct,
                )
            )
        gidx = {g: i for i, g in enumerate(_GROUP_ORDER)}
        out.sort(key=lambda x: (gidx.get(str(x.main_group), 0), x.status.lower(), x.source_status_id))
        return out
    except SQLAlchemyError:
        logger.exception("get_picking_configured_statuses: database error")
        return []


@router.get("/picking/config", response_model=WmsPickingFlowConfigRead)
def get_picking_flow_config(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    status: int = Query(..., ge=1, description="source_status_id — ID statusu panelu z konfiguracji"),
    db: Session = Depends(get_db),
):
    """Konfiguracja zbierania tylko przy istniejącym rekordzie ``picking_config``."""
    row = (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
            PickingConfig.source_status_id == int(status),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Brak konfiguracji zbierania dla tego statusu.")
    sid_short = getattr(row, "status_on_shortage_id", None)
    return WmsPickingFlowConfigRead(
        source_status_id=int(row.source_status_id),
        target_status_id=int(row.target_status_id),
        status_on_shortage_id=int(sid_short) if sid_short is not None else None,
        single_mode=_db_mode_to_flow_mode(row.single_mode),
        multi_mode=_db_mode_to_flow_mode(row.multi_mode),
        strategy=_flow_strategy_from_picking_row(row),
        pick_unit=cast(PickingConfigPickUnit, _norm_pick_unit_for_api(row)),
        order_sort=cast(PickingConfigOrderSort, _norm_order_sort_for_api(row)),
        limits=WmsPickingFlowLimits(
            single=row.max_single_orders,
            multi=row.max_multi_orders,
        ),
    )


@router.get("/picking/status-workload", response_model=WmsPickingStatusWorkloadResponse)
def get_picking_status_workload(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Per panel `order_ui_status`: total orders and subset with `cart_id` set (picked / assigned in progress).
    Same status definitions as office order panel; sorted by total_orders DESC for UI.
    """
    try:
        statuses: List[OrderUiStatus] = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.tenant_id == tenant_id,
                OrderUiStatus.warehouse_id == warehouse_id,
            )
            .order_by(OrderUiStatus.main_group.asc(), OrderUiStatus.sort_order.asc(), OrderUiStatus.id.asc())
            .all()
        )

        total_rows = (
            db.query(Order.order_ui_status_id, func.count(Order.id))
            .filter(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.order_ui_status_id.isnot(None),
            )
            .group_by(Order.order_ui_status_id)
            .all()
        )
        total_map: Dict[int, int] = {int(uid): int(c) for uid, c in total_rows if uid is not None}

        inprog_rows = (
            db.query(Order.order_ui_status_id, func.count(Order.id))
            .filter(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.order_ui_status_id.isnot(None),
                Order.cart_id.isnot(None),
            )
            .group_by(Order.order_ui_status_id)
            .all()
        )
        inprog_map: Dict[int, int] = {int(uid): int(c) for uid, c in inprog_rows if uid is not None}

        out: List[WmsPickingStatusWorkloadRow] = []
        for st in statuses:
            gkey = _norm_group(st.main_group)
            sid = int(st.id)
            out.append(
                WmsPickingStatusWorkloadRow(
                    order_ui_status_id=sid,
                    name=st.name,
                    color=normalize_stored_color(st.color),
                    main_group=cast(OrderUiMainGroup, gkey),
                    sort_order=int(st.sort_order or 0),
                    total_orders=total_map.get(sid, 0),
                    in_progress_orders=inprog_map.get(sid, 0),
                )
            )

        gidx = {g: i for i, g in enumerate(_GROUP_ORDER)}
        out.sort(
            key=lambda r: (
                -r.total_orders,
                -r.in_progress_orders,
                gidx.get(r.main_group, 0),
                r.sort_order,
                r.order_ui_status_id,
            )
        )
        return WmsPickingStatusWorkloadResponse(statuses=out)
    except SQLAlchemyError:
        logger.exception("get_picking_status_workload: database error")
        return WmsPickingStatusWorkloadResponse(statuses=[])


@router.get("/picking/resolve-cart", response_model=WmsPickingResolveCartResponse)
def get_picking_resolve_cart(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    cart_code: str = Query(..., min_length=1, description="Kod zeskanowany lub nazwa wózka"),
    db: Session = Depends(get_db),
):
    """Rozpoznanie wózka na początku sesji — zwraca ``cart_id`` do zapisu w stanie klienta."""
    try:
        cart = resolve_wms_picking_cart_row(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            cart_code=cart_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    code_str = str(getattr(cart, "code", None) or cart.barcode or "").strip() or str(cart.id)
    ct = getattr(cart, "type", None)
    cart_type_str = str(ct.value) if ct is not None and hasattr(ct, "value") else (str(ct) if ct is not None else None)
    return WmsPickingResolveCartResponse(
        cart_id=int(cart.id),
        name=str(cart.name or ""),
        code=code_str,
        barcode=str(cart.barcode) if cart.barcode else None,
        cart_type=cart_type_str,
        display_name=cart_display_name_for_wms(cart),
    )


@router.get("/picking/default-cart", response_model=WmsPickingResolveCartResponse)
def get_picking_default_cart(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Domyślny wózek BULK dla magazynu (sesja bez skanu kodu)."""
    try:
        cart = resolve_default_bulk_cart_for_warehouse(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    code_str = str(getattr(cart, "code", None) or cart.barcode or "").strip() or str(cart.id)
    ct = getattr(cart, "type", None)
    cart_type_str = str(ct.value) if ct is not None and hasattr(ct, "value") else (str(ct) if ct is not None else None)
    return WmsPickingResolveCartResponse(
        cart_id=int(cart.id),
        name=str(cart.name or ""),
        code=code_str,
        barcode=str(cart.barcode) if cart.barcode else None,
        cart_type=cart_type_str,
        display_name=cart_display_name_for_wms(cart),
    )


@router.get("/picking/product-lines", response_model=WmsPickingProductLinesResponse)
def get_picking_product_lines(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(..., description="single | multi | all"),
    cart_id: int | None = Query(
        None,
        ge=1,
        description="Sesja wózka: uwzględnij robocze Pick (picked_at NULL) przypisane do tego wózka w liczbie zebranych.",
    ),
    recovery_order_id: int | None = Query(
        None,
        ge=1,
        description="Dogrywka recovery: tylko to zamówienie (wymaga otwartego zadania recovery_pick).",
    ),
    order_ids: list[int] | None = Query(
        None,
        description="Opcjonalny zakres zadania kierownika — tylko wskazane zamówienia.",
    ),
    order_ids_csv: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """Agregat produktów do zbiórki (kolejność wg pierwszej lokalizacji na trasie — jak routing)."""
    if recovery_order_id is not None:
        if get_open_recovery_task_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(recovery_order_id),
        ) is None:
            raise HTTPException(status_code=404, detail="Brak otwartej dogrywki zbierki dla tego zamówienia.")
        resp = build_wms_picking_product_lines(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=order_type,
            cart_id=cart_id,
            fixed_order_ids=[int(recovery_order_id)],
        )
        if current_user is not None and current_user.id is not None:
            touch_wms_operation_session(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                session_kind="picking_recovery_active",
                operator_user_id=int(current_user.id),
                cart_id=cart_id,
                order_id=int(recovery_order_id),
                metadata=_picking_session_progress_metadata(resp, source_status_id=source_status_id, order_type=order_type),
            )
            db.commit()
        return resp
    csv_ids = [
        int(v)
        for v in (order_ids_csv or "").replace(";", ",").split(",")
        if v.strip().isdigit() and int(v.strip()) > 0
    ]
    fixed_order_ids = ([int(v) for v in (order_ids or []) if int(v) > 0] + csv_ids) or None
    resp = build_wms_picking_product_lines(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=order_type,
        cart_id=cart_id,
        fixed_order_ids=fixed_order_ids,
    )
    if current_user is not None and current_user.id is not None:
        touch_wms_operation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_kind="picking_active",
            operator_user_id=int(current_user.id),
            cart_id=cart_id,
            metadata=_picking_session_progress_metadata(resp, source_status_id=source_status_id, order_type=order_type),
        )
        db.commit()
    return resp


@router.get("/picking/product-lines/detail", response_model=WmsPickingProductDetailResponse)
def get_picking_product_detail(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    product_id: int = Query(..., ge=1),
    cart_id: int | None = Query(
        None,
        ge=1,
        description="Sesja WMS: zamówienia przypisane do tego wózka lub bez wózka (FIFO); brak = pusta lista zamówień",
    ),
    recovery_order_id: int | None = Query(
        None,
        ge=1,
        description="Dogrywka recovery — ten sam filtr co lista produktów.",
    ),
    order_ids: list[int] | None = Query(
        None,
        description="Opcjonalny zakres zadania kierownika — tylko wskazane zamówienia.",
    ),
    order_ids_csv: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    fixed: list[int] | None = None
    if recovery_order_id is not None:
        if get_open_recovery_task_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(recovery_order_id),
        ) is None:
            raise HTTPException(status_code=404, detail="Brak otwartej dogrywki zbierki dla tego zamówienia.")
        fixed = [int(recovery_order_id)]
    elif order_ids:
        fixed = [int(v) for v in order_ids if int(v) > 0] or None
    elif order_ids_csv:
        fixed = [int(v) for v in order_ids_csv.replace(";", ",").split(",") if v.strip().isdigit() and int(v.strip()) > 0] or None
    row = build_wms_picking_product_detail(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=order_type,
        product_id=product_id,
        cart_id=cart_id,
        fixed_order_ids=fixed,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Produkt nie występuje na liście zbiórki.")
    if current_user is not None and current_user.id is not None:
        touch_wms_operation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_kind="picking_recovery_active" if recovery_order_id is not None else "picking_active",
            operator_user_id=int(current_user.id),
            cart_id=cart_id,
            order_id=int(recovery_order_id) if recovery_order_id is not None else None,
            metadata={
                "screen": "picking_product_detail",
                "source_status_id": int(source_status_id),
                "order_type": str(order_type),
                "active_product_id": int(product_id),
            },
        )
        db.commit()
    return row


@router.post("/picking/quick-pick")
def post_picking_quick_pick(
    body: WmsPickingQuickPickBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(
        default=None,
        description="Opcjonalne; gdy brak lub brak dostępu — wybór z tenant_warehouses (jedyny magazyn lub domyślny).",
    ),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Zapis postępu: rekord Pick (roboczy, picked_at po finalizacji wózka) — FIFO po zamówieniach w kohortcie."""
    tid = int(tenant_id)
    logger.info(
        "post_picking_quick_pick: tenant_id=%s warehouse_id=%s",
        tid,
        warehouse_id,
    )
    ws = WarehouseService(db)
    req_wh: int | None = int(warehouse_id) if warehouse_id is not None else None
    if req_wh is not None and req_wh < 1:
        req_wh = None

    auto_selected = False
    if req_wh is not None and ws.can_tenant_access_warehouse(tid, req_wh):
        effective_wh = req_wh
    else:
        try:
            effective_wh = resolve_quick_pick_warehouse_for_tenant(db, tid)
            auto_selected = True
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        logger.info("Auto-selected warehouse_id=%s", effective_wh)

    if body.recovery_order_id is None or int(body.recovery_order_id) < 1:
        st = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.id == int(source_status_id),
                OrderUiStatus.tenant_id == tid,
                OrderUiStatus.warehouse_id == int(effective_wh),
            )
            .first()
        )
        if not st:
            return JSONResponse(
                status_code=404,
                content={
                    "error": (
                        f"Status panelu id={source_status_id} nie istnieje dla "
                        f"tenant_id={tid}, warehouse_id={effective_wh}."
                    )
                },
            )

    try:
        oid, oiid = record_wms_quick_pick(
            db,
            tenant_id=tid,
            warehouse_id=effective_wh,
            source_status_id=source_status_id,
            order_type=order_type,
            product_id=body.product_id,
            location_id=body.location_id,
            quantity=body.quantity,
            cart_id=body.cart_id,
            fixed_order_id=int(body.recovery_order_id) if body.recovery_order_id is not None and int(body.recovery_order_id) > 0 else None,
            operator_user_id=int(current_user.id),
        )
        if body.cart_id is not None:
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tid,
                warehouse_id=effective_wh,
                source_status_id=source_status_id,
                order_type=order_type,
                cart_id=body.cart_id,
                fixed_order_ids=[int(body.recovery_order_id)]
                if body.recovery_order_id is not None and int(body.recovery_order_id) > 0
                else None,
            )
            touch_wms_operation_session(
                db,
                tenant_id=tid,
                warehouse_id=effective_wh,
                session_kind="picking_recovery_active"
                if body.recovery_order_id is not None and int(body.recovery_order_id) > 0
                else "picking_active",
                operator_user_id=int(current_user.id),
                cart_id=body.cart_id,
                order_id=int(body.recovery_order_id)
                if body.recovery_order_id is not None and int(body.recovery_order_id) > 0
                else None,
                metadata=_picking_session_progress_metadata(resp, source_status_id=source_status_id, order_type=order_type),
            )
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_picking_quick_pick")
        raise HTTPException(status_code=503, detail="Zapis kompletacji nie powiódł się.") from None
    except Exception:
        db.rollback()
        logger.exception("quick-pick failed")
        return JSONResponse(
            status_code=500,
            content={"error": "Wewnętrzny błąd serwera"},
        )
    return {"ok": True, "order_id": oid, "order_item_id": oiid}


@router.post("/picking/report-shortage", response_model=WmsPickingReportShortageResponse)
def post_picking_report_shortage(
    body: WmsPickingReportShortageBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """
    Zgłoszenie braku w trakcie sesji: zapis na linii (brak / status linii), bez zmiany statusu panelu zamówienia
    i bez kolejki Braki — to następuje dopiero przy ``POST /wms/picking/finalize-cart``.
    """
    import traceback

    payload_dump = body.model_dump()
    logger.info(
        "[report_shortage] ENTER endpoint payload=%s tenant_id=%s warehouse_id=%s user=%s",
        payload_dump,
        tenant_id,
        warehouse_id,
        getattr(current_user, "id", None),
    )
    try:
        out = report_wms_picking_product_shortage(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=order_type,
            product_id=body.product_id,
            location_id=body.location_id,
            missing_qty=body.missing_qty,
            cart_id=body.cart_id,
            ui_order_ids=body.order_ids,
            recovery_order_id=body.recovery_order_id,
            order_item_id=body.order_item_id,
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
        if current_user is not None and current_user.id is not None and body.cart_id is not None:
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=order_type,
                cart_id=body.cart_id,
            )
            touch_wms_operation_session(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                session_kind="picking_active",
                operator_user_id=int(current_user.id),
                cart_id=body.cart_id,
                metadata=_picking_session_progress_metadata(resp, source_status_id=source_status_id, order_type=order_type),
            )
        db.commit()
    except ValueError as e:
        db.rollback()
        logger.warning(
            "[report_shortage] REJECT endpoint reason=%s payload=%s traceback=%s",
            str(e),
            payload_dump,
            traceback.format_exc(),
        )
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError:
        db.rollback()
        logger.error(
            "[report_shortage] ERROR payload=%s traceback=%s",
            payload_dump,
            traceback.format_exc(),
        )
        raise HTTPException(status_code=503, detail="Zgłoszenie braku nie powiodło się.") from None
    return WmsPickingReportShortageResponse(**out)


@router.post("/picking/recovery/finalize", response_model=WmsPickingRecoveryFinalizeResponse)
def post_picking_recovery_finalize(
    body: WmsPickingRecoveryFinalizeBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Domknięcie dogrywki zbierki: Picki na wózku dla jednego zamówienia + status OMS wg ustawień braków / pakowania."""
    logger.info(
        "[recovery.finalize] ENTER tenant=%s wh=%s order_id=%s cart_id=%s user=%s",
        tenant_id,
        warehouse_id,
        body.order_id,
        body.cart_id,
        getattr(current_user, "id", None),
    )
    logger.info("[recovery.finalize] payload=%s", body.model_dump())
    try:
        out = finalize_wms_recovery_picking_cart(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(body.order_id),
            cart_id=int(body.cart_id),
            operator_user_id=int(current_user.id),
            performed_by=current_user,
        )
        logger.info(
            "[recovery.finalize] recovery_id=order:%s lines_finalize=%s",
            int(body.order_id),
            out,
        )
        complete_wms_operation_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_kind="picking_recovery_active",
            operator_user_id=int(current_user.id),
            cart_id=int(body.cart_id),
            order_id=int(body.order_id),
            completed_reason="finished",
            metadata={"order_id": int(body.order_id), "cart_id": int(body.cart_id)},
        )
        from ..services.order_fulfillment_recompute import recalculate_order_shortage_state
        from ..services.wms_audit_service import emit_recovery_finished

        recalculate_order_shortage_state(db, int(body.order_id), commit=False)
        emit_recovery_finished(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(body.order_id),
            cart_id=int(body.cart_id),
            operator_user_id=int(current_user.id),
        )
        db.commit()
    except ValueError as e:
        db.rollback()
        logger.warning("[recovery.finalize] validation order_id=%s: %s", body.order_id, e)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception(
            "[recovery.finalize] ERROR traceback order_id=%s cart_id=%s",
            body.order_id,
            body.cart_id,
        )
        raise HTTPException(
            status_code=503,
            detail=f"Zakończenie dogrywki nie powiodło się (baza danych): {e.__class__.__name__}",
        ) from e
    except Exception as e:
        db.rollback()
        logger.exception(
            "[recovery.finalize] ERROR traceback order_id=%s cart_id=%s",
            body.order_id,
            body.cart_id,
        )
        msg = str(e).strip() or e.__class__.__name__
        raise HTTPException(
            status_code=503,
            detail=f"Zakończenie dogrywki nie powiodło się: {msg}",
        ) from e
    return WmsPickingRecoveryFinalizeResponse(**out)


@router.post("/picking/finalize-cart", response_model=WmsPickingFinalizeCartResponse)
def post_picking_finalize_cart(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    cart_id: int = Query(
        ...,
        ge=1,
        description="Aktywny wózek z sesji zbierania (ten sam ID co po skanie lub z domyślnego wózka BULK).",
    ),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Zakończenie zbiórki: zdejmowanie ilości z Inventory wg Pick sesji; per zamówienie ``fulfillment_state``
    (``READY_TO_PACK`` / ``NEEDS_DECISION`` / ``MISSING``) i status panelu z konfiguracji; wózek ``cart_id`` sesji.
    """
    try:
        out = finalize_wms_picking_cart(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=order_type,
            cart_id=cart_id,
            operator_user_id=int(current_user.id),
            performed_by=current_user,
        )
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_picking_finalize_cart")
        raise HTTPException(status_code=503, detail="Zakończenie zbiórki nie powiodło się.") from None
    return WmsPickingFinalizeCartResponse(**out)
