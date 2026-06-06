"""
Global (env) defaults for operational sales — read ONLY via operational_features_context.

Do not call these helpers from services directly; use OperationalFeaturesContext.
"""

from __future__ import annotations

import os
from typing import TypedDict


class GlobalFeatureDefaults(TypedDict):
    operational_sales: bool
    immediate_wms_exclusion: bool
    operational_sales_sessions: bool
    operational_runtime: bool
    replenishment_engine: bool


def _env_bool(name: str, *, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def read_global_feature_defaults() -> GlobalFeatureDefaults:
    """Global env layer — defaults OFF (classic WMS unchanged)."""
    try:
        from ..platform_state import is_operational_features_force_disabled

        if is_operational_features_force_disabled():
            return GlobalFeatureDefaults(
                operational_sales=False,
                immediate_wms_exclusion=False,
                operational_sales_sessions=False,
                operational_runtime=False,
                replenishment_engine=False,
            )
    except Exception:
        pass
    ops = _env_bool("FEATURE_OPERATIONAL_SALES", default=False)
    excl = _env_bool("FEATURE_IMMEDIATE_WMS_EXCLUSION", default=False)
    sess_env = os.getenv("FEATURE_OPERATIONAL_SALES_SESSIONS")
    if sess_env is None or str(sess_env).strip() == "":
        sess = ops
    else:
        sess = _env_bool("FEATURE_OPERATIONAL_SALES_SESSIONS", default=ops)
    runtime = _env_bool("FEATURE_OPERATIONAL_RUNTIME", default=False)
    repl = _env_bool("FEATURE_REPLENISHMENT_ENGINE", default=False)
    return GlobalFeatureDefaults(
        operational_sales=ops,
        immediate_wms_exclusion=excl,
        operational_sales_sessions=sess,
        operational_runtime=runtime,
        replenishment_engine=repl,
    )
