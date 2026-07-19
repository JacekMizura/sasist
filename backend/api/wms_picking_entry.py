"""WMS picking — entry: workload (legacy) + flow: statusy z konfiguracji i normalizowany config."""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..auth.deps import get_current_user, get_optional_current_user
from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_warehouse_scoped_entity_access,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
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
    WmsPickingCancelPendingBasketPutBody,
    WmsPickingConfirmBasketPutBody,
    WmsPickingEmptyLocationBody,
    WmsPickingEmptyLocationResponse,
    WmsPickingFinalizeCartResponse,
    WmsPickingOrderTypeFilter,
    WmsPickingProductDetailResponse,
    WmsPickingProductLinesResponse,
    WmsPickingQuickPickBody,
    WmsPickingRecoveryFinalizeBody,
    WmsPickingRecoveryFinalizeResponse,
    WmsPickingReportShortageBody,
    WmsPickingReportShortageResponse,
    WmsPickingBulkReportShortageBody,
    WmsPickingBulkReportShortageResponse,
    WmsPickingResolveCartResponse,
    WmsPickingUndoPickBody,
    WmsPickingUndoPickResponse,
    WmsRecoveryBatchCreateBody,
    WmsRecoveryBatchSessionRead,
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
    PickingFinalizeError,
    bootstrap_start_picking_if_needed,
    build_wms_picking_product_detail,
    build_wms_picking_product_lines,
    count_assignable_orders_for_picking_statuses,
    finalize_wms_picking_cart,
    finalize_wms_recovery_picking_cart,
    record_wms_quick_pick,
    report_wms_picking_product_shortage,
    resolve_default_bulk_cart_for_warehouse,
    resolve_wms_picking_cart_row,
)
from ..services.wms_recovery_pick_service import get_open_recovery_task_for_order, prepare_recovery_picking_for_order
from ..services.wms_audit_service import (
    complete_wms_operation_session,
    touch_wms_operation_session,
    WmsOperationSessionNotFound,
)
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


def _attach_basket_put_list_projection(
    db: Session,
    resp: WmsPickingProductLinesResponse,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int | None,
    operator_user_id: int | None,
) -> WmsPickingProductLinesResponse:
    """MULTI pending banner on product list — pending ≠ series."""
    if cart_id is None or int(cart_id) <= 0:
        return resp
    try:
        from ..models.cart import Cart
        from ..services.wms_basket_put import project_basket_put_for_product_lines

        cart = (
            db.query(Cart)
            .filter(
                Cart.id == int(cart_id),
                Cart.tenant_id == int(tenant_id),
                Cart.warehouse_id == int(warehouse_id),
            )
            .first()
        )
        proj = project_basket_put_for_product_lines(
            db,
            cart=cart,
            tenant_id=int(tenant_id),
            operator_user_id=operator_user_id,
        )
        resp.requires_basket_put_confirm = bool(proj.get("requires_basket_put_confirm"))
        resp.basket_put_pending = proj.get("basket_put_pending")
        resp.basket_put_active_series = proj.get("basket_put_active_series")
    except Exception:
        logger.exception("attach basket_put list projection failed cart_id=%s", cart_id)
    return resp


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
    if m == "consolidation_rack":
        return "consolidation_rack"
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
    warehouse_id: int = Depends(require_operable_warehouse),
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
    warehouse_id: int = Depends(require_operable_warehouse),
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
        # PRELIMINARY SSOT: eligibility + wolne cart_id (nie raw status; nie WMS validation gate).
        counts_map: Dict[int, int] = (
            count_assignable_orders_for_picking_statuses(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_status_ids=status_ids,
            )
            if status_ids
            else {}
        )

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
    warehouse_id: int = Depends(require_operable_warehouse),
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
    warehouse_id: int = Depends(require_operable_warehouse),
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

        from ..services.wms_picking_product_list_service import _picking_queue_eligibility_clauses

        queue_eligible = _picking_queue_eligibility_clauses(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
        )
        total_rows = (
            db.query(Order.order_ui_status_id, func.count(Order.id))
            .filter(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.order_ui_status_id.isnot(None),
                *queue_eligible,
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
                *queue_eligible,
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


def _safe_touch_picking_session(**kwargs):
    """touch nigdy nie tworzy — brak sesji = 409 SessionNotFound."""
    try:
        return touch_wms_operation_session(**kwargs)
    except WmsOperationSessionNotFound as e:
        raise HTTPException(
            status_code=409,
            detail={"code": "SessionNotFound", "error": e.message},
        ) from e


@router.post("/picking/claim-cart")
def post_picking_claim_cart(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    cart_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """AVAILABLE → ASSIGNED (wybór wózka bez zamówień)."""
    from ..models.cart import Cart
    from ..services.cart_picking_lifecycle_service import (
        CartAlreadyClaimedError,
        CartLifecycleError,
        claim_cart,
        get_cart_status,
    )

    cart = (
        db.query(Cart)
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        from ..services.wms_http_messages import raise_wms_cart_not_found

        raise_wms_cart_not_found()
    try:
        claim_cart(db, cart=cart, operator_user_id=int(current_user.id))
        db.commit()
    except CartAlreadyClaimedError as e:
        # Zachowaj event audytowy „Wykryto próbę podwójnej rezerwacji”
        db.commit()
        from ..services.wms_http_messages import raise_wms_from_lifecycle
        from ..services.cart_picking_lifecycle_service import get_cart_status

        op_name = None
        started = None
        aid = getattr(cart, "assigned_user_id", None)
        if aid:
            from ..models.app_user import AppUser

            u = db.query(AppUser).filter(AppUser.id == int(aid)).first()
            if u is not None:
                op_name = (
                    getattr(u, "display_name", None)
                    or getattr(u, "full_name", None)
                    or getattr(u, "email", None)
                    or f"Operator #{aid}"
                )
        ca = getattr(cart, "claimed_at", None) or getattr(cart, "started_at", None)
        if ca is not None:
            try:
                started = ca.strftime("%H:%M")
            except Exception:
                started = str(ca)
        raise_wms_from_lifecycle(
            e,
            extra={
                "operator_name": op_name,
                "started_at": started,
                "lifecycle_state": get_cart_status(cart).value,
            },
        )
    except CartLifecycleError as e:
        db.rollback()
        from ..services.wms_http_messages import raise_wms_from_lifecycle

        raise_wms_from_lifecycle(e)
    return {
        "cart_id": int(cart.id),
        "status": get_cart_status(cart).value,
        "assigned_user_id": cart.assigned_user_id,
    }


@router.post("/picking/heartbeat")
def post_picking_heartbeat(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    cart_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Heartbeat PICKING — aktualizuje wyłącznie last_activity_at.
    Nigdy nie tworzy sesji, nie zmienia statusów, nie przypisuje zamówień.
    Brak sesji → 409 SessionNotFound.
    """
    from ..models.cart import Cart
    from ..services.cart_picking_lifecycle_service import get_cart_status, refresh_current_task_progress
    from ..models.enums import CartStatus

    cart = (
        db.query(Cart)
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono wózka.")

    sess = _safe_touch_picking_session(
        db=db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_kind="picking_active",
        operator_user_id=int(current_user.id),
        cart_id=int(cart_id),
    )
    # Odśwież current_task (picked/remaining) bez historii / statusu
    if get_cart_status(cart) == CartStatus.PICKING:
        refresh_current_task_progress(db, cart)
    db.commit()
    return {
        "cart_id": int(cart_id),
        "session_id": int(sess.id) if sess is not None else None,
        "last_activity_at": (
            sess.last_activity_at.isoformat(sep=" ", timespec="seconds")
            if sess is not None and getattr(sess, "last_activity_at", None)
            else None
        ),
        "status": get_cart_status(cart).value,
    }


@router.post("/picking/start-cartless")
def post_picking_start_cartless(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    order_ids: list[int] | None = Query(None),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Cartless picking (DB bulk / UI cart_no_scan): sesja bez WarehouseCart.
    order.cart_id pozostaje NULL; scope = picking_session_id.
    """
    from ..services.wms_cartless_picking import start_cartless_picking
    from ..services.wms_cartless_picking.start_service import CartlessPickingError

    try:
        sess, operator_message = start_cartless_picking(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=str(order_type),
            operator_user_id=int(current_user.id),
            fixed_order_ids=[int(x) for x in order_ids] if order_ids else None,
        )
        db.commit()
    except CartlessPickingError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail={"code": e.code, "error": e.message}) from e
    except Exception:
        logger.exception("START_CARTLESS FAIL")
        db.rollback()
        raise

    return {
        "session_id": int(sess.id) if sess is not None else None,
        "cart_id": None,
        "status": "PICKING" if sess is not None else None,
        "operator_user_id": int(current_user.id),
        "operator_message": operator_message,
        "cartless": True,
    }


@router.post("/picking/finalize-cartless")
def post_picking_finalize_cartless(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    picking_session_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from ..services.wms_cartless_picking import finalize_cartless_picking_session
    from ..services.wms_picking_product_list_service import PickingFinalizeError

    try:
        out = finalize_cartless_picking_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=order_type,
            picking_session_id=int(picking_session_id),
            operator_user_id=int(current_user.id),
            performed_by=current_user,
        )
        db.commit()
        return out
    except PickingFinalizeError as e:
        db.rollback()
        raise HTTPException(
            status_code=int(getattr(e, "http_status", 409) or 409),
            detail={"code": getattr(e, "code", None), "error": str(e)},
        ) from e
    except Exception:
        logger.exception("FINALIZE_CARTLESS FAIL session_id=%s", picking_session_id)
        db.rollback()
        raise


@router.post("/picking/cancel-cartless-session")
def post_picking_cancel_cartless_session(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    picking_session_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from ..services.wms_cartless_picking import cancel_cartless_picking_session

    try:
        out = cancel_cartless_picking_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_id=int(picking_session_id),
            operator_user_id=int(current_user.id),
        )
        db.commit()
        return out
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception:
        logger.exception("CANCEL_CARTLESS FAIL session_id=%s", picking_session_id)
        db.rollback()
        raise


@router.post("/picking/heartbeat-cartless")
def post_picking_heartbeat_cartless(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    picking_session_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from ..services.wms_cartless_picking.cancel_service import touch_cartless_picking_session

    try:
        out = touch_cartless_picking_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            session_id=int(picking_session_id),
            operator_user_id=int(current_user.id),
        )
        db.commit()
        return out
    except (ValueError, PermissionError) as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.post("/picking/start")
def post_picking_start(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    cart_id: int = Query(..., ge=1),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    order_ids: list[int] | None = Query(None),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Skan wózka → startPicking: capacity + sesja + order.cart_id + PICKING.
    """
    from ..services.cart_capacity import CartCapacityExceeded, http_exception_cart_capacity_exceeded
    from ..services.cart_picking_lifecycle_service import (
        CartAlreadyClaimedError,
        CartLifecycleError,
        get_cart_status,
    )
    from ..models.cart import Cart

    try:
        sess, operator_message = bootstrap_start_picking_if_needed(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            cart_id=int(cart_id),
            source_status_id=int(source_status_id),
            order_type=order_type,
            operator_user_id=int(current_user.id),
            fixed_order_ids=[int(x) for x in order_ids] if order_ids else None,
        )
        db.commit()
    except CartCapacityExceeded as e:
        db.rollback()
        raise http_exception_cart_capacity_exceeded(e) from e
    except CartAlreadyClaimedError as e:
        db.commit()
        from ..services.wms_http_messages import raise_wms_from_lifecycle

        raise_wms_from_lifecycle(e)
    except CartLifecycleError as e:
        db.rollback()
        from ..services.wms_http_messages import raise_wms_from_lifecycle

        raise_wms_from_lifecycle(e)
    except ValueError as e:
        db.rollback()
        from ..services.wms_http_messages import raise_wms_cart_not_found, raise_wms_generic

        if "nie znaleziono" in str(e).lower() or "not found" in str(e).lower():
            raise_wms_cart_not_found()
        raise_wms_generic(detail=None, status_code=404)
    except Exception:
        logger.exception(
            "START_PICKING FAIL at post_picking_start bootstrap/commit cart_id=%s",
            cart_id,
        )
        db.rollback()
        raise

    cart = db.query(Cart).filter(Cart.id == int(cart_id)).first()
    return {
        "cart_id": int(cart_id),
        "status": get_cart_status(cart).value if cart else None,
        "session_id": int(sess.id) if sess is not None else None,
        "current_session_id": getattr(cart, "current_session_id", None) if cart else None,
        "assigned_user_id": getattr(cart, "assigned_user_id", None) if cart else None,
        "operator_message": operator_message,
    }


@router.get("/picking/resolve-cart", response_model=WmsPickingResolveCartResponse)
def get_picking_resolve_cart(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
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
    warehouse_id: int = Depends(require_operable_warehouse),
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
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(..., description="single | multi | all"),
    cart_id: int | None = Query(
        None,
        ge=1,
        description="Sesja wózka: uwzględnij robocze Pick (picked_at NULL) przypisane do tego wózka w liczbie zebranych.",
    ),
    picking_session_id: int | None = Query(
        None,
        ge=1,
        description="Sesja cartless (bulk): scope = order.picking_session_id; session.cart_id IS NULL.",
    ),
    recovery_order_id: int | None = Query(
        None,
        ge=1,
        description="Dogrywka recovery: tylko to zamówienie (auto-otwarcie zadania recovery_pick).",
    ),
    mode: str | None = Query(
        None,
        description="normal | recovery — jawny tryb (recovery wymaga recovery_order_id lub mode=recovery + order w query).",
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
    recovery_mode = (
        str(mode or "").strip().lower() == "recovery"
        or recovery_order_id is not None
    )
    if recovery_mode and recovery_order_id is not None:
        roid = int(recovery_order_id)
        prep = prepare_recovery_picking_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=roid,
            cart_id=cart_id,
        )
        if not prep.get("ok"):
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "RECOVERY_ORDER_NOT_FOUND",
                    "error": "Zamówienie dogrywki nie znalezione w tym magazynie.",
                },
            )
        if prep.get("completed"):
            from ..schemas.wms_picking_products import WmsPickingProductLinesResponse

            resp = WmsPickingProductLinesResponse(
                products=[],
                cohort_order_count=1,
                cohort_missing_lines=[],
                pick_list=[],
                shortfalls=[],
                warnings=["Braki zostały już rozwiązane — brak linii do dogrywki."],
                allow_continue_other_lines_after_shortage=True,
                picking_mode="recovery",
                recovery_order_id=roid,
                recovery_completed=True,
            )
        else:
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=order_type,
                cart_id=cart_id,
                fixed_order_ids=[roid],
                recovery_mode=True,
            )
        if current_user is not None and current_user.id is not None:
            _safe_touch_picking_session(
                db=db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                session_kind="picking_recovery_active",
                operator_user_id=int(current_user.id),
                cart_id=cart_id,
                order_id=int(recovery_order_id),
                metadata=_picking_session_progress_metadata(resp, source_status_id=source_status_id, order_type=order_type),
            )
            db.commit()
        return _attach_basket_put_list_projection(
            db,
            resp,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            cart_id=cart_id,
            operator_user_id=int(current_user.id) if current_user is not None and current_user.id else None,
        )
    csv_ids = [
        int(v)
        for v in (order_ids_csv or "").replace(";", ",").split(",")
        if v.strip().isdigit() and int(v.strip()) > 0
    ]
    fixed_order_ids = ([int(v) for v in (order_ids or []) if int(v) > 0] + csv_ids) or None
    if (
        picking_session_id is not None
        and current_user is not None
        and current_user.id is not None
        and not recovery_mode
    ):
        from ..services.wms_cartless_picking.cancel_service import touch_cartless_picking_session

        try:
            touch_cartless_picking_session(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                session_id=int(picking_session_id),
                operator_user_id=int(current_user.id),
            )
        except (ValueError, PermissionError) as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        resp = build_wms_picking_product_lines(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=order_type,
            cart_id=None,
            picking_session_id=int(picking_session_id),
            fixed_order_ids=fixed_order_ids,
        )
        db.commit()
        return resp
    if (
        cart_id is not None
        and current_user is not None
        and current_user.id is not None
        and not recovery_mode
    ):
        from ..services.cart_capacity import CartCapacityExceeded, http_exception_cart_capacity_exceeded
        from ..services.cart_picking_lifecycle_service import CartLifecycleError

        try:
            bootstrap_start_picking_if_needed(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                cart_id=int(cart_id),
                source_status_id=int(source_status_id),
                order_type=order_type,
                operator_user_id=int(current_user.id),
                fixed_order_ids=fixed_order_ids,
            )
            db.flush()
        except CartCapacityExceeded as e:
            db.rollback()
            raise http_exception_cart_capacity_exceeded(e) from e
        except CartLifecycleError as e:
            db.rollback()
            from ..services.wms_http_messages import raise_wms_from_lifecycle

            raise_wms_from_lifecycle(e)
    resp = build_wms_picking_product_lines(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        source_status_id=source_status_id,
        order_type=order_type,
        cart_id=cart_id,
        picking_session_id=picking_session_id,
        fixed_order_ids=fixed_order_ids,
    )
    if current_user is not None and current_user.id is not None and cart_id is not None:
        from ..services.cart_picking_lifecycle_service import find_open_picking_session, get_cart_status
        from ..models.cart import Cart as CartModel
        from ..models.enums import CartStatus as _CS

        cart_row = db.query(CartModel).filter(CartModel.id == int(cart_id)).first()
        if (
            cart_row is not None
            and get_cart_status(cart_row) == _CS.PICKING
            and find_open_picking_session(db, cart=cart_row) is not None
        ):
            _safe_touch_picking_session(
                db=db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                session_kind="picking_active",
                operator_user_id=int(current_user.id),
                cart_id=cart_id,
                metadata=_picking_session_progress_metadata(
                    resp, source_status_id=source_status_id, order_type=order_type
                ),
            )
        db.commit()
    return _attach_basket_put_list_projection(
        db,
        resp,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        cart_id=cart_id,
        operator_user_id=int(current_user.id) if current_user is not None and current_user.id else None,
    )


@router.get("/picking/product-lines/detail", response_model=WmsPickingProductDetailResponse)
def get_picking_product_detail(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    product_id: int = Query(..., ge=1),
    cart_id: int | None = Query(
        None,
        ge=1,
        description="Sesja WMS: zamówienia przypisane do tego wózka lub bez wózka (FIFO); brak = pusta lista zamówień",
    ),
    picking_session_id: int | None = Query(
        None,
        ge=1,
        description="Sesja cartless — scope po picking_session_id.",
    ),
    recovery_order_id: int | None = Query(
        None,
        ge=1,
        description="Dogrywka recovery — ten sam filtr co lista produktów.",
    ),
    mode: str | None = Query(None, description="normal | recovery"),
    order_ids: list[int] | None = Query(
        None,
        description="Opcjonalny zakres zadania kierownika — tylko wskazane zamówienia.",
    ),
    order_ids_csv: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    fixed: list[int] | None = None
    recovery_detail_mode = (
        str(mode or "").strip().lower() == "recovery" or recovery_order_id is not None
    )
    if recovery_detail_mode and recovery_order_id is not None:
        roid = int(recovery_order_id)
        prep = prepare_recovery_picking_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=roid,
            cart_id=cart_id,
        )
        if not prep.get("ok"):
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "RECOVERY_ORDER_NOT_FOUND",
                    "error": "Zamówienie dogrywki nie znalezione.",
                },
            )
        if prep.get("completed"):
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "RECOVERY_ALREADY_COMPLETED",
                    "error": "Braki zostały już rozwiązane — brak produktów do dogrywki.",
                },
            )
        fixed = [roid]
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
        picking_session_id=picking_session_id,
        fixed_order_ids=fixed,
        recovery_mode=recovery_detail_mode and recovery_order_id is not None,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Produkt nie występuje na liście zbiórki.")
    if current_user is not None and current_user.id is not None:
        try:
            _safe_touch_picking_session(
                db=db,
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
        except HTTPException:
            db.rollback()
            # SessionNotFound on touch must not hide basket_put pending already loaded on row.
            logger.warning(
                "detail touch skipped; returning basket_put projection as built product_id=%s cart_id=%s",
                product_id,
                cart_id,
            )
        else:
            # Re-read basket_put AFTER touch/commit so response matches session SSOT
            # (merge preserves basket_put; re-attach guards against stale in-memory row).
            if cart_id is not None and int(cart_id) > 0:
                try:
                    from ..models.cart import Cart
                    from ..services.wms_basket_put import get_basket_put_ui_state

                    cart_for_put = (
                        db.query(Cart)
                        .filter(Cart.id == int(cart_id), Cart.tenant_id == int(tenant_id))
                        .first()
                    )
                    if cart_for_put is not None:
                        ui_put = get_basket_put_ui_state(
                            db,
                            cart=cart_for_put,
                            product_id=int(product_id),
                            sanitize=True,
                        )
                        row.requires_basket_put_confirm = bool(ui_put.get("requires_basket_put"))
                        if row.requires_basket_put_confirm:
                            # Quantity mode: do not re-attach legacy pending/series onto detail.
                            row.basket_put_pending = None
                            row.basket_put_active_series = None
                            row.put_to_basket_label = None
                        else:
                            row.basket_put_pending = ui_put.get("pending")
                            row.basket_put_active_series = ui_put.get("active_series")
                            if row.requires_basket_put_confirm:
                                series = row.basket_put_active_series
                                if isinstance(series, dict) and series.get("basket_label"):
                                    row.put_to_basket_label = str(series["basket_label"])
                                else:
                                    row.put_to_basket_label = None
                            if row.basket_put_pending:
                                row.put_to_basket_label = None
                except Exception:
                    logger.exception("re-attach basket_put after detail touch failed cart_id=%s", cart_id)
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
    from ..models.cart import Cart
    from ..models.order import Order
    from ..services.cart_picking_lifecycle_service import (
        CartLifecycleError,
        InvalidCartStateError,
        SessionNotFoundError,
        find_open_picking_session,
        get_cart_status,
    )

    tid = int(tenant_id)
    uid = int(current_user.id) if current_user is not None else None
    cart_id = int(body.cart_id) if body.cart_id is not None else None
    picking_session_id = (
        int(body.picking_session_id) if getattr(body, "picking_session_id", None) is not None else None
    )
    barcode = None
    session_id = None
    cart_status = None
    current_session_id = None
    cart_ref: Cart | None = None
    session_ref = None
    effective_wh: int | None = None

    def _log_ctx(**extra: object) -> dict:
        return {
            "tenant_id": tid,
            "warehouse_id": effective_wh,
            "source_status_id": int(source_status_id),
            "barcode": barcode,
            "session_id": session_id,
            "cart_id": cart_id,
            "user_id": uid,
            "product_id": getattr(body, "product_id", None),
            "location_id": getattr(body, "location_id", None),
            "quantity": getattr(body, "quantity", None),
            "cart_status": cart_status,
            "current_session_id": current_session_id,
            **extra,
        }

    def _refresh_cart_debug() -> None:
        nonlocal cart_ref, session_ref, barcode, cart_status, session_id, current_session_id, cart_id
        if cart_id is None or effective_wh is None:
            return
        cart_ref = (
            db.query(Cart)
            .filter(
                Cart.id == int(cart_id),
                Cart.tenant_id == tid,
                Cart.warehouse_id == int(effective_wh),
            )
            .first()
        )
        if cart_ref is None:
            return
        barcode = (
            str(getattr(cart_ref, "barcode", None) or getattr(cart_ref, "code", None) or "").strip()
            or None
        )
        cart_status = get_cart_status(cart_ref).value
        current_session_id = getattr(cart_ref, "current_session_id", None)
        session_ref = find_open_picking_session(db, cart=cart_ref)
        session_id = int(session_ref.id) if session_ref is not None else current_session_id

    def _order_count() -> int | None:
        if cart_id is None or cart_ref is None:
            return None
        try:
            from ..services.cart_stats_service import list_orders_on_cart

            return len(list_orders_on_cart(db, cart_ref))
        except Exception:
            return None

    def _raise_409(code: str, message: str) -> None:
        """Log + HTTP 409 with WmsUserMessage (always before raise)."""
        from ..services.wms_user_messages import from_cart_lifecycle_error

        class _E:
            pass

        e = _E()
        e.code = code
        e.message = message
        _refresh_cart_debug()
        order_count = _order_count()
        logger.warning(
            "quick_pick rejected",
            extra={
                "code": code,
                "cart_id": int(cart_ref.id) if cart_ref is not None else cart_id,
                "cart_status": cart_status if cart_ref is not None else None,
                "current_session_id": (
                    int(current_session_id)
                    if current_session_id is not None
                    else (getattr(cart_ref, "current_session_id", None) if cart_ref is not None else None)
                ),
                "session_id": int(session_ref.id) if session_ref is not None else session_id,
                "order_count": order_count,
                "warehouse_id": effective_wh,
                "user_id": uid,
                "barcode": barcode,
            },
        )
        msg = from_cart_lifecycle_error(
            e,
            extra={"action": "quick_pick", "current": str(cart_status or "")},
        )
        detail = msg.to_detail()
        detail["debug"] = {
            "cart_id": int(cart_ref.id) if cart_ref is not None else cart_id,
            "cart_status": cart_status if cart_ref is not None else None,
            "session_id": int(session_ref.id) if session_ref is not None else session_id,
        }
        raise HTTPException(status_code=409, detail=detail)

    try:
        logger.info("post_picking_quick_pick:start %s", _log_ctx())
        ws = WarehouseService(db)
        req_wh: int | None = int(warehouse_id) if warehouse_id is not None else None
        if req_wh is not None and req_wh < 1:
            req_wh = None

        if req_wh is not None and ws.can_tenant_access_warehouse(tid, req_wh):
            effective_wh = req_wh
        else:
            try:
                effective_wh = resolve_quick_pick_warehouse_for_tenant(db, tid)
            except ValueError as e:
                logger.exception("post_picking_quick_pick:warehouse_resolve %s", _log_ctx(error=str(e)))
                raise HTTPException(status_code=400, detail=str(e)) from e
            logger.info("post_picking_quick_pick:auto_warehouse %s", _log_ctx())

        _refresh_cart_debug()

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
                logger.warning("post_picking_quick_pick:status_not_found %s", _log_ctx())
                return JSONResponse(
                    status_code=404,
                    content={
                        "error": (
                            f"Status panelu id={source_status_id} nie istnieje dla "
                            f"tenant_id={tid}, warehouse_id={effective_wh}."
                        ),
                        "code": "StatusNotFound",
                    },
                )

        if picking_session_id is not None:
            from ..services.wms_cartless_picking.pick_service import record_cartless_quick_pick
            from ..services.wms_cartless_picking.cancel_service import touch_cartless_picking_session

            oid, oiid = record_cartless_quick_pick(
                db,
                tenant_id=tid,
                warehouse_id=int(effective_wh),
                source_status_id=source_status_id,
                order_type=order_type,
                product_id=body.product_id,
                location_id=body.location_id,
                quantity=body.quantity,
                picking_session_id=int(picking_session_id),
                operator_user_id=uid,
            )
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tid,
                warehouse_id=int(effective_wh),
                source_status_id=source_status_id,
                order_type=order_type,
                picking_session_id=int(picking_session_id),
            )
            touch_cartless_picking_session(
                db,
                tenant_id=tid,
                warehouse_id=int(effective_wh),
                session_id=int(picking_session_id),
                operator_user_id=int(uid),
            )
            db.commit()
            logger.info(
                "post_picking_quick_pick:ok cartless %s",
                _log_ctx(order_id=oid, order_item_id=oiid, session_id=picking_session_id),
            )
            return {"ok": True, "order_id": oid, "order_item_id": oiid, "picking_session_id": int(picking_session_id)}

        if body.cart_id is None:
            raise HTTPException(status_code=400, detail="Wymagany cart_id albo picking_session_id.")

        from ..services.wms_basket_put import (
            cart_requires_basket_put_gate,
        )

        cart_for_gate = (
            db.query(Cart)
            .options(joinedload(Cart.baskets))
            .filter(
                Cart.id == int(body.cart_id),
                Cart.tenant_id == tid,
                Cart.warehouse_id == int(effective_wh),
            )
            .first()
        )
        if cart_for_gate is None:
            raise HTTPException(status_code=404, detail="Nie znaleziono wózka.")

        recovery_fixed = (
            int(body.recovery_order_id)
            if body.recovery_order_id is not None and int(body.recovery_order_id) > 0
            else None
        )

        def _do_record(
            *,
            quantity: float,
            fixed_order_id: int | None = None,
            scope_order_id: int | None = None,
        ):
            return record_wms_quick_pick(
                db,
                tenant_id=tid,
                warehouse_id=int(effective_wh),
                source_status_id=source_status_id,
                order_type=order_type,
                product_id=body.product_id,
                location_id=body.location_id,
                quantity=float(quantity),
                cart_id=int(body.cart_id),
                fixed_order_id=fixed_order_id if fixed_order_id is not None else recovery_fixed,
                scope_order_id=scope_order_id if recovery_fixed is None else None,
                operator_user_id=uid,
            )

        if cart_requires_basket_put_gate(cart_for_gate) and recovery_fixed is None:
            # QUANTITY MODE SSOT (MULTI / baskets):
            # Product scan must NOT create pending qty=1 or Pick via series.
            # Operator path: SELECT_PRODUCT → confirm-basket-put (qty modal) → Pick.
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "EXPECTED_BASKET_SCAN",
                    "message": (
                        "Dla wózka z koszykami zeskanuj koszyk i potwierdź ilość "
                        "(confirm-basket-put). Quick-pick nie tworzy Pick ani pending."
                    ),
                    "error": "EXPECTED_BASKET_SCAN",
                },
            )

        oid, oiid = _do_record(quantity=float(body.quantity), fixed_order_id=recovery_fixed)

        if body.cart_id is not None:
            recovery_oid = recovery_fixed
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tid,
                warehouse_id=int(effective_wh),
                source_status_id=source_status_id,
                order_type=order_type,
                cart_id=body.cart_id,
                fixed_order_ids=[recovery_oid] if recovery_oid is not None else None,
                recovery_mode=recovery_oid is not None,
            )
            _safe_touch_picking_session(
                db=db,
                tenant_id=tid,
                warehouse_id=int(effective_wh),
                session_kind="picking_recovery_active"
                if body.recovery_order_id is not None and int(body.recovery_order_id) > 0
                else "picking_active",
                operator_user_id=uid,
                cart_id=body.cart_id,
                order_id=int(body.recovery_order_id)
                if body.recovery_order_id is not None and int(body.recovery_order_id) > 0
                else None,
                metadata=_picking_session_progress_metadata(
                    resp, source_status_id=source_status_id, order_type=order_type
                ),
            )
        db.commit()
        logger.info(
            "post_picking_quick_pick:ok %s",
            _log_ctx(order_id=oid, order_item_id=oiid),
        )
        return {
            "ok": True,
            "order_id": oid,
            "order_item_id": oiid,
            "phase": "PUT_CONFIRMED",
            "picked": True,
        }
    except SessionNotFoundError as e:
        db.rollback()
        _raise_409("SessionNotFound", e.message)
    except InvalidCartStateError as e:
        db.rollback()
        if e.cart_status:
            cart_status = e.cart_status
        _raise_409("InvalidCartState", e.message)
    except CartLifecycleError as e:
        db.rollback()
        _raise_409(str(e.code or "CartLifecycleError"), e.message)
    except ValueError as e:
        db.rollback()
        logger.exception("post_picking_quick_pick:ValueError %s", _log_ctx(error=str(e)))
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_picking_quick_pick:SQLAlchemyError %s", _log_ctx(error=str(e)))
        msg = str(getattr(e, "orig", None) or e)
        lower = msg.lower()
        if "current_session_id" in lower or "assigned_user_id" in lower:
            _raise_409(
                "SessionNotFound",
                "Brak kolumn sesji wózka (current_session_id) — uruchom schema upgrade.",
            )
        if "invalid input value for enum" in lower or "cartstatus" in lower:
            _raise_409(
                "InvalidCartState",
                "Nieobsługiwana wartość statusu wózka w DB — wymagany ensure_cartstatus_enum (ADD VALUE).",
            )
        raise HTTPException(
            status_code=500,
            detail={"code": "QuickPickDatabaseError", "message": "Zapis kompletacji nie powiódł się."},
        ) from e
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception("post_picking_quick_pick:unhandled %s", _log_ctx(error=str(e)))
        raise HTTPException(
            status_code=500,
            detail={"code": "QuickPickInternalError", "message": "Wewnętrzny błąd serwera"},
        ) from e


@router.post("/picking/confirm-basket-put")
def post_picking_confirm_basket_put(
    body: WmsPickingConfirmBasketPutBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Confirm pending put by scanning the destination basket (MULTI / baskets carts)."""
    from ..models.cart import Cart
    from ..services.wms_basket_put import BasketPutError, confirm_basket_put

    tid = int(tenant_id)
    uid = int(current_user.id) if current_user is not None else None
    cart = (
        db.query(Cart)
        .options(joinedload(Cart.baskets))
        .filter(
            Cart.id == int(body.cart_id),
            Cart.tenant_id == tid,
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono wózka.")

    recovery_fixed = (
        int(body.recovery_order_id)
        if body.recovery_order_id is not None and int(body.recovery_order_id) > 0
        else None
    )

    def _do_record(
        *,
        quantity: float,
        fixed_order_id: int | None = None,
        scope_order_id: int | None = None,
    ):
        return record_wms_quick_pick(
            db,
            tenant_id=tid,
            warehouse_id=int(warehouse_id),
            source_status_id=source_status_id,
            order_type=order_type,
            product_id=int(_pending_product_id),
            location_id=int(_pending_location_id),
            quantity=float(quantity),
            cart_id=int(body.cart_id),
            fixed_order_id=fixed_order_id if fixed_order_id is not None else recovery_fixed,
            scope_order_id=scope_order_id if recovery_fixed is None else None,
            operator_user_id=uid,
        )

    from ..services.wms_basket_put.state import get_pending, get_active_series
    from ..services.cart_picking_lifecycle_service import assert_cart_ready_for_quick_pick
    from ..services.wms_picking_product_list_service import resolve_wms_picking_order_ids

    try:
        sess = assert_cart_ready_for_quick_pick(db, cart)
        pending = get_pending(sess)
        series = get_active_series(sess)
        ctx_product_id = (
            int(body.product_id) if body.product_id is not None and int(body.product_id) > 0 else None
        )
        ctx_location_id = (
            int(body.location_id) if body.location_id is not None and int(body.location_id) > 0 else None
        )
        if pending is None and series is None and ctx_product_id is None:
            raise BasketPutError(
                "EXPECTED_PRODUCT_SCAN",
                "Brak kontekstu produktu — otwórz produkt lub zeskanuj EAN, potem koszyk.",
                http_status=409,
            )
        # Product/location for Pick path: pending first; series / context for destination-only.
        if pending is not None:
            _pending_product_id = int(pending["product_id"])
            _pending_location_id = int(pending["location_id"])
        elif series is not None:
            _pending_product_id = int(series["product_id"])
            _pending_location_id = int(series["location_id"])
        else:
            _pending_product_id = int(ctx_product_id)
            _pending_location_id = int(ctx_location_id) if ctx_location_id is not None else 0

        ot = order_type if order_type in ("single", "multi", "all") else "all"
        confirm_order_ids = resolve_wms_picking_order_ids(
            db,
            tenant_id=tid,
            warehouse_id=int(warehouse_id),
            source_status_id=source_status_id,
            order_type=ot,
            cart_id=int(body.cart_id),
        )

        put_res = confirm_basket_put(
            db,
            cart=cart,
            basket_scan=str(body.basket_scan),
            operator_user_id=uid,
            record_pick_fn=_do_record,
            manual=bool(body.manual),
            order_ids=confirm_order_ids,
            product_id=ctx_product_id,
            location_id=ctx_location_id,
            quantity=float(body.quantity) if body.quantity is not None else None,
        )
        db.commit()
        qty_put = float(put_res.quantity_put or 0)
        return {
            "ok": True,
            "phase": put_res.phase,
            "order_id": put_res.order_id,
            "order_item_id": put_res.order_item_id,
            "quantity_put": put_res.quantity_put,
            "active_series": put_res.active_series,
            "expected_basket_label": put_res.expected_basket_label,
            "eligible_baskets": put_res.eligible_baskets,
            "scanned_basket": put_res.scanned_basket,
            "message": put_res.message,
            "picked": qty_put > 1e-9,
        }
    except BasketPutError as be:
        # Keep pending on mismatch / wrong basket / full line — no pick was written.
        if be.code in (
            "BASKET_MISMATCH",
            "BASKET_PRODUCT_MISMATCH",
            "BASKET_PRODUCT_ALREADY_COMPLETE",
        ):
            # ALREADY_COMPLETE may have refreshed eligible_baskets on pending — commit that.
            if be.code == "BASKET_PRODUCT_ALREADY_COMPLETE":
                try:
                    db.commit()
                except Exception:
                    db.rollback()
            else:
                db.rollback()
            raise HTTPException(status_code=be.http_status, detail=be.as_detail()) from be
        db.rollback()
        raise HTTPException(status_code=be.http_status, detail=be.as_detail()) from be
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/picking/cancel-pending-basket-put")
def post_picking_cancel_pending_basket_put(
    body: WmsPickingCancelPendingBasketPutBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Anuluj wyłącznie pending put (brak PICK). Nie cofa zatwierdzonych picków / serii.
    """
    from ..models.cart import Cart
    from ..services.wms_basket_put import BasketPutError, cancel_pending_basket_put

    tid = int(tenant_id)
    uid = int(current_user.id) if current_user is not None else None
    cart = (
        db.query(Cart)
        .filter(
            Cart.id == int(body.cart_id),
            Cart.tenant_id == tid,
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono wózka.")
    try:
        out = cancel_pending_basket_put(db, cart=cart, operator_user_id=uid)
        db.commit()
        return out
    except BasketPutError as be:
        db.rollback()
        raise HTTPException(status_code=be.http_status, detail=be.as_detail()) from be


@router.post("/picking/undo-pick", response_model=WmsPickingUndoPickResponse)
def post_picking_undo_pick(
    body: WmsPickingUndoPickBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """Cofnij draft Pick sesji (bez zmiany Inventory) — korekta pomyłki operatora."""
    from ..services.wms_picking_corrections import undo_wms_session_picks
    from ..services.wms_picking_corrections.undo_pick_service import UndoPickError

    _ = source_status_id, order_type
    try:
        out = undo_wms_session_picks(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            cart_id=int(body.cart_id),
            product_id=int(body.product_id),
            quantity=float(body.quantity),
            location_id=int(body.location_id) if body.location_id is not None else None,
            order_ids=body.order_ids,
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
        if current_user is not None and current_user.id is not None:
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=order_type,
                cart_id=body.cart_id,
            )
            _safe_touch_picking_session(
                db=db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                session_kind="picking_active",
                operator_user_id=int(current_user.id),
                cart_id=body.cart_id,
                metadata=_picking_session_progress_metadata(
                    resp, source_status_id=source_status_id, order_type=order_type
                ),
            )
        db.commit()
        return WmsPickingUndoPickResponse(
            ok=True,
            undone_qty=float(out.get("undone_qty") or 0),
            inventory_unchanged=True,
            order_ids=list(out.get("order_ids") or []),
            location_id=out.get("location_id"),
        )
    except UndoPickError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail={"code": e.code, "message": str(e)}) from e
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_picking_undo_pick:SQLAlchemyError")
        raise HTTPException(status_code=500, detail="Cofnięcie pobrania nie powiodło się.") from e


@router.post("/picking/confirm-empty-location", response_model=WmsPickingEmptyLocationResponse)
def post_picking_confirm_empty_location(
    body: WmsPickingEmptyLocationBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """Potwierdź pustą lokalizację: stock produktu → 0 (RK), undo draftów, alternatywy / product shortage."""
    from ..services.wms_picking_corrections import confirm_empty_pick_location
    from ..services.wms_picking_corrections.empty_location_service import EmptyLocationError
    from ..schemas.wms_picking_products import WmsPickingAlternateLocation

    try:
        out = confirm_empty_pick_location(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            cart_id=int(body.cart_id),
            product_id=int(body.product_id),
            location_id=int(body.location_id),
            observed_stock_qty=float(body.observed_stock_qty)
            if body.observed_stock_qty is not None
            else None,
            order_ids=body.order_ids,
            operator_user_id=int(current_user.id) if current_user is not None else None,
            source_status_id=int(source_status_id),
            order_type=str(order_type),
        )
        if current_user is not None and current_user.id is not None:
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=order_type,
                cart_id=body.cart_id,
            )
            _safe_touch_picking_session(
                db=db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                session_kind="picking_active",
                operator_user_id=int(current_user.id),
                cart_id=body.cart_id,
                metadata=_picking_session_progress_metadata(
                    resp, source_status_id=source_status_id, order_type=order_type
                ),
            )
        db.commit()
        alts = [
            WmsPickingAlternateLocation(
                location_id=int(a["location_id"]),
                location_code=str(a["location_code"]),
                stock_quantity=float(a["stock_quantity"]),
            )
            for a in (out.get("alternate_locations") or [])
        ]
        return WmsPickingEmptyLocationResponse(
            ok=True,
            shortage_kind=str(out.get("shortage_kind") or "LOCATION_SHORTAGE"),
            location_id=int(out["location_id"]),
            location_code=str(out["location_code"]),
            product_id=int(out["product_id"]),
            product_ean=out.get("product_ean"),
            previous_qty=float(out.get("previous_qty") or 0),
            new_qty=float(out.get("new_qty") or 0),
            formal_stock_qty=float(out["formal_stock_qty"])
            if out.get("formal_stock_qty") is not None
            else None,
            stock_effect=str(out.get("stock_effect") or "zeroed"),
            routing_blocked=bool(out.get("routing_blocked", True)),
            undone_pick_qty=float(out.get("undone_pick_qty") or 0),
            alternate_locations=alts,
            stock_document_id=out.get("stock_document_id"),
            inventory_document_id=out.get("inventory_document_id"),
            inventory_document_number=out.get("inventory_document_number"),
        )
    except EmptyLocationError as e:
        db.rollback()
        status = 409 if e.code == "STOCK_CHANGED" else 400
        raise HTTPException(status_code=status, detail={"code": e.code, "message": str(e)}) from e
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_picking_confirm_empty_location:SQLAlchemyError")
        raise HTTPException(status_code=500, detail="Wyzerowanie lokalizacji nie powiodło się.") from e


@router.post("/picking/report-shortage", response_model=WmsPickingReportShortageResponse)
def post_picking_report_shortage(
    body: WmsPickingReportShortageBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """
    Zgłoszenie braku w trakcie sesji: zapis na linii, utworzenie/aktualizacja OPEN ``OrderIssueTask``
    (kolejka Braki WMS) oraz przeliczenie fulfillment — bez zmiany statusu panelu zamówienia
    (status panelu przy domknięciu wózka: ``POST /wms/picking/finalize-cart``).
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
        if getattr(body, "picking_session_id", None) is not None:
            from ..services.wms_cartless_picking.shortage_service import (
                report_cartless_picking_product_shortage,
            )
            from ..services.wms_cartless_picking.cancel_service import touch_cartless_picking_session

            out = report_cartless_picking_product_shortage(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=order_type,
                product_id=body.product_id,
                location_id=body.location_id,
                missing_qty=body.missing_qty,
                picking_session_id=int(body.picking_session_id),
                ui_order_ids=body.order_ids,
                order_item_id=body.order_item_id,
                operator_user_id=int(current_user.id) if current_user is not None else None,
            )
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=order_type,
                picking_session_id=int(body.picking_session_id),
            )
            pid = int(body.product_id)
            product_line_snapshot = None
            for pl in getattr(resp, "products", None) or []:
                if int(getattr(pl, "product_id", 0) or 0) == pid:
                    product_line_snapshot = pl
                    break
            out = {**out, "product_line": product_line_snapshot}
            if current_user is not None and current_user.id is not None:
                touch_cartless_picking_session(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    session_id=int(body.picking_session_id),
                    operator_user_id=int(current_user.id),
                )
            db.commit()
            return out

        out = report_wms_picking_product_shortage(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=order_type,
            product_id=body.product_id,
            location_id=body.location_id,
            missing_qty=body.missing_qty,
            cart_id=int(body.cart_id),
            ui_order_ids=body.order_ids,
            recovery_order_id=body.recovery_order_id,
            order_item_id=body.order_item_id,
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
        product_line_snapshot = None
        if body.cart_id is not None:
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                source_status_id=source_status_id,
                order_type=order_type,
                cart_id=body.cart_id,
            )
            pid = int(body.product_id)
            for pl in getattr(resp, "products", None) or []:
                if int(getattr(pl, "product_id", 0) or 0) == pid:
                    product_line_snapshot = pl
                    break
            out = {**out, "product_line": product_line_snapshot}
            if current_user is not None and current_user.id is not None:
                _safe_touch_picking_session(
                    db=db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    session_kind="picking_active",
                    operator_user_id=int(current_user.id),
                    cart_id=body.cart_id,
                    metadata=_picking_session_progress_metadata(
                        resp, source_status_id=source_status_id, order_type=order_type
                    ),
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
    except Exception:
        db.rollback()
        logger.error(
            "[report_shortage] UNEXPECTED payload=%s traceback=%s",
            payload_dump,
            traceback.format_exc(),
        )
        raise
    return WmsPickingReportShortageResponse(**out)


@router.post("/picking/report-shortage-bulk", response_model=WmsPickingBulkReportShortageResponse)
def post_picking_report_shortage_bulk(
    body: WmsPickingBulkReportShortageBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_status_id: int = Query(..., ge=1),
    order_type: WmsPickingOrderTypeFilter = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """
    Zbiorcze shortage per order_item (MULTI) — atomic all-or-nothing.
    Orchestracja nad ``report_wms_picking_product_shortage`` (ten sam SSOT).
    """
    import traceback

    from ..services.wms_picking_shortage import (
        BulkShortageError,
        report_wms_picking_bulk_product_shortage,
    )

    payload_dump = body.model_dump()
    logger.info(
        "[report_shortage_bulk] ENTER payload=%s tenant_id=%s warehouse_id=%s user=%s",
        payload_dump,
        tenant_id,
        warehouse_id,
        getattr(current_user, "id", None),
    )
    try:
        out = report_wms_picking_bulk_product_shortage(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=order_type,
            product_id=int(body.product_id),
            cart_id=int(body.cart_id),
            items=[i.model_dump() for i in body.items],
            location_id=body.location_id,
            ui_order_ids=body.order_ids,
            recovery_order_id=body.recovery_order_id,
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
        product_line_snapshot = None
        resp = build_wms_picking_product_lines(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            source_status_id=source_status_id,
            order_type=order_type,
            cart_id=int(body.cart_id),
        )
        pid = int(body.product_id)
        for pl in getattr(resp, "products", None) or []:
            if int(getattr(pl, "product_id", 0) or 0) == pid:
                product_line_snapshot = pl
                break
        out = {**out, "product_line": product_line_snapshot}
        if current_user is not None and current_user.id is not None:
            _safe_touch_picking_session(
                db=db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                session_kind="picking_active",
                operator_user_id=int(current_user.id),
                cart_id=int(body.cart_id),
                metadata=_picking_session_progress_metadata(
                    resp, source_status_id=source_status_id, order_type=order_type
                ),
            )
        db.commit()
    except BulkShortageError as be:
        db.rollback()
        logger.warning(
            "[report_shortage_bulk] REJECT code=%s detail=%s",
            be.code,
            be.as_detail(),
        )
        raise HTTPException(status_code=409, detail=be.as_detail()) from be
    except ValueError as ve:
        db.rollback()
        logger.warning("[report_shortage_bulk] REJECT reason=%s", str(ve))
        raise HTTPException(
            status_code=409,
            detail={"code": "BULK_SHORTAGE_REJECTED", "message": str(ve), "error": str(ve)},
        ) from ve
    except Exception:
        db.rollback()
        logger.error(
            "[report_shortage_bulk] UNEXPECTED payload=%s traceback=%s",
            payload_dump,
            traceback.format_exc(),
        )
        raise
    return WmsPickingBulkReportShortageResponse(**out)


@router.post("/picking/recovery/finalize", response_model=WmsPickingRecoveryFinalizeResponse)
def post_picking_recovery_finalize(
    body: WmsPickingRecoveryFinalizeBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
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
        from ..services.recovery_workflow_service import apply_fulfillment_state_from_resolver
        from ..services.wms_audit_service import emit_recovery_finished

        _rec_order = (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.id == int(body.order_id), Order.tenant_id == int(tenant_id))
            .first()
        )
        if _rec_order is not None:
            apply_fulfillment_state_from_resolver(
                db,
                _rec_order,
                session_cart_id=int(body.cart_id),
                log=True,
            )
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


def _batch_session_to_read(sess) -> dict:
    from ..services.recovery_intelligence import batch_session_payload

    payload = batch_session_payload(sess)
    groups = payload.get("route_groups") or []
    return {
        "id": int(sess.id),
        "label": str(sess.label or ""),
        "status": str(sess.status or "open"),
        "order_ids": list(payload.get("order_ids") or []),
        "order_count": int(payload.get("order_count") or 0),
        "line_count": int(payload.get("line_count") or 0),
        "route_groups": groups,
    }


@router.post("/picking/recovery/batch", response_model=WmsRecoveryBatchSessionRead)
def post_recovery_batch_create(
    body: WmsRecoveryBatchCreateBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Utwórz grupową sesję dogrywki (top priority lub wskazane order_ids)."""
    from ..services.recovery_intelligence import create_recovery_batch_session

    try:
        sess = create_recovery_batch_session(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_ids=body.order_ids or None,
            max_orders=int(body.max_orders),
            operator_user_id=int(current_user.id),
        )
        db.commit()
        return WmsRecoveryBatchSessionRead.model_validate(_batch_session_to_read(sess))
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail={"message": str(e)}) from e
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=503, detail={"message": "Nie udało się utworzyć batch dogrywki."}) from e


@router.get("/picking/recovery/batch/{batch_id}", response_model=WmsRecoveryBatchSessionRead)
def get_recovery_batch_detail(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from ..services.recovery_intelligence import get_recovery_batch_session

    sess = get_recovery_batch_session(db, int(batch_id), tenant_id=int(tenant_id))
    if sess is None:
        raise HTTPException(status_code=404, detail={"message": "Nie znaleziono sesji batch dogrywki."})
    assert_warehouse_scoped_entity_access(
        db, current_user, getattr(sess, "warehouse_id", None), warehouse_id
    )
    return WmsRecoveryBatchSessionRead.model_validate(_batch_session_to_read(sess))


@router.post("/picking/cancel-session")
def post_picking_cancel_session(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    cart_id: int = Query(..., ge=1, description="Wózek aktywnej sesji zbierania"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Anuluj zbieranie: usuń order.cart_id / picking_session_id, przywróć poprzedni status,
    zwolnij wózek (AVAILABLE).
    """
    from ..services.cart_picking_lifecycle_service import CartLifecycleError, cancel_picking_session

    try:
        out = cancel_picking_session(
            db,
            cart_id=int(cart_id),
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            operator_user_id=int(current_user.id),
        )
        db.commit()
        return out
    except CartLifecycleError as e:
        db.rollback()
        from ..services.wms_http_messages import raise_wms_cart_not_found, raise_wms_from_lifecycle

        if e.code == "cart_not_found":
            raise_wms_cart_not_found()
        raise_wms_from_lifecycle(e)
    except Exception:
        db.rollback()
        logger.exception("picking.cancel-session failed cart_id=%s", cart_id)
        from ..services.wms_http_messages import raise_wms_generic

        raise_wms_generic(status_code=500)


@router.post("/picking/finalize-cart", response_model=WmsPickingFinalizeCartResponse)
def post_picking_finalize_cart(
    request: Request,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
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
    Zakończenie zbiórki: zdejmowanie ilości z Inventory wg Pick sesji; per zamówienie
    ``fulfillment_state`` (``PACKING`` / ``NEEDS_DECISION`` / ``MISSING``) i status panelu;
    wózek pozostaje przypięty (``READY_FOR_PACKING``) do zakończenia pakowania.
    """
    from ..middleware.exception_logging import get_or_create_request_id

    request_id = get_or_create_request_id(request)
    safe_fail_msg = (
        "Nie udało się zakończyć zbierania z powodu niespójności danych zamówienia. "
        "Sesja nie została zakończona."
    )
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
        logger.info(
            "FINALIZE_TRACE COMMIT cart_id=%s request_id=%s orders_updated=%s",
            cart_id,
            request_id,
            out.get("orders_updated") if isinstance(out, dict) else None,
        )
    except PickingFinalizeError as e:
        db.rollback()
        logger.warning(
            "[picking.finalize.error] request_id=%s cart_id=%s source_status_id=%s order_id=%s "
            "reason=%s step=%s code=%s",
            request_id,
            cart_id,
            source_status_id,
            e.order_id,
            e.reason,
            e.step,
            e.code,
        )
        detail = e.as_detail()
        detail["request_id"] = request_id
        detail["cart_id"] = int(cart_id)
        # Never leak ORM/SQL text to the operator for data-integrity failures.
        if e.code in ("apply_order_state_failed", "relocation_sync_failed") or e.reason in (
            "IntegrityError",
            "ForeignKeyViolation",
        ):
            detail["message"] = safe_fail_msg
            detail["error"] = safe_fail_msg
        raise HTTPException(status_code=int(e.http_status), detail=detail) from e
    except ValueError as e:
        db.rollback()
        msg = str(e).strip() or "Nieprawidłowy stan zbierania."
        logger.warning(
            "[picking.finalize.error] request_id=%s cart_id=%s source_status_id=%s reason=ValueError message=%s",
            request_id,
            cart_id,
            source_status_id,
            msg,
        )
        raise HTTPException(
            status_code=400,
            detail={
                "message": msg,
                "error": msg,
                "code": "picking_finalize_invalid",
                "cart_id": int(cart_id),
                "request_id": request_id,
            },
        ) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception(
            "[picking.finalize.error] request_id=%s cart_id=%s source_status_id=%s step=database "
            "exc_type=%s",
            request_id,
            cart_id,
            source_status_id,
            type(e).__name__,
        )
        raise HTTPException(
            status_code=409 if "ForeignKey" in type(e).__name__ or "Integrity" in type(e).__name__ else 503,
            detail={
                "message": safe_fail_msg,
                "error": safe_fail_msg,
                "reason": e.__class__.__name__,
                "code": "database_error",
                "cart_id": int(cart_id),
                "request_id": request_id,
            },
        ) from e
    except Exception as e:
        db.rollback()
        logger.exception(
            "[picking.finalize.error] request_id=%s cart_id=%s source_status_id=%s step=unexpected "
            "exc_type=%s",
            request_id,
            cart_id,
            source_status_id,
            type(e).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Zakończenie zbiórki nie powiodło się. Sesja nie została zakończona.",
                "error": "Zakończenie zbiórki nie powiodło się. Sesja nie została zakończona.",
                "reason": e.__class__.__name__,
                "code": "unexpected_error",
                "cart_id": int(cart_id),
                "request_id": request_id,
            },
        ) from e
    return WmsPickingFinalizeCartResponse(**out)
