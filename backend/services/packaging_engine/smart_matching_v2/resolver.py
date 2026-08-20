"""
Breakpoint + composition resolvers for Smart Matching v2.

SINGLE_PRODUCT: among ACTIVE rules with min_qty <= order_qty, pick MAX(min_qty).
COMPOSITION: exact identity_hash ACTIVE rule (no combining SINGLE rules).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ....models.wms_smart_matching import WmsSmartMatchingRuleV2
from .constants import PATTERN_COMPOSITION, PATTERN_SINGLE, SOURCE_MANUAL, STATUS_ACTIVE


@dataclass(frozen=True)
class ResolvedV2Rule:
    rule: WmsSmartMatchingRuleV2
    ambiguous: bool = False


def resolve_breakpoint_rule(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: int,
) -> Optional[ResolvedV2Rule]:
    qty = int(quantity)
    if qty <= 0:
        return None

    rows = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
            WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRuleV2.product_id == int(product_id),
            WmsSmartMatchingRuleV2.status == STATUS_ACTIVE,
            WmsSmartMatchingRuleV2.min_qty <= qty,
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_SINGLE,
        )
        .all()
    )
    if not rows:
        return None

    best_min = max(int(r.min_qty) for r in rows)
    at_best = [r for r in rows if int(r.min_qty) == best_min]

    manuals = [r for r in at_best if str(r.source) == SOURCE_MANUAL]
    pool = manuals if manuals else at_best

    carton_ids = {str(r.carton_id) for r in pool}
    if len(carton_ids) > 1:
        return ResolvedV2Rule(rule=pool[0], ambiguous=True)

    pool.sort(key=lambda r: (0 if str(r.source) == SOURCE_MANUAL else 1, -int(r.id)))
    return ResolvedV2Rule(rule=pool[0], ambiguous=False)


def resolve_composition_rule(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    identity_hash: str,
) -> Optional[ResolvedV2Rule]:
    hid = str(identity_hash or "").strip()
    if not hid:
        return None

    rows = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
            WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_COMPOSITION,
            WmsSmartMatchingRuleV2.composition_identity_hash == hid,
            WmsSmartMatchingRuleV2.status == STATUS_ACTIVE,
        )
        .all()
    )
    if not rows:
        return None

    manuals = [r for r in rows if str(r.source) == SOURCE_MANUAL]
    pool = manuals if manuals else rows
    carton_ids = {str(r.carton_id) for r in pool}
    if len(carton_ids) > 1:
        return ResolvedV2Rule(rule=pool[0], ambiguous=True)

    pool.sort(key=lambda r: (0 if str(r.source) == SOURCE_MANUAL else 1, -int(r.id)))
    return ResolvedV2Rule(rule=pool[0], ambiguous=False)
