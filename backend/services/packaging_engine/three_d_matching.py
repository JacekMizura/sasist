"""
Strategia 3D Matching — heurystyka „najmniejszy sensowny karton” (v2).

Sumuje objętość jednostek × ilość, porównuje z objętością kartonów:
- rozważa kartony od **najmniejszych** do większych,
- odrzuca kartony z absurdalnym nadmiarem pustej objętości,
- docelowo: prawdziwy bin packing; tu minimum operacyjne.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ...models.carton import Carton
from ...models.order import Order
from .scoring import confidence_from_fill
from .suggestions import PackagingSuggestionDraft

if TYPE_CHECKING:
    from ...models.order_item import OrderItem

PACKING_SLACK = 0.92
MAX_EMPTY_VOLUME_RATIO = 22.0
MIN_FILL_ABSURD = 4.5
HUGE_FACTOR = 14.0


def _carton_volume_cm3(c: Carton) -> float:
    if c.length_cm is None or c.width_cm is None or c.height_cm is None:
        return float("inf")
    try:
        lv, wv, hv = float(c.length_cm), float(c.width_cm), float(c.height_cm)
    except (TypeError, ValueError):
        return float("inf")
    if lv <= 0 or wv <= 0 or hv <= 0:
        return float("inf")
    return lv * wv * hv


def _item_unit_volume_cm3(it: OrderItem) -> tuple[float, bool]:
    p = getattr(it, "product", None)
    if p is None:
        return 0.0, False
    L = getattr(p, "length", None)
    W = getattr(p, "width", None)
    H = getattr(p, "height", None)
    if L is None or W is None or H is None:
        return 0.0, False
    try:
        lv, wv, hv = float(L), float(W), float(H)
    except (TypeError, ValueError):
        return 0.0, False
    if lv <= 0 or wv <= 0 or hv <= 0:
        return 0.0, False
    return lv * wv * hv, True


def suggest_three_d_matching(order: Order, cartons: list[Carton]) -> list[PackagingSuggestionDraft]:
    if not cartons:
        return []

    demand_vol = 0.0
    any_dims = False
    for it in order.items or []:
        q = int(getattr(it, "quantity", 0) or 0)
        if q <= 0:
            continue
        uv, ok = _item_unit_volume_cm3(it)
        if ok:
            any_dims = True
        demand_vol += max(0.0, uv) * q

    oid = int(order.id)
    sorted_cartons = sorted(cartons, key=_carton_volume_cm3)
    drafts: list[PackagingSuggestionDraft] = []

    for c in sorted_cartons:
        cid = str(c.id)
        cv = _carton_volume_cm3(c)
        if cv <= 0 or cv == float("inf"):
            continue
        dims = f"{float(c.length_cm):g}×{float(c.width_cm):g}×{float(c.height_cm):g} cm"
        img = getattr(c, "image_url", None)
        img_s = str(img).strip() if img else None

        if not any_dims or demand_vol <= 0:
            fill_pct = None
            fits = True
            conf = 0.35
            reason = (
                "3D Matching: brak kompletnych wymiarów produktów; zweryfikuj ręcznie."
            )
            sk = conf
        else:
            ratio = demand_vol / cv if cv > 0 else 0.0
            fill_pct = min(100.0, ratio * 100.0)

            if demand_vol > cv * 1.02:
                fits = False
                conf = confidence_from_fill(min(ratio, 2.0), fits=False)
                reason = (
                    f"3D Matching: objętość towaru przekracza ten karton (~{fill_pct:.0f}% nominalnie); "
                    "wybierz większy karton."
                )
                sk = conf - 0.12
            elif cv > demand_vol * MAX_EMPTY_VOLUME_RATIO:
                continue
            elif fill_pct < MIN_FILL_ABSURD and cv > demand_vol * HUGE_FACTOR:
                continue
            else:
                fits = ratio <= PACKING_SLACK + 1e-9
                conf = confidence_from_fill(ratio, fits=fits)
                bonus_small = max(0.0, 0.18 - min(0.18, cv / max(demand_vol, 1.0) * 0.02))
                sk = conf + bonus_small + (0.05 if fits and fill_pct is not None and 18 <= fill_pct <= 90 else 0.0)
                reason = (
                    f"3D Matching: szacowane wypełnienie ~{fill_pct:.0f}% objętości kartonu "
                    f"({'OK z zapasem pakowania' if fits else 'wysokie — sprawdź pakowanie'}). "                    
                )

        drafts.append(
            PackagingSuggestionDraft(
                order_id=oid,
                source_engine="THREE_D_MATCHING",
                suggested_package_id=cid,
                package_name=str(c.name or "").strip() or "—",
                package_dimensions=dims,
                image_url=img_s,
                confidence_score=conf,
                fill_percentage=fill_pct,
                reason=reason,
                sort_key=sk,
            )
        )

    vol_by_id = {str(c.id): _carton_volume_cm3(c) for c in sorted_cartons}
    drafts.sort(
        key=lambda x: (
            -x.sort_key,
            vol_by_id.get(str(x.suggested_package_id), float("inf")),
            x.package_name.lower(),
        )
    )
    return drafts
