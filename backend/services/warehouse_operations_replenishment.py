"""Actionable replenishment projections for Centrum operacyjne → Uzupełnienia.

Separates:
  ACTIONABLE_REPLENISHMENT — physical source stock exists → operator CTA
  NO_SOURCE_STOCK — need/shortage without moveable buffer → alerts / braki only

SSOT for source allocation + capacity: ``wms_replenishment_service``.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.order_issue_task import OrderIssueTask
from ..models.product import Product
from ..models.wms_operational_task import ACTIVE_STATUSES, WmsOperationalTask
from ..schemas.warehouse_operations import WarehouseReplenishmentAlertOut
from .wms_replenishment_service import _iter_replenishment_line_tuples

_EPS = 1e-9


def _minutes_between(start: datetime | None, end: datetime) -> int:
    if start is None:
        return 0
    return max(0, int((end - start).total_seconds() // 60))


def _qty_label(n: float) -> str:
    if abs(n - int(n)) < _EPS:
        return str(int(n))
    return f"{n:.2f}".rstrip("0").rstrip(".")


def blocked_orders_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> tuple[dict[int, set[int]], dict[int, datetime]]:
    blocked: dict[int, set[int]] = defaultdict(set)
    first_at: dict[int, datetime] = {}
    tasks = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.status == "OPEN",
        )
        .limit(2000)
        .all()
    )
    for task in tasks:
        try:
            missing = json.loads(task.missing_items or "[]")
        except (json.JSONDecodeError, TypeError, ValueError):
            missing = []
        if not isinstance(missing, list):
            continue
        for item in missing:
            if not isinstance(item, dict):
                continue
            try:
                pid = int(item.get("product_id"))
            except (TypeError, ValueError):
                continue
            blocked[pid].add(int(task.order_id))
            ts = getattr(task, "updated_at", None) or getattr(task, "created_at", None)
            if ts is not None and (pid not in first_at or ts < first_at[pid]):
                first_at[pid] = ts
    return blocked, first_at


def count_distinct_blocked_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> int:
    blocked, _ = blocked_orders_by_product(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    orders: set[int] = set()
    for s in blocked.values():
        orders.update(s)
    return len(orders)


def _active_relocation_product_ids(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> set[int]:
    return {
        int(pid)
        for (pid,) in db.query(WmsOperationalTask.product_id)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.status.in_(ACTIVE_STATUSES),
            WmsOperationalTask.task_type == "RELOCATION",
            WmsOperationalTask.product_id.isnot(None),
        )
        .distinct()
        .all()
    }


def build_replenishment_alerts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    now: datetime,
) -> list[WarehouseReplenishmentAlertOut]:
    """
    Operator queue: ACTIONABLE (+ IN_PROGRESS) only.

    NO_SOURCE_STOCK is intentionally omitted here — surfaced via
    ``iter_no_source_shortage_products`` → Alerty / Braki.
    """
    blocked_map, first_shortage_at = blocked_orders_by_product(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id
    )
    active_relocations = _active_relocation_product_ids(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id
    )
    line_tuples = _iter_replenishment_line_tuples(db, tenant_id, warehouse_id)

    out: list[WarehouseReplenishmentAlertOut] = []
    covered: set[int] = set()

    for line, _score, _req, _band in line_tuples:
        pid = int(line.product_id)
        covered.add(pid)
        source_avail = sum(float(s.moveable_quantity or 0) for s in (line.buffer_sources or []))
        move_qty = float(line.suggested_qty or 0)
        need = float(line.missing_qty or 0)
        unresolved = max(0.0, need - move_qty)
        blocked = len(blocked_map.get(pid, set()))
        in_progress = pid in active_relocations
        classification = "IN_PROGRESS" if in_progress else "ACTIONABLE"
        priority = "blue" if in_progress else ("red" if blocked > 0 else "orange")
        src = (line.buffer_location_name or "").strip() or None
        tgt = (line.pick_location_name or "").strip() or None
        instruction = None
        if src and tgt and move_qty > _EPS:
            instruction = f"Przenieś {_qty_label(move_qty)} szt. {src} → {tgt}"
        elif move_qty > _EPS:
            instruction = f"Przenieś {_qty_label(move_qty)} szt."

        out.append(
            WarehouseReplenishmentAlertOut(
                id=f"repl-{pid}-{int(line.pick_location_id)}",
                product_id=pid,
                product_name=str(line.product_name or f"Produkt #{pid}"),
                sku=(str(line.product_sku).strip() if line.product_sku else None),
                ean=(str(line.product_ean).strip() if line.product_ean else None),
                image_url=(str(line.product_image_url).strip() if line.product_image_url else None),
                source_location=src,
                target_location=tgt,
                missing_quantity=round(need, 6),
                move_quantity=round(move_qty, 6),
                unresolved_shortage_qty=round(unresolved, 6),
                current_picking_stock=round(float(line.pick_stock or 0), 6),
                reserve_stock=round(source_avail, 6),
                source_available_qty=round(source_avail, 6),
                blocked_orders=blocked,
                classification=classification,  # type: ignore[arg-type]
                priority=priority,  # type: ignore[arg-type]
                priority_label=(
                    "Przesunięcie w toku"
                    if priority == "blue"
                    else ("Blokuje zamówienia" if priority == "red" else "Niski stan pick-face")
                ),
                minutes_since_detected=_minutes_between(first_shortage_at.get(pid), now),
                zone=None,
                category=None,
                action_label="Utwórz przesunięcie" if move_qty > _EPS else "Brak stocku źródłowego",
                instruction_label=instruction,
            )
        )

    # Active relocation without a fresh actionable line (e.g. mid-move)
    orphan_ids = active_relocations - covered
    if orphan_ids:
        products = {
            int(p.id): p
            for p in db.query(Product)
            .filter(Product.tenant_id == int(tenant_id), Product.id.in_(list(orphan_ids)))
            .all()
        }
        for pid in orphan_ids:
            product = products.get(pid)
            if product is None:
                continue
            blocked = len(blocked_map.get(pid, set()))
            out.append(
                WarehouseReplenishmentAlertOut(
                    id=f"repl-active-{pid}",
                    product_id=pid,
                    product_name=str(product.name or f"Produkt #{pid}"),
                    sku=(str(product.sku).strip() if product.sku else None),
                    ean=(str(product.ean).strip() if product.ean else None),
                    image_url=(str(product.image_url).strip() if product.image_url else None),
                    source_location=None,
                    target_location=None,
                    missing_quantity=0,
                    move_quantity=0,
                    unresolved_shortage_qty=0,
                    current_picking_stock=0,
                    reserve_stock=0,
                    source_available_qty=0,
                    blocked_orders=blocked,
                    classification="IN_PROGRESS",
                    priority="blue",
                    priority_label="Przesunięcie w toku",
                    minutes_since_detected=_minutes_between(first_shortage_at.get(pid), now),
                    action_label="W toku",
                    instruction_label="Przesunięcie uzupełniające jest już w toku.",
                )
            )

    return sorted(
        out,
        key=lambda r: ({"red": 0, "orange": 1, "blue": 2}[r.priority], -r.blocked_orders, -r.move_quantity),
    )[:40]


def iter_no_source_shortage_products(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    now: datetime,
) -> list[dict[str, Any]]:
    """
    Products with replenishment need and/or open shortage, but zero moveable BUFFER stock.
    For Alerty / Braki — not the operator Uzupełnienia queue.
    """
    from .wms_replenishment_service import _agg_pick_buffer, _buffers_effective, _iter_replenishment_line_tuples

    blocked_map, first_shortage_at = blocked_orders_by_product(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id
    )
    pick_qty, buffer_locs, loc_by_id = _agg_pick_buffer(db, tenant_id, warehouse_id)

    # Products that appear only via shortages (no pick inventory row)
    candidate_pids: set[int] = set(blocked_map.keys())
    candidate_pids.update(int(pid) for pid, _lid in pick_qty.keys())

    # Also products with min_pick configured and empty pick face
    products = {
        int(p.id): p
        for p in db.query(Product)
        .filter(Product.tenant_id == int(tenant_id), Product.id.in_(list(candidate_pids) or [-1]))
        .all()
    } if candidate_pids else {}

    actionable_pids = {int(line.product_id) for line, *_ in _iter_replenishment_line_tuples(db, tenant_id, warehouse_id)}

    out: list[dict[str, Any]] = []
    for pid, product in products.items():
        if pid in actionable_pids:
            continue
        mn = getattr(product, "min_pick_quantity", None)
        min_level = float(mn) if mn is not None and float(mn) > _EPS else 0.0
        pick_stock = sum(float(q) for (p, _l), q in pick_qty.items() if int(p) == pid)
        need = max(0.0, min_level - pick_stock) if min_level > _EPS else 0.0
        blocked = len(blocked_map.get(pid, set()))
        if need <= _EPS and blocked <= 0:
            continue
        eff = _buffers_effective(product, buffer_locs.get(pid) or [])
        source_avail = sum(float(mv) for _lid, _g, mv in eff)
        if source_avail > _EPS:
            continue  # has source — should be actionable (or capacity-blocked to 0)
        # Capacity-blocked with source: treat as no actionable move for operator queue
        # already excluded if suggested was 0
        pick_name = None
        for (p, lid), q in pick_qty.items():
            if int(p) == pid:
                loc = loc_by_id.get(int(lid))
                pick_name = (loc.name if loc else None) or f"#{lid}"
                break
        if pick_name is None:
            # Assigned pick location without stock
            assigned = getattr(product, "assigned_locations", None)
            # leave None
        out.append(
            {
                "product_id": pid,
                "product_name": str(product.name or f"Produkt #{pid}"),
                "sku": (str(product.sku).strip() if product.sku else None),
                "pick_stock": round(pick_stock, 6),
                "source_available_qty": 0.0,
                "need_qty": round(need, 6),
                "blocked_orders": blocked,
                "target_location": pick_name,
                "minutes_since_detected": _minutes_between(first_shortage_at.get(pid), now),
            }
        )
    out.sort(key=lambda r: (-int(r["blocked_orders"]), -float(r["need_qty"])))
    return out[:40]
