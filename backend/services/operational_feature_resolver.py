"""Operational feature resolution — structured debug + [feature.resolve] logging."""

from __future__ import annotations

import logging
import os
from typing import Any

from sqlalchemy.orm import Session

from ..config.operational_sales_flags import read_global_feature_defaults
from .operational_features_context import OperationalFeaturesContext, build_operational_features_context

logger = logging.getLogger(__name__)

_FLAG_KEYS = (
    "operational_sales",
    "immediate_wms_exclusion",
    "operational_sales_sessions",
    "operational_runtime",
    "replenishment_engine",
)

_ENV_NAMES = {
    "operational_sales": "FEATURE_OPERATIONAL_SALES",
    "immediate_wms_exclusion": "FEATURE_IMMEDIATE_WMS_EXCLUSION",
    "operational_sales_sessions": "FEATURE_OPERATIONAL_SALES_SESSIONS",
    "operational_runtime": "FEATURE_OPERATIONAL_RUNTIME",
    "replenishment_engine": "FEATURE_REPLENISHMENT_ENGINE",
}


def _env_bool(name: str) -> bool:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return False
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def allow_operational_features_debug() -> bool:
    if _env_bool("DEBUG_OPERATIONAL_FEATURES"):
        return True
    app_env = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "")).strip().lower()
    return app_env in ("dev", "development", "staging", "stage", "test", "local")


def read_env_feature_flags() -> dict[str, bool]:
    g = read_global_feature_defaults()
    return {_ENV_NAMES[k]: bool(g[k]) for k in _FLAG_KEYS}


def _scope_dict(row: Any | None) -> dict[str, bool | None]:
    if row is None:
        return {}
    out: dict[str, bool | None] = {}
    for key in _FLAG_KEYS:
        val = getattr(row, key, None)
        if val is not None:
            out[key] = bool(val)
    return out


def _load_scope_rows(db: Session, *, tenant_id: int, warehouse_id: int):
    from ..models.operational_feature_scope import OperationalFeatureScope

    tenant_row = (
        db.query(OperationalFeatureScope)
        .filter(
            OperationalFeatureScope.tenant_id == int(tenant_id),
            OperationalFeatureScope.warehouse_id == 0,
        )
        .first()
    )
    wh_row = None
    if int(warehouse_id) > 0:
        wh_row = (
            db.query(OperationalFeatureScope)
            .filter(
                OperationalFeatureScope.tenant_id == int(tenant_id),
                OperationalFeatureScope.warehouse_id == int(warehouse_id),
            )
            .first()
        )
    return tenant_row, wh_row


def log_feature_resolve(ctx: OperationalFeaturesContext, *, env: dict[str, bool], tenant: dict, warehouse: dict) -> None:
    logger.info(
        "[feature.resolve] tenant_id=%s warehouse_id=%s scope=%s env=%s tenant_override=%s "
        "warehouse_override=%s resolved=%s",
        ctx.tenant_id,
        ctx.warehouse_id,
        ctx.resolution_scope,
        env,
        tenant,
        warehouse,
        {
            "direct_sales": ctx.operational_sales_sessions_active,
            "runtime": ctx.operational_runtime_active,
            "replenishment": ctx.replenishment_engine_active,
        },
    )


def build_feature_debug_bundle(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> dict[str, Any]:
    ctx = build_operational_features_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    tenant_row, wh_row = _load_scope_rows(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    env = read_env_feature_flags()
    tenant = _scope_dict(tenant_row)
    warehouse = _scope_dict(wh_row)
    log_feature_resolve(ctx, env=env, tenant=tenant, warehouse=warehouse)
    return {
        "env": env,
        "tenant": tenant,
        "warehouse": warehouse,
        "resolved": {
            "direct_sales": ctx.operational_sales_sessions_active,
            "runtime": ctx.operational_runtime_active,
            "replenishment": ctx.replenishment_engine_active,
            "operational_sales": ctx.operational_sales,
            "operational_sales_sessions": ctx.operational_sales_sessions,
            "resolution_scope": ctx.resolution_scope,
        },
    }
