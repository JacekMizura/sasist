"""Operational runtime API — device sessions, operator context, live SSE."""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.operational_runtime import (
    DeviceSessionRead,
    DeviceSessionUpsertBody,
    LiveEventRead,
    OperatorContextRead,
    OperatorContextUpsertBody,
)
from ..services.live.publisher import fetch_events_since
from ..services.operational_features_context import resolve_operational_features_context
from ..services.runtime.device_session_service import close_device_session, upsert_device_session
from ..services.runtime.operator_context_service import get_operator_context, upsert_operator_context

router = APIRouter(prefix="/operational-runtime", tags=["Operational runtime"])


def _require_runtime(db: Session, tenant_id: int, warehouse_id: int):
    ctx = resolve_operational_features_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not ctx.operational_runtime_active:
        raise HTTPException(status_code=403, detail="FEATURE_OPERATIONAL_RUNTIME is disabled")
    return ctx


@router.post("/device-sessions", response_model=DeviceSessionRead)
def post_device_session(
    body: DeviceSessionUpsertBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    _require_runtime(db, tenant_id, warehouse_id)
    row = upsert_device_session(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        device_key=body.device_key,
        operator_user_id=int(current_user.id),
        workflow_type=body.workflow_type,
        device_kind=body.device_kind,
        payload=body.payload,
        battery_pct=body.battery_pct,
        network_state=body.network_state,
    )
    db.commit()
    return DeviceSessionRead(
        id=row.id,
        device_key=row.device_key,
        workflow_type=row.workflow_type,
        device_kind=row.device_kind,
        status=row.status,
        operator_user_id=row.operator_user_id,
        battery_pct=row.battery_pct,
        network_state=row.network_state,
        last_seen_at=row.last_seen_at,
    )


@router.delete("/device-sessions/{session_id}")
def delete_device_session(
    session_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    from ..models.device_session import DeviceSession

    row = (
        db.query(DeviceSession)
        .filter(DeviceSession.id == int(session_id), DeviceSession.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Device session not found")
    close_device_session(db, row)
    db.commit()
    return {"ok": True}


@router.put("/operator-context", response_model=OperatorContextRead)
def put_operator_context(
    body: OperatorContextUpsertBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    _require_runtime(db, tenant_id, warehouse_id)
    row = upsert_operator_context(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        operator_user_id=int(current_user.id),
        context_type=body.context_type,
        cart_id=body.cart_id,
        zone_id=body.zone_id,
        active_task_id=body.active_task_id,
        payload=body.payload,
    )
    db.commit()
    payload = json.loads(row.payload_json or "{}") if row.payload_json else {}
    return OperatorContextRead(
        operator_user_id=row.operator_user_id,
        context_type=row.context_type,
        cart_id=row.cart_id,
        zone_id=row.zone_id,
        active_task_id=row.active_task_id,
        payload=payload,
        updated_at=row.updated_at,
    )


@router.get("/operator-context", response_model=OperatorContextRead | None)
def get_operator_context_endpoint(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    operator_user_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    _require_runtime(db, tenant_id, warehouse_id)
    uid = int(operator_user_id or current_user.id)
    row = get_operator_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id, operator_user_id=uid)
    if row is None:
        return None
    payload = json.loads(row.payload_json or "{}") if row.payload_json else {}
    return OperatorContextRead(
        operator_user_id=row.operator_user_id,
        context_type=row.context_type,
        cart_id=row.cart_id,
        zone_id=row.zone_id,
        active_task_id=row.active_task_id,
        payload=payload,
        updated_at=row.updated_at,
    )


@router.get("/events", response_model=list[LiveEventRead])
def list_live_events(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    since_id: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    _require_runtime(db, tenant_id, warehouse_id)
    rows = fetch_events_since(db, tenant_id=tenant_id, warehouse_id=warehouse_id, since_id=since_id, limit=limit)
    return [
        LiveEventRead(
            id=r.id,
            event_type=r.event_type,
            channel=r.channel,
            revision=r.revision,
            payload=json.loads(r.payload_json or "{}"),
            created_at=r.created_at,
        )
        for r in rows
    ]


async def _sse_generator(db_factory, tenant_id: int, warehouse_id: int, since_id: int) -> AsyncIterator[str]:
    last_id = int(since_id)
    while True:
        db = db_factory()
        try:
            rows = fetch_events_since(
                db, tenant_id=tenant_id, warehouse_id=warehouse_id, since_id=last_id, limit=20
            )
            for r in rows:
                last_id = int(r.id)
                payload = {
                    "id": r.id,
                    "event_type": r.event_type,
                    "revision": r.revision,
                    "payload": json.loads(r.payload_json or "{}"),
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            if not rows:
                yield ": heartbeat\n\n"
        finally:
            db.close()
        await asyncio.sleep(2)


@router.get("/stream")
async def sse_live_stream(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    since_id: int = Query(0, ge=0),
    access_token: str | None = Query(None, description="Bearer token for EventSource (no custom headers)"),
    db: Session = Depends(get_db),
):
    if access_token:
        from ..auth.tokens import decode_access_token

        try:
            payload = decode_access_token(access_token)
            if payload.get("typ") != "access":
                raise ValueError("wrong token type")
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    _require_runtime(db, tenant_id, warehouse_id)
    from ..database import SessionLocal

    return StreamingResponse(
        _sse_generator(SessionLocal, tenant_id, warehouse_id, since_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
