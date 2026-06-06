"""Operational direct sales — command-style session API (not CRUD cart)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..api.operational_features_deps import operational_sales_sessions_for_request
from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ..schemas.direct_sales import (
    DirectSaleAddProductBody,
    DirectSaleCompleteBody,
    DirectSaleCompleteResponse,
    DirectSaleLinePatchBody,
    DirectSaleProductSearchHit,
    DirectSaleScanBody,
    DirectSaleScanResponse,
    DirectSaleSessionCreateBody,
    DirectSaleSessionLineRead,
    DirectSaleSessionRead,
    DirectSaleSetCustomerBody,
    DirectSaleStartPaymentBody,
)
from ..services.direct_sale_complete_service import (
    complete_direct_sale_session,
    start_direct_sale_payment,
)
from ..services.direct_sale.line_service import (
    add_product_to_session,
    remove_session_line,
    update_session_line_location,
    update_session_line_quantity,
)
from ..services.direct_sale.product_search_service import search_direct_sale_products
from ..services.direct_sale.session_enrichment import enrich_session_lines
from ..services.direct_sale_service import (
    DirectSaleError,
    create_session,
    get_session,
    session_scan_add_line,
    set_session_customer,
    suspend_session,
)

router = APIRouter(
    prefix="/direct-sales",
    tags=["Direct sales"],
    dependencies=[Depends(operational_sales_sessions_for_request)],
)


def _operator_id(user: AppUser | None) -> int | None:
    if user is None or user.id is None:
        return None
    return int(user.id)


def _line_to_read(line: DirectSaleSessionLine, *, meta: dict | None = None) -> DirectSaleSessionLineRead:
    m = meta or {}
    return DirectSaleSessionLineRead(
        id=int(line.id),
        product_id=int(line.product_id),
        quantity=float(line.quantity or 0),
        unit_price=float(line.unit_price) if line.unit_price is not None else None,
        discount_amount=float(line.discount_amount or 0),
        source_location_id=int(line.source_location_id) if line.source_location_id else None,
        suggested_location_id=int(line.suggested_location_id) if line.suggested_location_id else None,
        sort_order=int(line.sort_order or 0),
        product_name=m.get("product_name"),
        product_sku=m.get("product_sku"),
        product_ean=m.get("product_ean"),
        image_url=m.get("image_url"),
        source_location_code=m.get("source_location_code"),
        operational_zone_type=m.get("operational_zone_type"),
        available_qty_hint=m.get("available_qty_hint"),
        has_reservation=bool(m.get("has_reservation")),
    )


def _session_to_read(db: Session, sess: DirectSaleSession) -> DirectSaleSessionRead:
    enriched = enrich_session_lines(db, sess)
    lines = [
        _line_to_read(row["line"], meta=row)
        for row in enriched
    ]
    payment_ctx = None
    raw_pay = getattr(sess, "payment_context_json", None)
    if raw_pay:
        import json

        try:
            payment_ctx = json.loads(raw_pay)
        except (json.JSONDecodeError, TypeError):
            payment_ctx = None
    return DirectSaleSessionRead(
        id=int(sess.id),
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        operator_user_id=int(sess.operator_user_id) if sess.operator_user_id else None,
        workstation_id=int(sess.workstation_id) if sess.workstation_id else None,
        operational_zone_id=int(sess.operational_zone_id) if sess.operational_zone_id else None,
        status=sess.status,  # type: ignore[arg-type]
        order_id=int(sess.order_id) if sess.order_id else None,
        issue_strategy=sess.issue_strategy,  # type: ignore[arg-type]
        reservation_scope=sess.reservation_scope,  # type: ignore[arg-type]
        started_at=sess.started_at,
        suspended_at=sess.suspended_at,
        last_activity_at=sess.last_activity_at,
        completed_at=sess.completed_at,
        customer_id=int(sess.customer_id) if getattr(sess, "customer_id", None) else None,
        expires_at=getattr(sess, "expires_at", None),
        payment_context=payment_ctx,
        lines=lines,
    )


def _require_session(
    db: Session,
    *,
    session_id: int,
    tenant_id: int,
) -> DirectSaleSession:
    sess = get_session(db, session_id, tenant_id=tenant_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Direct sale session not found.")
    return sess


@router.post("/session", response_model=DirectSaleSessionRead)
def post_create_session(
    body: DirectSaleSessionCreateBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    sess = create_session(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        operator_user_id=_operator_id(user),
        workstation_id=body.workstation_id,
        operational_zone_id=body.operational_zone_id,
        issue_strategy=body.issue_strategy,
        reservation_scope=body.reservation_scope,
    )
    db.commit()
    db.refresh(sess)
    return _session_to_read(db, sess)


@router.get("/products/search", response_model=list[DirectSaleProductSearchHit])
def get_direct_sale_product_search(
    q: str = Query("", min_length=0),
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    limit: int = Query(12, ge=1, le=24),
    db: Session = Depends(get_db),
):
    rows = search_direct_sale_products(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        query=q,
        limit=limit,
    )
    return [DirectSaleProductSearchHit(**row) for row in rows]


@router.get("/session/{session_id}", response_model=DirectSaleSessionRead)
def get_direct_sale_session(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    return _session_to_read(db, sess)


@router.post("/session/{session_id}/scan", response_model=DirectSaleScanResponse)
def post_session_scan(
    session_id: int,
    body: DirectSaleScanBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        line, suggestions = session_scan_add_line(
            db,
            sess,
            code=body.code,
            quantity=body.quantity,
            source_location_id=body.source_location_id,
        )
        if _operator_id(user) and not sess.operator_user_id:
            sess.operator_user_id = _operator_id(user)
        db.commit()
        db.refresh(line)
        return DirectSaleScanResponse(
            session_id=int(sess.id),
            line_id=int(line.id),
            product_id=int(line.product_id),
            quantity=float(line.quantity),
            suggested_locations=suggestions,
        )
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.post("/session/{session_id}/add-product", response_model=DirectSaleScanResponse)
def post_session_add_product(
    session_id: int,
    body: DirectSaleAddProductBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        line, suggestions = add_product_to_session(
            db,
            sess,
            product_id=body.product_id,
            quantity=body.quantity,
            source_location_id=body.source_location_id,
        )
        if _operator_id(user) and not sess.operator_user_id:
            sess.operator_user_id = _operator_id(user)
        db.commit()
        db.refresh(line)
        return DirectSaleScanResponse(
            session_id=int(sess.id),
            line_id=int(line.id),
            product_id=int(line.product_id),
            quantity=float(line.quantity),
            suggested_locations=suggestions,
        )
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.patch("/session/{session_id}/lines/{line_id}", response_model=DirectSaleSessionRead)
def patch_session_line(
    session_id: int,
    line_id: int,
    body: DirectSaleLinePatchBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        if body.quantity is not None:
            update_session_line_quantity(db, sess, line_id=line_id, quantity=body.quantity)
        if body.source_location_id is not None:
            update_session_line_location(
                db,
                sess,
                line_id=line_id,
                source_location_id=body.source_location_id,
            )
        db.commit()
        db.refresh(sess)
        return _session_to_read(db, sess)
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.delete("/session/{session_id}/lines/{line_id}", response_model=DirectSaleSessionRead)
def delete_session_line(
    session_id: int,
    line_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        remove_session_line(db, sess, line_id=line_id)
        db.commit()
        db.refresh(sess)
        return _session_to_read(db, sess)
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.post("/session/{session_id}/suspend", response_model=DirectSaleSessionRead)
def post_session_suspend(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        suspend_session(db, sess)
        db.commit()
        db.refresh(sess)
        return _session_to_read(db, sess)
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.post("/session/{session_id}/set-customer", response_model=DirectSaleSessionRead)
def post_session_set_customer(
    session_id: int,
    body: DirectSaleSetCustomerBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        set_session_customer(db, sess, customer_id=body.customer_id)
        db.commit()
        db.refresh(sess)
        return _session_to_read(db, sess)
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.post("/session/{session_id}/start-payment", response_model=DirectSaleSessionRead)
def post_session_start_payment(
    session_id: int,
    body: DirectSaleStartPaymentBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        start_direct_sale_payment(
            db,
            sess,
            payment_method=body.payment_method,
            performed_by_user_id=_operator_id(user),
        )
        db.commit()
        db.refresh(sess)
        return _session_to_read(db, sess)
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.post("/session/{session_id}/complete", response_model=DirectSaleCompleteResponse)
def post_session_complete(
    session_id: int,
    body: DirectSaleCompleteBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        result = complete_direct_sale_session(
            db,
            sess,
            payment_method=body.payment_method,
            document_subtype=body.document_subtype,
            performed_by_user_id=_operator_id(user),
        )
        db.commit()
        return DirectSaleCompleteResponse(
            session_id=result.session_id,
            order_id=result.order_id,
            payment_id=result.payment_id,
            document_job_id=result.document_job_id,
            document_number=result.document_number,
            total_amount=result.total_amount,
            payment_status=result.payment_status,
            payment_method=result.payment_method,
        )
    except DirectSaleError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Nie udało się zakończyć sprzedaży.") from exc
