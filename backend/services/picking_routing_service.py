"""
PickingRoutingService — trasa zbiórki „Po lokalizacjach”.

- Tylko logika odczytu: zamówienia, pozycje, stany ``Inventory`` + ``Location``.
- Nie tworzy PickTask w DB, nie zmienia stocku ani MM.

Używaj wyłącznie gdy strategia zbierania = po lokalizacjach (wywołanie po stronie klienta / fali).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..schemas.picking_routing import (
    PickingRoutingAllocationShortfall,
    PickingRoutingResult,
    PickListBasketBreakdown,
    PickListRow,
)


@dataclass
class _AtomicPickLine:
    location_id: int
    location_code: str
    product_id: int
    quantity: float
    basket_id: Optional[int]


@dataclass
class _GroupAcc:
    location_code: str
    total_quantity: float = 0.0
    baskets: dict[Optional[int], float] = field(default_factory=lambda: defaultdict(float))


class PickingRoutingService:
    def __init__(self, db: Session):
        self.db = db

    def build_location_pick_list(
        self,
        order_ids: Sequence[int],
        *,
        tenant_id: Optional[int] = None,
    ) -> PickingRoutingResult:
        """
        Buduje ``pick_list`` pogrupowane po (lokalizacja, produkt), z rozbiciem na koszyki.

        Alokacja ilości z magazynu: agregacja stanów po lokalizacji, sortowanie lokalizacji po ``name``,
        zasilanie „greedy” do pokrycia ilości z linii zamówienia.
        """
        uniq: list[int] = []
        for oid in order_ids:
            i = int(oid)
            if i not in uniq:
                uniq.append(i)

        if not uniq:
            return PickingRoutingResult()

        q = (
            self.db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id.in_(uniq))
        )
        if tenant_id is not None:
            q = q.filter(Order.tenant_id == int(tenant_id))
        orders: list[Order] = q.all()

        atomic: list[_AtomicPickLine] = []
        shortfalls: list[PickingRoutingAllocationShortfall] = []

        # Preload inventory aggregates: (warehouse_id, product_id) -> [(location_id, qty, name)]
        wh_product_pairs: set[tuple[int, int]] = set()
        for o in orders:
            for oi in o.items or []:
                wh_product_pairs.add((int(o.warehouse_id), int(oi.product_id)))

        inv_by_wh_product = self._load_inventory_by_warehouse_product(wh_product_pairs)
        if tenant_id is not None:
            from ..services.inventory_count.inventory_movement_guard_service import locked_location_ids_for_picking

            loc_ids: set[int] = set()
            for lst in inv_by_wh_product.values():
                for lid, _, _ in lst:
                    loc_ids.add(int(lid))
            blocked = locked_location_ids_for_picking(
                self.db,
                tenant_id=int(tenant_id),
                location_ids=loc_ids,
            )
            if blocked:
                for key, lst in list(inv_by_wh_product.items()):
                    inv_by_wh_product[key] = [
                        (lid, q, name) for lid, q, name in lst if int(lid) not in blocked
                    ]

        seen_orders = {int(o.id) for o in orders}
        warnings: list[str] = []
        for oid in uniq:
            if oid not in seen_orders:
                warnings.append(f"order_id={oid}: nie znaleziono lub niezgodny tenant_id")

        for order in orders:
            wid = int(order.warehouse_id)
            basket_id = order.basket_id  # None w trybie BULK
            for oi in order.items or []:
                if order_item_is_replaced_line(oi):
                    continue
                pid = int(oi.product_id)
                need = float(oi.quantity)
                if need <= 0:
                    continue
                loc_qtys = list(inv_by_wh_product.get((wid, pid), []))
                if not loc_qtys:
                    shortfalls.append(
                        PickingRoutingAllocationShortfall(
                            order_id=int(order.id),
                            product_id=pid,
                            requested=need,
                            allocated=0.0,
                        )
                    )
                    continue
                remain = need
                allocated_here = 0.0
                while remain > 1e-9:
                    fresh = [
                        row
                        for row in inv_by_wh_product.get((wid, pid), [])
                        if row[1] > 1e-9
                    ]
                    if not fresh:
                        break
                    loc_id, avail, loc_name = fresh[0]
                    take = min(remain, avail)
                    if take <= 1e-9:
                        break
                    atomic.append(
                        _AtomicPickLine(
                            location_id=loc_id,
                            location_code=loc_name,
                            product_id=pid,
                            quantity=take,
                            basket_id=basket_id,
                        )
                    )
                    remain -= take
                    allocated_here += take
                    self._decrement_cached(inv_by_wh_product, wid, pid, loc_id, take)
                if remain > 1e-6:
                    shortfalls.append(
                        PickingRoutingAllocationShortfall(
                            order_id=int(order.id),
                            product_id=pid,
                            requested=need,
                            allocated=allocated_here,
                        )
                    )

        groups: dict[tuple[int, int], _GroupAcc] = {}
        for line in atomic:
            key = (line.location_id, line.product_id)
            if key not in groups:
                groups[key] = _GroupAcc(location_code=line.location_code)
            g = groups[key]
            g.total_quantity += line.quantity
            g.baskets[line.basket_id] += line.quantity

        pick_rows: list[PickListRow] = []
        for (loc_id, pid), acc in groups.items():
            baskets_out = [
                PickListBasketBreakdown(basket_id=bid, quantity=round(qty, 6))
                for bid, qty in sorted(acc.baskets.items(), key=lambda x: (x[0] is None, x[0] or 0))
                if qty > 1e-9
            ]
            pick_rows.append(
                PickListRow(
                    location_id=loc_id,
                    location_code=acc.location_code,
                    product_id=pid,
                    total_quantity=round(acc.total_quantity, 6),
                    baskets=baskets_out,
                )
            )

        pick_rows.sort(key=lambda r: (r.location_code or "", r.product_id))

        return PickingRoutingResult(pick_list=pick_rows, shortfalls=shortfalls, warnings=warnings)

    def _load_inventory_by_warehouse_product(
        self,
        pairs: set[tuple[int, int]],
    ) -> dict[tuple[int, int], list[tuple[int, float, str]]]:
        """
        Zwraca mapę (warehouse_id, product_id) -> lista (location_id, sum_quantity, location.name)
        posortowana: ``pick`` przed innymi typami, potem ``name``, potem ``id``.
        """
        out: dict[tuple[int, int], list[tuple[int, float, str]]] = {}
        if not pairs:
            return out

        wid_list = list({p[0] for p in pairs})
        pid_list = list({p[1] for p in pairs})

        subq = (
            self.db.query(
                Inventory.warehouse_id.label("wh_id"),
                Inventory.product_id.label("pr_id"),
                Inventory.location_id.label("loc_id"),
                func.sum(Inventory.quantity).label("qty_sum"),
            )
            .filter(
                Inventory.warehouse_id.in_(wid_list),
                Inventory.product_id.in_(pid_list),
            )
            .group_by(Inventory.warehouse_id, Inventory.product_id, Inventory.location_id)
            .having(func.sum(Inventory.quantity) > 0)
            .subquery()
        )

        rows = (
            self.db.query(
                subq.c.wh_id,
                subq.c.pr_id,
                subq.c.loc_id,
                subq.c.qty_sum,
                Location.name,
                Location.type,
            )
            .join(Location, Location.id == subq.c.loc_id)
            .filter(Location.is_active.is_(True))
            .all()
        )

        raw: dict[tuple[int, int], list[tuple[int, float, str, str]]] = defaultdict(list)
        for wh_id, pr_id, loc_id, qty_sum, loc_name, loc_type in rows:
            pair = (int(wh_id), int(pr_id))
            if pair not in pairs:
                continue
            lt = str(loc_type or "")
            raw[pair].append((int(loc_id), float(qty_sum or 0), str(loc_name or ""), lt))

        for pair, lst in raw.items():
            lst.sort(key=lambda t: (0 if t[3] == "pick" else 1, t[2], t[0]))
            out[pair] = [(a, b, c) for a, b, c, _ in lst]

        for pair in pairs:
            if pair not in out:
                out[pair] = []
        return out

    @staticmethod
    def _decrement_cached(
        cache: dict[tuple[int, int], list[tuple[int, float, str]]],
        warehouse_id: int,
        product_id: int,
        location_id: int,
        amount: float,
    ) -> None:
        lst = cache.get((warehouse_id, product_id))
        if not lst:
            return
        new_list: list[tuple[int, float, str]] = []
        for lid, qty, name in lst:
            if lid == location_id:
                q = round(qty - amount, 6)
                if q > 1e-9:
                    new_list.append((lid, q, name))
                amount = 0.0
            else:
                new_list.append((lid, qty, name))
        cache[(warehouse_id, product_id)] = new_list
