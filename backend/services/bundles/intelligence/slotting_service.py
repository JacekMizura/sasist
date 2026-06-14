"""P4.18B — Bundle component co-occurrence and slotting proximity recommendations."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from itertools import combinations
from typing import Optional

from sqlalchemy.orm import Session

from ....models.bundle import Bundle
from ....models.product import Product
from ....models.product_warehouse_slotting import ProductWarehouseSlotting


@dataclass
class BundleSlottingPairRecommendation:
    product_a_id: int
    product_a_name: str
    product_a_sku: Optional[str]
    product_b_id: int
    product_b_name: str
    product_b_sku: Optional[str]
    co_occurrence_rate: float
    bundles_together_count: int
    bundles_with_a_count: int
    location_a: Optional[str]
    location_b: Optional[str]
    recommendation: str
    priority: str  # high | medium | low


def _primary_location_label(db: Session, *, tenant_id: int, warehouse_id: int, product_id: int) -> Optional[str]:
    row = (
        db.query(ProductWarehouseSlotting)
        .filter(
            ProductWarehouseSlotting.tenant_id == int(tenant_id),
            ProductWarehouseSlotting.warehouse_id == int(warehouse_id),
            ProductWarehouseSlotting.product_id == int(product_id),
        )
        .order_by(ProductWarehouseSlotting.quantity.desc())
        .first()
    )
    return str(row.location_uuid) if row else None


def _product_labels(db: Session, product_ids: set[int]) -> dict[int, tuple[str, Optional[str]]]:
    if not product_ids:
        return {}
    rows = db.query(Product).filter(Product.id.in_(list(product_ids))).all()
    return {int(p.id): (str(p.name or f"P{p.id}"), (p.sku or "").strip() or None) for p in rows}


def build_bundle_slotting_recommendations(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    min_co_occurrence_rate: float = 0.8,
    limit: int = 50,
) -> list[BundleSlottingPairRecommendation]:
    """
    Analyse bundle catalog (BundleItem) for SKU pairs that co-occur in bundles.
    Recommend adjacent slotting when pick locations differ.
    """
    bundles = (
        db.query(Bundle)
        .filter(Bundle.tenant_id == int(tenant_id), Bundle.deleted_at.is_(None), Bundle.active.is_(True))
        .all()
    )
    bundle_items: dict[int, set[int]] = {}
    for b in bundles:
        pids = {int(it.product_id) for it in (b.items or []) if it.product_id}
        if len(pids) >= 2:
            bundle_items[int(b.id)] = pids

    pair_bundles: dict[tuple[int, int], int] = defaultdict(int)
    product_bundle_count: dict[int, int] = defaultdict(int)

    for _bid, pids in bundle_items.items():
        for pid in pids:
            product_bundle_count[pid] += 1
        for a, b in combinations(sorted(pids), 2):
            pair_bundles[(a, b)] += 1

    product_ids = set(product_bundle_count.keys())
    labels = _product_labels(db, product_ids)

    out: list[BundleSlottingPairRecommendation] = []
    for (a, b), together in sorted(pair_bundles.items(), key=lambda x: -x[1]):
        with_a = product_bundle_count.get(a, 0)
        if with_a <= 0:
            continue
        rate = together / with_a
        if rate < min_co_occurrence_rate:
            continue
        loc_a = _primary_location_label(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=a)
        loc_b = _primary_location_label(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=b)
        name_a, sku_a = labels.get(a, (f"P{a}", None))
        name_b, sku_b = labels.get(b, (f"P{b}", None))
        same_loc = loc_a and loc_b and loc_a == loc_b
        if same_loc:
            rec = "Już w tej samej lokalizacji pick-face — utrzymaj sąsiedztwo."
            priority = "low"
        elif loc_a and loc_b:
            rec = f"Zalecane sąsiedztwo lokalizacji ({int(rate * 100)}% bundle wspólnych)."
            priority = "high" if rate >= 0.95 else "medium"
        else:
            rec = "Przypisz oba SKU do sąsiednich lokalizacji pick-face (brak pełnego slottingu)."
            priority = "medium"
        out.append(
            BundleSlottingPairRecommendation(
                product_a_id=a,
                product_a_name=name_a,
                product_a_sku=sku_a,
                product_b_id=b,
                product_b_name=name_b,
                product_b_sku=sku_b,
                co_occurrence_rate=round(rate, 4),
                bundles_together_count=together,
                bundles_with_a_count=with_a,
                location_a=loc_a,
                location_b=loc_b,
                recommendation=rec,
                priority=priority,
            )
        )
        if len(out) >= limit:
            break
    return out
