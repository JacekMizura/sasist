"""Orkiestracja Smart + 3D → jedna lista propozycji."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ...models.carton import Carton
from ...models.order import Order
from ...schemas.packaging_intelligence import PackagingSuggestionOut
from .decision import finalize_primary_packaging
from .overrides import annotate_override_flags
from .smart_matching import suggest_smart_matching
from .suggestions import PackagingEngineSource, PackagingSuggestionDraft
from .three_d_matching import suggest_three_d_matching


def _carton_volume_sort_key(c: Carton) -> float:
    if c.length_cm is None or c.width_cm is None or c.height_cm is None:
        return float("inf")
    try:
        return float(c.length_cm) * float(c.width_cm) * float(c.height_cm)
    except (TypeError, ValueError):
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
            conf = max(a.confidence_score, b.confidence_score)
            fill = a.fill_percentage if a.fill_percentage is not None else b.fill_percentage
            reason = f"{a.reason} | {b.reason}"[:2000]
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
                    sort_key=max(a.sort_key, b.sort_key),
                )
            )
        elif a is not None:
            merged.append(a)
        elif b is not None:
            merged.append(b)
    merged.sort(key=lambda x: (-x.confidence_score, -x.sort_key, x.package_name.lower()))
    return merged


def _to_out(d: PackagingSuggestionDraft) -> PackagingSuggestionOut:
    return PackagingSuggestionOut(
        order_id=d.order_id,
        source_engine=d.source_engine,
        suggested_package_id=d.suggested_package_id,
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
    )


def build_packaging_suggestions_for_order(
    db: Session,
    order: Order,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> tuple[list[PackagingSuggestionOut], Optional[PackagingSuggestionOut], list[PackagingSuggestionOut]]:
    """
    Zwraca listę do UI (primary + uzasadnione alternatywy), osobno primary i alternatywy.
    Pełny merge Smart+3D jest źródłem kandydatów — nie pokazujemy „losowych” kartonów.
    """
    cartons = _load_active_cartons(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    smart = suggest_smart_matching(db, order=order, tenant_id=tenant_id, warehouse_id=warehouse_id, cartons=cartons)
    td = suggest_three_d_matching(order, cartons=cartons)
    merged = _merge_by_carton(smart, td)
    annotate_override_flags(merged, order)
    primary_draft, alt_drafts = finalize_primary_packaging(order, cartons, merged)
    primary_out = _to_out(primary_draft) if primary_draft is not None else None
    alt_outs = [_to_out(x) for x in alt_drafts]
    combined: list[PackagingSuggestionOut] = []
    if primary_out is not None:
        combined.append(primary_out)
    combined.extend(alt_outs)
    return combined, primary_out, alt_outs
