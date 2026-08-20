"""
Breakpoint conflict detection for Smart Matching v2.

Conflict = same (tenant, warehouse, product, min_qty) with ≥2 distinct ACTIVE AUTO cartons.
Breakpoint rules at different min_qty (3→X, 5→Y) are NOT conflicts.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ....models.wms_smart_matching import WmsSmartMatchingRuleV2
from .constants import SOURCE_AUTO, STATUS_ACTIVE, STATUS_AMBIGUOUS

logger = logging.getLogger(__name__)


def mark_ambiguous_pair(
    db: Session,
    *,
    existing: WmsSmartMatchingRuleV2,
    other_carton_id: str,
) -> None:
    """Mark an existing ACTIVE AUTO rule AMBIGUOUS when a competing carton targets same min_qty."""
    if str(existing.status) == STATUS_ACTIVE and str(existing.source) == SOURCE_AUTO:
        existing.status = STATUS_AMBIGUOUS
        existing.updated_at = datetime.utcnow()
        db.add(existing)
        logger.info(
            "smart_matching_v2 conflict AMBIGUOUS rule_id=%s product=%s min_qty=%s carton=%s vs=%s",
            existing.id,
            existing.product_id,
            existing.min_qty,
            existing.carton_id,
            other_carton_id,
        )
    db.flush()


def reconcile_product_breakpoint_conflicts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> int:
    """
    Scan ACTIVE AUTO rules for product; mark groups with multi-carton same min_qty as AMBIGUOUS.
    Returns number of rules flipped to AMBIGUOUS.
    """
    rows = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
            WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRuleV2.product_id == int(product_id),
            WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
            WmsSmartMatchingRuleV2.status == STATUS_ACTIVE,
            WmsSmartMatchingRuleV2.pattern_type == "SINGLE_PRODUCT",
        )
        .all()
    )
    by_min: dict[int, list[WmsSmartMatchingRuleV2]] = defaultdict(list)
    for r in rows:
        by_min[int(r.min_qty)].append(r)

    flipped = 0
    now = datetime.utcnow()
    for min_qty, group in by_min.items():
        cartons = {str(r.carton_id) for r in group}
        if len(cartons) <= 1:
            continue
        for r in group:
            r.status = STATUS_AMBIGUOUS
            r.updated_at = now
            db.add(r)
            flipped += 1
        logger.info(
            "smart_matching_v2 reconcile conflict product=%s min_qty=%s cartons=%s flipped=%s",
            product_id,
            min_qty,
            sorted(cartons),
            len(group),
        )
    if flipped:
        db.flush()
    return flipped


def insert_ambiguous_competitor(
    db: Session,
    *,
    template: WmsSmartMatchingRuleV2,
    carton_id: str,
    hit_count: int,
    created_from_observation_id: Optional[int],
    created_threshold: int,
    last_order_id: Optional[int],
) -> WmsSmartMatchingRuleV2:
    """Persist competing AUTO rule as AMBIGUOUS (visible in history; no auto suggest)."""
    now = datetime.utcnow()
    row = WmsSmartMatchingRuleV2(
        tenant_id=int(template.tenant_id),
        warehouse_id=int(template.warehouse_id),
        product_id=int(template.product_id),
        min_qty=int(template.min_qty),
        carton_id=str(carton_id).strip(),
        source=SOURCE_AUTO,
        status=STATUS_AMBIGUOUS,
        is_locked=False,
        hit_count=int(hit_count),
        override_streak=0,
        created_from_observation_id=created_from_observation_id,
        created_threshold=created_threshold,
        last_order_id=int(last_order_id) if last_order_id else None,
        last_used_at=now,
        engine_version=2,
        pattern_type=str(getattr(template, "pattern_type", None) or "SINGLE_PRODUCT"),
        composition_items_json=getattr(template, "composition_items_json", None),
        composition_identity_hash=str(getattr(template, "composition_identity_hash", None) or ""),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row
