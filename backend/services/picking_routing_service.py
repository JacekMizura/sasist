"""
PickingRoutingService — trasa zbiórki „Po lokalizacjach”.

- Alokacja ze stanów Inventory + Location (pick-eligible).
- Kolejność lokalizacji na liście: Authored Warehouse Routing Graph
  (`warehouse_routing.runtime_graph_reader`) — bez heurystyk geometrycznych / etykiet.
- Nie tworzy PickTask w DB, nie zmienia stocku ani MM.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from ..schemas.picking_routing import (
    PickingRoutingAllocationShortfall,
    PickingRoutingResult,
    PickListBasketBreakdown,
    PickListRow,
)
from .wms_picking_atp import pickable_available_by_location


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
        product_ids: Optional[Sequence[int]] = None,
    ) -> PickingRoutingResult:
        """
        Buduje ``pick_list`` pogrupowane po (lokalizacja, produkt), z rozbiciem na koszyki.

        Alokacja ilości z magazynu: agregacja stanów po lokalizacji (preferencja typu pick),
        zasilanie greedy. Kolejność ``pick_list`` = Runtime Graph Reader (authored graph).

        ``product_ids`` — opcjonalny filtr (np. product detail): pomija inne SKU w alokacji.
        """
        uniq: list[int] = []
        for oid in order_ids:
            i = int(oid)
            if i not in uniq:
                uniq.append(i)

        product_filter: set[int] | None = None
        if product_ids is not None:
            product_filter = {int(x) for x in product_ids if int(x) > 0}
            if not product_filter:
                return PickingRoutingResult()

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

        # Cohort-local claims so earlier orders in this batch reduce ATP for later ones.
        cohort_claimed: dict[tuple[int, int, int], float] = defaultdict(float)

        seen_orders = {int(o.id) for o in orders}
        warnings: list[str] = []
        for oid in uniq:
            if oid not in seen_orders:
                warnings.append(f"order_id={oid}: nie znaleziono lub niezgodny tenant_id")

        tid = int(tenant_id) if tenant_id is not None else (
            int(orders[0].tenant_id) if orders else 0
        )

        blocked: set[int] = set()

        for order in orders:
            wid = int(order.warehouse_id)
            basket_id = order.basket_id  # None w trybie BULK
            oid = int(order.id)
            order_tid = tid if tid > 0 else int(order.tenant_id)
            for oi in order.items or []:
                if order_item_is_replaced_line(oi):
                    continue
                if order_item_skip_bundle_commercial_header_for_ops(oi):
                    continue
                pid = int(oi.product_id)
                if product_filter is not None and pid not in product_filter:
                    continue
                need = float(oi.quantity)
                if need <= 0:
                    continue
                loc_qtys = pickable_available_by_location(
                    self.db,
                    tenant_id=order_tid,
                    warehouse_id=wid,
                    product_id=pid,
                    exclude_order_id=oid,
                )
                if order_tid > 0 and loc_qtys:
                    try:
                        from ..services.inventory_count.inventory_movement_guard_service import (
                            locked_location_ids_for_picking,
                        )

                        loc_ids = {int(lid) for lid, _, _ in loc_qtys}
                        blocked |= locked_location_ids_for_picking(
                            self.db, tenant_id=order_tid, location_ids=loc_ids
                        )
                    except Exception:
                        # Tests / partial schemas — inventory locks are optional hardening.
                        pass
                if blocked:
                    loc_qtys = [(lid, q, n) for lid, q, n in loc_qtys if int(lid) not in blocked]
                # Apply cohort claims from earlier orders in this routing batch.
                adjusted: list[tuple[int, float, str]] = []
                for lid, qty, name in loc_qtys:
                    claimed = float(cohort_claimed.get((wid, pid, int(lid)), 0.0))
                    avail = max(0.0, float(qty) - claimed)
                    if avail > 1e-9:
                        adjusted.append((int(lid), avail, name))
                if not adjusted:
                    shortfalls.append(
                        PickingRoutingAllocationShortfall(
                            order_id=oid,
                            product_id=pid,
                            requested=need,
                            allocated=0.0,
                        )
                    )
                    continue
                remain = need
                allocated_here = 0.0
                # Mutable working list
                working = {lid: (qty, name) for lid, qty, name in adjusted}
                while remain > 1e-9:
                    fresh = [(lid, q, n) for lid, (q, n) in working.items() if q > 1e-9]
                    if not fresh:
                        break
                    fresh.sort(key=lambda t: t[0])
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
                    prev_q, prev_n = working[loc_id]
                    working[loc_id] = (prev_q - take, prev_n)
                    cohort_claimed[(wid, pid, int(loc_id))] = (
                        float(cohort_claimed.get((wid, pid, int(loc_id)), 0.0)) + take
                    )
                if remain > 1e-6:
                    shortfalls.append(
                        PickingRoutingAllocationShortfall(
                            order_id=oid,
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

        # Etap 3: kolejność trasy z Authored Routing Graph (Runtime Graph Reader).
        warehouse_ids = {int(o.warehouse_id) for o in orders}
        if len(warehouse_ids) == 1:
            from .warehouse_routing.runtime_graph_reader import visit_index_map

            wid = next(iter(warehouse_ids))
            loc_ids = [r.location_id for r in pick_rows]
            idx = visit_index_map(self.db, wid, loc_ids)
            pick_rows.sort(
                key=lambda r: (idx.get(int(r.location_id), 10**9), int(r.location_id), int(r.product_id))
            )
        else:
            pick_rows.sort(key=lambda r: (int(r.location_id), int(r.product_id)))

        return PickingRoutingResult(pick_list=pick_rows, shortfalls=shortfalls, warnings=warnings)
