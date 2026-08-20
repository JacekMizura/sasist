"""
Override streak + AUTO rule break/relearn (Phase 2 + 5A + COMPOSITION).

break_threshold = learning threshold (settings identical_orders_threshold),
preferring the rule's created_threshold when set.

Matching choice → override_streak = 0.
Override → override_streak += 1; at threshold → status BROKEN (AUTO only)
  and broken_by_observation_id = current observation (deterministic).
MANUAL / is_locked rules are never auto-broken.

SINGLE only: if order qty > suggested rule.min_qty, do NOT count as override
(higher breakpoint path). COMPOSITION always counts exact-pattern overrides.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ....models.wms_smart_matching import WmsSmartMatchingObservationV2, WmsSmartMatchingRuleV2
from .constants import (
    PATTERN_COMPOSITION,
    PATTERN_SINGLE,
    SOURCE_AUTO,
    STATUS_ACTIVE,
    STATUS_BROKEN,
    VALID_THRESHOLDS,
)
from .resolver import ResolvedV2Rule

logger = logging.getLogger(__name__)


def _break_threshold(rule: WmsSmartMatchingRuleV2, settings_row) -> int:
    ct = getattr(rule, "created_threshold", None)
    if ct is not None and int(ct) in VALID_THRESHOLDS:
        return int(ct)
    th = int(getattr(settings_row, "identical_orders_threshold", None) or 3)
    return th if th in VALID_THRESHOLDS else 3


def _competing_series_ready_single(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    chosen_carton_id: str,
    rule_min_qty: int,
    threshold: int,
) -> bool:
    obs = (
        db.query(WmsSmartMatchingObservationV2)
        .filter(
            WmsSmartMatchingObservationV2.tenant_id == int(tenant_id),
            WmsSmartMatchingObservationV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingObservationV2.product_id == int(product_id),
            WmsSmartMatchingObservationV2.carton_id == str(chosen_carton_id),
            (
                (WmsSmartMatchingObservationV2.pattern_type == PATTERN_SINGLE)
                | (WmsSmartMatchingObservationV2.pattern_type.is_(None))
            ),
        )
        .all()
    )
    n = len(obs)
    if n < threshold:
        return False
    qtys = [int(o.quantity) for o in obs]
    return min(qtys) == int(rule_min_qty)


def _competing_series_ready_composition(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    identity_hash: str,
    chosen_carton_id: str,
    threshold: int,
) -> bool:
    n = (
        db.query(WmsSmartMatchingObservationV2)
        .filter(
            WmsSmartMatchingObservationV2.tenant_id == int(tenant_id),
            WmsSmartMatchingObservationV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingObservationV2.pattern_type == PATTERN_COMPOSITION,
            WmsSmartMatchingObservationV2.composition_identity_hash == str(identity_hash),
            WmsSmartMatchingObservationV2.carton_id == str(chosen_carton_id),
        )
        .count()
    )
    return n >= threshold


def apply_override_streak_after_choice(
    db: Session,
    *,
    resolved: Optional[ResolvedV2Rule],
    chosen_carton_id: str,
    order_quantity: int,
    settings_row,
    breaking_observation_id: Optional[int] = None,
    pattern_type: str = PATTERN_SINGLE,
    composition_identity_hash: str = "",
) -> Optional[WmsSmartMatchingRuleV2]:
    if resolved is None or resolved.ambiguous:
        return None
    rule = resolved.rule
    if str(rule.source) != SOURCE_AUTO:
        return None
    if bool(rule.is_locked):
        return None
    if str(rule.status) != STATUS_ACTIVE:
        return None

    chosen = str(chosen_carton_id or "").strip()
    suggested = str(rule.carton_id or "").strip()
    if not chosen or not suggested:
        return None

    now = datetime.utcnow()
    if chosen == suggested:
        if int(rule.override_streak or 0) != 0:
            rule.override_streak = 0
            rule.updated_at = now
            db.add(rule)
            db.flush()
        return None

    pt = str(pattern_type or getattr(rule, "pattern_type", None) or PATTERN_SINGLE)
    # SINGLE higher-breakpoint path — not an override of the lower rule.
    if pt == PATTERN_SINGLE and int(order_quantity) > int(rule.min_qty):
        return None

    streak = int(rule.override_streak or 0) + 1
    rule.override_streak = streak
    rule.updated_at = now
    threshold = _break_threshold(rule, settings_row)
    broken = None
    if streak >= threshold:
        competing = False
        if pt == PATTERN_COMPOSITION:
            competing = _competing_series_ready_composition(
                db,
                tenant_id=int(rule.tenant_id),
                warehouse_id=int(rule.warehouse_id),
                identity_hash=str(
                    composition_identity_hash
                    or getattr(rule, "composition_identity_hash", None)
                    or ""
                ),
                chosen_carton_id=chosen,
                threshold=threshold,
            )
        else:
            competing = _competing_series_ready_single(
                db,
                tenant_id=int(rule.tenant_id),
                warehouse_id=int(rule.warehouse_id),
                product_id=int(rule.product_id),
                chosen_carton_id=chosen,
                rule_min_qty=int(rule.min_qty),
                threshold=threshold,
            )
        if competing:
            db.add(rule)
            db.flush()
            return None
        rule.status = STATUS_BROKEN
        if breaking_observation_id is not None:
            rule.broken_by_observation_id = int(breaking_observation_id)
        broken = rule
        logger.info(
            "smart_matching_v2 AUTO rule BROKEN id=%s pattern=%s carton=%s streak=%s thr=%s obs=%s",
            rule.id,
            pt,
            rule.carton_id,
            streak,
            threshold,
            breaking_observation_id,
        )
    db.add(rule)
    db.flush()
    return broken
