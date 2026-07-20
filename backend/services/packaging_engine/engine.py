"""Orkiestracja: PHYSICAL FIT gate → eligible → Smart soft ranking → PRIMARY."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ...models.carton import Carton
from ...models.order import Order
from ...schemas.packaging_intelligence import (
    PackagingFitPlanOut,
    PackagingPlanCartonOut,
    PackagingPlanItemOut,
    PackagingSuggestionOut,
)
from ..fit_engine.adapters import fit_container_from_carton
from .cartonization_solver import items_from_order, solve_cartonization
from .decision import _demand_volume_cm3, finalize_primary_packaging
from .overrides import annotate_override_flags
from .presentation import confidence_label, map_reject_reason_to_operator
from .smart_matching import suggest_smart_matching
from .suggestions import PackagingEngineSource, PackagingSuggestionDraft
from .three_d_matching import suggest_three_d_matching


def _carton_volume_sort_key(c: Carton) -> float:
    try:
        return fit_container_from_carton(c).volume_cm3 or float("inf")
    except Exception:
        return float("inf")


def _load_active_cartons(db: Session, *, tenant_id: int, warehouse_id: int, limit: int = 24) -> list[Carton]:
    rows = (
        db.query(Carton)
        .filter(
            Carton.tenant_id == int(tenant_id),
            Carton.warehouse_id == int(warehouse_id),
            Carton.is_active.is_(True),
        )
        .limit(max(4, min(int(limit), 48)))
        .all()
    )
    rows.sort(key=_carton_volume_sort_key)
    return rows


def _merge_by_carton(
    smart: list[PackagingSuggestionDraft],
    three_d: list[PackagingSuggestionDraft],
) -> list[PackagingSuggestionDraft]:
    m_s = {str(s.suggested_package_id): s for s in smart}
    m_t = {str(s.suggested_package_id): s for s in three_d}
    ids = sorted(set(m_s) | set(m_t), key=lambda cid: (cid not in m_s, cid not in m_t, cid))
    merged: list[PackagingSuggestionDraft] = []
    for cid in ids:
        a = m_s.get(cid)
        b = m_t.get(cid)
        if a is not None and b is not None:
            eng: PackagingEngineSource = "COMBINED" if a.source_engine != b.source_engine else a.source_engine
            a_rej = "Odrzucony:" in (a.reason or "")
            b_rej = "Odrzucony:" in (b.reason or "")
            if a_rej or b_rej:
                rej = a if a_rej else b
                other = b if a_rej else a
                conf = float(rej.confidence_score)
                fill = rej.fill_percentage
                reason = f"{other.reason} | {rej.reason}"[:2000]
                sk = float(rej.sort_key)
            else:
                conf = max(a.confidence_score, b.confidence_score)
                fill = a.fill_percentage if a.fill_percentage is not None else b.fill_percentage
                reason = f"{a.reason} | {b.reason}"[:2000]
                sk = max(a.sort_key, b.sort_key)
            merged.append(
                PackagingSuggestionDraft(
                    order_id=a.order_id,
                    source_engine=eng,
                    suggested_package_id=cid,
                    package_name=a.package_name or b.package_name,
                    package_dimensions=a.package_dimensions or b.package_dimensions,
                    image_url=a.image_url or b.image_url,
                    confidence_score=conf,
                    fill_percentage=fill,
                    reason=reason,
                    sort_key=sk,
                )
            )
        elif a is not None:
            merged.append(a)
        elif b is not None:
            merged.append(b)
    merged.sort(key=lambda x: (-x.confidence_score, -x.sort_key, x.package_name.lower()))
    return merged


def _usable_dims_str(carton: Carton) -> tuple[str, bool]:
    container = fit_container_from_carton(carton)
    dims = f"{container.length_cm:g}×{container.width_cm:g}×{container.height_cm:g} cm"
    return dims, bool(container.dimensions_are_usable)


def _enrich_out(
    d: PackagingSuggestionDraft,
    *,
    carton: Optional[Carton],
    eligible: set[str],
    rejected_reasons: dict[str, str],
    fit_confidence: str,
    is_recommended: bool,
) -> PackagingSuggestionOut:
    cid = str(d.suggested_package_id)
    rejected = cid in rejected_reasons or "Odrzucony:" in (d.reason or "")
    eligible_ok = cid in eligible and not rejected
    usable = None
    max_payload = None
    has_usable = False
    if carton is not None:
        usable, has_usable = _usable_dims_str(carton)
        mp = getattr(carton, "max_payload_kg", None)
        max_payload = float(mp) if mp is not None else None
    why = None
    if "WHY_SELECTED:" in (d.reason or ""):
        why = (d.reason or "").split("WHY_SELECTED:", 1)[-1].strip()
    reject_code = rejected_reasons.get(cid)
    if rejected and not reject_code and "Odrzucony:" in (d.reason or ""):
        reject_code = (d.reason or "").split("Odrzucony:", 1)[-1].strip().split("|")[0].strip()
    fit_status = "REJECTED" if rejected else ("ELIGIBLE" if eligible_ok else "UNKNOWN")
    if eligible_ok and fit_confidence == "ESTIMATED":
        fit_status = "ESTIMATED"
    conf = fit_confidence if eligible_ok else ("UNKNOWN" if rejected else fit_confidence)
    return PackagingSuggestionOut(
        order_id=d.order_id,
        source_engine=d.source_engine,  # type: ignore[arg-type]
        suggested_package_id=cid,
        package_name=d.package_name,
        package_dimensions=d.package_dimensions,
        image_url=d.image_url,
        confidence_score=round(d.confidence_score, 4),
        fill_percentage=round(d.fill_percentage, 2) if d.fill_percentage is not None else None,
        reason=d.reason,
        auto_assigned=d.auto_assigned,
        overridden_by_user=d.overridden_by_user,
        assigned_by=d.assigned_by,
        assigned_at=d.assigned_at,
        fit_status=fit_status,  # type: ignore[arg-type]
        fit_confidence=conf,
        usable_dimensions=usable,
        total_weight_kg=None,
        max_payload_kg=max_payload,
        reject_reason_code=reject_code,
        reject_reason_label=map_reject_reason_to_operator(reject_code) if reject_code else None,
        why_selected=why,
        is_recommended=is_recommended,
    )


def _fit_plan_out(fit) -> PackagingFitPlanOut:
    raw = fit.to_dict() if hasattr(fit, "to_dict") else {}
    plan_rows = []
    for p in raw.get("plan") or raw.get("cartons") or []:
        items = [
            PackagingPlanItemOut(
                product_id=int(it.get("product_id") or 0),
                quantity=int(it.get("quantity") or 0),
                label=str(it.get("label") or ""),
            )
            for it in (p.get("items") or [])
        ]
        plan_rows.append(
            PackagingPlanCartonOut(
                carton_id=str(p.get("carton_id") or ""),
                carton_name=str(p.get("carton_name") or ""),
                usable_dimensions=p.get("usable_dimensions"),
                items=items,
                placements=list(p.get("placements") or []),
                weight=p.get("weight") if p.get("weight") is not None else p.get("total_weight_kg"),
                volume_utilization=p.get("volume_utilization") if p.get("volume_utilization") is not None else p.get("fill_percent"),
                confidence=p.get("confidence") or raw.get("confidence"),
                warnings=list(p.get("warnings") or []),
            )
        )
    return PackagingFitPlanOut(
        fits=bool(raw.get("fits")),
        recommended_packaging=raw.get("recommended_packaging") or raw.get("recommended_carton_id"),
        carton_count=int(raw.get("carton_count") or len(plan_rows)),
        method=str(raw.get("method") or ""),
        confidence=str(raw.get("confidence") or "UNKNOWN"),
        explanation=str(raw.get("explanation") or ""),
        warnings=list(raw.get("warnings") or []),
        plan=plan_rows,
        multi_carton_required=bool(raw.get("multi_carton_required")),
    )


def build_packaging_suggestions_for_order(
    db: Session,
    order: Order,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> tuple[list[PackagingSuggestionOut], Optional[PackagingSuggestionOut], list[PackagingSuggestionOut], PackagingFitPlanOut]:
    """
    Pipeline:
      candidates → PHYSICAL FIT (cartonization) → eligible only
      → Smart soft scores → deterministic ranking → PRIMARY.
    """
    cartons = _load_active_cartons(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    by_id = {str(c.id): c for c in cartons}
    items = items_from_order(order)
    shipping_constraints = None
    sm_id = getattr(order, "shipping_method_id", None)
    if sm_id:
        from ...models.shipping_method import ShippingMethod
        from .cartonization_solver import ShippingPackageConstraints

        sm = db.query(ShippingMethod).filter(ShippingMethod.id == str(sm_id)).first()
        shipping_constraints = ShippingPackageConstraints.from_shipping_method(sm)
    fit = solve_cartonization(
        items_with_qty=items,
        cartons=cartons,
        allow_multi_carton=True,
        shipping_constraints=shipping_constraints,
    )
    fit_plan = _fit_plan_out(fit)

    rejected_reasons = {str(r.carton_id): str(r.reason) for r in fit.rejected_cartons}
    rejected_ids = set(rejected_reasons)
    eligible: set[str] = set()
    if fit.fits:
        for plan in fit.cartons:
            eligible.add(str(plan.carton_id))
        if fit.recommended_carton_id:
            eligible.add(str(fit.recommended_carton_id))
    td = suggest_three_d_matching(order, cartons=cartons, shipping_constraints=shipping_constraints)
    for d in td:
        if "Odrzucony:" not in (d.reason or ""):
            eligible.add(str(d.suggested_package_id))
    eligible -= rejected_ids

    smart = suggest_smart_matching(db, order=order, tenant_id=tenant_id, warehouse_id=warehouse_id, cartons=cartons)
    smart_bonus = {
        str(s.suggested_package_id): max(0.0, float(s.confidence_score) - 0.4)
        for s in smart
        if str(s.suggested_package_id) in eligible
    }

    merged = _merge_by_carton(smart, td)
    annotate_override_flags(merged, order)
    demand, _ = _demand_volume_cm3(order)
    primary_draft, alt_drafts = finalize_primary_packaging(
        order,
        cartons,
        merged,
        eligible_carton_ids=eligible if eligible else set(),
        smart_bonus_by_id=smart_bonus,
        demand_cm3=demand,
        multi_carton=bool(fit.multi_carton_required),
    )

    # Append rejected cartons as trailing alternatives for operator transparency
    present_ids = {str(x.suggested_package_id) for x in ([primary_draft] if primary_draft else []) + alt_drafts}
    for rej in fit.rejected_cartons:
        cid = str(rej.carton_id)
        if cid in present_ids:
            continue
        c = by_id.get(cid)
        alt_drafts.append(
            PackagingSuggestionDraft(
                order_id=int(order.id),
                source_engine="THREE_D_MATCHING",
                suggested_package_id=cid,
                package_name=str(rej.carton_name or (c.name if c else "") or ""),
                package_dimensions="",
                image_url=getattr(c, "image_url", None) if c else None,
                confidence_score=0.05,
                fill_percentage=None,
                reason=f"Odrzucony: {rej.reason}",
                sort_key=0.0,
            )
        )
        present_ids.add(cid)
        if len(alt_drafts) >= 8:
            break

    conf = str(fit.confidence or "UNKNOWN")
    primary_out = (
        _enrich_out(
            primary_draft,
            carton=by_id.get(str(primary_draft.suggested_package_id)),
            eligible=eligible,
            rejected_reasons=rejected_reasons,
            fit_confidence=conf,
            is_recommended=True,
        )
        if primary_draft is not None
        else None
    )
    alt_outs = [
        _enrich_out(
            x,
            carton=by_id.get(str(x.suggested_package_id)),
            eligible=eligible,
            rejected_reasons=rejected_reasons,
            fit_confidence=conf,
            is_recommended=False,
        )
        for x in alt_drafts
    ]
    # Attach weight from plan if single carton
    if primary_out is not None and fit_plan.plan:
        primary_out.total_weight_kg = fit_plan.plan[0].weight
        if fit_plan.plan[0].usable_dimensions:
            ud = fit_plan.plan[0].usable_dimensions
            primary_out.usable_dimensions = f"{ud.get('length_cm', 0):g}×{ud.get('width_cm', 0):g}×{ud.get('height_cm', 0):g} cm"
        if fit_plan.plan[0].volume_utilization is not None and primary_out.fill_percentage is None:
            primary_out.fill_percentage = float(fit_plan.plan[0].volume_utilization)

    # Missing dims / usable warnings on primary
    if primary_out is not None:
        for w in fit_plan.warnings:
            if "MISSING" in w.upper() and "MISSING_PRODUCT_DIMENSIONS" not in (primary_out.reason or ""):
                primary_out.reason = f"{primary_out.reason} | Brak kompletnych wymiarów produktu.".strip(" |")[:2000]
            if "USABLE_DIMENSIONS" in w.upper():
                primary_out.reason = (
                    f"{primary_out.reason} | Brak wymiarów użytkowych opakowania — dopasowanie szacunkowe."
                ).strip(" |")[:2000]

    combined: list[PackagingSuggestionOut] = []
    if primary_out is not None:
        combined.append(primary_out)
    combined.extend(alt_outs)
    _ = confidence_label  # used by FE via fit_confidence codes
    return combined, primary_out, alt_outs, fit_plan
