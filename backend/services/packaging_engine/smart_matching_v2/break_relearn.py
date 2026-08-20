"""
Override streak + AUTO rule break/relearn (Phase 2).

break_threshold = learning threshold (settings identical_orders_threshold),
preferring the rule's created_threshold when set.

Matching choice → override_streak = 0.
Override → override_streak += 1; at threshold → status BROKEN (AUTO only).
MANUAL / is_locked rules are never auto-broken.

Important: if order qty > suggested rule.min_qty, do NOT count as override.
That path is how higher breakpoint rules (3→X, 5→Y) form without breaking the lower rule.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ....models.wms_smart_matching import WmsSmartMatchingObservationV2, WmsSmartMatchingRuleV2
from .constants import SOURCE_AUTO, STATUS_ACTIVE, STATUS_BROKEN, VALID_THRESHOLDS
from .resolver import ResolvedV2Rule

logger = logging.getLogger(__name__)


def _break_threshold(rule: WmsSmartMatchingRuleV2, settings_row) -> int:
    ct = getattr(rule, "created_threshold", None)
    if ct is not None and int(ct) in VALID_THRESHOLDS:
        return int(ct)
    th = int(getattr(settings_row, "identical_orders_threshold", None) or 3)
    return th if th in VALID_THRESHOLDS else 3


def _competing_series_ready(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    chosen_carton_id: str,
    order_quantity: int,
    rule_min_qty: int,
    threshold: int,
) -> bool:
    """True when this pack tips a competing same-min_qty series (conflict, not break)."""
    obs = (
        db.query(WmsSmartMatchingObservationV2)
        .filter(
            WmsSmartMatchingObservationV2.tenant_id == int(tenant_id),
            WmsSmartMatchingObservationV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingObservationV2.product_id == int(product_id),
            WmsSmartMatchingObservationV2.carton_id == str(chosen_carton_id),
        )
        .all()
    )
    # Current pack not yet written — count + 1.
    n = len(obs) + 1
    if n < threshold:
        return False
    qtys = [int(o.quantity) for o in obs] + [int(order_quantity)]
    return min(qtys) == int(rule_min_qty)


def apply_override_streak_after_choice(
    db: Session,
    *,
    resolved: Optional[ResolvedV2Rule],
    chosen_carton_id: str,
    order_quantity: int,
    settings_row,
) -> Optional[WmsSmartMatchingRuleV2]:
    """
    Update override_streak on the ACTIVE AUTO rule that would have been suggested.
    Returns the rule if it was BROKEN by this call.
    """
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

    # Higher qty than current breakpoint → candidate for a new higher min_qty rule, not a break.
    if int(order_quantity) > int(rule.min_qty):
        return None

    streak = int(rule.override_streak or 0) + 1
    rule.override_streak = streak
    rule.updated_at = now
    threshold = _break_threshold(rule, settings_row)
    broken = None
    if streak >= threshold:
        # Same-breakpoint competing series → conflict path in learning, not BROKEN.
        if _competing_series_ready(
            db,
            tenant_id=int(rule.tenant_id),
            warehouse_id=int(rule.warehouse_id),
            product_id=int(rule.product_id),
            chosen_carton_id=chosen,
            order_quantity=int(order_quantity),
            rule_min_qty=int(rule.min_qty),
            threshold=threshold,
        ):
            db.add(rule)
            db.flush()
            return None
        rule.status = STATUS_BROKEN
        broken = rule
        logger.info(
            "smart_matching_v2 AUTO rule BROKEN id=%s product=%s min_qty=%s carton=%s streak=%s thr=%s",
            rule.id,
            rule.product_id,
            rule.min_qty,
            rule.carton_id,
            streak,
            threshold,
        )
    db.add(rule)
    db.flush()
    return broken
