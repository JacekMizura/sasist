"""AI recommendation context — architecture only, no ML (§13)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Literal

RecommendationKind = Literal[
    "SUBSTITUTE",
    "ALTERNATIVE_RECIPE",
    "RESCHEDULE_PRODUCTION",
    "PURCHASE",
    "PARTIAL_PRODUCTION",
]


@dataclass
class MaterialRecommendationCandidate:
    kind: RecommendationKind
    score: float | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    rationale: str = ""
    requires_user_acceptance: bool = True


@dataclass
class MaterialRecommendationContext:
    """Serializable snapshot for future AI / rules engine."""

    tenant_id: int
    warehouse_id: int
    composition_id: int | None
    product_id: int | None
    planned_quantity: float
    material_status: str
    producible_now_qty: float
    waiting_qty: float
    limiting_component_id: int | None
    component_shortages: list[dict[str, Any]] = field(default_factory=list)
    substitute_proposals: list[dict[str, Any]] = field(default_factory=list)
    recipe_variant_codes: list[str] = field(default_factory=list)
    candidates: list[MaterialRecommendationCandidate] = field(default_factory=list)
    generated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["candidates"] = [asdict(c) for c in self.candidates]
        return d


def build_recommendation_context(
    *,
    tenant_id: int,
    warehouse_id: int,
    analysis: dict[str, Any],
    composition_id: int | None = None,
    product_id: int | None = None,
    recipe_variant_codes: list[str] | None = None,
) -> MaterialRecommendationContext:
    """Rule-based candidate list — placeholder for future AI ranking."""
    components = analysis.get("components") or []
    shortages = [c for c in components if float(c.get("missing_qty") or 0) > 1e-6]
    limiting = analysis.get("limiting_component")
    candidates: list[MaterialRecommendationCandidate] = []

    if analysis.get("material_status") == "PARTIAL":
        candidates.append(
            MaterialRecommendationCandidate(
                kind="PARTIAL_PRODUCTION",
                score=1.0,
                payload={
                    "producible_now_qty": analysis.get("producible_now_qty"),
                    "waiting_qty": analysis.get("waiting_qty"),
                },
                rationale="Materiałów wystarcza na produkcję częściową.",
            )
        )

    for comp in shortages:
        for sub in comp.get("substitute_proposals") or []:
            if sub.get("can_cover_shortage"):
                candidates.append(
                    MaterialRecommendationCandidate(
                        kind="SUBSTITUTE",
                        score=0.9 - 0.01 * float(sub.get("priority") or 10),
                        payload={
                            "original_product_id": comp.get("component_product_id"),
                            "substitute_product_id": sub.get("substitute_product_id"),
                            "conversion_ratio": sub.get("conversion_ratio"),
                        },
                        rationale=f"Zamiennik {sub.get('substitute_product_name')} pokrywa brak.",
                    )
                )
                break
        candidates.append(
            MaterialRecommendationCandidate(
                kind="PURCHASE",
                score=0.5,
                payload={
                    "component_product_id": comp.get("component_product_id"),
                    "missing_qty": comp.get("missing_qty"),
                },
                rationale="Utwórz zapotrzebowanie zakupowe.",
            )
        )

    if recipe_variant_codes and len(recipe_variant_codes) > 1:
        candidates.append(
            MaterialRecommendationCandidate(
                kind="ALTERNATIVE_RECIPE",
                score=0.4,
                payload={"available_variants": recipe_variant_codes},
                rationale="Dostępne alternatywne receptury produktu.",
            )
        )

    return MaterialRecommendationContext(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        composition_id=composition_id,
        product_id=product_id,
        planned_quantity=float(analysis.get("planned_quantity") or 0),
        material_status=str(analysis.get("material_status") or "OK"),
        producible_now_qty=float(analysis.get("producible_now_qty") or 0),
        waiting_qty=float(analysis.get("waiting_qty") or 0),
        limiting_component_id=int(limiting["component_product_id"]) if limiting else None,
        component_shortages=shortages,
        substitute_proposals=[s for c in shortages for s in (c.get("substitute_proposals") or [])],
        recipe_variant_codes=list(recipe_variant_codes or []),
        candidates=candidates,
    )
