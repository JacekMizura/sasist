"""
Strategia Smart Matching — uczenie zachowań (v1: heurystyki operacyjne).

Docelowo: agregaty wyborów operatorów per (produkty × metoda wysyłki).
Teraz: priorytet kartonów powiązanych z metodą wysyłki zamówienia, potem nazwa.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.carton import Carton, carton_shipping_method_links
from ...models.order import Order
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

    ship_id = getattr(order, "shipping_method_id", None)
    ship_s = str(ship_id).strip() if ship_id else ""

    linked_ids: set[str] = set()
    if ship_s and db is not None:
        rows = (
            db.query(carton_shipping_method_links.c.carton_id)
            .filter(carton_shipping_method_links.c.shipping_method_id == ship_s)
            .all()
        )
        linked_ids = {str(r[0]) for r in rows}

    oid = int(order.id)
    out: list[PackagingSuggestionDraft] = []
    for i, c in enumerate(sorted(cartons, key=lambda x: (str(x.name or "").lower()))):
        cid = str(c.id)
        dims = ""
        if c.length_cm is not None and c.width_cm is not None and c.height_cm is not None:
            dims = f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm"
        img = getattr(c, "image_url", None)
        img_s = str(img).strip() if img else None

        linked = cid in linked_ids
        # Baza pewności + bonus za dopasowanie do przewoźnika / metody.
        conf = 0.42 + (0.28 if linked else 0.0) + (0.06 if i == 0 else 0.0)
        conf = min(0.92, conf)
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
