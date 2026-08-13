"""Phase 9 — schedule auto PLANNING stock replenishment across warehouses.

Uses the shared operational worker loop (not a production-only scheduler).
Calls existing ``run_production_stock_replenishment`` — no duplicated algorithm.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.wms_settings import WmsSettings
from .forecast_settings_service import (
    is_stock_replenishment_due,
    load_forecast_settings,
    parse_forecast_settings_json,
)
from .stock_replenishment_service import run_production_stock_replenishment

logger = logging.getLogger(__name__)


def list_auto_replenishment_targets(db: Session) -> list[tuple[int, int]]:
    """Return (tenant_id, warehouse_id) where auto_stock_replenishment is ON."""
    rows = (
        db.query(WmsSettings)
        .filter(WmsSettings.production_forecast_json.isnot(None))
        .order_by(WmsSettings.tenant_id.asc(), WmsSettings.warehouse_id.asc())
        .all()
    )
    out: list[tuple[int, int]] = []
    for row in rows:
        settings = parse_forecast_settings_json(getattr(row, "production_forecast_json", None))
        if not bool(settings.auto_stock_replenishment):
            continue
        tid = int(row.tenant_id)
        wid = int(row.warehouse_id)
        if tid > 0 and wid > 0:
            out.append((tid, wid))
    return out


def run_due_stock_replenishment_jobs(
    db: Session,
    *,
    now: datetime | None = None,
    force_all_due: bool = False,
) -> dict[str, Any]:
    """
    Run replenishment for each warehouse that is auto-ON and due by interval.

    One warehouse failure is logged and does not stop the rest.
    """
    now = now or datetime.utcnow()
    targets = list_auto_replenishment_targets(db)
    ran = 0
    skipped_not_due = 0
    errors = 0
    results: list[dict[str, Any]] = []

    for tenant_id, warehouse_id in targets:
        settings = load_forecast_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
        if not force_all_due and not is_stock_replenishment_due(settings, now=now):
            skipped_not_due += 1
            continue
        try:
            result = run_production_stock_replenishment(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                performed_by_user_id=None,
                force=False,
            )
            db.commit()
            ran += 1
            results.append(
                {
                    "tenant_id": int(tenant_id),
                    "warehouse_id": int(warehouse_id),
                    "created_count": int(result.created_count),
                    "total_quantity": float(result.total_quantity),
                    "skipped_count": int(result.skipped_count),
                }
            )
        except Exception:
            errors += 1
            logger.exception(
                "PRODUCTION_REPLENISHMENT_RUN ERROR tenant_id=%s warehouse_id=%s",
                tenant_id,
                warehouse_id,
            )
            try:
                db.rollback()
            except Exception:
                pass

    return {
        "targets": len(targets),
        "ran": ran,
        "skipped_not_due": skipped_not_due,
        "errors": errors,
        "results": results,
    }
