"""Normalized order composition for Smart Matching v2 COMPOSITION patterns."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy.orm import Session

from ....models.order import Order
from ....models.order_item import OrderItem
from .constants import PATTERN_COMPOSITION, PATTERN_SINGLE


@dataclass(frozen=True)
class NormalizedItem:
    product_id: int
    quantity: int

    def as_dict(self) -> dict[str, int]:
        return {"product_id": int(self.product_id), "quantity": int(self.quantity)}


@dataclass(frozen=True)
class OrderPatternSnapshot:
    """Deterministic packing-decision identity for one order."""

    pattern_type: str
    items: tuple[NormalizedItem, ...]
    identity_hash: str
    #: Anchor product_id for NOT NULL DB columns (SINGLE = the product; COMPOSITION = min pid).
    anchor_product_id: int
    #: SINGLE = line qty; COMPOSITION = sum of quantities.
    quantity: int

    @property
    def items_json(self) -> str:
        return json.dumps([i.as_dict() for i in self.items], separators=(",", ":"), ensure_ascii=False)

    def items_dicts(self) -> list[dict[str, int]]:
        return [i.as_dict() for i in self.items]


def _identity_hash(items: list[NormalizedItem]) -> str:
    raw = "|".join(f"{i.product_id}:{i.quantity}" for i in items)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def normalize_items_from_pairs(pairs: list[tuple[int, int]]) -> list[NormalizedItem]:
    by_pid: dict[int, int] = {}
    for pid, qty in pairs:
        pid_i = int(pid)
        qty_i = int(qty)
        if pid_i <= 0 or qty_i <= 0:
            continue
        by_pid[pid_i] = by_pid.get(pid_i, 0) + qty_i
    return [NormalizedItem(product_id=p, quantity=by_pid[p]) for p in sorted(by_pid.keys())]


def pattern_from_normalized_items(items: list[NormalizedItem]) -> Optional[OrderPatternSnapshot]:
    if not items:
        return None
    if len(items) == 1:
        it = items[0]
        return OrderPatternSnapshot(
            pattern_type=PATTERN_SINGLE,
            items=(it,),
            identity_hash=_identity_hash(items),
            anchor_product_id=int(it.product_id),
            quantity=int(it.quantity),
        )
    total = sum(int(i.quantity) for i in items)
    return OrderPatternSnapshot(
        pattern_type=PATTERN_COMPOSITION,
        items=tuple(items),
        identity_hash=_identity_hash(items),
        anchor_product_id=int(items[0].product_id),
        quantity=int(total),
    )


def pattern_from_order(db: Session, order: Order) -> Optional[OrderPatternSnapshot]:
    rows = db.query(OrderItem).filter(OrderItem.order_id == int(order.id)).all()
    pairs = [
        (int(getattr(it, "product_id", 0) or 0), int(getattr(it, "quantity", 0) or 0))
        for it in rows
    ]
    items = normalize_items_from_pairs(pairs)
    return pattern_from_normalized_items(items)


def parse_composition_items_json(raw: Optional[str]) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    out: list[dict[str, Any]] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        try:
            pid = int(row.get("product_id") or 0)
            qty = int(row.get("quantity") or 0)
        except (TypeError, ValueError):
            continue
        if pid > 0 and qty > 0:
            out.append({"product_id": pid, "quantity": qty})
    return out
