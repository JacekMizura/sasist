"""Cartonization solver — multi-SKU order → cartons using shared fit_engine."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from ...models.carton import Carton
from ..fit_engine.adapters import fit_container_from_carton, fit_item_from_product
from ..fit_engine.geometry import best_identical_unit_layout, item_fits_in_container_any_orientation
from ..fit_engine.models import FitConfidence, FitContainer, FitItem, FitMethod
from ..fit_engine.placement import identical_qty_fits_via_capacity, try_pack_items_into_container


@dataclass
class RejectedCarton:
    carton_id: str
    carton_name: str
    reason: str


@dataclass
class CartonPlanItem:
    product_id: int
    quantity: int
    label: str = ""


@dataclass
class CartonPlan:
    carton_id: str
    carton_name: str
    items: list[CartonPlanItem]
    placements: list[dict[str, Any]] = field(default_factory=list)
    used_volume_cm3: float = 0.0
    fill_percent: float = 0.0
    total_weight_kg: float = 0.0
    remaining_weight_kg: Optional[float] = None
    unused_volume_cm3: float = 0.0
    warnings: list[str] = field(default_factory=list)
    usable_dimensions: Optional[dict[str, float]] = None
    confidence: Optional[str] = None
    volume_utilization: Optional[float] = None


@dataclass
class PackagingFitResult:
    fits: bool
    recommended_carton_id: Optional[str]
    cartons: list[CartonPlan]
    multi_carton_required: bool
    method: str
    confidence: str
    explanation: str
    warnings: list[str] = field(default_factory=list)
    rejected_cartons: list[RejectedCarton] = field(default_factory=list)
    capability_flags: dict[str, bool] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "fits": self.fits,
            "recommended_packaging": self.recommended_carton_id,
            "recommended_carton_id": self.recommended_carton_id,
            "carton_count": len(self.cartons),
            "plan": [
                {
                    "carton_id": c.carton_id,
                    "carton_name": c.carton_name,
                    "usable_dimensions": c.usable_dimensions,
                    "items": [asdict(i) for i in c.items],
                    "placements": c.placements,
                    "weight": c.total_weight_kg,
                    "volume_utilization": c.volume_utilization if c.volume_utilization is not None else c.fill_percent,
                    "confidence": c.confidence or self.confidence,
                    "warnings": c.warnings,
                    "used_volume_cm3": c.used_volume_cm3,
                    "fill_percent": c.fill_percent,
                    "total_weight_kg": c.total_weight_kg,
                    "remaining_weight_kg": c.remaining_weight_kg,
                    "unused_volume_cm3": c.unused_volume_cm3,
                }
                for c in self.cartons
            ],
            "multi_carton_required": self.multi_carton_required,
            "method": self.method,
            "confidence": self.confidence,
            "explanation": self.explanation,
            "warnings": list(self.warnings),
            "capability_flags": dict(self.capability_flags),
            "cartons": [
                {
                    "carton_id": c.carton_id,
                    "carton_name": c.carton_name,
                    "usable_dimensions": c.usable_dimensions,
                    "items": [asdict(i) for i in c.items],
                    "placements": c.placements,
                    "used_volume_cm3": c.used_volume_cm3,
                    "fill_percent": c.fill_percent,
                    "volume_utilization": c.volume_utilization if c.volume_utilization is not None else c.fill_percent,
                    "total_weight_kg": c.total_weight_kg,
                    "remaining_weight_kg": c.remaining_weight_kg,
                    "unused_volume_cm3": c.unused_volume_cm3,
                    "confidence": c.confidence or self.confidence,
                    "warnings": c.warnings,
                }
                for c in self.cartons
            ],
            "rejected_cartons": [asdict(r) for r in self.rejected_cartons],
        }


def _usable_dims(container: FitContainer) -> dict[str, float]:
    return {
        "length_cm": float(container.length_cm),
        "width_cm": float(container.width_cm),
        "height_cm": float(container.height_cm),
    }


def _plan_confidence(container: FitContainer, *, multi: bool = False) -> str:
    if multi:
        return FitConfidence.ESTIMATED.value
    if not container.dimensions_are_usable:
        return FitConfidence.ESTIMATED.value
    return FitConfidence.EXACT.value


def _carton_volume_cm3(c: Carton | FitContainer) -> float:
    if isinstance(c, FitContainer):
        return c.volume_cm3
    L = float(getattr(c, "length_cm", 0) or 0)
    W = float(getattr(c, "width_cm", 0) or 0)
    H = float(getattr(c, "height_cm", 0) or 0)
    if L <= 0 or W <= 0 or H <= 0:
        return 0.0
    return L * W * H


def _cheap_reject(
    container: FitContainer,
    items: list[tuple[FitItem, int]],
) -> Optional[str]:
    total_w = sum(float(it.weight_kg or 0) * q for it, q in items)
    if container.max_weight_kg is not None and container.max_weight_kg > 0 and total_w > float(container.max_weight_kg) + 1e-6:
        return "WEIGHT_EXCEEDED"
    demand_vol = sum(it.unit_volume_dm3 * 1000.0 * q for it, q in items)
    if container.volume_cm3 > 0 and demand_vol > container.volume_cm3 * 1.05:
        # Soft — still try geometry; only hard-fail single item dims
        pass
    for it, q in items:
        if q <= 0:
            continue
        ok, reason = item_fits_in_container_any_orientation(container, it)
        if not ok:
            return reason or "ITEM_DIMENSION_EXCEEDS_CONTAINER"
    return None


def try_fit_order_in_carton(
    container: FitContainer,
    items_with_qty: list[tuple[FitItem, int]],
) -> tuple[bool, Optional[str], Any]:
    """Returns (fits, reason, pack_result_or_layout)."""
    cheap = _cheap_reject(container, items_with_qty)
    if cheap in ("ITEM_DIMENSION_EXCEEDS_CONTAINER", "ITEM_MISSING_DIMENSIONS", "CONTAINER_MISSING_DIMENSIONS", "NO_VALID_ORIENTATION"):
        return False, cheap, None
    if cheap == "WEIGHT_EXCEEDED":
        return False, "WEIGHT_EXCEEDED", None

    # Identical SKU fast path (stack/compression aware)
    non_empty = [(it, q) for it, q in items_with_qty if q > 0]
    if len(non_empty) == 1:
        it, q = non_empty[0]
        if identical_qty_fits_via_capacity(container, it, int(q)):
            layout = best_identical_unit_layout(container, it)
            return True, None, layout
        return False, "GEOMETRIC_PACKING_FAILED", None

    pack = try_pack_items_into_container(container, items_with_qty)
    if not pack.fits:
        return False, pack.reason or "GEOMETRIC_PACKING_FAILED", pack
    return True, None, pack


def _score_fill(used_cm3: float, carton_cm3: float) -> float:
    if carton_cm3 <= 0:
        return 0.0
    return min(100.0, (used_cm3 / carton_cm3) * 100.0)


def solve_cartonization(
    *,
    items_with_qty: list[tuple[FitItem, int]],
    cartons: list[Carton],
    allow_multi_carton: bool = True,
    max_payload_kg_by_carton_id: Optional[dict[str, float]] = None,
) -> PackagingFitResult:
    """
    Pick smallest carton that geometrically fits; else multi-carton plan if allowed.
    Deterministic: sort by volume asc, then id.
    """
    warnings: list[str] = []
    rejected: list[RejectedCarton] = []
    capability = {"multi_carton": True, "geometric_placement": True}

    # Missing dims → UNKNOWN / VOLUME_ESTIMATE, do not fake EXACT
    no_xyz = any(
        (float(it.length_cm or 0) <= 0 or float(it.width_cm or 0) <= 0 or float(it.height_cm or 0) <= 0)
        for it, q in items_with_qty
        if q > 0
    )
    missing = any(
        (float(it.length_cm or 0) <= 0 or float(it.width_cm or 0) <= 0 or float(it.height_cm or 0) <= 0)
        and it.unit_volume_dm3 <= 0
        for it, q in items_with_qty
        if q > 0
    )

    sorted_cartons = sorted(
        [c for c in cartons if _carton_volume_cm3(c) > 0],
        key=lambda c: (_carton_volume_cm3(c), str(c.id)),
    )
    if not sorted_cartons:
        return PackagingFitResult(
            fits=False,
            recommended_carton_id=None,
            cartons=[],
            multi_carton_required=False,
            method=FitMethod.UNKNOWN.value,
            confidence=FitConfidence.UNKNOWN.value,
            explanation="Brak aktywnych kartonów z wymiarami.",
            warnings=["NO_CARTONS"],
            rejected_cartons=[],
            capability_flags=capability,
        )

    if no_xyz:
        # Soft carton suggestion by volume ratio only — never EXACT
        demand = sum(max(0.0, it.unit_volume_dm3) * q * 1000 for it, q in items_with_qty)
        conf = FitConfidence.UNKNOWN if missing else FitConfidence.ESTIMATED
        method = FitMethod.UNKNOWN if missing else FitMethod.VOLUME_ESTIMATE
        for c in sorted_cartons:
            cv = _carton_volume_cm3(c)
            if demand <= 0 or cv >= demand:
                return PackagingFitResult(
                    fits=True,
                    recommended_carton_id=str(c.id),
                    cartons=[
                        CartonPlan(
                            carton_id=str(c.id),
                            carton_name=str(c.name or ""),
                            items=[CartonPlanItem(it.product_id, q, it.label) for it, q in items_with_qty if q > 0],
                            fill_percent=0.0 if demand <= 0 else _score_fill(demand, cv),
                            warnings=["MISSING_PRODUCT_DIMENSIONS"],
                            usable_dimensions=_usable_dims(fit_container_from_carton(c)),
                            confidence=conf.value,
                            volume_utilization=0.0 if demand <= 0 else _score_fill(demand, cv),
                        )
                    ],
                    multi_carton_required=False,
                    method=method.value,
                    confidence=conf.value,
                    explanation="Brak pełnych wymiarów XYZ produktów — sugestia objętościowa, bez twardej walidacji.",
                    warnings=["MISSING_PRODUCT_DIMENSIONS"],
                    rejected_cartons=[],
                    capability_flags=capability,
                )
        return PackagingFitResult(
            fits=False,
            recommended_carton_id=None,
            cartons=[],
            multi_carton_required=True,
            method=method.value,
            confidence=conf.value,
            explanation="Brak wymiarów — nie można potwierdzić fit.",
            warnings=["MISSING_PRODUCT_DIMENSIONS"],
            rejected_cartons=[],
            capability_flags=capability,
        )

    # Single-carton search: smallest that fits
    best: Optional[tuple[Carton, Any, float, float]] = None  # carton, pack, fill, weight
    for c in sorted_cartons:
        payload = None
        if max_payload_kg_by_carton_id and str(c.id) in max_payload_kg_by_carton_id:
            payload = max_payload_kg_by_carton_id[str(c.id)]
        container = fit_container_from_carton(c, max_payload_kg=payload)
        ok, reason, pack = try_fit_order_in_carton(container, items_with_qty)
        if not ok:
            rejected.append(
                RejectedCarton(
                    carton_id=str(c.id),
                    carton_name=str(c.name or ""),
                    reason=reason or "GEOMETRIC_PACKING_FAILED",
                )
            )
            continue
        used = 0.0
        weight = sum(float(it.weight_kg or 0) * q for it, q in items_with_qty)
        if hasattr(pack, "used_volume_cm3"):
            used = float(pack.used_volume_cm3 or 0)
        else:
            used = sum(it.unit_volume_dm3 * 1000.0 * q for it, q in items_with_qty)
        fill = _score_fill(used, container.volume_cm3)
        best = (c, pack, fill, weight)
        break  # smallest first — first success is best

    if best is not None:
        c, pack, fill, weight = best
        container = fit_container_from_carton(c)
        placements: list[dict[str, Any]] = []
        if hasattr(pack, "placements"):
            placements = [
                {
                    "product_id": p.product_id,
                    "x": p.x,
                    "y": p.y,
                    "z": p.z,
                    "l": p.l,
                    "w": p.w,
                    "h": p.h,
                }
                for p in pack.placements
            ]
        rem_w = None
        if container.max_weight_kg:
            rem_w = max(0.0, float(container.max_weight_kg) - weight)
        plan = CartonPlan(
            carton_id=str(c.id),
            carton_name=str(c.name or ""),
            items=[CartonPlanItem(it.product_id, int(q), it.label) for it, q in items_with_qty if q > 0],
            placements=placements,
            used_volume_cm3=sum(it.unit_volume_dm3 * 1000 * q for it, q in items_with_qty),
            fill_percent=fill,
            total_weight_kg=weight,
            remaining_weight_kg=rem_w,
            unused_volume_cm3=max(0.0, container.volume_cm3 - fill / 100.0 * container.volume_cm3),
            warnings=list(container.warnings),
            usable_dimensions=_usable_dims(container),
            confidence=_plan_confidence(container),
            volume_utilization=fill,
        )
        conf = FitConfidence.EXACT
        method = FitMethod.GEOMETRIC
        out_warnings = list(warnings) + list(container.warnings)
        if not container.dimensions_are_usable:
            conf = FitConfidence.ESTIMATED
            out_warnings.append("USABLE_DIMENSIONS_NOT_DEFINED")
        return PackagingFitResult(
            fits=True,
            recommended_carton_id=str(c.id),
            cartons=[plan],
            multi_carton_required=False,
            method=method.value,
            confidence=conf.value,
            explanation=(
                f"Wybrano {c.name or c.id}. Wypełnienie geometryczne ~{fill:.0f}%. "
                f"Waga: {weight:.2f} kg."
            ),
            warnings=out_warnings,
            rejected_cartons=rejected,
            capability_flags=capability,
        )

    if not allow_multi_carton:
        return PackagingFitResult(
            fits=False,
            recommended_carton_id=None,
            cartons=[],
            multi_carton_required=True,
            method=FitMethod.GEOMETRIC.value,
            confidence=FitConfidence.EXACT.value,
            explanation="Żaden pojedynczy karton nie mieści zamówienia (MULTI_CARTON_REQUIRED).",
            warnings=warnings + ["MULTI_CARTON_REQUIRED"],
            rejected_cartons=rejected,
            capability_flags=capability,
        )

    # Multi-carton greedy + bounded improvement (HEURISTIC, not EXACT)
    def _greedy_multi(item_order: list[tuple[FitItem, int]]) -> list[CartonPlan] | None:
        rem: dict[int, tuple[FitItem, int]] = {}
        for it, q in item_order:
            if q <= 0:
                continue
            if it.product_id in rem:
                prev_it, prev_q = rem[it.product_id]
                rem[it.product_id] = (prev_it, prev_q + q)
            else:
                rem[it.product_id] = (it, q)
        local_plans: list[CartonPlan] = []
        safety = 0
        while rem and safety < 64:
            safety += 1
            placed_any = False
            for c in sorted_cartons:
                container = fit_container_from_carton(c)
                current_items = [(it, q) for it, q in rem.values()]
                ok, _reason, _pack = try_fit_order_in_carton(container, current_items)
                if ok:
                    weight = sum(float(it.weight_kg or 0) * q for it, q in current_items)
                    used = sum(it.unit_volume_dm3 * 1000 * q for it, q in current_items)
                    local_plans.append(
                        CartonPlan(
                            carton_id=str(c.id),
                            carton_name=str(c.name or ""),
                            items=[CartonPlanItem(it.product_id, int(q), it.label) for it, q in current_items],
                            used_volume_cm3=used,
                            fill_percent=_score_fill(used, container.volume_cm3),
                            total_weight_kg=weight,
                            unused_volume_cm3=max(0.0, container.volume_cm3 - used),
                            warnings=list(container.warnings),
                            usable_dimensions=_usable_dims(container),
                            confidence=_plan_confidence(container, multi=True),
                            volume_utilization=_score_fill(used, container.volume_cm3),
                        )
                    )
                    rem.clear()
                    placed_any = True
                    break
                for pid in sorted(rem.keys()):
                    it, q = rem[pid]
                    layout = best_identical_unit_layout(container, it)
                    take = min(int(q), int(layout.capacity))
                    if take <= 0:
                        continue
                    ok2, _, _ = try_fit_order_in_carton(container, [(it, take)])
                    if not ok2:
                        continue
                    weight = float(it.weight_kg or 0) * take
                    used = it.unit_volume_dm3 * 1000 * take
                    local_plans.append(
                        CartonPlan(
                            carton_id=str(c.id),
                            carton_name=str(c.name or ""),
                            items=[CartonPlanItem(it.product_id, take, it.label)],
                            used_volume_cm3=used,
                            fill_percent=_score_fill(used, container.volume_cm3),
                            total_weight_kg=weight,
                            unused_volume_cm3=max(0.0, container.volume_cm3 - used),
                            warnings=list(container.warnings),
                            usable_dimensions=_usable_dims(container),
                            confidence=_plan_confidence(container, multi=True),
                            volume_utilization=_score_fill(used, container.volume_cm3),
                        )
                    )
                    left = int(q) - take
                    if left > 0:
                        rem[pid] = (it, left)
                    else:
                        del rem[pid]
                    placed_any = True
                    break
                if placed_any:
                    break
            if not placed_any:
                return None
        return local_plans if not rem else None

    orders = [
        list(items_with_qty),
        sorted(items_with_qty, key=lambda t: (-t[0].unit_volume_dm3, -t[0].product_id)),
        sorted(
            items_with_qty,
            key=lambda t: (-max(t[0].length_cm, t[0].width_cm, t[0].height_cm), -t[0].product_id),
        ),
        sorted(items_with_qty, key=lambda t: (-t[0].weight_kg, -t[0].product_id)),
    ]
    best_plans: list[CartonPlan] | None = None
    for ord_items in orders:
        candidate = _greedy_multi(ord_items)
        if candidate is None:
            continue
        if best_plans is None or len(candidate) < len(best_plans):
            best_plans = candidate

    # Improvement: try packing last two carton loads into one larger carton
    if best_plans is not None and len(best_plans) >= 2:
        last_two = best_plans[-2:]
        merged_items: dict[int, tuple[FitItem, int]] = {}
        item_lookup = {it.product_id: it for it, _ in items_with_qty}
        for plan in last_two:
            for ci in plan.items:
                it = item_lookup.get(ci.product_id)
                if it is None:
                    continue
                prev = merged_items.get(ci.product_id)
                merged_items[ci.product_id] = (it, (prev[1] if prev else 0) + ci.quantity)
        merged_list = list(merged_items.values())
        for c in reversed(sorted_cartons):
            container = fit_container_from_carton(c)
            ok, _, _ = try_fit_order_in_carton(container, merged_list)
            if ok:
                weight = sum(float(it.weight_kg or 0) * q for it, q in merged_list)
                used = sum(it.unit_volume_dm3 * 1000 * q for it, q in merged_list)
                improved = best_plans[:-2] + [
                    CartonPlan(
                        carton_id=str(c.id),
                        carton_name=str(c.name or ""),
                        items=[CartonPlanItem(it.product_id, int(q), it.label) for it, q in merged_list],
                        used_volume_cm3=used,
                        fill_percent=_score_fill(used, container.volume_cm3),
                        total_weight_kg=weight,
                        unused_volume_cm3=max(0.0, container.volume_cm3 - used),
                        warnings=list(container.warnings),
                        usable_dimensions=_usable_dims(container),
                        confidence=_plan_confidence(container, multi=True),
                        volume_utilization=_score_fill(used, container.volume_cm3),
                    )
                ]
                if len(improved) < len(best_plans):
                    best_plans = improved
                break

    if best_plans is None:
        return PackagingFitResult(
            fits=False,
            recommended_carton_id=None,
            cartons=[],
            multi_carton_required=True,
            method="HEURISTIC_MULTI_CARTON",
            confidence=FitConfidence.ESTIMATED.value,
            explanation="Nie udało się rozłożyć całego zamówienia na kartony (GEOMETRIC_PACKING_FAILED).",
            warnings=warnings + ["MULTI_CARTON_INCOMPLETE"],
            rejected_cartons=rejected,
            capability_flags=capability,
        )

    plans = best_plans
    first_id = plans[0].carton_id if plans else None
    return PackagingFitResult(
        fits=True,
        recommended_carton_id=first_id,
        cartons=plans,
        multi_carton_required=len(plans) > 1,
        method="HEURISTIC_MULTI_CARTON",
        confidence=FitConfidence.ESTIMATED.value,
        explanation=(
            f"MULTI_CARTON_REQUIRED (heuristic): {len(plans)} opakowań. "
            + "; ".join(f"{p.carton_name or p.carton_id}" for p in plans)
        ),
        warnings=warnings + (["MULTI_CARTON_REQUIRED", "HEURISTIC_MULTI_CARTON"] if len(plans) > 1 else []),
        rejected_cartons=rejected,
        capability_flags=capability,
    )


def items_from_order(order: Any) -> list[tuple[FitItem, int]]:
    out: list[tuple[FitItem, int]] = []
    for it in getattr(order, "items", None) or []:
        q = int(getattr(it, "quantity", 0) or 0)
        if q <= 0:
            continue
        product = getattr(it, "product", None)
        if product is None:
            continue
        out.append((fit_item_from_product(product), q))
    return out
