"""Record v2 observations, apply override streak / break, trigger min-qty learning."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ....models.order import Order
from ....models.wms_smart_matching import WmsSmartMatchingObservationV2
from ..smart_matching_store import get_or_create_settings
from .break_relearn import apply_override_streak_after_choice
from .constants import ENGINE_VERSION
from .eligibility import single_product_qty_from_order
from .learning import learn_auto_rules_for_product_carton
from .resolver import resolve_breakpoint_rule


def record_v2_observation_and_learn(
    db: Session,
    *,
    order: Order,
    carton_id: str,
    operator_user_id: Optional[int] = None,
    suggested_carton_id: Optional[str] = None,
) -> Optional[WmsSmartMatchingObservationV2]:
    """
    Write a v2 observation when the order is single-product eligible.
    Multi-SKU baskets: no v2 observation / no v2 learning (caller may still write v1 history).

    Also applies AUTO override_streak / break before learning from the new choice.
    """
    line = single_product_qty_from_order(db, order)
    if line is None:
        return None

    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    cid = str(carton_id).strip()
    if not cid:
        return None

    settings = get_or_create_settings(db, tenant_id=tid, warehouse_id=wid)

    suggested = (suggested_carton_id or "").strip() or None
    resolved = resolve_breakpoint_rule(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=line.product_id,
        quantity=line.quantity,
    )
    if suggested is None:
        if resolved is not None and not resolved.ambiguous:
            suggested = str(resolved.rule.carton_id)

    apply_override_streak_after_choice(
        db,
        resolved=resolved,
        chosen_carton_id=cid,
        order_quantity=int(line.quantity),
        settings_row=settings,
    )

    obs = WmsSmartMatchingObservationV2(
        tenant_id=tid,
        warehouse_id=wid,
        order_id=int(order.id),
        product_id=int(line.product_id),
        quantity=int(line.quantity),
        carton_id=cid,
        suggested_carton_id=suggested,
        user_id=int(operator_user_id) if operator_user_id else None,
        engine_version=ENGINE_VERSION,
        created_at=datetime.utcnow(),
    )
    db.add(obs)
    db.flush()

    learn_auto_rules_for_product_carton(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=line.product_id,
        carton_id=cid,
        settings_row=settings,
        last_order_id=int(order.id),
    )
    return obs
