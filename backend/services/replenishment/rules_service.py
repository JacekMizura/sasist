"""CRUD for operational replenishment rules."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.operational_replenishment_rule import OperationalReplenishmentRule


def list_replenishment_rules(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    active_only: bool = True,
) -> list[OperationalReplenishmentRule]:
    q = db.query(OperationalReplenishmentRule).filter(
        OperationalReplenishmentRule.tenant_id == int(tenant_id),
        OperationalReplenishmentRule.warehouse_id == int(warehouse_id),
    )
    if active_only:
        q = q.filter(OperationalReplenishmentRule.is_active.is_(True))
    return list(q.order_by(OperationalReplenishmentRule.priority.desc(), OperationalReplenishmentRule.id.asc()).all())


def upsert_replenishment_rule(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    zone_type: str,
    min_qty: float,
    rule_id: int | None = None,
    product_id: int | None = None,
    task_type: str = "REPLENISHMENT",
    max_qty: float | None = None,
    target_qty: float | None = None,
    preferred_source_zone_type: str | None = None,
    season_key: str | None = None,
    time_window: dict[str, Any] | None = None,
    priority: int = 50,
    is_active: bool = True,
) -> OperationalReplenishmentRule:
    row: OperationalReplenishmentRule | None = None
    if rule_id is not None:
        row = (
            db.query(OperationalReplenishmentRule)
            .filter(
                OperationalReplenishmentRule.id == int(rule_id),
                OperationalReplenishmentRule.tenant_id == int(tenant_id),
            )
            .first()
        )
    if row is None:
        row = OperationalReplenishmentRule(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            created_at=datetime.utcnow(),
        )
        db.add(row)

    row.warehouse_id = int(warehouse_id)
    row.product_id = int(product_id) if product_id else None
    row.zone_type = str(zone_type).strip().upper()
    row.task_type = str(task_type).strip().upper()
    row.min_qty = float(min_qty)
    row.max_qty = float(max_qty) if max_qty is not None else None
    row.target_qty = float(target_qty) if target_qty is not None else None
    row.preferred_source_zone_type = (
        str(preferred_source_zone_type).strip().upper() if preferred_source_zone_type else None
    )
    row.season_key = str(season_key).strip() if season_key else None
    row.time_window_json = json.dumps(time_window, ensure_ascii=False) if time_window else None
    row.priority = int(priority)
    row.is_active = bool(is_active)
    row.updated_at = datetime.utcnow()
    db.flush()
    return row
