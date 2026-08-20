"""Record v2 observations for SINGLE_PRODUCT and COMPOSITION; learn + break."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ....models.order import Order
from ....models.wms_smart_matching import WmsSmartMatchingObservationV2
from ..smart_matching_store import get_or_create_settings
from .break_relearn import apply_override_streak_after_choice
from .composition import pattern_from_order
from .constants import (
    ENGINE_VERSION,
    PATTERN_COMPOSITION,
)
from .learning import learn_auto_rules_for_product_carton, learn_auto_composition_rule
from .product_rules import is_product_smart_matching_enabled
from .resolver import resolve_breakpoint_rule, resolve_composition_rule


def _composition_products_enabled(db: Session, *, tenant_id: int, warehouse_id: int, product_ids: list[int]) -> bool:
    for pid in product_ids:
        if not is_product_smart_matching_enabled(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(pid)
        ):
            return False
    return True


def record_v2_observation_and_learn(
    db: Session,
    *,
    order: Order,
    carton_id: str,
    operator_user_id: Optional[int] = None,
    suggested_carton_id: Optional[str] = None,
) -> Optional[WmsSmartMatchingObservationV2]:
    """
    Write one ObservationV2 per packing decision (SINGLE or COMPOSITION).

    Empty basket → None. Product disable: still writes observation; skips learn/streak/suggest path.
    """
    snap = pattern_from_order(db, order)
    if snap is None:
        return None

    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    cid = str(carton_id).strip()
    if not cid:
        return None

    settings = get_or_create_settings(db, tenant_id=tid, warehouse_id=wid)
    product_ids = [int(i.product_id) for i in snap.items]
    smart_on = _composition_products_enabled(
        db, tenant_id=tid, warehouse_id=wid, product_ids=product_ids
    )

    suggested = (suggested_carton_id or "").strip() or None
    resolved = None
    if smart_on:
        if snap.pattern_type == PATTERN_COMPOSITION:
            resolved = resolve_composition_rule(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                identity_hash=snap.identity_hash,
            )
        else:
            resolved = resolve_breakpoint_rule(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                product_id=snap.anchor_product_id,
                quantity=snap.quantity,
            )
        if suggested is None:
            if resolved is not None and not resolved.ambiguous:
                suggested = str(resolved.rule.carton_id)

    obs = WmsSmartMatchingObservationV2(
        tenant_id=tid,
        warehouse_id=wid,
        order_id=int(order.id),
        product_id=int(snap.anchor_product_id),
        quantity=int(snap.quantity),
        carton_id=cid,
        suggested_carton_id=suggested,
        user_id=int(operator_user_id) if operator_user_id else None,
        engine_version=ENGINE_VERSION,
        pattern_type=str(snap.pattern_type),
        composition_items_json=snap.items_json,
        composition_identity_hash=snap.identity_hash if snap.pattern_type == PATTERN_COMPOSITION else None,
        created_at=datetime.utcnow(),
    )
    db.add(obs)
    db.flush()

    if smart_on:
        apply_override_streak_after_choice(
            db,
            resolved=resolved,
            chosen_carton_id=cid,
            order_quantity=int(snap.quantity),
            settings_row=settings,
            breaking_observation_id=int(obs.id),
            pattern_type=str(snap.pattern_type),
            composition_identity_hash=(
                snap.identity_hash if snap.pattern_type == PATTERN_COMPOSITION else ""
            ),
        )
        if snap.pattern_type == PATTERN_COMPOSITION:
            learn_auto_composition_rule(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                identity_hash=snap.identity_hash,
                items_json=snap.items_json,
                anchor_product_id=snap.anchor_product_id,
                carton_id=cid,
                settings_row=settings,
                last_order_id=int(order.id),
            )
        else:
            learn_auto_rules_for_product_carton(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                product_id=snap.anchor_product_id,
                carton_id=cid,
                settings_row=settings,
                last_order_id=int(order.id),
            )
    return obs
