"""Commit WMS collection picks to inventory at confirm time (not at finish-collecting).

After the operator confirms a component pick, qty + location are an operational fact:
inventory is decremented immediately and slices are stored on the collection task.
finish-collecting posts RW from those slices and must not consume again.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ..order_item_pick_allocation_service import PickLotSlice, SENTINEL_EXPIRY
from ..stock_disposition import STOCK_DISPOSITION_SALEABLE
from .material_consume_service import consume_production_material_slices


def serialize_picked_slice(
    sl: PickLotSlice,
    *,
    product_id: int,
    location_id: int,
) -> dict[str, Any]:
    exp = sl.expiry_date if isinstance(sl.expiry_date, date) else SENTINEL_EXPIRY
    return {
        "quantity": float(sl.quantity),
        "batch_number": str(sl.batch_number or ""),
        "expiry_date": exp.isoformat(),
        "inventory_id": int(sl.inventory_id) if sl.inventory_id is not None else None,
        "warehouse_carrier_id": (
            int(sl.warehouse_carrier_id) if sl.warehouse_carrier_id is not None else None
        ),
        "product_id": int(product_id),
        "location_id": int(location_id),
    }


def parse_picked_slices(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        qty = float(item.get("quantity") or 0)
        if qty <= 1e-12:
            continue
        out.append(item)
    return out


def picked_slices_total_qty(slices: list[dict[str, Any]]) -> float:
    return sum(float(s.get("quantity") or 0) for s in slices)


def restore_picked_slices(db: Session, slices: list[dict[str, Any]]) -> None:
    """Return previously committed pick qty to inventory (edit / clear pick)."""
    for s in slices:
        qty = float(s.get("quantity") or 0)
        if qty <= 1e-12:
            continue
        inv_id = s.get("inventory_id")
        if inv_id is not None and int(inv_id) > 0:
            inv = (
                db.query(Inventory)
                .filter(Inventory.id == int(inv_id))
                .with_for_update()
                .first()
            )
            if inv is not None:
                inv.quantity = float(inv.quantity or 0) + qty
                continue
        # Fallback when inventory row was merged/deleted: re-add by keys
        pid = int(s.get("product_id") or 0)
        loc_id = int(s.get("location_id") or 0)
        if pid <= 0 or loc_id <= 0:
            continue
        batch = str(s.get("batch_number") or "")
        exp_raw = s.get("expiry_date")
        try:
            exp = date.fromisoformat(str(exp_raw)) if exp_raw else SENTINEL_EXPIRY
        except ValueError:
            exp = SENTINEL_EXPIRY
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.product_id == pid,
                Inventory.location_id == loc_id,
                Inventory.batch_number == batch,
                Inventory.expiry_date == exp,
                Inventory.stock_disposition == STOCK_DISPOSITION_SALEABLE,
            )
            .with_for_update()
            .first()
        )
        if inv is not None:
            inv.quantity = float(inv.quantity or 0) + qty
        # If no row exists, skip — better than inventing tenant/warehouse without context


def commit_collection_task_pick(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    task: dict[str, Any],
    collected_qty: float,
    location_id: int | None,
    batch_number: str | None = None,
    lot: str | None = None,
    serial_number: str | None = None,
) -> None:
    """Restore any prior pick for this task, then consume the new confirmed qty.

    Mutates ``task`` in place (collected_qty, location fields, picked_slices).
    Raises ValueError when location stock is insufficient (caller maps to business error).
    On failure after releasing a prior pick, attempts to re-commit the previous slices.
    """
    product_id = int(task.get("component_product_id") or 0)
    if product_id <= 0:
        raise ValueError("Brak product_id komponentu w zadaniu zbierania.")

    old_slices = parse_picked_slices(task.get("picked_slices"))
    qty = round(float(collected_qty or 0), 4)
    loc_id = int(location_id) if location_id is not None and int(location_id) > 0 else 0
    if loc_id <= 0:
        loc_id = int(task.get("selected_location_id") or task.get("location_id") or 0)

    if old_slices:
        restore_picked_slices(db, old_slices)
        task["picked_slices"] = []

    if batch_number is not None:
        task["selected_batch_number"] = str(batch_number).strip()
    if lot is not None:
        task["selected_lot"] = str(lot).strip()
    if serial_number is not None:
        task["selected_serial_number"] = str(serial_number).strip()

    if qty <= 1e-9:
        task["collected_qty"] = 0.0
        task["picked_slices"] = []
        return

    if loc_id <= 0:
        # Put previous pick back if we released it
        if old_slices:
            _recommit_slices(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                product_id=product_id,
                slices=old_slices,
            )
            task["picked_slices"] = old_slices
            task["collected_qty"] = round(picked_slices_total_qty(old_slices), 4)
        raise ValueError("Wybierz lokalizację pobrania komponentu.")

    bn = task.get("selected_batch_number") or batch_number
    lt = task.get("selected_lot") or lot
    sn = task.get("selected_serial_number") or serial_number

    try:
        slices = consume_production_material_slices(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=product_id,
            location_id=loc_id,
            quantity=qty,
            batch_number=str(bn).strip() if bn else None,
            lot=str(lt).strip() if lt else None,
            serial_number=str(sn).strip() if sn else None,
        )
    except Exception:
        if old_slices:
            try:
                _recommit_slices(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    product_id=product_id,
                    slices=old_slices,
                )
                task["picked_slices"] = old_slices
                task["collected_qty"] = round(picked_slices_total_qty(old_slices), 4)
                prev_loc = int(old_slices[0].get("location_id") or 0)
                if prev_loc > 0:
                    task["selected_location_id"] = prev_loc
                    task["location_id"] = prev_loc
            except Exception:
                task["picked_slices"] = []
                task["collected_qty"] = 0.0
        raise

    task["collected_qty"] = qty
    task["selected_location_id"] = loc_id
    task["location_id"] = loc_id
    task["picked_slices"] = [
        serialize_picked_slice(sl, product_id=product_id, location_id=loc_id) for sl in slices
    ]


def _recommit_slices(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    slices: list[dict[str, Any]],
) -> None:
    """Best-effort re-consume previously held slices after a failed replace."""
    by_loc: dict[int, float] = {}
    for s in slices:
        loc = int(s.get("location_id") or 0)
        if loc <= 0:
            continue
        by_loc[loc] = by_loc.get(loc, 0.0) + float(s.get("quantity") or 0)
    for loc_id, qty in by_loc.items():
        consume_production_material_slices(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
            location_id=int(loc_id),
            quantity=float(qty),
        )


def collection_tasks_have_committed_picks(tasks: list[dict[str, Any]]) -> bool:
    """True when every collected task has picked_slices covering collected_qty."""
    for t in tasks:
        qty = float(t.get("collected_qty") or 0)
        if qty <= 1e-9:
            continue
        slices = parse_picked_slices(t.get("picked_slices"))
        if abs(picked_slices_total_qty(slices) - qty) > 1e-2:
            return False
        if not slices:
            return False
    return True


def slices_from_committed_tasks(tasks: list[dict[str, Any]]) -> dict[int, list[dict[str, Any]]]:
    """component_product_id -> list of slice dicts (already consumed from inventory)."""
    by_pid: dict[int, list[dict[str, Any]]] = {}
    for t in tasks:
        pid = int(t.get("component_product_id") or 0)
        if pid <= 0:
            continue
        slices = parse_picked_slices(t.get("picked_slices"))
        if not slices:
            continue
        by_pid.setdefault(pid, []).extend(slices)
    return by_pid
