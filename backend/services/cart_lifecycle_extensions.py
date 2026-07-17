"""
Aktywna kompletacja (Active Picking) + Event Log + timeouty.

Odczyt/enrich — wolny.
Zapis current_task_json (snapshot Active Picking) i Event Log —
wyłącznie przez CartLifecycleService.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.cart import Cart
from ..models.cart_lifecycle_event import CartLifecycleEvent
from ..models.cart_lifecycle_history import CartLifecycleHistory
from ..models.enums import CartStatus
from ..models.pick import Pick

logger = logging.getLogger(__name__)

# Snapshot Active Picking — wartości wewnętrzne (nie uniwersalna encja Task)
ACTIVE_NONE = "NONE"
ACTIVE_CLAIMED = "CLAIMED"
ACTIVE_PICKING = "PICKING"
ACTIVE_READY_FOR_PACKING = "READY_FOR_PACKING"
ACTIVE_PACKING = "PACKING"

# Aliasy legacy (testy / stary kod)
TASK_NONE = ACTIVE_NONE
TASK_CLAIMED = ACTIVE_CLAIMED
TASK_PICKING = ACTIVE_PICKING
TASK_READY_FOR_PACKING = ACTIVE_READY_FOR_PACKING
TASK_PACKING = ACTIVE_PACKING


def assigned_timeout_minutes() -> int:
    raw = os.getenv("CART_ASSIGNED_TIMEOUT_MINUTES", "30")
    try:
        return max(1, int(raw))
    except ValueError:
        return 30


def picking_idle_no_picks_minutes() -> int:
    """Idle PICKING bez żadnego potwierdzonego picka → auto-release."""
    raw = os.getenv("CART_PICKING_IDLE_NO_PICKS_MINUTES", "15")
    try:
        return max(1, int(raw))
    except ValueError:
        return 15


@dataclass
class CartActivePicking:
    """Snapshot aktywnej kompletacji (nie encja Task)."""

    phase: str
    session_id: int | None = None
    batch_id: int | None = None
    operator_id: int | None = None
    started_at: str | None = None
    progress: float = 0.0
    total_orders: int = 0
    total_products: int = 0
    confirmed_products: int = 0
    remaining_products: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "phase": self.phase,
            "session_id": self.session_id,
            "batch_id": self.batch_id,
            "operator_id": self.operator_id,
            "started_at": self.started_at,
            "progress": self.progress,
            "total_orders": self.total_orders,
            "total_products": self.total_products,
            "confirmed_products": self.confirmed_products,
            "remaining_products": self.remaining_products,
            # Kompatybilność ze starym current_task
            "task_type": self.phase,
            "task_id": self.session_id,
            "picked_count": self.confirmed_products,
            "remaining_count": self.remaining_products,
        }


# Legacy alias
CartCurrentTask = CartActivePicking


def _dump(data: dict[str, Any] | None) -> str | None:
    if not data:
        return None
    try:
        return json.dumps(data, ensure_ascii=False)
    except Exception:
        return None


def _load(raw: str | None) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def parse_active_picking(cart: Cart) -> CartActivePicking | None:
    raw = getattr(cart, "current_task_json", None)
    data = _load(raw if isinstance(raw, str) else None)
    if not data:
        return None
    phase = str(
        data.get("phase") or data.get("task_type") or ACTIVE_NONE
    ).strip().upper() or ACTIVE_NONE
    if phase == ACTIVE_NONE:
        return None
    return CartActivePicking(
        phase=phase,
        session_id=int(data["session_id"])
        if data.get("session_id") is not None
        else (int(data["task_id"]) if data.get("task_id") is not None else None),
        batch_id=int(data["batch_id"]) if data.get("batch_id") is not None else None,
        operator_id=int(data["operator_id"]) if data.get("operator_id") is not None else None,
        started_at=str(data["started_at"]) if data.get("started_at") else None,
        progress=float(data.get("progress") or 0),
        total_orders=int(data.get("total_orders") or 0),
        total_products=int(data.get("total_products") or 0),
        confirmed_products=int(
            data.get("confirmed_products")
            if data.get("confirmed_products") is not None
            else data.get("picked_count")
            or 0
        ),
        remaining_products=int(
            data.get("remaining_products")
            if data.get("remaining_products") is not None
            else data.get("remaining_count")
            or 0
        ),
    )


parse_current_task = parse_active_picking


def write_active_picking(cart: Cart, snapshot: CartActivePicking | None) -> None:
    """Jedyny writer pola carts.current_task_json (woła CartLifecycleService)."""
    if snapshot is None or snapshot.phase == ACTIVE_NONE:
        cart.current_task_json = None
    else:
        cart.current_task_json = _dump(snapshot.to_dict())


write_current_task = write_active_picking


def build_active_picking_for_status(
    *,
    status: CartStatus,
    operator_id: int | None,
    session_id: int | None = None,
    batch_id: int | None = None,
    started_at: datetime | None = None,
    progress: float = 0.0,
    total_orders: int = 0,
    total_products: int = 0,
    confirmed_products: int = 0,
    remaining_products: int = 0,
) -> CartActivePicking | None:
    mapping = {
        CartStatus.AVAILABLE: None,
        CartStatus.ASSIGNED: ACTIVE_CLAIMED,
        CartStatus.PICKING: ACTIVE_PICKING,
        CartStatus.READY_FOR_PACKING: ACTIVE_READY_FOR_PACKING,
        CartStatus.PACKING: ACTIVE_PACKING,
    }
    phase = mapping.get(status)
    if phase is None:
        return None
    started = started_at or datetime.utcnow()
    return CartActivePicking(
        phase=phase,
        session_id=session_id,
        batch_id=batch_id,
        operator_id=operator_id,
        started_at=started.isoformat(sep=" ", timespec="seconds"),
        progress=float(progress),
        total_orders=int(total_orders),
        total_products=int(total_products),
        confirmed_products=int(confirmed_products),
        remaining_products=int(remaining_products),
    )


def build_task_for_status(
    *,
    status: CartStatus,
    operator_id: int | None,
    task_id: int | None = None,
    batch_id: int | None = None,
    started_at: datetime | None = None,
    progress: float = 0.0,
    total_orders: int = 0,
    total_products: int = 0,
    picked_count: int = 0,
    remaining_count: int = 0,
) -> CartActivePicking | None:
    return build_active_picking_for_status(
        status=status,
        operator_id=operator_id,
        session_id=task_id,
        batch_id=batch_id,
        started_at=started_at,
        progress=progress,
        total_orders=total_orders,
        total_products=total_products,
        confirmed_products=picked_count,
        remaining_products=remaining_count,
    )


def count_confirmed_picks_on_cart(db: Session, cart_id: int) -> int:
    """
    Potwierdzony pick = rekord Pick dla wózka (roboczy lub sfinalizowany).
    Jedyny warunek auto-release: count == 0.
    """
    return int(
        db.query(func.count(Pick.id))
        .filter(Pick.cart_id == int(cart_id))
        .scalar()
        or 0
    )


def compute_pick_progress(db: Session, cart: Cart) -> tuple[int, int, float]:
    """
    (picked_count, remaining_count, progress_pct) na poziomie produktów (SKU).
    picked = SKU z co najmniej jednym Pick na wózku; remaining = total_products - picked.
    """
    try:
        from .cart_stats_service import compute_cart_stats, query_orders_on_cart
        from ..models.order_item import OrderItem

        stats = compute_cart_stats(db, cart)
        total_products = int(stats.get("products_count") or 0)
        cid = int(cart.id)
        picked_pids = {
            int(r[0])
            for r in db.query(Pick.product_id)
            .filter(Pick.cart_id == cid, Pick.product_id.isnot(None))
            .distinct()
            .all()
            if r[0] is not None
        }
        # Ogranicz do produktów z zamówień na wózku
        on_cart_pids: set[int] = set()
        for o in query_orders_on_cart(db, cart).all():
            for it in getattr(o, "items", None) or []:
                if getattr(it, "product_id", None) is not None:
                    on_cart_pids.add(int(it.product_id))
        if on_cart_pids:
            picked_pids &= on_cart_pids
            total_products = max(total_products, len(on_cart_pids))
        picked = len(picked_pids)
        remaining = max(0, total_products - picked)
        progress = round((picked / total_products) * 100.0, 2) if total_products > 0 else 0.0
        return picked, remaining, progress
    except Exception:
        logger.exception("compute_pick_progress failed cart_id=%s", getattr(cart, "id", None))
        return 0, 0, 0.0


def enrich_active_picking_with_stats(
    db: Session, cart: Cart, snapshot: CartActivePicking
) -> CartActivePicking:
    """Uzupełnij totals + confirmed/remaining (odczyt) — bez zapisu."""
    try:
        from .cart_stats_service import compute_cart_stats

        stats = compute_cart_stats(db, cart)
        snapshot.total_orders = int(stats.get("orders_count") or 0)
        snapshot.total_products = int(stats.get("products_count") or 0)
        picked, remaining, progress = compute_pick_progress(db, cart)
        snapshot.confirmed_products = picked
        snapshot.remaining_products = remaining
        if snapshot.phase in (ACTIVE_PICKING, ACTIVE_READY_FOR_PACKING):
            snapshot.progress = progress if snapshot.phase == ACTIVE_PICKING else 100.0
    except Exception:
        logger.exception(
            "enrich_active_picking_with_stats failed cart_id=%s", getattr(cart, "id", None)
        )
    return snapshot


enrich_current_task_with_stats = enrich_active_picking_with_stats


def get_active_picking(db: Session, cart: Cart, *, enrich: bool = True) -> dict[str, Any] | None:
    snapshot = parse_active_picking(cart)
    if snapshot is None:
        return None
    if enrich:
        snapshot = enrich_active_picking_with_stats(db, cart, snapshot)
    return snapshot.to_dict()


get_current_task = get_active_picking


def append_lifecycle_event(
    db: Session,
    *,
    cart: Cart,
    event_code: str,
    operator_user_id: int | None = None,
    session_id: int | None = None,
    batch_id: int | None = None,
    order_id: int | None = None,
    description: str | None = None,
    severity: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> CartLifecycleEvent:
    """
    Zapis Event Log — wywoływać wyłącznie z CartLifecycleService.

    Logika / filtry: wyłącznie ``event_code`` (+ severity z katalogu).
    ``description`` — tylko UI (PL); nigdy nie używać w warunkach biznesowych.
    """
    from .cart_lifecycle_event_catalog import description_pl, severity_for

    code = str(event_code or "").strip()[:64]
    row = CartLifecycleEvent(
        tenant_id=int(cart.tenant_id),
        warehouse_id=int(cart.warehouse_id),
        cart_id=int(cart.id),
        event_code=code,
        description=description_pl(code, override=description),
        severity=severity_for(code, override=severity),
        operator_user_id=int(operator_user_id) if operator_user_id and int(operator_user_id) > 0 else None,
        occurred_at=datetime.utcnow(),
        session_id=int(session_id) if session_id is not None else None,
        batch_id=int(batch_id) if batch_id is not None else None,
        order_id=int(order_id) if order_id is not None else None,
        metadata_json=_dump(metadata),
    )
    db.add(row)
    db.flush()
    logger.info(
        "cart_lifecycle.event cart_id=%s code=%s severity=%s",
        int(cart.id),
        code,
        row.severity,
    )
    return row


def list_lifecycle_events(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    limit: int = 100,
) -> list[CartLifecycleEvent]:
    q = db.query(CartLifecycleEvent).filter(CartLifecycleEvent.cart_id == int(cart_id))
    if tenant_id is not None:
        q = q.filter(CartLifecycleEvent.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(CartLifecycleEvent.warehouse_id == int(warehouse_id))
    return (
        q.order_by(CartLifecycleEvent.id.desc())
        .limit(max(1, min(int(limit), 500)))
        .all()
    )


def append_lifecycle_history(
    db: Session,
    *,
    cart: Cart,
    from_status: str | None,
    to_status: str,
    operator_user_id: int | None,
    reason: str,
    task_type: str | None = None,
    task_id: int | None = None,
    batch_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> CartLifecycleHistory:
    row = CartLifecycleHistory(
        tenant_id=int(cart.tenant_id),
        warehouse_id=int(cart.warehouse_id),
        cart_id=int(cart.id),
        from_status=(str(from_status).strip().upper() if from_status else None),
        to_status=str(to_status).strip().upper(),
        operator_user_id=int(operator_user_id) if operator_user_id and int(operator_user_id) > 0 else None,
        changed_at=datetime.utcnow(),
        reason=str(reason or "transition")[:64],
        task_type=(str(task_type).strip().upper()[:32] if task_type else None),
        task_id=int(task_id) if task_id is not None else None,
        batch_id=int(batch_id) if batch_id is not None else None,
        metadata_json=_dump(metadata),
    )
    db.add(row)
    db.flush()
    logger.info(
        "cart_lifecycle.history cart_id=%s %s→%s reason=%s task=%s/%s",
        int(cart.id),
        from_status,
        to_status,
        reason,
        task_type,
        task_id,
    )
    return row


def list_lifecycle_history(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    limit: int = 100,
) -> list[CartLifecycleHistory]:
    q = db.query(CartLifecycleHistory).filter(CartLifecycleHistory.cart_id == int(cart_id))
    if tenant_id is not None:
        q = q.filter(CartLifecycleHistory.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(CartLifecycleHistory.warehouse_id == int(warehouse_id))
    return q.order_by(CartLifecycleHistory.id.desc()).limit(max(1, min(int(limit), 500))).all()
