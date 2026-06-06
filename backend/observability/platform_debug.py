"""Temporary structured logs for platform stability incident (RCA)."""

from __future__ import annotations

import logging
import os
from typing import Any

_LOG = logging.getLogger("platform.debug")

_VERBOSE = os.getenv("PLATFORM_DEBUG", "0").strip().lower() in ("1", "true", "yes")


def _emit(tag: str, **fields: Any) -> None:
    parts = " ".join(f"{k}={v!r}" for k, v in fields.items() if v is not None)
    _LOG.info("[%s] %s", tag, parts)


def log_startup_schema(step: str, *, added: int | None = None, error: str | None = None) -> None:
    _emit("startup.schema", step=step, added=added, error=error)


def log_startup_features(**fields: Any) -> None:
    _emit("startup.features", **fields)


def log_request_features(
    *,
    path: str,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    features: dict[str, Any] | None = None,
) -> None:
    if not _VERBOSE:
        return
    _emit(
        "request.features",
        path=path,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        features=features,
    )


def log_db_session(
    *,
    phase: str,
    path: str | None = None,
    dirty: bool | None = None,
    active: bool | None = None,
    error: str | None = None,
) -> None:
    if not _VERBOSE and error is None:
        return
    _emit("db.session", phase=phase, path=path, dirty=dirty, active=active, error=error)


def log_dependency_resolve(
    *,
    name: str,
    path: str | None = None,
    ok: bool = True,
    error: str | None = None,
) -> None:
    if not _VERBOSE and not error:
        return
    _emit("dependency.resolve", name=name, path=path, ok=ok, error=error)


def log_feature_scope(
    *,
    tenant_id: int | None,
    warehouse_id: int | None,
    scope: str | None = None,
    error: str | None = None,
) -> None:
    if error or _VERBOSE:
        _emit(
            "feature.scope",
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            scope=scope,
            error=error,
        )
