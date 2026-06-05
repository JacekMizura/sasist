"""Detect low shelf stock and enqueue replenishment operational tasks."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ...models.operational_replenishment_rule import OperationalReplenishmentRule
from ...models.product import Product
from ..alerts.alert_service import create_operational_alert
from ..live.constants import EVENT_REPLENISHMENT_ALERT
from ..live.publisher import publish_live_event
from ..operational_features_context import resolve_operational_features_context
from .constants import DEFAULT_SOURCE_ZONE, TASK_TYPE_BY_ZONE
from .rules_service import list_replenishment_rules
from .stock_zone_query import qty_by_zone_for_product
from .task_service import upsert_replenishment_operational_task

logger = logging.getLogger(__name__)


def _target_qty(rule: OperationalReplenishmentRule, shelf_qty: float) -> float:
    if rule.target_qty is not None and float(rule.target_qty) > 0:
        return float(rule.target_qty)
    if rule.max_qty is not None and float(rule.max_qty) > 0:
        return float(rule.max_qty)
    return float(rule.min_qty)


def evaluate_rule_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    rule: OperationalReplenishmentRule,
    zone_qty: dict[str, float],
    features=None,
) -> dict[str, Any] | None:
    zone = str(rule.zone_type).strip().upper()
    shelf_qty = float(zone_qty.get(zone, 0.0))
    min_qty = float(rule.min_qty)
    if shelf_qty >= min_qty:
        return None

    source_zone = str(rule.preferred_source_zone_type or DEFAULT_SOURCE_ZONE).strip().upper()
    source_qty = float(zone_qty.get(source_zone, zone_qty.get("BACKROOM", 0.0)))
    if source_qty <= 0:
        create_operational_alert(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            alert_type="REPLENISHMENT_BLOCKED",
            title=f"Brak źródła uzupełnienia — produkt #{product_id}",
            message=f"Strefa {zone}: {shelf_qty:.0f} szt., brak stanu w {source_zone}",
            severity="WARNING",
            entity_type="product",
            entity_id=int(product_id),
            payload={"zone_type": zone, "shelf_qty": shelf_qty, "source_zone": source_zone},
        )
        return None

    need = max(0.0, _target_qty(rule, shelf_qty) - shelf_qty)
    if need <= 0:
        return None

    task_type = str(rule.task_type or TASK_TYPE_BY_ZONE.get(zone, "REPLENISHMENT")).strip().upper()
    task = upsert_replenishment_operational_task(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        task_type=task_type,
        zone_type=zone,
        quantity_required=need,
        shelf_qty=shelf_qty,
        source_qty=source_qty,
        rule_id=int(rule.id),
        priority=int(rule.priority),
    )
    publish_live_event(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        event_type=EVENT_REPLENISHMENT_ALERT,
        payload={
            "product_id": product_id,
            "zone_type": zone,
            "shelf_qty": shelf_qty,
            "source_qty": source_qty,
            "quantity_required": need,
            "task_id": task.id,
        },
        features=features,
    )
    return {
        "product_id": product_id,
        "zone_type": zone,
        "task_id": task.id,
        "quantity_required": need,
    }


def scan_warehouse_replenishment(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int | None = None,
    features=None,
) -> dict[str, Any]:
    ctx = resolve_operational_features_context(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, features=features
    )
    if not ctx.replenishment_engine_active:
        logger.info(
            "[replenishment.engine] skipped (flag off) tenant_id=%s warehouse_id=%s",
            tenant_id,
            warehouse_id,
        )
        return {"created": 0, "tasks": [], "skipped": "replenishment_engine_disabled"}

    rules = list_replenishment_rules(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not rules:
        return {"created": 0, "tasks": [], "skipped": "no_rules"}

    product_ids: list[int]
    if product_id is not None:
        product_ids = [int(product_id)]
    else:
        rows = (
            db.query(Product.id)
            .filter(Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
            .limit(500)
            .all()
        )
        product_ids = [int(r[0]) for r in rows]

    created: list[dict[str, Any]] = []
    for pid in product_ids:
        zone_qty = qty_by_zone_for_product(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid)
        applicable = [r for r in rules if r.product_id is None or int(r.product_id) == pid]
        for rule in applicable:
            hit = evaluate_rule_for_product(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                product_id=pid,
                rule=rule,
                zone_qty=zone_qty,
                features=ctx,
            )
            if hit:
                created.append(hit)

    logger.info(
        "[replenishment.engine] scan_done tenant_id=%s warehouse_id=%s created=%s",
        tenant_id,
        warehouse_id,
        len(created),
    )
    return {"created": len(created), "tasks": created}
