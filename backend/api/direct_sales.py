"""Operational direct sales — command-style session API (not CRUD cart)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ..schemas.direct_sales import (
    DirectSaleScanBody,
    DirectSaleScanResponse,
    DirectSaleSessionCreateBody,
    DirectSaleSessionLineRead,
    DirectSaleSessionRead,
)
from ..services.direct_sale_service import (
    DirectSaleError,
    create_session,
    get_session,
    session_scan_add_line,
    suspend_session,
)

router = APIRouter(prefix="/direct-sales", tags=["Direct sales"])


def _operator_id(user: AppUser | None) -> int | None:
    if user is None or user.id is None:
        return None
    return int(user.id)


def _line_to_read(line: DirectSaleSessionLine) -> DirectSaleSessionLineRead:
    return DirectSaleSessionLineRead(
        id=int(line.id),
        product_id=int(line.product_id),
        quantity=float(line.quantity or 0),
        unit_price=float(line.unit_price) if line.unit_price is not None else None,
        discount_amount=float(line.discount_amount or 0),
        source_location_id=int(line.source_location_id) if line.source_location_id else None,
        suggested_location_id=int(line.suggested_location_id) if line.suggested_location_id else None,
        sort_order=int(line.sort_order or 0),
    )


def _session_to_read(sess: DirectSaleSession) -> DirectSaleSessionRead:
    lines = [_line_to_read(ln) for ln in (sess.lines or [])]
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
    return _session_to_read(sess)


@router.get("/session/{session_id}", response_model=DirectSaleSessionRead)
def get_direct_sale_session(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return _session_to_read(_require_session(db, session_id=session_id, tenant_id=tenant_id))


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
        return _session_to_read(sess)
    except DirectSaleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc
