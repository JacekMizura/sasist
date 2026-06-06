"""FastAPI dependency — bind OperationalFeaturesContext once per request."""

from __future__ import annotations

from typing import Generator

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.operational_features_context import (
    OperationalFeaturesContext,
    bind_operational_features,
    build_operational_features_context,
    reset_operational_features,
)


def operational_features_for_request(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> Generator[OperationalFeaturesContext, None, None]:
    from ..observability.platform_debug import log_dependency_resolve

    try:
        ctx = build_operational_features_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        token = bind_operational_features(ctx)
        log_dependency_resolve(name="operational_features_for_request", ok=True)
        try:
            yield ctx
        finally:
            reset_operational_features(token)
    except Exception as exc:
        log_dependency_resolve(
            name="operational_features_for_request",
            ok=False,
            error=f"{type(exc).__name__}: {exc}",
        )
        raise


def operational_sales_sessions_for_request(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> Generator[OperationalFeaturesContext, None, None]:
    """Direct-sales routes — resolves + gates sessions in one dependency (no nested generators)."""
    ctx = build_operational_features_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not ctx.operational_sales_sessions_active:
        raise HTTPException(status_code=404, detail="Operational sales is disabled.")
    token = bind_operational_features(ctx)
    try:
        yield ctx
    finally:
        reset_operational_features(token)
