"""Resolve undocumented WMS pick settlements for documentary WZ creation."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from ...models.pick import Pick
from ...models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from .constants import (
    FULFILLMENT_KIND_CART,
    FULFILLMENT_KIND_CARTLESS,
    FULFILLMENT_KIND_RECOVERY,
    build_fulfillment_key,
)

logger = logging.getLogger(__name__)

FULFILLMENT_MODE_PREFIX = "fulfillment:"


@dataclass(frozen=True)
class UndocumentedWmsSettlement:
    """One physical pick settlement that has no documentary WZ yet."""

    fulfillment_key: str
    fulfillment_kind: str
    fulfillment_session_id: str
    pick_ids: list[int]
    warehouse_id: int


def fulfillment_mode_value(fulfillment_key: str) -> str:
    return f"{FULFILLMENT_MODE_PREFIX}{str(fulfillment_key).strip()}"


def parse_fulfillment_key_from_mode(wms_mode: str | None) -> str | None:
    raw = str(wms_mode or "").strip()
    if not raw.startswith(FULFILLMENT_MODE_PREFIX):
        return None
    key = raw[len(FULFILLMENT_MODE_PREFIX) :].strip()
    return key or None


def stamp_fulfillment_key_on_pick_movements(
    db: Session,
    *,
    tenant_id: int,
    pick_ids: list[int],
    fulfillment_key: str,
) -> int:
    """
    Label PICKING product-history rows with an explicit fulfillment key.

    Does NOT create a document — enables later documentary WZ resolution without
    timestamp heuristics.
    """
    ids = sorted({int(x) for x in pick_ids if int(x) > 0})
    if not ids:
        return 0
    mode = fulfillment_mode_value(fulfillment_key)
    rows = (
        db.query(WmsProductWarehouseOperation)
        .filter(
            WmsProductWarehouseOperation.tenant_id == int(tenant_id),
            WmsProductWarehouseOperation.pick_id.in_(ids),
            WmsProductWarehouseOperation.movement_type == "PICKING",
        )
        .all()
    )
    updated = 0
    for row in rows:
        cur = str(getattr(row, "wms_mode", None) or "").strip()
        if cur.startswith(FULFILLMENT_MODE_PREFIX) and cur != mode:
            # Already stamped for another settlement — keep original.
            continue
        if cur != mode:
            row.wms_mode = mode
            updated += 1
    if updated:
        db.flush()
    return updated


def _split_fulfillment_key(key: str) -> tuple[str, str] | None:
    parts = str(key or "").split(":", 1)
    if len(parts) != 2:
        return None
    kind, session_id = parts[0].strip().lower(), parts[1].strip()
    if not kind or not session_id:
        return None
    if kind not in (FULFILLMENT_KIND_CART, FULFILLMENT_KIND_CARTLESS, FULFILLMENT_KIND_RECOVERY):
        return None
    return kind, session_id


def _legacy_key_for_pick(pick: Pick) -> str | None:
    """Fallback when movements were not stamped (pre-fix picks)."""
    cart_id = getattr(pick, "cart_id", None)
    if cart_id is not None and int(cart_id) > 0:
        return build_fulfillment_key(kind=FULFILLMENT_KIND_CART, session_id=int(cart_id))
    # Cartless: group by order + calendar day of picked_at (stable enough for legacy only).
    picked_at = getattr(pick, "picked_at", None)
    day = picked_at.date().isoformat() if picked_at is not None else "unknown"
    return build_fulfillment_key(
        kind=FULFILLMENT_KIND_CARTLESS,
        session_id=f"order-{int(pick.order_id)}-{day}",
    )


def list_undocumented_wms_settlements(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> list[UndocumentedWmsSettlement]:
    """
    Settlements with done picks whose PICKING movements are not linked to a WZ.

    Groups by stamped fulfillment key (preferred) or legacy cart_id / cartless day.
    Ordered by min(pick_id) ascending — earliest undocumented first.
    """
    picks = (
        db.query(Pick)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.order_id == int(order_id),
            Pick.status == "done",
            Pick.quantity > 0,
        )
        .all()
    )
    if warehouse_id:
        picks = [
            p
            for p in picks
            if int(getattr(p, "warehouse_id", 0) or warehouse_id) == int(warehouse_id)
        ]
    if not picks:
        return []

    pick_ids = [int(p.id) for p in picks]
    ops = (
        db.query(WmsProductWarehouseOperation)
        .filter(
            WmsProductWarehouseOperation.tenant_id == int(tenant_id),
            WmsProductWarehouseOperation.pick_id.in_(pick_ids),
            WmsProductWarehouseOperation.movement_type == "PICKING",
        )
        .all()
    )
    ops_by_pick: dict[int, list[WmsProductWarehouseOperation]] = {}
    for op in ops:
        pid = int(op.pick_id) if op.pick_id else 0
        if pid:
            ops_by_pick.setdefault(pid, []).append(op)

    buckets: dict[str, list[int]] = {}
    for pick in picks:
        pid = int(pick.id)
        related = ops_by_pick.get(pid, [])
        # Documented if any PICKING op already has stock_document_id.
        if any(getattr(op, "stock_document_id", None) for op in related):
            continue
        # Prefer stamped fulfillment key from movements.
        key: str | None = None
        for op in related:
            key = parse_fulfillment_key_from_mode(getattr(op, "wms_mode", None))
            if key:
                break
        if key is None:
            key = _legacy_key_for_pick(pick)
        if not key:
            continue
        buckets.setdefault(key, []).append(pid)

    out: list[UndocumentedWmsSettlement] = []
    for key, ids in buckets.items():
        split = _split_fulfillment_key(key)
        if split is None:
            continue
        kind, session_id = split
        ids_sorted = sorted(set(ids))
        out.append(
            UndocumentedWmsSettlement(
                fulfillment_key=key,
                fulfillment_kind=kind,
                fulfillment_session_id=session_id,
                pick_ids=ids_sorted,
                warehouse_id=int(warehouse_id),
            )
        )
    out.sort(key=lambda s: (min(s.pick_ids) if s.pick_ids else 0, s.fulfillment_key))
    return out


def next_undocumented_wms_settlement(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> UndocumentedWmsSettlement | None:
    rows = list_undocumented_wms_settlements(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
    )
    return rows[0] if rows else None
