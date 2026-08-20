"""
v2 learning: observations → min_qty auto rules.

Deterministic detection (documented):

1. Collect all observations for (tenant, warehouse, product_id, carton_id).
2. If count < identical_orders_threshold → no AUTO rule for that carton.
3. Else candidate_min_qty = MIN(quantity) across those observations.
4. Upsert ACTIVE AUTO rule (product, min_qty=candidate_min_qty, carton):
   - If an ACTIVE AUTO rule already exists for this product+carton → update
     min_qty downward if needed, refresh hit_count; never change created_from_*.
   - If a BROKEN AUTO rule exists for this product+carton → re-activate when
     no competing ACTIVE/AMBIGUOUS carton occupies the same min_qty.
   - If an ACTIVE AUTO rule exists for the same product+min_qty with a *different*
     carton → mark conflict (AMBIGUOUS); do not create ACTIVE competitor.
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
from .conflicts import insert_ambiguous_competitor, mark_ambiguous_pair, reconcile_product_breakpoint_conflicts
from .constants import SOURCE_AUTO, STATUS_ACTIVE, STATUS_AMBIGUOUS, STATUS_BROKEN, VALID_THRESHOLDS, PATTERN_SINGLE

logger = logging.getLogger(__name__)


def _threshold(settings_row) -> int:
    th = int(getattr(settings_row, "identical_orders_threshold", None) or 3)
    return th if th in VALID_THRESHOLDS else 3


def _competitor_at_min_qty(
    db: Session,
    *,
    tid: int,
    wid: int,
    pid: int,
    min_qty: int,
    carton_id: str,
) -> Optional[WmsSmartMatchingRuleV2]:
    return (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == tid,
            WmsSmartMatchingRuleV2.warehouse_id == wid,
            WmsSmartMatchingRuleV2.product_id == pid,
            WmsSmartMatchingRuleV2.min_qty == min_qty,
            WmsSmartMatchingRuleV2.carton_id != carton_id,
            WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
            WmsSmartMatchingRuleV2.status.in_([STATUS_ACTIVE, STATUS_AMBIGUOUS]),
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_SINGLE,
        )
        .first()
    )


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
            # Legacy NULL pattern_type rows count as SINGLE.
            (
                (WmsSmartMatchingObservationV2.pattern_type == PATTERN_SINGLE)
                | (WmsSmartMatchingObservationV2.pattern_type.is_(None))
            ),
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
            WmsSmartMatchingRuleV2.status.in_([STATUS_ACTIVE, STATUS_BROKEN, STATUS_AMBIGUOUS]),
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_SINGLE,
        )
        .order_by(WmsSmartMatchingRuleV2.id.desc())
        .first()
    )
    if existing_same_carton is not None:
        existing_same_carton.hit_count = n
        existing_same_carton.last_order_id = (
            int(last_order_id) if last_order_id else existing_same_carton.last_order_id
        )
        existing_same_carton.last_used_at = now
        existing_same_carton.updated_at = now

        if min_qty < int(existing_same_carton.min_qty):
            collision = _competitor_at_min_qty(
                db, tid=tid, wid=wid, pid=pid, min_qty=min_qty, carton_id=cid
            )
            if collision is None:
                existing_same_carton.min_qty = min_qty
            # else keep old min_qty; do not steal conflicting breakpoint

        # Re-activate BROKEN/AMBIGUOUS when no competing carton at breakpoint.
        if str(existing_same_carton.status) in (STATUS_BROKEN, STATUS_AMBIGUOUS):
            prev_status = str(existing_same_carton.status)
            collision = _competitor_at_min_qty(
                db,
                tid=tid,
                wid=wid,
                pid=pid,
                min_qty=int(existing_same_carton.min_qty),
                carton_id=cid,
            )
            if collision is None:
                existing_same_carton.status = STATUS_ACTIVE
                existing_same_carton.override_streak = 0
                logger.info(
                    "smart_matching_v2 re-activate rule_id=%s product=%s carton=%s status_was=%s",
                    existing_same_carton.id,
                    pid,
                    cid,
                    prev_status,
                )
            else:
                mark_ambiguous_pair(db, existing=collision, other_carton_id=cid)
                existing_same_carton.status = STATUS_AMBIGUOUS

        db.add(existing_same_carton)
        db.flush()
        reconcile_product_breakpoint_conflicts(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
        return existing_same_carton

    collision = _competitor_at_min_qty(db, tid=tid, wid=wid, pid=pid, min_qty=min_qty, carton_id=cid)
    if collision is not None:
        mark_ambiguous_pair(db, existing=collision, other_carton_id=cid)
        existing_amb = (
            db.query(WmsSmartMatchingRuleV2)
            .filter(
                WmsSmartMatchingRuleV2.tenant_id == tid,
                WmsSmartMatchingRuleV2.warehouse_id == wid,
                WmsSmartMatchingRuleV2.product_id == pid,
                WmsSmartMatchingRuleV2.min_qty == min_qty,
                WmsSmartMatchingRuleV2.carton_id == cid,
                WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
                WmsSmartMatchingRuleV2.pattern_type == PATTERN_SINGLE,
            )
            .first()
        )
        if existing_amb is None:
            insert_ambiguous_competitor(
                db,
                template=collision,
                carton_id=cid,
                hit_count=n,
                created_from_observation_id=int(decisive.id),
                created_threshold=threshold,
                last_order_id=last_order_id,
            )
        else:
            existing_amb.status = STATUS_AMBIGUOUS
            existing_amb.hit_count = n
            existing_amb.updated_at = now
            db.add(existing_amb)
            db.flush()
        reconcile_product_breakpoint_conflicts(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
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
        pattern_type=PATTERN_SINGLE,
        composition_identity_hash="",
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
    reconcile_product_breakpoint_conflicts(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
    return rule


def learn_auto_composition_rule(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    identity_hash: str,
    items_json: str,
    anchor_product_id: int,
    carton_id: str,
    settings_row,
    last_order_id: Optional[int] = None,
) -> Optional[WmsSmartMatchingRuleV2]:
    """Exact multi-SKU composition → one AUTO rule per (hash, carton). No min_qty breakpoints."""
    from .constants import (
        COMPOSITION_MIN_QTY_SENTINEL,
        PATTERN_COMPOSITION,
    )

    tid = int(tenant_id)
    wid = int(warehouse_id)
    hid = str(identity_hash or "").strip()
    cid = str(carton_id).strip()
    if not hid or not cid:
        return None

    threshold = _threshold(settings_row)
    if not bool(getattr(settings_row, "enabled", True)):
        return None

    obs = (
        db.query(WmsSmartMatchingObservationV2)
        .filter(
            WmsSmartMatchingObservationV2.tenant_id == tid,
            WmsSmartMatchingObservationV2.warehouse_id == wid,
            WmsSmartMatchingObservationV2.pattern_type == PATTERN_COMPOSITION,
            WmsSmartMatchingObservationV2.composition_identity_hash == hid,
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

    decisive = obs[-1]
    now = datetime.utcnow()

    existing_same = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == tid,
            WmsSmartMatchingRuleV2.warehouse_id == wid,
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_COMPOSITION,
            WmsSmartMatchingRuleV2.composition_identity_hash == hid,
            WmsSmartMatchingRuleV2.carton_id == cid,
            WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
            WmsSmartMatchingRuleV2.status.in_([STATUS_ACTIVE, STATUS_BROKEN, STATUS_AMBIGUOUS]),
        )
        .order_by(WmsSmartMatchingRuleV2.id.desc())
        .first()
    )
    if existing_same is not None:
        existing_same.hit_count = n
        existing_same.composition_items_json = items_json
        existing_same.last_order_id = (
            int(last_order_id) if last_order_id else existing_same.last_order_id
        )
        existing_same.last_used_at = now
        existing_same.updated_at = now
        if str(existing_same.status) in (STATUS_BROKEN, STATUS_AMBIGUOUS):
            collision = _composition_competitor(
                db, tid=tid, wid=wid, identity_hash=hid, carton_id=cid
            )
            if collision is None:
                existing_same.status = STATUS_ACTIVE
                existing_same.override_streak = 0
            else:
                mark_ambiguous_pair(db, existing=collision, other_carton_id=cid)
                existing_same.status = STATUS_AMBIGUOUS
        db.add(existing_same)
        db.flush()
        reconcile_composition_conflicts(db, tenant_id=tid, warehouse_id=wid, identity_hash=hid)
        return existing_same

    collision = _composition_competitor(db, tid=tid, wid=wid, identity_hash=hid, carton_id=cid)
    if collision is not None:
        mark_ambiguous_pair(db, existing=collision, other_carton_id=cid)
        insert_ambiguous_competitor(
            db,
            template=collision,
            carton_id=cid,
            hit_count=n,
            created_from_observation_id=int(decisive.id),
            created_threshold=threshold,
            last_order_id=last_order_id,
        )
        # Ensure inserted competitor has composition fields (template may be COMPOSITION).
        reconcile_composition_conflicts(db, tenant_id=tid, warehouse_id=wid, identity_hash=hid)
        return None

    rule = WmsSmartMatchingRuleV2(
        tenant_id=tid,
        warehouse_id=wid,
        product_id=int(anchor_product_id),
        min_qty=COMPOSITION_MIN_QTY_SENTINEL,
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
        pattern_type=PATTERN_COMPOSITION,
        composition_items_json=items_json,
        composition_identity_hash=hid,
        created_at=now,
        updated_at=now,
    )
    db.add(rule)
    db.flush()
    logger.info(
        "smart_matching_v2 COMPOSITION rule created tenant=%s wh=%s hash=%s carton=%s hits=%s obs=%s",
        tid,
        wid,
        hid[:12],
        cid,
        n,
        decisive.id,
    )
    reconcile_composition_conflicts(db, tenant_id=tid, warehouse_id=wid, identity_hash=hid)
    return rule


def _composition_competitor(
    db: Session,
    *,
    tid: int,
    wid: int,
    identity_hash: str,
    carton_id: str,
) -> Optional[WmsSmartMatchingRuleV2]:
    from .constants import PATTERN_COMPOSITION

    return (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == tid,
            WmsSmartMatchingRuleV2.warehouse_id == wid,
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_COMPOSITION,
            WmsSmartMatchingRuleV2.composition_identity_hash == str(identity_hash),
            WmsSmartMatchingRuleV2.carton_id != str(carton_id),
            WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
            WmsSmartMatchingRuleV2.status.in_([STATUS_ACTIVE, STATUS_AMBIGUOUS]),
        )
        .first()
    )


def reconcile_composition_conflicts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    identity_hash: str,
) -> int:
    """Same exact composition + ≥2 ACTIVE AUTO cartons → AMBIGUOUS (no max hit tie-break)."""
    from .constants import PATTERN_COMPOSITION

    rows = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
            WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_COMPOSITION,
            WmsSmartMatchingRuleV2.composition_identity_hash == str(identity_hash),
            WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
            WmsSmartMatchingRuleV2.status == STATUS_ACTIVE,
        )
        .all()
    )
    cartons = {str(r.carton_id) for r in rows}
    if len(cartons) <= 1:
        return 0
    now = datetime.utcnow()
    for r in rows:
        r.status = STATUS_AMBIGUOUS
        r.updated_at = now
        db.add(r)
    db.flush()
    logger.info(
        "smart_matching_v2 COMPOSITION conflict hash=%s cartons=%s",
        str(identity_hash)[:12],
        sorted(cartons),
    )
    return len(rows)
