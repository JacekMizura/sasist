"""WMS pakowanie — statusy docelowe z konfiguracji zbierania + lista zamówień."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..auth.deps import get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..schemas.wms_packing import (
    WmsPackingEntryOut,
    WmsPackingFinishBody,
    WmsPackingLinePackBody,
    WmsPackingModeDistribution,
    WmsPackingOrderCard,
    WmsPackingOrderDetailOut,
    WmsPackingResolveEanOut,
    WmsPackingScanBody,
    WmsPackingScanOut,
    WmsPackingTargetStatusItem,
)
from ..services.wms_audit_service import emit_wms_packing_paused, emit_wms_packing_resumed, touch_wms_packing_session_activity
from ..services.wms_packing_service import (
    PackingScanError,
    find_first_packing_order_id_for_ean,
    get_packing_order_detail_for_queue,
    list_packing_orders,
    list_packing_target_statuses,
    packing_apply_line_pack,
    packing_finish_order,
    packing_mode_distribution,
    packing_pack_all_lines,
    packing_scan_increment,
    resolve_packing_entry_for_order,
)

router = APIRouter(prefix="/wms", tags=["WMS packing"])
logger = logging.getLogger(__name__)


@router.get("/packing/target-statuses", response_model=list[WmsPackingTargetStatusItem])
def get_packing_target_statuses(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Unikalne statusy panelu będące ``target_status_id`` w ``picking_config``
    (kolejka „po zbieraniu” / gotowe do pakowania).
    """
    try:
        return list_packing_target_statuses(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    except SQLAlchemyError:
        logger.exception("get_packing_target_statuses")
        return []


@router.get("/packing/modes", response_model=WmsPackingModeDistribution)
def get_packing_modes(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    status: int = Query(..., ge=1, description="order_ui_status_id — status kolejki pakowania"),
    db: Session = Depends(get_db),
):
    """Liczba zamówień w statusie: bez wózka / na wózku BULK / na wózku z koszykami (MULTI)."""
    try:
        no_cart, bulk, baskets = packing_mode_distribution(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=status
        )
        return WmsPackingModeDistribution(no_cart=no_cart, bulk=bulk, baskets=baskets)
    except SQLAlchemyError:
        logger.exception("get_packing_modes")
        return WmsPackingModeDistribution(no_cart=0, bulk=0, baskets=0)


@router.get("/packing/orders", response_model=list[WmsPackingOrderCard])
def get_packing_orders(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    status: int = Query(..., ge=1, description="order_ui_status_id — status „gotowe do pakowania”"),
    mode: str = Query(
        ...,
        description="no_cart | bulk | baskets — zgodnie z wyborem na ekranie trybu pakowania",
    ),
    cart_id: int | None = Query(default=None, ge=1, description="Wymagane dla mode=bulk i mode=baskets"),
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
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError:
        logger.exception("get_packing_orders")
        return []


def _packing_scan_http_exception(exc: PackingScanError) -> HTTPException:
    code = str(exc.code)
    if code == "PRODUCT_NOT_FOUND":
        return HTTPException(status_code=404, detail={"code": code})
    if code == "ORDER_NOT_IN_QUEUE":
        return HTTPException(status_code=404, detail={"code": code})
    if code in ("BASKET_NOT_FOUND", "BASKET_EMPTY", "BASKET_ORDER_NOT_IN_QUEUE"):
        return HTTPException(status_code=404, detail={"code": code})
    if code in (
        "WRONG_PRODUCT",
        "ALREADY_PACKED",
        "INVALID_QUANTITY",
        "ORDER_NOT_FULLY_PACKED",
        "CARTON_REQUIRED",
    ):
        return HTTPException(status_code=400, detail={"code": code})
    if code == "FORBIDDEN_FINISH_WITHOUT_CARTON":
        return HTTPException(status_code=403, detail={"code": code})
    return HTTPException(status_code=400, detail={"code": code})


@router.get("/packing/resolve-ean", response_model=WmsPackingResolveEanOut)
def get_packing_resolve_ean(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
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
    except SQLAlchemyError:
        logger.exception("get_packing_resolve_ean")
        raise HTTPException(status_code=500, detail="Database error") from None
    if oid is None:
        raise HTTPException(status_code=404, detail={"code": "PRODUCT_NOT_FOUND"})
    return WmsPackingResolveEanOut(order_id=int(oid))


@router.post("/packing/orders/{order_id}/enter", response_model=WmsPackingEntryOut)
def post_packing_order_enter(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
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
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_order_enter order_id=%s", order_id)
        raise HTTPException(status_code=500, detail="Database error") from None


@router.get("/packing/orders/{order_id}/detail", response_model=WmsPackingOrderDetailOut)
def get_packing_order_detail(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
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
    except SQLAlchemyError:
        db.rollback()
        logger.exception("get_packing_order_detail")
        raise HTTPException(status_code=500, detail="Database error") from None
    if detail is None:
        raise HTTPException(status_code=404, detail={"code": "ORDER_NOT_IN_QUEUE"})
    return detail


@router.post("/packing/orders/{order_id}/scan", response_model=WmsPackingScanOut)
def post_packing_order_scan(
    order_id: int,
    body: WmsPackingScanBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
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
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_order_scan")
        raise HTTPException(status_code=500, detail="Database error") from None


@router.post("/packing/orders/{order_id}/line-pack", response_model=WmsPackingScanOut)
def post_packing_order_line_pack(
    order_id: int,
    body: WmsPackingLinePackBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
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
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_order_line_pack")
        raise HTTPException(status_code=500, detail="Database error") from None


@router.post("/packing/orders/{order_id}/finish", response_model=WmsPackingScanOut)
def post_packing_order_finish(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    status: int = Query(..., ge=1),
    mode: str = Query(...),
    cart_id: int | None = Query(default=None, ge=1),
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
            current_user=current_user,
        )
    except PackingScanError as e:
        db.rollback()
        raise _packing_scan_http_exception(e) from e
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_order_finish")
        raise HTTPException(status_code=500, detail="Database error") from None


@router.post("/packing/orders/{order_id}/pack-all", response_model=WmsPackingScanOut)
def post_packing_order_pack_all(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
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
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_order_pack_all")
        raise HTTPException(status_code=500, detail="Database error") from None


@router.post("/packing/orders/{order_id}/pause")
def post_packing_order_pause(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
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
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_order_pause")
        raise HTTPException(status_code=500, detail="Database error") from None
    return {"ok": True}


@router.post("/packing/orders/{order_id}/resume")
def post_packing_order_resume(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
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
    except SQLAlchemyError:
        db.rollback()
        logger.exception("post_packing_order_resume")
        raise HTTPException(status_code=500, detail="Database error") from None
    return {"ok": True}
