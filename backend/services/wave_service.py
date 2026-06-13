"""
Wave Service

- create_wave: take up to wave_size orders (FIFO or location_clustering); create wave, PickWave;
  create StockReservations and PickTasks from order items (allocate from Inventory), link via PickWaveTask.
- list_waves, get_wave: list/get waves with metrics (locations_count, estimated_distance, estimated_picking_time).
"""

import logging
import re
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.wave import Wave
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.pick_wave import PickWave, PickWaveTask
from ..models.pick_task import PickTask
from ..models.inventory import Inventory
from ..models.stock_reservation import StockReservation
from ..models.location import Location
from .inventory_allocation_service import allocate_inventory_slices_fefo_pick_path
from .inventory_lot_keys import NO_EXPIRY_SENTINEL
from .commercial_availability_service import commercially_sellable_qty
from .stock_disposition import (
    STOCK_DISPOSITION_SALEABLE,
    normalize_stock_disposition,
    resolve_order_item_required_disposition,
)

logger = logging.getLogger(__name__)

# Orders with status NEW and no wave are "ready for wave assignment"
READY_STATUS = "NEW"
DEFAULT_WAVE_SIZE = 80
DEFAULT_MAX_ORDERS_PER_WAVE = 8
WALKING_SPEED_M_PER_S = 1.4
PICK_TIME_PER_ITEM_SEC = 4.0


def _get_order_locations_sets(
    db: Session,
    order_ids: list[int],
    *,
    tenant_id: int,
    warehouse_id: int,
) -> dict[int, set[str]]:
    """Per order: pickable location keys from product_warehouse_slotting (warehouse-scoped SSOT)."""
    from .product_warehouse_slotting_service import get_wave_cluster_order_location_sets

    return get_wave_cluster_order_location_sets(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_ids=order_ids,
    )


def _rack_str_to_num(rack_str: str) -> int:
    """Convert rack string (e.g. A1, B) to numeric for ordering."""
    if not rack_str:
        return 0
    s = str(rack_str).strip().upper()
    first = s[0] if s else ""
    rest = s[1:].strip() or "0"
    return (ord(first) - ord("A")) * 100 + (int(rest) if rest.isdigit() else 0)


def _location_label_to_coords(location: str | dict) -> tuple[int, int, int] | None:
    """Parse location to (rack_num, level, position). Accepts string label or dict with level/position/rack_name."""
    if isinstance(location, dict):
        if "level" in location and "position" in location:
            try:
                level = int(location.get("level", 0))
                pos = int(location.get("position", 0))
                rack_str = (
                    location.get("rack_name")
                    or location.get("rack_id")
                    or location.get("rack")
                    or ""
                )
                rack_num = _rack_str_to_num(str(rack_str))
                return (rack_num, level, pos)
            except (TypeError, ValueError):
                pass
        label = location.get("loc_name") or location.get("location_name") or location.get("name") or ""
        if not label:
            return None
        location = str(label)
    if not location or not isinstance(location, str):
        return None
    s = str(location).strip()
    parts = re.split(r"[-_\s]+", s)
    if len(parts) >= 3:
        try:
            rack_str = parts[0].upper()
            level = int(parts[1])
            pos = int(parts[2])
            rack_num = _rack_str_to_num(rack_str)
            return (rack_num, level, pos)
        except (ValueError, IndexError):
            pass
    if len(parts) == 2:
        try:
            rack_str = parts[0].upper()
            level = int(parts[1])
            rack_num = _rack_str_to_num(rack_str)
            return (rack_num, level, 0)
        except (ValueError, IndexError):
            pass
    return None


def _distance_between(coords_a: tuple[int, int, int] | None, coords_b: tuple[int, int, int] | None) -> float:
    """Distance = abs(rack_diff)*10 + abs(level_diff)*3 + abs(position_diff)."""
    if coords_a is None or coords_b is None:
        return 0.0
    ra, la, pa = coords_a
    rb, lb, pb = coords_b
    return abs(ra - rb) * 10 + abs(la - lb) * 3 + abs(pa - pb)


# Used when location has no pick_sequence set (unsequenced locations come last on path).
EFFECTIVE_SEQ_UNSEQUENCED = 999999


def _effective_pick_sequence(pick_sequence: int | None) -> int:
    """Return effective sequence for ordering; unsequenced locations sort after all sequenced."""
    return pick_sequence if pick_sequence is not None else EFFECTIVE_SEQ_UNSEQUENCED


def _build_wave_order_ids_clustering(
    order_ids: list[int],
    order_locations: dict[int, set[str]],
    max_orders_per_wave: int,
) -> list[int]:
    """
    Build wave by similarity: seed = first order; repeatedly add order with highest
    similarity (shared locations) to current wave set until wave full.
    """
    if not order_ids or max_orders_per_wave <= 0:
        return []
    wave_ids: list[int] = [order_ids[0]]
    wave_locs = set(order_locations.get(order_ids[0], set()))
    remaining = [o for o in order_ids[1:] if o != order_ids[0]]
    while len(wave_ids) < max_orders_per_wave and remaining:
        best_id = None
        best_score = -1
        for oid in remaining:
            locs = order_locations.get(oid, set())
            score = len(wave_locs & locs)
            if score > best_score:
                best_score = score
                best_id = oid
        if best_id is None:
            break
        wave_ids.append(best_id)
        wave_locs |= order_locations.get(best_id, set())
        remaining = [o for o in remaining if o != best_id]
    return wave_ids


def compute_wave_metrics(
    db: Session,
    wave_id: int,
) -> dict:
    """
    For a wave's PickWave: get all PickTasks (via PickWaveTask), collect location_ids,
    resolve to labels, sort by warehouse layout order, compute path distance and picking time.
    Returns locations_count, estimated_distance, estimated_picking_time.
    """
    pick_wave = db.query(PickWave).filter(PickWave.wave_id == wave_id).first()
    if not pick_wave:
        return {"locations_count": 0, "estimated_distance": 0.0, "estimated_picking_time": 0.0}
    tasks = (
        db.query(PickTask)
        .join(PickWaveTask, PickWaveTask.pick_task_id == PickTask.id)
        .filter(PickWaveTask.wave_id == pick_wave.id)
        .all()
    )
    if not tasks:
        return {"locations_count": 0, "estimated_distance": 0.0, "estimated_picking_time": 0.0}
    location_ids = list({t.location_id for t in tasks})
    locations = {loc.id: loc for loc in db.query(Location).filter(Location.id.in_(location_ids)).all()}
    labels_with_coords: list[tuple[tuple[int, int, int], str]] = []
    for loc_id in location_ids:
        loc = locations.get(loc_id)
        name = (loc.name or "").strip() if loc else ""
        if name:
            coords = _location_label_to_coords(name)
            if coords:
                labels_with_coords.append((coords, name))
    labels_with_coords.sort(key=lambda x: x[0])
    path_labels = [name for _, name in labels_with_coords]
    locations_count = len(path_labels)
    total_distance = 0.0
    for i in range(len(path_labels) - 1):
        c1 = _location_label_to_coords(path_labels[i])
        c2 = _location_label_to_coords(path_labels[i + 1])
        total_distance += _distance_between(c1, c2)
    picking_time_sec = (total_distance / WALKING_SPEED_M_PER_S) + (len(tasks) * PICK_TIME_PER_ITEM_SEC)
    return {
        "locations_count": locations_count,
        "estimated_distance": round(total_distance, 2),
        "estimated_picking_time": round(picking_time_sec, 2),
    }


def create_wave(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    wave_size: int = DEFAULT_WAVE_SIZE,
    algorithm: str = "fifo",
    max_orders_per_wave: int | None = None,
) -> Wave:
    """
    Create a new wave. algorithm: "fifo" = first wave_size orders by id; "location_clustering" =
    group orders by location similarity (shared locations), wave size limited by max_orders_per_wave.
    """
    if algorithm == "location_clustering":
        max_n = max_orders_per_wave or DEFAULT_MAX_ORDERS_PER_WAVE
        orders_ready_q = (
            db.query(Order)
            .filter(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.status == READY_STATUS,
                Order.wave_id == None,
            )
            .order_by(Order.id)
        )
        orders_all = orders_ready_q.all()
        if not orders_all:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="No orders ready for wave assignment")
        order_ids = [o.id for o in orders_all]
        order_locations = _get_order_locations_sets(
            db, order_ids, tenant_id=tenant_id, warehouse_id=warehouse_id
        )
        wave_order_ids = _build_wave_order_ids_clustering(order_ids, order_locations, max_n)
        orders_ready = [o for o in orders_all if o.id in wave_order_ids]
        orders_ready.sort(key=lambda x: wave_order_ids.index(x.id))
    else:
        orders_ready = (
            db.query(Order)
            .filter(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.status == READY_STATUS,
                Order.wave_id == None,
            )
            .order_by(Order.id)
            .limit(wave_size)
            .all()
        )
    if not orders_ready:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No orders ready for wave assignment")

    wave = Wave(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status="created",
        orders_count=len(orders_ready),
    )
    db.add(wave)
    db.flush()

    pick_wave = PickWave(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        wave_id=wave.id,
        status="created",
    )
    db.add(pick_wave)
    db.flush()

    for order in orders_ready:
        order.wave_id = wave.id

    from .order_fulfillment_lifecycle_service import on_wave_created_for_orders

    on_wave_created_for_orders(orders_ready)

    # Create stock reservations and pick tasks from order items (allocate from Inventory)
    order_ids = [o.id for o in orders_ready]
    order_items = (
        db.query(OrderItem)
        .filter(
            OrderItem.order_id.in_(order_ids),
            OrderItem.is_bundle_parent.is_(False),
        )
        .all()
    )
    # Virtual picker position along the warehouse pick path (pick_sequence). Advances as we assign picks.
    current_pick_sequence = 0
    commercial_remaining: dict[int, float] = {}
    for oi in order_items:
        need = float(oi.quantity)
        if need <= 0:
            continue
        req_disp = resolve_order_item_required_disposition(oi)
        sd_norm = normalize_stock_disposition(req_disp)
        if sd_norm == STOCK_DISPOSITION_SALEABLE:
            pid = int(oi.product_id)
            if pid not in commercial_remaining:
                commercial_remaining[pid] = commercially_sellable_qty(
                    db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_id=pid
                )
            if commercial_remaining[pid] + 1e-9 < need:
                logger.warning(
                    "Commercial sales block: order_item order_id=%s product_id=%s qty=%s avail=%s",
                    oi.order_id,
                    oi.product_id,
                    need,
                    commercial_remaining[pid],
                )
                continue
        slices, next_sequence = allocate_inventory_slices_fefo_pick_path(
            db,
            tenant_id,
            oi.product_id,
            warehouse_id,
            need,
            current_pick_sequence,
            stock_disposition=req_disp,
        )
        if not slices or sum(s[1] for s in slices) + 1e-9 < need:
            logger.warning(
                "No stock for order_item order_id=%s product_id=%s qty=%s",
                oi.order_id, oi.product_id, need,
            )
            continue
        current_pick_sequence = next_sequence
        for chosen, slice_qty in slices:
            bn = getattr(chosen, "batch_number", "") or ""
            ed = getattr(chosen, "expiry_date", None) or NO_EXPIRY_SENTINEL
            res = StockReservation(
                tenant_id=tenant_id,
                order_id=oi.order_id,
                product_id=oi.product_id,
                location_id=chosen.location_id,
                quantity=float(slice_qty),
                status="reserved",
                batch_number=bn,
                expiry_date=ed,
                stock_disposition=req_disp,
            )
            db.add(res)
            db.flush()
            task = PickTask(
                tenant_id=tenant_id,
                order_id=oi.order_id,
                product_id=oi.product_id,
                location_id=chosen.location_id,
                warehouse_id=int(warehouse_id),
                quantity=float(slice_qty),
                status="waiting",
                batch_number=bn,
                expiry_date=ed,
                stock_disposition=req_disp,
            )
            db.add(task)
            db.flush()
            db.add(PickWaveTask(wave_id=pick_wave.id, pick_task_id=task.id))
            if sd_norm == STOCK_DISPOSITION_SALEABLE:
                commercial_remaining[int(oi.product_id)] = max(
                    0.0, commercial_remaining.get(int(oi.product_id), 0.0) - float(slice_qty)
                )

    db.commit()
    db.refresh(wave)
    logger.info("Created wave %s with %s orders", wave.id, wave.orders_count)
    return wave


def list_waves(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
) -> list:
    """
    List waves for tenant/warehouse. For each wave compute carts_count (distinct cart_id from orders).
    """
    waves = (
        db.query(Wave)
        .filter(
            Wave.tenant_id == tenant_id,
            Wave.warehouse_id == warehouse_id,
        )
        .order_by(Wave.id.desc())
        .all()
    )
    result = []
    for w in waves:
        carts_count = (
            db.query(func.count(func.distinct(Order.cart_id)))
            .filter(Order.wave_id == w.id, Order.cart_id != None)
            .scalar()
        ) or 0
        metrics = compute_wave_metrics(db, w.id)
        result.append({
            "id": w.id,
            "created_at": w.created_at,
            "status": w.status,
            "orders_count": w.orders_count,
            "carts_count": carts_count,
            "locations_count": metrics["locations_count"],
            "estimated_distance": metrics["estimated_distance"],
            "estimated_picking_time": metrics["estimated_picking_time"],
        })
    return result


def get_wave(
    db: Session,
    wave_id: int,
    tenant_id: int,
    warehouse_id: int,
) -> Wave | None:
    return (
        db.query(Wave)
        .filter(
            Wave.id == wave_id,
            Wave.tenant_id == tenant_id,
            Wave.warehouse_id == warehouse_id,
        )
        .first()
    )
