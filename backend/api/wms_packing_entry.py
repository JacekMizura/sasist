"""WMS pakowanie — statusy docelowe z konfiguracji zbierania + lista zamówień."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user, get_optional_current_user
from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..schemas.wms_packing import (
    WmsPackingCartHandoffOut,
    WmsPackingEntryOut,
    WmsPackingFinishBody,
    WmsPackingLinePackBody,
    WmsPackingManagerParcelApproveBody,
    WmsPackingManagerParcelApproveOut,
    WmsPackingMarkShortageBody,
    WmsPackingMarkShortageOut,
    WmsPackingModeDistribution,
    WmsPackingOrderCard,
    WmsPackingOrderDetailOut,
    WmsPackingReplacementLabelCreateBody,
    WmsPackingReplacementLabelOut,
    WmsPackingReplacementLabelRetryOut,
    WmsPackingResolveEanOut,
    WmsPackingShelfOrderOut,
    WmsPackingScanBody,
    WmsPackingScanOut,
    WmsPackingTargetStatusItem,
)
from ..services.wms_audit_service import emit_wms_packing_paused, emit_wms_packing_resumed, touch_wms_packing_session_activity
from ..services.wms_packing_service import (
    PackingScanError,
    acknowledge_packing_reopen,
    approve_packing_extra_parcels_for_order,
    find_first_packing_order_id_for_ean,
    inspect_packing_cart_handoff,
    resolve_packing_order_for_shelf_scan,
    get_packing_order_detail_for_queue,
    list_packing_orders,
    list_packing_target_statuses,
    packing_apply_line_pack,
    packing_finish_order,
    packing_mode_distribution,
    packing_pack_all_lines,
    packing_resolve_and_scan_ean,
    packing_scan_increment,
    resolve_packing_entry_for_order,
)
from ..services.wms_packing_shortage_service import (
    PackingShortageError,
    packing_mark_line_shortage_and_defer,
)

router = APIRouter(prefix="/wms", tags=["WMS packing"])
logger = logging.getLogger(__name__)


@router.get("/packing/target-statuses", response_model=list[WmsPackingTargetStatusItem])
def get_packing_target_statuses(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """
    Statusy kolejek pakowania: ``picking_config.target_status_id`` oraz
    statusy startowe z ustawień pakowania (``start_status_id`` + ``allowed_start_status_ids``).
    """
    try:
        return list_packing_target_statuses(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    except SQLAlchemyError:
        logger.exception("get_packing_target_statuses")
        return []


@router.get("/packing/modes", response_model=WmsPackingModeDistribution)
def get_packing_modes(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1, description="order_ui_status_id — status kolejki pakowania"),
    db: Session = Depends(get_db),
):
    """Liczba zamówień w statusie: bez wózka / na wózku BULK / na wózku z koszykami (MULTI)."""
    try:
        no_cart, bulk, baskets, single_item, multi_item = packing_mode_distribution(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=status
        )
        db.commit()
        return WmsPackingModeDistribution(
            no_cart=no_cart,
            bulk=bulk,
            baskets=baskets,
            single_item=single_item,
            multi_item=multi_item,
        )
    except SQLAlchemyError:
        db.rollback()
        logger.exception("get_packing_modes")
        return WmsPackingModeDistribution(no_cart=0, bulk=0, baskets=0, single_item=0, multi_item=0)


@router.post("/packing/start-cart")
def post_packing_start_cart(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    cart_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Pakowacz skanuje wózek: READY_FOR_PACKING → PACKING.
    assigned_user=NULL, packing_user=operator.
    """
    from ..models.cart import Cart
    from ..services.cart_picking_lifecycle_service import (
        CartLifecycleError,
        get_cart_status,
        start_packing,
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
        raise HTTPException(status_code=404, detail="Nie znaleziono wózka.")
    try:
        start_packing(db, cart=cart, operator_user_id=int(current_user.id))
        db.commit()
    except CartLifecycleError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": e.code, "error": e.message}) from e
    return {
        "cart_id": int(cart.id),
        "status": get_cart_status(cart).value,
        "packing_user_id": getattr(cart, "packing_user_id", None),
        "assigned_user_id": cart.assigned_user_id,
    }


@router.get("/packing/cart-handoff", response_model=WmsPackingCartHandoffOut)
def get_packing_cart_handoff(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1, description="order_ui_status_id kolejki pakowania"),
    cart_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Skan wózka → pakowanie: custody vs kolejka packable.

    Nie myli pustego wózka z zamówieniem na wózku, które nie przeszło filtra
    ``order_can_show_ready_pack`` (np. niedokończone zbieranie).
    """
    try:
        return inspect_packing_cart_handoff(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            cart_id=cart_id,
        )
    except PackingScanError as e:
        raise _packing_scan_http_exception(e) from e
    except SQLAlchemyError:
        db.rollback()
        logger.exception("get_packing_cart_handoff")
        raise HTTPException(status_code=500, detail="Nie udało się odczytać stanu wózka.") from None


@router.get("/packing/orders", response_model=list[WmsPackingOrderCard])
def get_packing_orders(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1, description="order_ui_status_id — status „gotowe do pakowania”"),
    mode: str = Query(
        ...,
        description="all | no_cart | bulk | baskets — all = pełna kolejka statusu (domyślna lista)",
    ),
    cart_id: int | None = Query(default=None, ge=1, description="Wymagane dla mode=bulk; opcjonalne dla baskets"),
    order_type: str = Query(
        default="all",
        description="all | single | multi — filtr jedno-/wieloelementowe (jak w zbieraniu)",
    ),
    limit: int = Query(
        default=500,
        ge=1,
        le=2000,
        description="Wielkość partii zamówień (paginacja / doczytywanie)",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Offset w przefiltrowanej liście zamówień (kolejne partie)",
    ),
    db: Session = Depends(get_db),
):
    """Zamówienia w statusie wg trybu: bez wózka albo na konkretnym wózku (typ zgodny z trybem)."""
    try:
        return list_packing_orders(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
            order_type=order_type,
            limit=limit,
            offset=offset,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError:
        logger.exception("get_packing_orders")
        return []


def _packing_scan_error_detail(exc: PackingScanError) -> dict:
    detail: dict = {"code": str(exc.code)}
    msg = getattr(exc, "message", None)
    if msg and str(msg).strip():
        detail["error"] = str(msg).strip()
    oid = getattr(exc, "order_item_id", None)
    if oid is not None and int(oid) > 0:
        detail["order_item_id"] = int(oid)
    return detail


def _packing_scan_http_exception(exc: PackingScanError) -> HTTPException:
    code = str(exc.code)
    detail = _packing_scan_error_detail(exc)
    if code == "PRODUCT_NOT_FOUND":
        return HTTPException(status_code=404, detail=detail)
    if code == "ORDER_NOT_IN_QUEUE":
        return HTTPException(status_code=404, detail=detail)
    if code in (
        "BASKET_NOT_FOUND",
        "BASKET_EMPTY",
        "BASKET_ORDER_NOT_IN_QUEUE",
        "SHELF_NOT_FOUND",
        "SHELF_ORDER_NOT_IN_QUEUE",
        "CART_NOT_FOUND",
    ):
        return HTTPException(status_code=404, detail=detail)
    if code == "AMBIGUOUS_BASKET_CODE":
        return HTTPException(status_code=409, detail=detail)
    if code == "SCOPE_REQUIRED":
        return HTTPException(status_code=400, detail=detail)
    if code == "SHELF_ORDER_NOT_READY":
        return HTTPException(status_code=400, detail=detail)
    if code in (
        "WRONG_PRODUCT",
        "ALREADY_PACKED",
        "INVALID_QUANTITY",
        "ORDER_NOT_FULLY_PACKED",
        "LINE_NOT_FULLY_PACKED",
        "UNRESOLVED_SHORTAGES",
        "CARTON_REQUIRED",
    ):
        return HTTPException(status_code=400, detail=detail)
    if code == "FORBIDDEN_FINISH_WITHOUT_CARTON":
        return HTTPException(status_code=403, detail=detail)
    return HTTPException(status_code=400, detail=detail)


@router.get("/packing/resolve-shelf", response_model=WmsPackingShelfOrderOut)
def get_packing_resolve_shelf(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1, description="order_ui_status_id — jak w GET /wms/packing/orders"),
    mode: str = Query(..., description="no_cart | bulk | baskets"),
    cart_id: int | None = Query(default=None, ge=1),
    code: str = Query(..., min_length=1, description="Etykieta półki kompletacyjnej, np. RK-01/A2"),
    db: Session = Depends(get_db),
):
    """Wejście do pakowania po skanie półki kompletacyjnej — jak koszyk / EAN."""
    try:
        return resolve_packing_order_for_shelf_scan(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            shelf_scan=code,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
        )
    except PackingScanError as e:
        raise _packing_scan_http_exception(e) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        logger.exception("get_packing_resolve_shelf")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.get("/packing/resolve-ean", response_model=WmsPackingResolveEanOut)
def get_packing_resolve_ean(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1, description="order_ui_status_id — jak w GET /wms/packing/orders"),
    mode: str = Query(..., description="no_cart | bulk | baskets"),
    cart_id: int | None = Query(default=None, ge=1),
    ean: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Pierwsze zamówienie FIFO z kolejki, które wymaga podanego produktu (EAN / kody jak przy przyjęciu)."""
    try:
        oid = find_first_packing_order_id_for_ean(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
            ean_raw=ean,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        logger.exception("get_packing_resolve_ean")
        raise HTTPException(status_code=500, detail="Database error") from e
    if oid is None:
        raise HTTPException(status_code=404, detail={"code": "PRODUCT_NOT_FOUND"})
    return WmsPackingResolveEanOut(order_id=int(oid))


@router.post("/packing/resolve-ean/scan", response_model=WmsPackingScanOut)
def post_packing_resolve_ean_scan(
    body: WmsPackingScanBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1),
    mode: str = Query(...),
    cart_id: int | None = Query(default=None, ge=1),
    handoff_scope: str | None = Query(
        default=None,
        description="CART | BASKET | CARTLESS — obowiązkowy scope (bez global FIFO)",
    ),
    order_id: int | None = Query(
        default=None,
        ge=1,
        description="Wymagane dla scope=BASKET (exact order)",
    ),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """
    Skan EAN: scoped choose + packing increment dokładnie raz.
    Brak scope → 400 SCOPE_REQUIRED (nie global warehouse FIFO).
    """
    try:
        return packing_resolve_and_scan_ean(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
            ean_raw=body.ean,
            operator_user_id=int(current_user.id) if current_user is not None else None,
            handoff_scope=handoff_scope,
            order_id=order_id,
        )
    except PackingScanError as e:
        db.rollback()
        raise _packing_scan_http_exception(e) from e
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_resolve_ean_scan")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.post("/packing/orders/{order_id}/enter", response_model=WmsPackingEntryOut)
def post_packing_order_enter(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    source_workflow: str = Query(default="shortage", max_length=32),
    redirected_from: str | None = Query(default=None, max_length=64),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """Bootstrap sesji pakowania — bezpośrednie wejście z braków / OMS (bez pulpitu pakowania)."""
    try:
        out = resolve_packing_entry_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order_id),
            operator_user_id=int(current_user.id) if current_user and current_user.id else None,
            source_workflow=str(source_workflow or "shortage").strip() or "shortage",
            redirected_from=redirected_from,
        )
        db.commit()
        return out
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_order_enter order_id=%s", order_id)
        raise HTTPException(status_code=500, detail="Database error") from e


@router.get("/packing/orders/{order_id}/detail", response_model=WmsPackingOrderDetailOut)
def get_packing_order_detail(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1),
    mode: str = Query(...),
    cart_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    try:
        detail = get_packing_order_detail_for_queue(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
            order_id=order_id,
        )
        if detail is not None and current_user is not None and current_user.id is not None:
            order = (
                db.query(Order)
                .filter(
                    Order.id == int(order_id),
                    Order.tenant_id == int(tenant_id),
                    Order.warehouse_id == int(warehouse_id),
                )
                .first()
            )
            if order is not None:
                touch_wms_packing_session_activity(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    order=order,
                    operator_user_id=int(current_user.id),
                    metadata={
                        "screen": "packing_order_detail",
                        "mode": mode,
                        "cart_id": int(cart_id) if cart_id is not None else None,
                        "status_id": int(status),
                        "progress_done": int(detail.packed_quantity),
                        "progress_total": int(detail.total_quantity),
                        "progress_percent": int(round((detail.packed_quantity / detail.total_quantity) * 100))
                        if int(detail.total_quantity or 0) > 0
                        else 0,
                    },
                )
                db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("get_packing_order_detail")
        raise HTTPException(status_code=500, detail="Database error") from e
    if detail is None:
        raise HTTPException(status_code=404, detail={"code": "ORDER_NOT_IN_QUEUE"})
    return detail


@router.post("/packing/orders/{order_id}/acknowledge-reopen")
def post_packing_acknowledge_reopen(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Świadome potwierdzenie komunikatu o wcześniej spakowanym zamówieniu → log zamówienia."""
    try:
        acknowledge_packing_reopen(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order_id),
            operator_user_id=int(current_user.id) if current_user.id is not None else None,
        )
    except ValueError as e:
        db.rollback()
        code = str(e)
        if code == "ORDER_NOT_FOUND":
            raise HTTPException(status_code=404, detail={"code": "ORDER_NOT_FOUND"}) from e
        raise HTTPException(status_code=400, detail=code) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_acknowledge_reopen")
        raise HTTPException(status_code=500, detail="Database error") from e
    return {"ok": True}


@router.post("/packing/orders/{order_id}/scan", response_model=WmsPackingScanOut)
def post_packing_order_scan(
    order_id: int,
    body: WmsPackingScanBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1),
    mode: str = Query(...),
    cart_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    try:
        return packing_scan_increment(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
            order_id=order_id,
            ean_raw=body.ean,
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
    except PackingScanError as e:
        db.rollback()
        raise _packing_scan_http_exception(e) from e
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_order_scan")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.post("/packing/orders/{order_id}/line-pack", response_model=WmsPackingScanOut)
def post_packing_order_line_pack(
    order_id: int,
    body: WmsPackingLinePackBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1),
    mode: str = Query(...),
    cart_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """
    Aktualizuje ilość spakowaną na linii (tylko ilości + commit). **Nie** uruchamia dokumentów ani potoku
    post-pack — po ``fully_packed`` frontend wywołuje ``POST …/finish``.
    """
    try:
        return packing_apply_line_pack(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
            order_id=order_id,
            order_item_id=body.order_item_id,
            quantity=body.quantity,
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
    except PackingScanError as e:
        db.rollback()
        raise _packing_scan_http_exception(e) from e
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_order_line_pack")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.post(
    "/packing/orders/{order_id}/approve-extra-parcels",
    response_model=WmsPackingManagerParcelApproveOut,
)
def post_packing_approve_extra_parcels(
    order_id: int,
    body: WmsPackingManagerParcelApproveBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1),
    mode: str = Query(...),
    cart_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """
    Jednorazowa zgoda kierownika (skan ``barcode_login_code``) na przekroczenie
    limitu paczek bez potwierdzenia — dotyczy wyłącznie tego zamówienia.
    """
    _ = current_user
    try:
        _order, manager = approve_packing_extra_parcels_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            status_id=int(status),
            mode=mode,
            cart_id=cart_id,
            order_id=int(order_id),
            barcode=body.barcode,
        )
        return WmsPackingManagerParcelApproveOut(
            ok=True,
            approved_by_user_id=int(manager.id),
            message="Zgoda kierownika zapisana. Możesz dodać kolejne paczki.",
        )
    except ValueError as e:
        db.rollback()
        code = str(e)
        if code == "ORDER_NOT_IN_QUEUE":
            raise HTTPException(status_code=404, detail={"code": code}) from e
        if code == "MULTI_PARCEL_DISABLED":
            raise HTTPException(
                status_code=400,
                detail={"code": code, "message": "Wielopaczkowość jest wyłączona."},
            ) from e
        if code == "INVALID_MANAGER_CODE":
            raise HTTPException(
                status_code=400,
                detail={"code": code, "message": "Nie rozpoznano kodu kierownika."},
            ) from e
        if code == "NOT_A_MANAGER":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": code,
                    "message": "Zeskanowany użytkownik nie ma uprawnienia „Kierownik”.",
                },
            ) from e
        raise HTTPException(status_code=400, detail={"code": code, "message": code}) from e
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_approve_extra_parcels")
        raise HTTPException(status_code=500, detail="Database error") from None


@router.post("/packing/orders/{order_id}/finish", response_model=WmsPackingScanOut)
def post_packing_order_finish(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1),
    mode: str = Query(...),
    cart_id: int | None = Query(default=None, ge=1),
    order_type: str = Query(
        default="all",
        description="all | single | multi — filtr kolejki przy NEXT_ORDER",
    ),
    body: WmsPackingFinishBody = Body(default_factory=WmsPackingFinishBody),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """
    Domknięcie pakowania: wymaga w pełni spakowanych linii; uruchamia potok post-pack
    (m.in. ``create_sale_document`` / ``sale_documents``). Wywoływane **po** ostatnim skanie / line-pack.
    """
    try:
        return packing_finish_order(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
            order_id=order_id,
            operator_user_id=int(current_user.id) if current_user is not None else None,
            allow_without_carton=bool(body.allow_without_carton),
            packaging_carton_ids=list(body.packaging_carton_ids or []),
            current_user=current_user,
            order_type=order_type,
        )
    except PackingScanError as e:
        db.rollback()
        raise _packing_scan_http_exception(e) from e
    except ValueError as e:
        db.rollback()
        msg = str(e).strip()
        if msg == "MANAGER_APPROVAL_REQUIRED":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "MANAGER_APPROVAL_REQUIRED",
                    "error": "MANAGER_APPROVAL_REQUIRED",
                    "message": (
                        "Limit paczek bez potwierdzenia został przekroczony. "
                        "Wymagana zgoda kierownika."
                    ),
                },
            ) from e
        raise HTTPException(
            status_code=400,
            detail={"code": msg[:120] or "PACKING_FINISH_VALIDATION", "error": msg[:500]},
        ) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_order_finish")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "PACKING_FINISH_DATABASE_ERROR",
                "error": "Błąd bazy danych podczas domknięcia pakowania",
                "message": str(e)[:400],
            },
        ) from e
    except Exception as e:
        db.rollback()
        logger.exception("post_packing_order_finish")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "PACKING_FINISH_FAILED",
                "error": "Nie udało się domknąć pakowania",
                "message": str(e)[:400],
            },
        ) from e


@router.post("/packing/orders/{order_id}/pack-all", response_model=WmsPackingScanOut)
def post_packing_order_pack_all(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    status: int = Query(..., ge=1),
    mode: str = Query(...),
    cart_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    try:
        return packing_pack_all_lines(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            status_id=status,
            mode=mode,
            cart_id=cart_id,
            order_id=order_id,
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
    except PackingScanError as e:
        db.rollback()
        raise _packing_scan_http_exception(e) from e
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_order_pack_all")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.post("/packing/orders/{order_id}/mark-shortage", response_model=WmsPackingMarkShortageOut)
def post_packing_order_mark_shortage(
    order_id: int,
    body: WmsPackingMarkShortageBody = Body(...),
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """
    Oznacz pozycję jako brak z ekranu pakowania → status z ustawienia ``missing_status_id``
    → operator wraca do listy (nawigacja FE).
    """
    try:
        out = packing_mark_line_shortage_and_defer(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order_id),
            order_item_id=int(body.order_item_id),
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
        db.commit()
        return WmsPackingMarkShortageOut(**out)
    except PackingShortageError as e:
        db.rollback()
        detail = {"code": str(e.code)}
        if e.message:
            detail["error"] = str(e.message)
        if e.order_item_id is not None:
            detail["order_item_id"] = int(e.order_item_id)
        status = 400
        if e.code in ("ORDER_NOT_FOUND", "LINE_NOT_FOUND"):
            status = 404
        raise HTTPException(status_code=status, detail=detail) from e
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_order_mark_shortage")
        raise HTTPException(status_code=500, detail="Database error")


@router.post("/packing/orders/{order_id}/pause")
def post_packing_order_pause(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    reason: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """Audyt operacyjny: pauza pakowania (terminal wywołuje przy zejściu ze stanowiska)."""
    o = (
        db.query(Order)
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if o is None:
        raise HTTPException(status_code=404, detail="ORDER_NOT_FOUND")
    try:
        emit_wms_packing_paused(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order_id),
            operator_user_id=int(current_user.id) if current_user is not None else None,
            reason=reason,
        )
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_order_pause")
        raise HTTPException(status_code=500, detail="Database error") from e
    return {"ok": True}


@router.post("/packing/orders/{order_id}/resume")
def post_packing_order_resume(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: Optional[AppUser] = Depends(get_optional_current_user),
):
    """Audyt operacyjny: wznowienie pakowania."""
    o = (
        db.query(Order)
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if o is None:
        raise HTTPException(status_code=404, detail="ORDER_NOT_FOUND")
    try:
        emit_wms_packing_resumed(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order_id),
            operator_user_id=int(current_user.id) if current_user is not None else None,
        )
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_order_resume")
        raise HTTPException(status_code=500, detail="Database error") from e
    return {"ok": True}


@router.post(
    "/packing/orders/{order_id}/replacement-label",
    response_model=WmsPackingReplacementLabelOut,
)
def post_packing_replacement_label(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    body: WmsPackingReplacementLabelCreateBody = Body(default_factory=WmsPackingReplacementLabelCreateBody),
    db: Session = Depends(get_db),
):
    """Wygeneruj etykietę zastępczą + zapisz snapshot wyborów pakowania."""
    from ..services.wms_packing_replacement_label_service import (
        ReplacementLabelError,
        create_replacement_label,
        pdf_to_base64,
        serialize_replacement_row,
    )

    order = (
        db.query(Order)
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="ORDER_NOT_FOUND")
    try:
        row, pdf = create_replacement_label(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order=order,
            courier_error=body.courier_error,
        )
        db.commit()
        db.refresh(row)
        out = serialize_replacement_row(row)
        out["pdf_base64"] = pdf_to_base64(pdf)
        return WmsPackingReplacementLabelOut.model_validate(out)
    except ReplacementLabelError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail={"code": e.code, "error": e.message}) from e
    except ValueError as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail={"code": "REPLACEMENT_LABEL_RENDER_FAILED", "error": str(e)[:500]},
        ) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_replacement_label")
        raise HTTPException(status_code=500, detail="Database error") from e


@router.get(
    "/packing/replacement-labels/by-barcode/{barcode}",
    response_model=WmsPackingReplacementLabelOut,
)
def get_packing_replacement_label_by_barcode(
    barcode: str,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    from ..services.wms_packing_replacement_label_service import get_by_barcode, serialize_replacement_row

    row = get_by_barcode(db, tenant_id=int(tenant_id), barcode=barcode)
    if row is None:
        raise HTTPException(status_code=404, detail="REPLACEMENT_LABEL_NOT_FOUND")
    return WmsPackingReplacementLabelOut.model_validate(serialize_replacement_row(row))


@router.post(
    "/packing/replacement-labels/{replacement_id}/retry-courier",
    response_model=WmsPackingReplacementLabelRetryOut,
)
def post_packing_replacement_label_retry(
    replacement_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """Po skanie etykiety zastępczej — przywróć snapshot i ponów generowanie listu kurierskiego."""
    from ..models.wms_packing_replacement_label import WmsPackingReplacementLabel
    from ..services.wms_packing_replacement_label_service import (
        ReplacementLabelError,
        retry_courier_label_from_replacement,
    )

    row = (
        db.query(WmsPackingReplacementLabel)
        .filter(
            WmsPackingReplacementLabel.id == int(replacement_id),
            WmsPackingReplacementLabel.tenant_id == int(tenant_id),
            WmsPackingReplacementLabel.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="REPLACEMENT_LABEL_NOT_FOUND")
    try:
        result = retry_courier_label_from_replacement(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            row=row,
        )
        db.commit()
        return WmsPackingReplacementLabelRetryOut.model_validate(result)
    except ReplacementLabelError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail={"code": e.code, "error": e.message}) from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("post_packing_replacement_label_retry")
        raise HTTPException(status_code=500, detail="Database error") from e
