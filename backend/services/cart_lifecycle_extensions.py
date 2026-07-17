"""
Rozszerzenia Current Task (liczniki zbierania) + konfiguracja timeoutów.

Odczyt/enrich — wolny. Zapis current_task_json wyłącznie przez CartLifecycleService.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.cart import Cart
from ..models.cart_lifecycle_history import CartLifecycleHistory
from ..models.enums import CartStatus
from ..models.pick import Pick

logger = logging.getLogger(__name__)

TASK_NONE = "NONE"
TASK_CLAIMED = "CLAIMED"
TASK_PICKING = "PICKING"
TASK_READY_FOR_PACKING = "READY_FOR_PACKING"
TASK_PACKING = "PACKING"


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
class CartCurrentTask:
    task_type: str
    task_id: int | None = None
    batch_id: int | None = None
    operator_id: int | None = None
    started_at: str | None = None
    progress: float = 0.0
    total_orders: int = 0
    total_products: int = 0
    picked_count: int = 0
    remaining_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


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


def parse_current_task(cart: Cart) -> CartCurrentTask | None:
    raw = getattr(cart, "current_task_json", None)
    data = _load(raw if isinstance(raw, str) else None)
    if not data:
        return None
    tt = str(data.get("task_type") or TASK_NONE).strip().upper() or TASK_NONE
    if tt == TASK_NONE:
        return None
    return CartCurrentTask(
        task_type=tt,
        task_id=int(data["task_id"]) if data.get("task_id") is not None else None,
        batch_id=int(data["batch_id"]) if data.get("batch_id") is not None else None,
        operator_id=int(data["operator_id"]) if data.get("operator_id") is not None else None,
        started_at=str(data["started_at"]) if data.get("started_at") else None,
        progress=float(data.get("progress") or 0),
        total_orders=int(data.get("total_orders") or 0),
        total_products=int(data.get("total_products") or 0),
        picked_count=int(data.get("picked_count") or 0),
        remaining_count=int(data.get("remaining_count") or 0),
    )


def write_current_task(cart: Cart, task: CartCurrentTask | None) -> None:
    """Jedyny writer pola carts.current_task_json (woła CartLifecycleService)."""
    if task is None or task.task_type == TASK_NONE:
        cart.current_task_json = None
    else:
        cart.current_task_json = _dump(task.to_dict())


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
) -> CartCurrentTask | None:
    mapping = {
        CartStatus.AVAILABLE: None,
        CartStatus.ASSIGNED: TASK_CLAIMED,
        CartStatus.PICKING: TASK_PICKING,
        CartStatus.READY_FOR_PACKING: TASK_READY_FOR_PACKING,
        CartStatus.PACKING: TASK_PACKING,
    }
    tt = mapping.get(status)
    if tt is None:
        return None
    started = started_at or datetime.utcnow()
    return CartCurrentTask(
        task_type=tt,
        task_id=task_id,
        batch_id=batch_id,
        operator_id=operator_id,
        started_at=started.isoformat(sep=" ", timespec="seconds"),
        progress=float(progress),
        total_orders=int(total_orders),
        total_products=int(total_products),
        picked_count=int(picked_count),
        remaining_count=int(remaining_count),
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


def enrich_current_task_with_stats(db: Session, cart: Cart, task: CartCurrentTask) -> CartCurrentTask:
    """Uzupełnij totals + picked/remaining (odczyt) — bez zapisu."""
    try:
        from .cart_stats_service import compute_cart_stats

        stats = compute_cart_stats(db, cart)
        task.total_orders = int(stats.get("orders_count") or 0)
        task.total_products = int(stats.get("products_count") or 0)
        picked, remaining, progress = compute_pick_progress(db, cart)
        task.picked_count = picked
        task.remaining_count = remaining
        if task.task_type in (TASK_PICKING, TASK_READY_FOR_PACKING):
            task.progress = progress if task.task_type == TASK_PICKING else 100.0
    except Exception:
        logger.exception("enrich_current_task_with_stats failed cart_id=%s", getattr(cart, "id", None))
    return task


def get_current_task(db: Session, cart: Cart, *, enrich: bool = True) -> dict[str, Any] | None:
    task = parse_current_task(cart)
    if task is None:
        return None
    if enrich:
        task = enrich_current_task_with_stats(db, cart, task)
    return task.to_dict()


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
