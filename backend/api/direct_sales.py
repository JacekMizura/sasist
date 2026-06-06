"""Operational direct sales — command-style session API (not CRUD cart)."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
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
    DirectSaleCompletionRead,
    DirectSaleHistoryEntryRead,
    DirectSaleLinePatchBody,
    DirectSaleProductSearchHit,
    DirectSaleScanBody,
    DirectSaleScanResponse,
    DirectSaleSessionCreateBody,
    DirectSaleSessionLineRead,
    DirectSaleSessionRead,
    DirectSaleSetCustomerBody,
    DirectSaleStartPaymentBody,
    DirectSaleSuspendedSummaryRead,
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
from ..services.direct_sale.completion_read_service import build_direct_sale_completion_read
from ..services.direct_sale.history_service import list_direct_sale_history
from ..services.direct_sale.product_search_service import search_direct_sale_products
from ..services.documents.generation_queue_service import enqueue_document_job
from ..services.direct_sale.session_enrichment import enrich_session_lines
from ..services.operational_feature_resolver import allow_operational_features_debug
from ..services.direct_sale_service import (
    DirectSaleError,
    cancel_session,
    create_session,
    get_session,
    list_suspended_sessions,
    resume_session,
    session_scan_add_line,
    set_session_customer,
    suspend_session,
)

router = APIRouter(
    prefix="/direct-sales",
    tags=["Direct sales"],
    dependencies=[Depends(operational_sales_sessions_for_request)],
)

_logger = logging.getLogger(__name__)
_logger.info(
    "[startup.direct-sales.router] registered add-product endpoint v2, set-customer v2, clear-customer, debug-echo"
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
        product_catalog_number=m.get("product_catalog_number"),
        margin_percent=m.get("margin_percent"),
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


def _line_total_amount(line: DirectSaleSessionLine) -> float:
    qty = float(line.quantity or 0)
    price = float(line.unit_price) if line.unit_price is not None else 0.0
    discount = float(line.discount_amount or 0)
    return max(0.0, qty * price - discount)


def _suspended_summary(db: Session, sess: DirectSaleSession) -> DirectSaleSuspendedSummaryRead:
    from datetime import datetime

    from ..models.app_user import AppUser

    operator_label = None
    if sess.operator_user_id:
        user = db.query(AppUser).filter(AppUser.id == int(sess.operator_user_id)).first()
        if user:
            name = " ".join(
                p for p in (getattr(user, "first_name", None), getattr(user, "last_name", None)) if p
            ).strip()
            operator_label = name or str(getattr(user, "login", None) or f"#{user.id}")
    lines = list(sess.lines or [])
    total = sum(_line_total_amount(ln) for ln in lines)
    age_minutes = None
    ref = sess.suspended_at or sess.started_at
    if ref is not None:
        age_minutes = max(0, int((datetime.utcnow() - ref).total_seconds() // 60))
    return DirectSaleSuspendedSummaryRead(
        id=int(sess.id),
        operator_user_id=int(sess.operator_user_id) if sess.operator_user_id else None,
        operator_label=operator_label,
        line_count=len(lines),
        total_amount=round(total, 2),
        suspended_at=sess.suspended_at,
        started_at=sess.started_at,
        age_minutes=age_minutes,
    )


def _completion_read_or_404(db: Session, *, tenant_id: int, session_id: int) -> DirectSaleCompletionRead:
    bundle = build_direct_sale_completion_read(db, tenant_id=tenant_id, session_id=session_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Brak danych zakończenia sesji.")
    return DirectSaleCompletionRead(**bundle)


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


@router.get("/history", response_model=list[DirectSaleHistoryEntryRead])
def get_direct_sale_history(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    today_only: bool = Query(False),
    operator_user_id: int | None = Query(None, ge=1),
    workstation_id: int | None = Query(None, ge=1),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows = list_direct_sale_history(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        today_only=today_only,
        operator_user_id=operator_user_id,
        workstation_id=workstation_id,
        limit=limit,
    )
    return [DirectSaleHistoryEntryRead(**row) for row in rows]


@router.get("/session/{session_id}/completion", response_model=DirectSaleCompletionRead)
def get_session_completion(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return _completion_read_or_404(db, tenant_id=tenant_id, session_id=session_id)


@router.get("/sessions/suspended", response_model=list[DirectSaleSuspendedSummaryRead])
def get_suspended_sessions(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    rows = list_suspended_sessions(db, tenant_id=tenant_id, warehouse_id=warehouse_id, limit=limit)
    return [_suspended_summary(db, row) for row in rows]


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


@router.post("/debug/echo")
async def post_direct_sales_debug_echo(request: Request):
    """Temporary — verify frontend payloads (dev/staging only)."""
    if not allow_operational_features_debug():
        raise HTTPException(status_code=404, detail="Not found")
    raw = await request.body()
    parsed: object | None = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None
    return {
        "method": request.method,
        "path": str(request.url.path),
        "query": dict(request.query_params),
        "headers": {
            k: v
            for k, v in request.headers.items()
            if k.lower() in ("content-type", "content-length", "accept")
        },
        "raw_body": raw.decode("utf-8", errors="replace") if raw else "",
        "parsed_body": parsed,
    }


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
            quantity=float(body.quantity),
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


@router.post("/session/{session_id}/resume", response_model=DirectSaleSessionRead)
def post_session_resume(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        resume_session(db, sess)
        db.commit()
        db.refresh(sess)
        return _session_to_read(db, sess)
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc


@router.post("/session/{session_id}/cancel", response_model=DirectSaleSessionRead)
def post_session_cancel(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        cancel_session(db, sess)
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


@router.post("/session/{session_id}/clear-customer", response_model=DirectSaleSessionRead)
def post_session_clear_customer(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    try:
        set_session_customer(db, sess, customer_id=None)
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
    _complete_log = logging.getLogger(__name__)
    sess = _require_session(db, session_id=session_id, tenant_id=tenant_id)
    current_step = "validation"
    _complete_log.info(
        "[direct-sales.complete.validation] session_id=%s tenant_id=%s warehouse_id=%s status=%s lines=%s",
        session_id,
        tenant_id,
        int(sess.warehouse_id),
        sess.status,
        len(sess.lines or []),
    )
    try:
        splits = None
        if body.payment_splits:
            splits = [{"method": s.method, "amount": float(s.amount)} for s in body.payment_splits]
        result = complete_direct_sale_session(
            db,
            sess,
            payment_method=body.payment_method,
            document_subtype=body.document_subtype,
            payment_splits=splits,
            performed_by_user_id=_operator_id(user),
        )
        current_step = "commit"
        db.commit()
        current_step = "response"
        completion = None
        completion_read = None
        try:
            completion_read = build_direct_sale_completion_read(db, tenant_id=tenant_id, session_id=int(sess.id))
            if completion_read:
                completion = DirectSaleCompletionRead(**completion_read)
        except Exception as read_exc:
            _complete_log.warning(
                "[direct-sales.complete.error] session_id=%s step=response read_model_failed=%s",
                session_id,
                read_exc,
            )
        return DirectSaleCompleteResponse(
            session_id=result.session_id,
            order_id=result.order_id,
            payment_id=result.payment_id,
            document_job_id=result.document_job_id,
            document_number=result.document_number,
            total_amount=result.total_amount,
            payment_status=result.payment_status,
            payment_method=result.payment_method,
            completion=completion,
        )
    except DirectSaleError as exc:
        db.rollback()
        step = getattr(exc, "step", None) or current_step
        _complete_log.error(
            "[direct_sales.complete] %s",
            json.dumps(
                {
                    "session_id": int(session_id),
                    "stage": str(step),
                    "status": "error",
                    "error": exc.message,
                    "code": getattr(exc, "code", None),
                },
                ensure_ascii=False,
                default=str,
            ),
        )
        raise HTTPException(
            status_code=exc.http_status,
            detail={
                "error": "DIRECT_SALE_COMPLETE_FAILED",
                "step": step,
                "message": exc.message,
                "code": getattr(exc, "code", None),
            },
        ) from exc
    except Exception as exc:
        db.rollback()
        _complete_log.error(
            "[direct_sales.complete] %s",
            json.dumps(
                {
                    "session_id": int(session_id),
                    "stage": str(current_step),
                    "status": "error",
                    "error": f"{type(exc).__name__}: {exc}",
                },
                ensure_ascii=False,
                default=str,
            ),
        )
        _complete_log.exception(
            "[direct-sales.complete.error] session_id=%s step=%s unhandled=%s",
            session_id,
            current_step,
            exc,
        )
        raise HTTPException(
            status_code=422,
            detail={
                "error": "DIRECT_SALE_COMPLETE_FAILED",
                "step": current_step,
                "message": str(exc),
                "code": "SESSION_INVALID",
            },
        ) from exc


@router.post("/documents/{job_id}/reprint")
def post_reprint_document(
    job_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Explicit document re-generation — never silent."""
    from ..models.document_generation_job import DocumentGenerationJob

    prev = (
        db.query(DocumentGenerationJob)
        .filter(DocumentGenerationJob.id == int(job_id), DocumentGenerationJob.tenant_id == int(tenant_id))
        .first()
    )
    if prev is None:
        raise HTTPException(status_code=404, detail="Zadanie dokumentu nie istnieje.")
    enq = enqueue_document_job(
        db,
        tenant_id=int(prev.tenant_id),
        warehouse_id=int(prev.warehouse_id),
        order_id=int(prev.order_id),
        session_id=int(prev.session_id) if prev.session_id else None,
        document_type=str(prev.document_type or "SALE"),
        document_subtype=str(prev.document_subtype or "RECEIPT"),
        performed_by_user_id=_operator_id(user),
    )
    db.commit()
    return {
        "previous_job_id": int(prev.id),
        "new_job_id": int(enq.job_id),
        "status": enq.status,
        "message": "Ponowne generowanie dokumentu zostało zlecone.",
    }
