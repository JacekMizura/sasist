"""
v2 learning: observations → min_qty auto rules.

Deterministic detection (documented):

1. Collect all observations for (tenant, warehouse, product_id, carton_id).
2. If count < identical_orders_threshold → no AUTO rule for that carton.
3. Else candidate_min_qty = MIN(quantity) across those observations.
4. Upsert ACTIVE AUTO rule (product, min_qty=candidate_min_qty, carton):
   - If an ACTIVE AUTO rule already exists for this product+carton → update
     min_qty downward if needed, refresh hit_count; never change created_from_*.
   - If an ACTIVE AUTO rule exists for the same product+min_qty with a *different*
     carton → do not create (ambiguous breakpoint; Phase 2 marks CONFLICT).
5. created_from_observation_id on INSERT = newest observation in this learn call
   (the pack that triggered create). On first threshold crossing that equals
   obs[threshold-1]; after reset with retained history it is the new pack.

Example: qty 3,5,7 → carton X with threshold 3 → one rule min_qty=3 → X.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ....models.wms_smart_matching import WmsSmartMatchingObservationV2, WmsSmartMatchingRuleV2
from .constants import SOURCE_AUTO, STATUS_ACTIVE, VALID_THRESHOLDS

logger = logging.getLogger(__name__)


def _threshold(settings_row) -> int:
    th = int(getattr(settings_row, "identical_orders_threshold", None) or 3)
    return th if th in VALID_THRESHOLDS else 3


def learn_auto_rules_for_product_carton(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    carton_id: str,
    settings_row,
    last_order_id: Optional[int] = None,
) -> Optional[WmsSmartMatchingRuleV2]:
    tid = int(tenant_id)
    wid = int(warehouse_id)
    pid = int(product_id)
    cid = str(carton_id).strip()
    if not cid:
        return None

    threshold = _threshold(settings_row)
    if not bool(getattr(settings_row, "enabled", True)):
        return None

    obs = (
        db.query(WmsSmartMatchingObservationV2)
        .filter(
            WmsSmartMatchingObservationV2.tenant_id == tid,
            WmsSmartMatchingObservationV2.warehouse_id == wid,
            WmsSmartMatchingObservationV2.product_id == pid,
            WmsSmartMatchingObservationV2.carton_id == cid,
        )
        .order_by(
            WmsSmartMatchingObservationV2.created_at.asc(),
            WmsSmartMatchingObservationV2.id.asc(),
        )
        .all()
    )
    n = len(obs)
    if n < threshold:
        return None

    min_qty = min(int(o.quantity) for o in obs)
    # Decisive = observation that triggered this INSERT (always the newest in this call).
    # Equals obs[threshold-1] on first crossing; after reset with retained history, the new pack.
    decisive = obs[-1]
    now = datetime.utcnow()

    existing_same_carton = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == tid,
            WmsSmartMatchingRuleV2.warehouse_id == wid,
            WmsSmartMatchingRuleV2.product_id == pid,
            WmsSmartMatchingRuleV2.carton_id == cid,
            WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
            WmsSmartMatchingRuleV2.status == STATUS_ACTIVE,
        )
        .order_by(WmsSmartMatchingRuleV2.id.desc())
        .first()
    )
    if existing_same_carton is not None:
        existing_same_carton.hit_count = n
        if min_qty < int(existing_same_carton.min_qty):
            # Move breakpoint down; check collision at new min_qty.
            collision = (
                db.query(WmsSmartMatchingRuleV2)
                .filter(
                    WmsSmartMatchingRuleV2.tenant_id == tid,
                    WmsSmartMatchingRuleV2.warehouse_id == wid,
                    WmsSmartMatchingRuleV2.product_id == pid,
                    WmsSmartMatchingRuleV2.min_qty == min_qty,
                    WmsSmartMatchingRuleV2.carton_id != cid,
                    WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
                    WmsSmartMatchingRuleV2.status == STATUS_ACTIVE,
                )
                .first()
            )
            if collision is None:
                existing_same_carton.min_qty = min_qty
        existing_same_carton.last_order_id = int(last_order_id) if last_order_id else existing_same_carton.last_order_id
        existing_same_carton.last_used_at = now
        existing_same_carton.updated_at = now
        db.add(existing_same_carton)
        db.flush()
        return existing_same_carton

    collision = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == tid,
            WmsSmartMatchingRuleV2.warehouse_id == wid,
            WmsSmartMatchingRuleV2.product_id == pid,
            WmsSmartMatchingRuleV2.min_qty == min_qty,
            WmsSmartMatchingRuleV2.carton_id != cid,
            WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
            WmsSmartMatchingRuleV2.status == STATUS_ACTIVE,
        )
        .first()
    )
    if collision is not None:
        logger.info(
            "smart_matching_v2 skip create ambiguous breakpoint tenant=%s wh=%s product=%s min_qty=%s "
            "existing_carton=%s new_carton=%s",
            tid,
            wid,
            pid,
            min_qty,
            collision.carton_id,
            cid,
        )
        return None

    rule = WmsSmartMatchingRuleV2(
        tenant_id=tid,
        warehouse_id=wid,
        product_id=pid,
        min_qty=min_qty,
        carton_id=cid,
        source=SOURCE_AUTO,
        status=STATUS_ACTIVE,
        is_locked=False,
        hit_count=n,
        override_streak=0,
        created_from_observation_id=int(decisive.id),
        created_threshold=threshold,
        last_order_id=int(last_order_id) if last_order_id else None,
        last_used_at=now,
        engine_version=2,
        created_at=now,
        updated_at=now,
    )
    db.add(rule)
    db.flush()
    logger.info(
        "smart_matching_v2 rule created tenant=%s wh=%s product=%s min_qty=%s carton=%s hits=%s obs=%s",
        tid,
        wid,
        pid,
        min_qty,
        cid,
        n,
        decisive.id,
    )
    return rule
