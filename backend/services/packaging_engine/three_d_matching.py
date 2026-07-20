"""
Strategia 3D Matching — prawdziwy geometric fit via shared fit_engine + cartonization_solver.

NIE jest to samo SUM(volume) — każdy produkt musi fizycznie mieścić się wymiarami
i przejść heurystykę placement (multi-SKU) lub identical-unit capacity (single SKU).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ...models.carton import Carton
from ...models.order import Order
from .cartonization_solver import items_from_order, solve_cartonization
from .scoring import confidence_from_fill
from .suggestions import PackagingSuggestionDraft

if TYPE_CHECKING:
    pass


def suggest_three_d_matching(
    order: Order,
    cartons: list[Carton],
    *,
    shipping_constraints=None,
) -> list[PackagingSuggestionDraft]:
    if not cartons:
        return []

    items = items_from_order(order)
    oid = int(order.id)
    result = solve_cartonization(
        items_with_qty=items,
        cartons=cartons,
        allow_multi_carton=True,
        shipping_constraints=shipping_constraints,
    )

    drafts: list[PackagingSuggestionDraft] = []
    rejected_by_id = {r.carton_id: r for r in result.rejected_cartons}
    recommended = result.recommended_carton_id

    # Build suggestion per carton that was considered / recommended
    seen: set[str] = set()
    for plan in result.cartons:
        cid = plan.carton_id
        seen.add(cid)
        fill = plan.fill_percent
        conf = confidence_from_fill((fill or 0) / 100.0, fits=True) if fill is not None else 0.55
        if result.confidence == "UNKNOWN":
            conf = min(conf, 0.4)
        elif result.confidence == "ESTIMATED":
            conf = min(conf, 0.7)
        is_primary = cid == recommended and not result.multi_carton_required
        bonus = 0.12 if is_primary else (0.04 if cid == recommended else 0.0)
        reason = result.explanation
        if plan.fill_percent is not None:
            reason = (
                f"Fit geometryczny: ~{plan.fill_percent:.0f}% wykorzystania. "
                f"{result.explanation}"
            )[:2000]
        if result.multi_carton_required:
            reason = (f"Wymagane wiele kartonów. {reason}")[:2000]
        dims = ""
        for c in cartons:
            if str(c.id) == cid:
                dims = f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm"
                name = str(c.name or "").strip() or "—"
                img = getattr(c, "image_url", None)
                img_s = str(img).strip() if img else None
                break
        else:
            name = plan.carton_name or "—"
            img_s = None

        drafts.append(
            PackagingSuggestionDraft(
                order_id=oid,
                source_engine="THREE_D_MATCHING",
                suggested_package_id=cid,
                package_name=name,
                package_dimensions=dims,
                image_url=img_s,
                confidence_score=conf + bonus,
                fill_percentage=fill,
                reason=reason,
                sort_key=conf + bonus + (0.2 if is_primary else 0.0),
            )
        )

    # Also surface rejected cartons as low-confidence "does not fit" for UI transparency
    for c in sorted(cartons, key=lambda x: (float(x.length_cm or 0) * float(x.width_cm or 0) * float(x.height_cm or 0), str(x.id))):
        cid = str(c.id)
        if cid in seen:
            continue
        rej = rejected_by_id.get(cid)
        if rej is None and result.fits and recommended:
            # Larger cartons not needed when smaller fits — skip noise
            continue
        if rej is None:
            continue
        dims = f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm"
        img = getattr(c, "image_url", None)
        drafts.append(
            PackagingSuggestionDraft(
                order_id=oid,
                source_engine="THREE_D_MATCHING",
                suggested_package_id=cid,
                package_name=str(c.name or "").strip() or "—",
                package_dimensions=dims,
                image_url=str(img).strip() if img else None,
                confidence_score=0.15,
                fill_percentage=None,
                reason=f"Odrzucony: {rej.reason}",
                sort_key=0.05,
            )
        )

    if not drafts and result.explanation:
        # Fallback: at least one draft from smallest carton with warning
        c = min(
            cartons,
            key=lambda x: (
                float(x.length_cm or 0) * float(x.width_cm or 0) * float(x.height_cm or 0),
                str(x.id),
            ),
        )
        drafts.append(
            PackagingSuggestionDraft(
                order_id=oid,
                source_engine="THREE_D_MATCHING",
                suggested_package_id=str(c.id),
                package_name=str(c.name or "").strip() or "—",
                package_dimensions=f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm",
                image_url=str(c.image_url).strip() if getattr(c, "image_url", None) else None,
                confidence_score=0.25,
                fill_percentage=None,
                reason=result.explanation[:2000],
                sort_key=0.1,
            )
        )

    drafts.sort(key=lambda x: (-x.sort_key, x.package_name.lower()))
    return drafts
