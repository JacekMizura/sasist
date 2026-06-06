"""
Request-scoped operational feature flags — single resolver per request/operation.

Resolution: warehouse override → tenant override → global env → default false (NULL scope = inherit).
Legacy NULL order columns remain permanent — see order_operational_mode.py.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ..config.operational_sales_flags import read_global_feature_defaults

logger = logging.getLogger(__name__)

_bound_features: ContextVar["OperationalFeaturesContext | None"] = ContextVar(
    "operational_features_context",
    default=None,
)


@dataclass(frozen=True)
class OperationalFeaturesContext:
    """Resolved feature flags for one tenant/warehouse operation."""

    tenant_id: int | None
    warehouse_id: int | None
    operational_sales: bool
    immediate_wms_exclusion: bool
    operational_sales_sessions: bool
    operational_runtime: bool
    replenishment_engine: bool
    resolution_scope: str  # global | tenant | warehouse

    @property
    def immediate_wms_exclusion_active(self) -> bool:
        return bool(self.operational_sales and self.immediate_wms_exclusion)

    @property
    def operational_sales_sessions_active(self) -> bool:
        return bool(self.operational_sales and self.operational_sales_sessions)

    @property
    def operational_runtime_active(self) -> bool:
        return bool(self.operational_runtime)

    @property
    def replenishment_engine_active(self) -> bool:
        return bool(self.replenishment_engine)

    def as_log_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "warehouse_id": self.warehouse_id,
            "operational_sales": self.operational_sales,
            "immediate_wms_exclusion": self.immediate_wms_exclusion,
            "operational_sales_sessions": self.operational_sales_sessions,
            "operational_runtime": self.operational_runtime,
            "replenishment_engine": self.replenishment_engine,
            "resolution_scope": self.resolution_scope,
        }

    @classmethod
    def global_defaults(cls) -> OperationalFeaturesContext:
        g = read_global_feature_defaults()
        return cls(
            tenant_id=None,
            warehouse_id=None,
            operational_sales=bool(g["operational_sales"]),
            immediate_wms_exclusion=bool(g["immediate_wms_exclusion"]),
            operational_sales_sessions=bool(g["operational_sales_sessions"]),
            operational_runtime=bool(g["operational_runtime"]),
            replenishment_engine=bool(g["replenishment_engine"]),
            resolution_scope="global",
        )


def _tri_merge(
    global_val: bool,
    tenant_val: bool | None,
    warehouse_val: bool | None,
) -> tuple[bool, str]:
    if warehouse_val is not None:
        return bool(warehouse_val), "warehouse"
    if tenant_val is not None:
        return bool(tenant_val), "tenant"
    return bool(global_val), "global"


def _load_scope_overrides(
    db: Session | None,
    *,
    tenant_id: int,
    warehouse_id: int | None,
) -> tuple[
    bool | None,
    bool | None,
    bool | None,
    bool | None,
    bool | None,
    bool | None,
    bool | None,
    bool | None,
    bool | None,
    bool | None,
]:
    """Returns tenant_ops, tenant_excl, tenant_sess, tenant_runtime, tenant_repl, wh_*."""
    if db is None:
        return (None,) * 10
    try:
        from ..platform_state import is_operational_features_force_disabled

        if is_operational_features_force_disabled():
            return (None,) * 10
    except Exception:
        pass
    try:
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
        if warehouse_id is not None and int(warehouse_id) > 0:
            wh_row = (
                db.query(OperationalFeatureScope)
                .filter(
                    OperationalFeatureScope.tenant_id == int(tenant_id),
                    OperationalFeatureScope.warehouse_id == int(warehouse_id),
                )
                .first()
            )
        return (
            getattr(tenant_row, "operational_sales", None) if tenant_row else None,
            getattr(tenant_row, "immediate_wms_exclusion", None) if tenant_row else None,
            getattr(tenant_row, "operational_sales_sessions", None) if tenant_row else None,
            getattr(tenant_row, "operational_runtime", None) if tenant_row else None,
            getattr(tenant_row, "replenishment_engine", None) if tenant_row else None,
            getattr(wh_row, "operational_sales", None) if wh_row else None,
            getattr(wh_row, "immediate_wms_exclusion", None) if wh_row else None,
            getattr(wh_row, "operational_sales_sessions", None) if wh_row else None,
            getattr(wh_row, "operational_runtime", None) if wh_row else None,
            getattr(wh_row, "replenishment_engine", None) if wh_row else None,
        )
    except Exception as exc:
        logger.exception(
            "[operational.features] scope lookup failed tenant_id=%s warehouse_id=%s",
            tenant_id,
            warehouse_id,
        )
        try:
            from ..observability.platform_debug import log_feature_scope

            log_feature_scope(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                error=f"{type(exc).__name__}: {exc}",
            )
        except Exception:
            pass
        return None, None, None, None, None, None, None, None, None, None


def build_operational_features_context(
    db: Session | None,
    *,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
) -> OperationalFeaturesContext:
    """Resolve flags once for a tenant/warehouse pair (safe if DB unavailable)."""
    g = read_global_feature_defaults()
    if tenant_id is None:
        return OperationalFeaturesContext.global_defaults()

    t_ops, t_excl, t_sess, t_rt, t_repl, w_ops, w_excl, w_sess, w_rt, w_repl = _load_scope_overrides(
        db, tenant_id=int(tenant_id), warehouse_id=warehouse_id
    )
    ops, scope_ops = _tri_merge(bool(g["operational_sales"]), t_ops, w_ops)
    excl, scope_excl = _tri_merge(bool(g["immediate_wms_exclusion"]), t_excl, w_excl)
    sess, scope_sess = _tri_merge(bool(g["operational_sales_sessions"]), t_sess, w_sess)
    runtime, scope_runtime = _tri_merge(bool(g["operational_runtime"]), t_rt, w_rt)
    repl, scope_repl = _tri_merge(bool(g["replenishment_engine"]), t_repl, w_repl)
    scopes = {scope_ops, scope_excl, scope_sess, scope_runtime, scope_repl}
    resolution = "warehouse" if "warehouse" in scopes else ("tenant" if "tenant" in scopes else "global")
    ctx = OperationalFeaturesContext(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
        operational_sales=ops,
        immediate_wms_exclusion=excl,
        operational_sales_sessions=sess,
        operational_runtime=runtime,
        replenishment_engine=repl,
        resolution_scope=resolution,
    )
    return ctx


def get_bound_operational_features() -> OperationalFeaturesContext | None:
    return _bound_features.get()


def bind_operational_features(ctx: OperationalFeaturesContext) -> Token:
    return _bound_features.set(ctx)


def reset_operational_features(token: Token) -> None:
    _bound_features.reset(token)


def resolve_operational_features_context(
    db: Session | None = None,
    *,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    features: OperationalFeaturesContext | None = None,
) -> OperationalFeaturesContext:
    """
    Prefer explicit ``features``, then request-bound context, then build from ids.
    """
    if features is not None:
        return features
    bound = get_bound_operational_features()
    if bound is not None:
        if tenant_id is None or bound.tenant_id == int(tenant_id):
            if warehouse_id is None or bound.warehouse_id in (None, int(warehouse_id)):
                return bound
    if tenant_id is not None:
        return build_operational_features_context(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    return OperationalFeaturesContext.global_defaults()
