"""Commit WMS collection picks to inventory at confirm time (not at finish-collecting).

Multi-location flow:
- each confirm appends a pick_event for one location + qty
- collected_qty = sum(pick_events)
- picked_slices = flat inventory slices for RW (no double-consume on finish)
- discrepancy = max(0, min(remaining, system_qty) - confirmed_qty)
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.location import Location
from ..order_item_pick_allocation_service import PickLotSlice, SENTINEL_EXPIRY
from ..stock_disposition import STOCK_DISPOSITION_SALEABLE, normalize_stock_disposition
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


def parse_pick_events(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    return [e for e in raw if isinstance(e, dict)]


def picked_slices_total_qty(slices: list[dict[str, Any]]) -> float:
    return sum(float(s.get("quantity") or 0) for s in slices)


def pick_events_total_qty(events: list[dict[str, Any]]) -> float:
    return sum(float(e.get("quantity") or 0) for e in events)


def location_system_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
) -> float:
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.location_id == int(location_id),
            Inventory.stock_disposition == normalize_stock_disposition(STOCK_DISPOSITION_SALEABLE),
            Inventory.quantity > 0,
        )
        .all()
    )
    return round(sum(float(r.quantity or 0) for r in rows), 4)


def _location_code(db: Session, location_id: int) -> str:
    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    return str(getattr(loc, "name", None) or getattr(loc, "code", None) or location_id)


def sync_collected_from_events(task: dict[str, Any]) -> None:
    events = parse_pick_events(task.get("pick_events"))
    if events:
        slices: list[dict[str, Any]] = []
        for ev in events:
            slices.extend(parse_picked_slices(ev.get("picked_slices")))
        if not slices:
            slices = parse_picked_slices(task.get("picked_slices"))
        task["pick_events"] = events
        task["picked_slices"] = slices
        task["collected_qty"] = round(pick_events_total_qty(events), 4)
        return
    slices = parse_picked_slices(task.get("picked_slices"))
    if slices:
        task["picked_slices"] = slices
        task["collected_qty"] = round(picked_slices_total_qty(slices), 4)
        return
    # Legacy / ERP JSON without committed slices — keep collected_qty as stored.


def _suggest_next_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    remaining: float,
    exclude_location_ids: set[int],
    preferred_location_ids: list[int] | None = None,
) -> tuple[int | None, str]:
    """Pick next location with on-hand qty (lightweight — no ATP / soft-hold graph)."""
    if remaining <= 1e-9:
        return None, ""
    rows = (
        db.query(Inventory, Location)
        .join(Location, Location.id == Inventory.location_id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.stock_disposition == normalize_stock_disposition(STOCK_DISPOSITION_SALEABLE),
            Inventory.quantity > 0,
        )
        .order_by(Inventory.quantity.desc(), Inventory.id.asc())
        .all()
    )
    preferred = set(int(x) for x in (preferred_location_ids or []) if int(x) > 0)
    # Preferred first, then others
    ordered = sorted(
        rows,
        key=lambda pair: (
            0 if int(pair[0].location_id) in preferred else 1,
            -float(pair[0].quantity or 0),
            int(pair[0].id or 0),
        ),
    )
    for inv, loc in ordered:
        loc_id = int(inv.location_id)
        if loc_id in exclude_location_ids:
            continue
        if float(inv.quantity or 0) > 1e-9:
            return loc_id, str(getattr(loc, "name", None) or getattr(loc, "code", None) or loc_id)
    return None, ""


def append_collection_location_pick(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    task: dict[str, Any],
    pick_qty: float,
    location_id: int | None,
    batch_number: str | None = None,
    lot: str | None = None,
    serial_number: str | None = None,
    exclude_production_order_id: int | None = None,
) -> dict[str, Any]:
    """Append one location pick. Mutates ``task``. Returns shortage/next hints."""
    product_id = int(task.get("component_product_id") or 0)
    if product_id <= 0:
        raise ValueError("Brak product_id komponentu w zadaniu zbierania.")

    required = float(task.get("required_qty") or 0)
    sync_collected_from_events(task)
    collected = float(task.get("collected_qty") or 0)
    remaining = round(required - collected, 4)
    if remaining <= 1e-9:
        raise ValueError("Komponent jest już w pełni pobrany.")

    loc_id = int(location_id) if location_id is not None and int(location_id) > 0 else 0
    if loc_id <= 0:
        raise ValueError("Wybierz lokalizację pobrania komponentu.")

    qty = round(float(pick_qty or 0), 4)
    if qty <= 1e-9:
        raise ValueError("Ilość pobrania musi być większa od zera.")
    if qty > remaining + 1e-6:
        raise ValueError(
            f"Nie można pobrać więcej niż pozostało: wymagane {qty}, pozostało {remaining}."
        )

    system_qty = location_system_qty(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        location_id=loc_id,
    )
    if qty > system_qty + 1e-6:
        raise ValueError(
            f"Brak stanu w lokalizacji dla produktu #{product_id}: wymagane {qty}, dostępne {system_qty}."
        )

    suggested = round(min(remaining, system_qty), 4)
    discrepancy = round(max(0.0, suggested - qty), 4)

    bn = batch_number if batch_number is not None else task.get("selected_batch_number")
    lt = lot if lot is not None else task.get("selected_lot")
    sn = serial_number if serial_number is not None else task.get("selected_serial_number")
    exclude_mo = int(exclude_production_order_id) if exclude_production_order_id else None

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
        exclude_production_order_id=exclude_mo,
    )
    loc_code = _location_code(db, loc_id)
    event_slices = [
        serialize_picked_slice(sl, product_id=product_id, location_id=loc_id) for sl in slices
    ]
    discrepancy_slices: list[dict[str, Any]] = []
    if discrepancy > 1e-9:
        # Physical short vs system suggested pick — write down ghost stock so it is not
        # offered again as available on this location.
        try:
            adj = consume_production_material_slices(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=product_id,
                location_id=loc_id,
                quantity=discrepancy,
                exclude_production_order_id=exclude_mo,
            )
            discrepancy_slices = [
                serialize_picked_slice(sl, product_id=product_id, location_id=loc_id) for sl in adj
            ]
        except ValueError:
            # Concurrent stock change — keep discrepancy flag without forcing adj.
            discrepancy_slices = []
    event = {
        "event_id": str(uuid4()),
        "location_id": loc_id,
        "location_code": loc_code,
        "quantity": qty,
        "system_available_qty": system_qty,
        "suggested_qty": suggested,
        "discrepancy": discrepancy,
        "discrepancy_slices": discrepancy_slices,
        "picked_at": datetime.utcnow().isoformat() + "Z",
        "picked_slices": event_slices,
        "batch_number": str(bn).strip() if bn else None,
        "lot": str(lt).strip() if lt else None,
        "serial_number": str(sn).strip() if sn else None,
    }
    events = parse_pick_events(task.get("pick_events"))
    events.append(event)
    task["pick_events"] = events
    sync_collected_from_events(task)

    if batch_number is not None:
        task["selected_batch_number"] = str(batch_number).strip()
    if lot is not None:
        task["selected_lot"] = str(lot).strip()
    if serial_number is not None:
        task["selected_serial_number"] = str(serial_number).strip()

    task["selected_location_id"] = loc_id
    task["location_id"] = loc_id
    task["location_code"] = loc_code
    task.pop("pending_shortage", None)

    new_collected = float(task.get("collected_qty") or 0)
    new_remaining = round(required - new_collected, 4)
    hint: dict[str, Any] = {
        "remaining_qty": max(0.0, new_remaining),
        "discrepancy": discrepancy,
        "last_location_id": loc_id,
        "last_location_code": loc_code,
    }

    if new_remaining <= 1e-9:
        task["next_location_id"] = None
        hint["complete"] = True
        return hint

    next_id, next_code = _suggest_next_location(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        remaining=new_remaining,
        exclude_location_ids=set(),  # allow revisit if stock left; prefer others via options order
        preferred_location_ids=None,
    )
    # Prefer a location different from the one just picked when possible
    if next_id == loc_id:
        alt_id, alt_code = _suggest_next_location(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            remaining=new_remaining,
            exclude_location_ids={loc_id},
            preferred_location_ids=None,
        )
        if alt_id:
            next_id, next_code = alt_id, alt_code

    if next_id:
        task["selected_location_id"] = next_id
        task["location_id"] = next_id
        task["location_code"] = next_code
        task["next_location_id"] = next_id
        hint["next_location_id"] = next_id
        hint["next_location_code"] = next_code
        hint["complete"] = False
        return hint

    # No other location can cover remaining → blocking shortage decision
    shortage = {
        "missing_qty": new_remaining,
        "required_qty": required,
        "collected_qty": new_collected,
        "product_id": product_id,
        "product_name": str(task.get("product_name") or f"Produkt #{product_id}"),
        "location_id": loc_id,
        "location_code": loc_code,
        "discrepancy": discrepancy,
    }
    task["pending_shortage"] = shortage
    task["next_location_id"] = None
    hint["pending_shortage"] = shortage
    hint["complete"] = False
    return hint


def report_collection_shortage(task: dict[str, Any]) -> None:
    """Operator confirms production shortage for remaining qty on this component."""
    required = float(task.get("required_qty") or 0)
    sync_collected_from_events(task)
    collected = float(task.get("collected_qty") or 0)
    missing = round(max(0.0, required - collected), 4)
    pending = task.get("pending_shortage") if isinstance(task.get("pending_shortage"), dict) else {}
    task["shortage_reported"] = True
    task["shortage"] = {
        "missing_qty": float(pending.get("missing_qty") or missing),
        "required_qty": required,
        "collected_qty": collected,
        "product_id": int(task.get("component_product_id") or 0),
        "product_name": str(task.get("product_name") or ""),
        "location_id": pending.get("location_id"),
        "location_code": pending.get("location_code"),
        "discrepancy": float(pending.get("discrepancy") or 0),
        "reported_at": datetime.utcnow().isoformat() + "Z",
    }
    task.pop("pending_shortage", None)


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


# Back-compat name used by production_batch_service
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
    exclude_production_order_id: int | None = None,
) -> dict[str, Any]:
    """Alias: ``collected_qty`` means qty for this location pick (append), not total."""
    return append_collection_location_pick(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        task=task,
        pick_qty=collected_qty,
        location_id=location_id,
        batch_number=batch_number,
        lot=lot,
        serial_number=serial_number,
        exclude_production_order_id=exclude_production_order_id,
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
        sync_collected_from_events(t)
        slices = parse_picked_slices(t.get("picked_slices"))
        if not slices:
            continue
        by_pid.setdefault(pid, []).extend(slices)
    return by_pid


def task_is_collection_complete(task: dict[str, Any] | Any) -> bool:
    """Full pick OR shortage reported (operator closed incomplete component)."""
    required = float(getattr(task, "required_qty", None) or (task.get("required_qty") if isinstance(task, dict) else 0) or 0)
    collected = float(getattr(task, "collected_qty", None) or (task.get("collected_qty") if isinstance(task, dict) else 0) or 0)
    if collected >= required - 1e-6:
        return True
    if isinstance(task, dict):
        return bool(task.get("shortage_reported"))
    return bool(getattr(task, "shortage_reported", False))
