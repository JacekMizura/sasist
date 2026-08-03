"""DemandPolicy — open PZ pressure, unlockable demand, item volume."""

from __future__ import annotations

from ..context import PriorityContext
from ..contribution import PriorityContribution


class DemandPolicy:
    name = "DemandPolicy"

    def evaluate(self, ctx: PriorityContext) -> list[PriorityContribution]:
        open_pz = min(40.0, float(max(0, ctx.open_pz_count)) * 8.0)
        unlockable = min(60.0, float(max(0, ctx.unlockable_order_count)) * 12.0)
        item_volume = min(10.0, float(max(0, ctx.item_count)) * 0.5)
        return [
            PriorityContribution(
                score=open_pz,
                reason=f"Otwarte PZ do rozlokowania: {ctx.open_pz_count}",
                weight=8.0,
                source="open_pz",
            ),
            PriorityContribution(
                score=unlockable,
                reason=f"Zamówienia Recovery możliwe do odblokowania: {ctx.unlockable_order_count}",
                weight=12.0,
                source="unlockable_orders",
            ),
            PriorityContribution(
                score=item_volume,
                reason=f"Liczba pozycji dostawy: {ctx.item_count}",
                weight=0.5,
                source="item_volume",
            ),
        ]
