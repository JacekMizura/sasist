"""
Packaging ranking — PHYSICAL FIT is the gate; Smart/history is soft ranking only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ...models.carton import Carton
from ...models.order import Order
from ..fit_engine.adapters import fit_container_from_carton
from .suggestions import PackagingSuggestionDraft


@dataclass
class RankedPackagingCandidate:
    draft: PackagingSuggestionDraft
    score: float
    why_selected: list[str] = field(default_factory=list)


def _usable_volume_cm3(c: Carton) -> float:
    container = fit_container_from_carton(c)
    return float(container.volume_cm3 or 0)


def _carton_cost(c: Carton) -> float:
    for attr in ("unit_cost", "purchase_price", "last_purchase_price_net"):
        v = getattr(c, attr, None)
        if v is not None:
            try:
                f = float(v)
                if f >= 0:
                    return f
            except (TypeError, ValueError):
                pass
    return 0.0


def score_eligible_carton(
    c: Carton,
    draft: PackagingSuggestionDraft,
    *,
    demand_cm3: float,
    smart_bonus: float,
    carton_count: int = 1,
) -> RankedPackagingCandidate:
    """
    Lower score is better (deterministic).
    Physical eligibility is assumed already gated by caller.
    """
    why: list[str] = ["FIT_OK"]
    uv = _usable_volume_cm3(c)
    fill = float(draft.fill_percentage) if draft.fill_percentage is not None else None
    waste = 0.0
    if uv > 0 and demand_cm3 > 0:
        waste = max(0.0, (uv - demand_cm3) / uv)
    elif fill is not None:
        waste = max(0.0, 1.0 - fill / 100.0)

    score = 0.0
    # 1) fewer cartons
    score += 1000.0 * max(0, carton_count - 1)
    if carton_count == 1:
        why.append("1_CARTON")

    # 2) wasted usable volume
    score += 100.0 * waste
    if waste <= 0.35:
        why.append("LOWEST_WASTE")

    # 3) oversize slack (prefer tighter)
    score += 10.0 * (uv / max(demand_cm3, 1.0))

    # 4) Smart / historical soft signal (never a gate)
    score -= 15.0 * float(smart_bonus)
    if smart_bonus >= 0.2:
        why.append("HISTORICAL_MATCH")

    # 5) packaging cost soft
    cost = _carton_cost(c)
    score += min(50.0, cost)
    if cost > 0 and cost < 5:
        why.append("LOWER_COST")

    # 6) usable dims preferred
    container = fit_container_from_carton(c)
    if not container.dimensions_are_usable:
        score += 5.0
        why.append("EXTERNAL_DIMS_FALLBACK")

    # 7) tie-break: smaller volume then id
    score += uv * 1e-9
    score += (hash(str(c.id)) % 1000) * 1e-12  # avoid; use lexical below

    return RankedPackagingCandidate(draft=draft, score=score, why_selected=why)


def finalize_primary_packaging(
    order: Order,
    cartons: list[Carton],
    merged: list[PackagingSuggestionDraft],
    *,
    eligible_carton_ids: Optional[set[str]] = None,
    smart_bonus_by_id: Optional[dict[str, float]] = None,
    demand_cm3: float = 0.0,
    multi_carton: bool = False,
) -> tuple[Optional[PackagingSuggestionDraft], list[PackagingSuggestionDraft]]:
    """
    PHYSICAL FIT gate first (eligible_carton_ids), then deterministic ranking.
    Smart Matching may only affect soft score among eligible cartons.
    """
    if not merged:
        return None, []

    by_id = {str(c.id): c for c in cartons}
    smart_bonus_by_id = smart_bonus_by_id or {}

    def _is_reject(d: PackagingSuggestionDraft) -> bool:
        return "Odrzucony:" in (d.reason or "")

    # HARD GATE: only physically eligible
    if eligible_carton_ids is not None:
        pool = [
            d
            for d in merged
            if str(d.suggested_package_id) in eligible_carton_ids and not _is_reject(d)
        ]
    else:
        # Backward-compatible fallback: geometric engines only
        pool = [
            d
            for d in merged
            if not _is_reject(d)
            and (
                d.source_engine in ("THREE_D_MATCHING", "COMBINED")
                or d.fill_percentage is not None
            )
        ]

    if not pool:
        # HARD GATE: when eligible_carton_ids was provided (even empty), never promote
        # Smart-only / historically preferred cartons that failed physical FIT.
        if eligible_carton_ids is not None:
            reject_alts = [d for d in merged if _is_reject(d)][:4]
            return None, reject_alts
        # Backward-compatible fallback only when gate was not supplied
        non_rej = [d for d in merged if not _is_reject(d)]
        pool = non_rej or []

    if not pool:
        return None, []

    ranked: list[RankedPackagingCandidate] = []
    for d in pool:
        c = by_id.get(str(d.suggested_package_id))
        if c is None:
            continue
        bonus = float(smart_bonus_by_id.get(str(c.id), 0.0))
        # Also parse soft bonus from SMART in merged conf if not provided
        if bonus <= 0 and "Smart Matching" in (d.reason or "") and "HISTORICAL" not in "".join([]):
            if d.source_engine in ("SMART_MATCHING", "COMBINED"):
                bonus = max(0.0, min(0.5, float(d.confidence_score) - 0.4))
        rc = score_eligible_carton(
            c,
            d,
            demand_cm3=demand_cm3,
            smart_bonus=bonus,
            carton_count=2 if multi_carton else 1,
        )
        ranked.append(rc)

    if not ranked:
        return None, []

    ranked.sort(
        key=lambda r: (
            r.score,
            _usable_volume_cm3(by_id[str(r.draft.suggested_package_id)]),
            str(r.draft.suggested_package_id),
        )
    )
    primary_rc = ranked[0]
    primary = primary_rc.draft
    # Annotate why into reason (explainable)
    why = ",".join(primary_rc.why_selected)
    if why and f"WHY_SELECTED:{why}" not in (primary.reason or ""):
        primary.reason = f"{primary.reason} | WHY_SELECTED:{why}"[:2000]
        primary.sort_key = max(primary.sort_key, 1.0 - primary_rc.score / 10000.0)

    alts: list[PackagingSuggestionDraft] = []
    for rc in ranked[1:]:
        if len(alts) >= 4:
            break
        alts.append(rc.draft)

    # Rejects only as trailing transparency alts
    for d in merged:
        if len(alts) >= 4:
            break
        if _is_reject(d) and all(a.suggested_package_id != d.suggested_package_id for a in alts):
            if d.suggested_package_id != primary.suggested_package_id:
                alts.append(d)

    return primary, alts


# Re-export helpers used by older call sites / tests
def _demand_volume_cm3(order: Order) -> tuple[float, bool]:
    vol = 0.0
    any_ok = False
    for it in order.items or []:
        q = int(getattr(it, "quantity", 0) or 0)
        if q <= 0:
            continue
        p = getattr(it, "product", None)
        if p is None:
            continue
        L = getattr(p, "length", None)
        W = getattr(p, "width", None)
        H = getattr(p, "height", None)
        if L is None or W is None or H is None:
            continue
        try:
            lv, wv, hv = float(L), float(W), float(H)
        except (TypeError, ValueError):
            continue
        if lv <= 0 or wv <= 0 or hv <= 0:
            continue
        any_ok = True
        vol += lv * wv * hv * q
    return vol, any_ok
