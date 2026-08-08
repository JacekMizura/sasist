"""
Strategia Smart Matching — uczenie z historii pakowania + miękka heurystyka metody wysyłki.

Historia (reguły auto) ma pierwszeństwo. Gdy ustawienie wyłączone — brak propozycji Smart.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.carton import Carton, carton_shipping_method_links
from ...models.order import Order
from .smart_matching_store import (
    active_rule_for_composition,
    composition_from_order,
    get_or_create_settings,
)
from .suggestions import PackagingSuggestionDraft


def suggest_smart_matching(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    cartons: list[Carton],
) -> list[PackagingSuggestionDraft]:
    if not cartons:
        return []

    settings = get_or_create_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not settings.enabled:
        return []

    oid = int(order.id)
    by_id = {str(c.id): c for c in cartons}
    out: list[PackagingSuggestionDraft] = []

    key, _label, _units = composition_from_order(db, order)
    rule = active_rule_for_composition(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, composition_key=key
    )
    if rule is not None and str(rule.carton_id) in by_id:
        c = by_id[str(rule.carton_id)]
        dims = ""
        if c.length_cm is not None and c.width_cm is not None and c.height_cm is not None:
            dims = f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm"
        img = getattr(c, "image_url", None)
        conf = min(0.95, 0.72 + min(0.2, int(rule.hit_count or 0) * 0.02))
        out.append(
            PackagingSuggestionDraft(
                order_id=oid,
                source_engine="SMART_MATCHING",
                suggested_package_id=str(c.id),
                package_name=str(c.name or "").strip() or "—",
                package_dimensions=dims,
                image_url=str(img).strip() if img else None,
                confidence_score=conf,
                fill_percentage=None,
                reason=(
                    f"Smart Matching: HISTORICAL_MATCH — reguła z historii pakowania "
                    f"({int(rule.hit_count)}× to samo zestawienie produktów)."
                ),
                sort_key=conf + 0.5,
            )
        )

    # Soft fallback: shipping-method linked cartons (never overrides historical top).
    ship_id = getattr(order, "shipping_method_id", None)
    ship_s = str(ship_id).strip() if ship_id else ""
    linked_ids: set[str] = set()
    if ship_s:
        try:
            rows = (
                db.query(carton_shipping_method_links.c.carton_id)
                .filter(carton_shipping_method_links.c.shipping_method_id == ship_s)
                .all()
            )
            linked_ids = {str(r[0]) for r in rows}
        except Exception:
            linked_ids = set()

    historical_id = str(rule.carton_id) if rule is not None else None
    for i, c in enumerate(sorted(cartons, key=lambda x: (str(x.name or "").lower()))):
        cid = str(c.id)
        if historical_id and cid == historical_id:
            continue
        dims = ""
        if c.length_cm is not None and c.width_cm is not None and c.height_cm is not None:
            dims = f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm"
        img = getattr(c, "image_url", None)
        img_s = str(img).strip() if img else None
        linked = cid in linked_ids
        conf = 0.42 + (0.28 if linked else 0.0) + (0.06 if i == 0 else 0.0)
        conf = min(0.88, conf)
        reason_parts = ["Smart Matching: kolejność operacyjna i słownik kartonów."]
        if linked:
            reason_parts.append("Karton powiązany z metodą wysyłki zamówienia.")
        else:
            reason_parts.append("Brak powiązania karton ↔ metoda — propozycja wg dostępności.")
        out.append(
            PackagingSuggestionDraft(
                order_id=oid,
                source_engine="SMART_MATCHING",
                suggested_package_id=cid,
                package_name=str(c.name or "").strip() or "—",
                package_dimensions=dims,
                image_url=img_s,
                confidence_score=conf,
                fill_percentage=None,
                reason=" ".join(reason_parts),
                sort_key=conf + (0.2 if linked else 0.0),
            )
        )

    out.sort(key=lambda x: (-x.sort_key, x.package_name.lower()))
    return out
