"""Operational alerts API."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.operational_alert import OperationalAlert
from ..schemas.operational_alerts import OperationalAlertRead
from ..services.alerts.alert_service import ack_operational_alert, list_open_alerts
from ..services.operational_features_context import resolve_operational_features_context

router = APIRouter(prefix="/operational-alerts", tags=["Operational alerts"])


@router.get("", response_model=list[OperationalAlertRead])
def get_operational_alerts(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    ctx = resolve_operational_features_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not ctx.operational_runtime_active:
        raise HTTPException(status_code=403, detail="FEATURE_OPERATIONAL_RUNTIME is disabled")
    rows = list_open_alerts(db, tenant_id=tenant_id, warehouse_id=warehouse_id, limit=limit)
    return [
        OperationalAlertRead(
            id=r.id,
            alert_type=r.alert_type,
            severity=r.severity,
            status=r.status,
            title=r.title,
            message=r.message,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            payload=json.loads(r.payload_json or "{}") if r.payload_json else None,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/{alert_id}/ack", response_model=OperationalAlertRead)
def post_ack_alert(
    alert_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    row = (
        db.query(OperationalAlert)
        .filter(OperationalAlert.id == int(alert_id), OperationalAlert.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    ack_operational_alert(db, row, user_id=int(current_user.id))
    db.commit()
    return OperationalAlertRead(
        id=row.id,
        alert_type=row.alert_type,
        severity=row.severity,
        status=row.status,
        title=row.title,
        message=row.message,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        payload=json.loads(row.payload_json or "{}") if row.payload_json else None,
        created_at=row.created_at,
    )
