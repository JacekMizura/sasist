"""Block background workers when production schema is invalid."""

from __future__ import annotations

from sqlalchemy.engine import Engine


def require_production_schema_valid(*, context: str, engine: Engine | None = None) -> None:
    """
    Fail fast before workers mutate data on drifted production schema.

    Uses the startup gate snapshot when available; otherwise runs a read-only audit.
    """
    from ..db.production_schema import get_production_schema_health
    from ..platform_state import get_production_schema_health_snapshot, is_production_schema_valid

    if is_production_schema_valid():
        snap = get_production_schema_health_snapshot()
        if snap and snap.get("status") == "ok":
            return

    bind = engine
    if bind is None:
        from ..database import engine as default_engine

        bind = default_engine

    health = get_production_schema_health(bind)
    if health.get("status") != "ok":
        raise RuntimeError(
            "production schema invalid — worker blocked "
            f"context={context} status={health.get('status')} "
            f"missing_columns={health.get('missing_columns')}"
        )
