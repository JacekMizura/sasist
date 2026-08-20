"""Smart Matching suggest — v2 breakpoint first, optional legacy v1 exact fallback."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from ....models.carton import Carton
from ....models.order import Order
from ..smart_matching_store import (
    active_rule_for_composition,
    composition_from_order,
    get_or_create_settings,
)
from ..suggestions import PackagingSuggestionDraft
from .eligibility import single_product_qty_from_order
from .resolver import resolve_breakpoint_rule
from .shipping import is_carton_compatible_with_shipping

if TYPE_CHECKING:
    from ..strategy_resolver import SmartResult


def _draft_from_carton(
    *,
    order_id: int,
    carton: Carton,
    confidence: float,
    reason: str,
    sort_key: float,
) -> PackagingSuggestionDraft:
    dims = ""
    if carton.length_cm is not None and carton.width_cm is not None and carton.height_cm is not None:
        dims = f"{float(carton.length_cm):g}×{float(carton.width_cm):g}×{float(carton.height_cm):g} cm"
    img = getattr(carton, "image_url", None)
    return PackagingSuggestionDraft(
        order_id=order_id,
        source_engine="SMART_MATCHING",
        suggested_package_id=str(carton.id),
        package_name=str(carton.name or "").strip() or "—",
        package_dimensions=dims,
        image_url=str(img).strip() if img else None,
        confidence_score=confidence,
        fill_percentage=None,
        reason=reason,
        sort_key=sort_key,
    )


def evaluate_smart_matching_v2(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    cartons: list[Carton],
) -> "SmartResult":
    """
    Returns SmartResult for StrategyResolver.
    Ambiguous v2 conflict → ambiguous=True, no draft (no v1 fallback).
    """
    from ..strategy_resolver import SmartResult

    if not cartons:
        return SmartResult(draft=None, ambiguous=False, reason="NO_CARTONS")

    settings = get_or_create_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not settings.enabled:
        return SmartResult(draft=None, ambiguous=False, reason="DISABLED")

    oid = int(order.id)
    by_id = {str(c.id): c for c in cartons}
    shipping_method_id = getattr(order, "shipping_method_id", None)

    line = single_product_qty_from_order(db, order)
    if line is not None:
        resolved = resolve_breakpoint_rule(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=line.product_id,
            quantity=line.quantity,
        )
        if resolved is not None and resolved.ambiguous:
            return SmartResult(draft=None, ambiguous=True, reason="AMBIGUOUS")
        if resolved is not None and not resolved.ambiguous:
            cid = str(resolved.rule.carton_id)
            if cid in by_id and is_carton_compatible_with_shipping(
                db, carton_id=cid, shipping_method_id=shipping_method_id
            ):
                conf = min(0.95, 0.78 + min(0.15, int(resolved.rule.hit_count or 0) * 0.02))
                draft = _draft_from_carton(
                    order_id=oid,
                    carton=by_id[cid],
                    confidence=conf,
                    reason=(
                        f"Smart Matching v2: product #{line.product_id} "
                        f"min_qty≥{int(resolved.rule.min_qty)} → carton "
                        f"({int(resolved.rule.hit_count)} hits)."
                    ),
                    sort_key=conf + 0.6,
                )
                return SmartResult(draft=draft, ambiguous=False, reason="V2")
            # Incompatible / missing → treat as no Smart v2

    legacy_on = bool(getattr(settings, "legacy_v1_fallback_enabled", True))
    if legacy_on:
        key, _label, _units = composition_from_order(db, order)
        rule = active_rule_for_composition(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, composition_key=key
        )
        if rule is not None and str(rule.carton_id) in by_id:
            cid = str(rule.carton_id)
            if is_carton_compatible_with_shipping(
                db, carton_id=cid, shipping_method_id=shipping_method_id
            ):
                c = by_id[cid]
                conf = min(0.90, 0.70 + min(0.15, int(rule.hit_count or 0) * 0.02))
                draft = _draft_from_carton(
                    order_id=oid,
                    carton=c,
                    confidence=conf,
                    reason=(
                        f"Smart Matching v1 legacy exact composition "
                        f"({int(rule.hit_count)}× fingerprint)."
                    ),
                    sort_key=conf + 0.45,
                )
                return SmartResult(draft=draft, ambiguous=False, reason="V1_LEGACY")

    return SmartResult(draft=None, ambiguous=False, reason="NO_SMART")


def suggest_smart_matching_v2(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    cartons: list[Carton],
) -> list[PackagingSuggestionDraft]:
    result = evaluate_smart_matching_v2(
        db, order=order, tenant_id=tenant_id, warehouse_id=warehouse_id, cartons=cartons
    )
    if result.draft is None:
        return []
    return [result.draft]
