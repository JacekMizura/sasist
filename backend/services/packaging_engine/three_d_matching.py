"""
Strategia 3D Matching — prawdziwy geometric fit via shared fit_engine + cartonization_solver.

NIE jest to samo SUM(volume) — każdy produkt musi fizycznie mieścić się wymiarami
i przejść heurystykę placement (multi-SKU) lub identical-unit capacity (single SKU).

Outcomes (deterministic):
  MATCHED | NO_FIT | MISSING_PRODUCT_DATA
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from ...models.carton import Carton
from ...models.order import Order
from .cartonization_solver import items_from_order, solve_cartonization
from .scoring import confidence_from_fill
from .suggestions import PackagingSuggestionDraft

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

THREE_D_OUTCOME_MATCHED = "MATCHED"
THREE_D_OUTCOME_NO_FIT = "NO_FIT"
THREE_D_OUTCOME_MISSING_PRODUCT_DATA = "MISSING_PRODUCT_DATA"


def suggest_three_d_matching(
    order: Order,
    cartons: list[Carton],
    *,
    shipping_constraints=None,
    filler_percent: float = 0.0,
    db: Optional["Session"] = None,
    shipping_method_id: Optional[str] = None,
) -> tuple[list[PackagingSuggestionDraft], str]:
    """
    Returns (drafts, outcome) where outcome is MATCHED | NO_FIT | MISSING_PRODUCT_DATA.

    When ``db`` + ``shipping_method_id`` are provided, cartons are hard-filtered with
    the same Smart v2 SSOT ``is_carton_compatible_with_shipping``.
    """
    eligible_cartons = list(cartons)
    if db is not None:
        from .smart_matching_v2.shipping import is_carton_compatible_with_shipping

        eligible_cartons = [
            c
            for c in cartons
            if is_carton_compatible_with_shipping(
                db, carton_id=str(c.id), shipping_method_id=shipping_method_id
            )
        ]

    if not eligible_cartons:
        return [], THREE_D_OUTCOME_NO_FIT

    items = items_from_order(order)
    if not items:
        return [], THREE_D_OUTCOME_NO_FIT

    oid = int(order.id)
    result = solve_cartonization(
        items_with_qty=items,
        cartons=eligible_cartons,
        allow_multi_carton=True,
        shipping_constraints=shipping_constraints,
        filler_percent=filler_percent,
        require_real_product_dimensions=True,
    )

    if "MISSING_PRODUCT_DATA" in (result.warnings or []) or "MISSING_PRODUCT_DATA" in (
        result.explanation or ""
    ):
        return [], THREE_D_OUTCOME_MISSING_PRODUCT_DATA

    if not result.fits or not result.recommended_carton_id:
        # Surface rejects for UI transparency (not MATCHED)
        drafts = _rejected_drafts(order_id=oid, cartons=eligible_cartons, result=result)
        return drafts, THREE_D_OUTCOME_NO_FIT

    drafts: list[PackagingSuggestionDraft] = []
    rejected_by_id = {r.carton_id: r for r in result.rejected_cartons}
    recommended = result.recommended_carton_id

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
        name = plan.carton_name or "—"
        img_s = None
        for c in eligible_cartons:
            if str(c.id) == cid:
                dims = f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm"
                name = str(c.name or "").strip() or "—"
                img = getattr(c, "image_url", None)
                img_s = str(img).strip() if img else None
                break

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

    for c in sorted(
        eligible_cartons,
        key=lambda x: (
            float(x.length_cm or 0) * float(x.width_cm or 0) * float(x.height_cm or 0),
            str(x.id),
        ),
    ):
        cid = str(c.id)
        if cid in seen:
            continue
        rej = rejected_by_id.get(cid)
        if rej is None and result.fits and recommended:
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

    drafts.sort(key=lambda x: (-x.sort_key, x.package_name.lower()))
    # Multi-carton required: still report plan cartons but outcome is NO_FIT for single-carton assign
    if result.multi_carton_required:
        return drafts, THREE_D_OUTCOME_NO_FIT
    usable = [d for d in drafts if "Odrzucony:" not in (d.reason or "")]
    if not usable:
        return drafts, THREE_D_OUTCOME_NO_FIT
    return drafts, THREE_D_OUTCOME_MATCHED


def _rejected_drafts(*, order_id: int, cartons: list[Any], result: Any) -> list[PackagingSuggestionDraft]:
    drafts: list[PackagingSuggestionDraft] = []
    for r in result.rejected_cartons or []:
        c = next((x for x in cartons if str(x.id) == str(r.carton_id)), None)
        dims = ""
        img_s = None
        name = str(r.carton_name or "")
        if c is not None:
            dims = f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm"
            name = str(c.name or "").strip() or name or "—"
            img = getattr(c, "image_url", None)
            img_s = str(img).strip() if img else None
        drafts.append(
            PackagingSuggestionDraft(
                order_id=order_id,
                source_engine="THREE_D_MATCHING",
                suggested_package_id=str(r.carton_id),
                package_name=name or "—",
                package_dimensions=dims,
                image_url=img_s,
                confidence_score=0.15,
                fill_percentage=None,
                reason=f"Odrzucony: {r.reason}",
                sort_key=0.05,
            )
        )
    if not drafts and result.explanation:
        drafts.append(
            PackagingSuggestionDraft(
                order_id=order_id,
                source_engine="THREE_D_MATCHING",
                suggested_package_id="",
                package_name="—",
                package_dimensions="",
                image_url=None,
                confidence_score=0.0,
                fill_percentage=None,
                reason=str(result.explanation)[:2000],
                sort_key=0.0,
            )
        )
    return drafts
