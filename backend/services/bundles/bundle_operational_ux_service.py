"""P4.15B — Bundle operational UX projections (read-only, no warehouse logic changes)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ..bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from .bundle_component_index import (
    bundle_component_index_sort_key,
    normalize_sibling_bundle_component_indices,
)
from .bundle_line_projections import OperationalLineProjection, picking_lines
from .bundle_line_resolver import bundle_line_resolver

_LOG = logging.getLogger(__name__)


@dataclass(frozen=True)
class BundleOperationalUxMeta:
    bundle_id: Optional[int] = None
    bundle_name: Optional[str] = None
    bundle_mode: Optional[str] = None
    bundle_component_index: Optional[int] = None
    bundle_component_count: Optional[int] = None
    is_bundle_component: bool = False
    parent_bundle_order_line_id: Optional[int] = None


def _meta_from_projection(p: OperationalLineProjection) -> BundleOperationalUxMeta:
    return BundleOperationalUxMeta(
        bundle_id=p.bundle_id,
        bundle_name=p.bundle_name,
        bundle_mode=p.bundle_mode,
        bundle_component_index=p.bundle_component_index,
        bundle_component_count=p.bundle_component_count,
        is_bundle_component=bool(p.is_bundle_component),
        parent_bundle_order_line_id=p.parent_bundle_order_line_id,
    )


def _reindex_ux_bundle_components(
    ux: dict[int, BundleOperationalUxMeta],
) -> dict[int, BundleOperationalUxMeta]:
    """Canonical repair of sibling indices on a UX index (NULL/dup/0 → 1..N)."""
    by_parent: dict[int, list[int]] = {}
    for oi_id, meta in ux.items():
        if not bool(meta.is_bundle_component):
            continue
        if meta.parent_bundle_order_line_id is None:
            continue
        by_parent.setdefault(int(meta.parent_bundle_order_line_id), []).append(int(oi_id))

    out = dict(ux)
    for _parent_id, oi_ids in by_parent.items():
        raw = [(oid, out[oid].bundle_component_index) for oid in oi_ids]
        assigned = normalize_sibling_bundle_component_indices(raw)
        count = len(oi_ids)
        for oid, new_idx in assigned.items():
            meta = out[oid]
            if meta.bundle_component_index == new_idx and meta.bundle_component_count == count:
                continue
            out[oid] = BundleOperationalUxMeta(
                bundle_id=meta.bundle_id,
                bundle_name=meta.bundle_name,
                bundle_mode=meta.bundle_mode,
                bundle_component_index=new_idx,
                bundle_component_count=count,
                is_bundle_component=True,
                parent_bundle_order_line_id=meta.parent_bundle_order_line_id,
            )
    return out


def build_bundle_ux_index_for_order(db: Session, order_id: int) -> dict[int, BundleOperationalUxMeta]:
    """Map order_item_id → bundle UX metadata from resolver picking_lines projection."""
    out: dict[int, BundleOperationalUxMeta] = {}
    for ctx in bundle_line_resolver.resolve_for_order(db, int(order_id)):
        for proj in picking_lines(ctx):
            out[int(proj.order_line_id)] = _meta_from_projection(proj)
    return _reindex_ux_bundle_components(out)


def build_bundle_ux_index_for_orders(db: Session, order_ids: list[int]) -> dict[int, BundleOperationalUxMeta]:
    merged: dict[int, BundleOperationalUxMeta] = {}
    for oid in order_ids:
        merged.update(build_bundle_ux_index_for_order(db, int(oid)))
    return merged


def bundle_ux_for_order_item(db: Session, order_item: OrderItem) -> Optional[BundleOperationalUxMeta]:
    parent_id = getattr(order_item, "parent_bundle_order_item_id", None)
    if parent_id is not None:
        idx = build_bundle_ux_index_for_order(db, int(order_item.order_id))
        return idx.get(int(order_item.id))
    if bool(getattr(order_item, "is_bundle_parent", False)):
        idx = build_bundle_ux_index_for_order(db, int(order_item.order_id))
        return idx.get(int(order_item.id))
    return None


@dataclass
class _LinePickState:
    order_item_id: int
    product_id: int
    product_name: str
    quantity: float
    picked_quantity: float
    quantity_to_pick: float
    bundle_component_index: int
    is_current_product: bool
    pick_done: bool


def build_picking_bundle_trees_for_orders(
    db: Session,
    *,
    orders: list,
    product_id: int,
    cart_id: Optional[int],
    ux_index: dict[int, BundleOperationalUxMeta],
    sum_pick_fn,
) -> list[dict]:
    """Order-centric bundle trees for picking detail UI."""
    from ...models.order import Order

    trees: list[dict] = []
    pid = int(product_id)
    cid = int(cart_id) if cart_id is not None else None
    # Repair indices even when caller passed a hand-built / stale ux_index.
    ux_index = _reindex_ux_bundle_components(dict(ux_index))

    for order in orders:
        if not isinstance(order, Order):
            continue
        bundles_seen: set[int] = set()
        items_by_parent: dict[int, list[OrderItem]] = {}
        for oi in sorted(order.items or [], key=lambda x: int(x.id)):
            if order_item_skip_bundle_commercial_header_for_ops(oi):
                continue
            meta = ux_index.get(int(oi.id))
            # Only real ON_DEMAND components belong in component-status trees.
            if meta is None or not bool(meta.is_bundle_component):
                continue
            if meta.parent_bundle_order_line_id is None or meta.bundle_id is None:
                continue
            parent_key = int(meta.parent_bundle_order_line_id)
            items_by_parent.setdefault(parent_key, []).append(oi)

        for parent_id, comp_items in items_by_parent.items():
            sample = ux_index.get(int(comp_items[0].id))
            if sample is None or sample.bundle_id is None:
                continue
            bid = int(sample.bundle_id)
            if bid in bundles_seen:
                continue
            bundles_seen.add(bid)
            try:
                components: list[_LinePickState] = []
                ordered = sorted(
                    comp_items,
                    key=lambda x: bundle_component_index_sort_key(
                        (ux_index.get(int(x.id)).bundle_component_index if ux_index.get(int(x.id)) else None),
                        order_item_id=int(x.id),
                    ),
                )
                for oi in ordered:
                    meta = ux_index.get(int(oi.id))
                    if meta is None or not bool(meta.is_bundle_component):
                        continue
                    idx = int(meta.bundle_component_index) if meta.bundle_component_index is not None else None
                    if idx is None or idx < 1:
                        # Should be impossible after _reindex; skip rather than 500.
                        _LOG.warning(
                            "skip bundle component without index order_id=%s oi=%s bundle_id=%s",
                            order.id,
                            oi.id,
                            bid,
                        )
                        continue
                    qty = float(oi.quantity or 0)
                    pq = float(sum_pick_fn(db, int(oi.id), cid)) if cid is not None else 0.0
                    miss = float(oi.wms_picking_line_missing_qty or 0)
                    to_pick = max(0.0, qty - pq - miss)
                    picked_row = min(pq, max(0.0, qty - miss))
                    pname = str(getattr(oi.product, "name", None) or f"P{oi.product_id}")
                    components.append(
                        _LinePickState(
                            order_item_id=int(oi.id),
                            product_id=int(oi.product_id),
                            product_name=pname,
                            quantity=qty,
                            picked_quantity=round(picked_row, 6),
                            quantity_to_pick=round(to_pick, 6),
                            bundle_component_index=idx,
                            is_current_product=int(oi.product_id) == pid,
                            pick_done=to_pick <= 1e-9 and qty > 0,
                        )
                    )
                if not components:
                    continue
                done = sum(1 for c in components if c.pick_done)
                trees.append(
                    {
                        "order_id": int(order.id),
                        "order_number": str(order.number or f"#{order.id}"),
                        "bundle_id": bid,
                        "bundle_name": str(sample.bundle_name or ""),
                        "bundle_mode": str(sample.bundle_mode or ""),
                        "parent_order_line_id": int(parent_id),
                        "components_total": len(components),
                        "components_done": done,
                        "components": components,
                    }
                )
            except Exception:
                _LOG.exception(
                    "bundle tree skipped order_id=%s parent_line=%s bundle_id=%s",
                    getattr(order, "id", None),
                    parent_id,
                    bid,
                )
                continue
    return trees


def build_packing_bundle_trees(
    db: Session,
    *,
    order,
    active_lines: list,
) -> list[dict]:
    """Bundle tree for packing — progress per component."""
    order_id = int(order.id)
    ux_index = build_bundle_ux_index_for_order(db, order_id)
    by_parent: dict[int, list] = {}
    line_by_oi: dict[int, object] = {int(ln.order_item_id): ln for ln in active_lines}

    for oi in order.items or []:
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        meta = ux_index.get(int(oi.id))
        if meta is None or not bool(meta.is_bundle_component):
            continue
        if meta.parent_bundle_order_line_id is None:
            continue
        by_parent.setdefault(int(meta.parent_bundle_order_line_id), []).append((oi, meta))

    trees: list[dict] = []
    for parent_id, rows in by_parent.items():
        sample_meta = rows[0][1]
        if sample_meta.bundle_id is None:
            continue
        try:
            components = []
            packed_n = 0
            ordered = sorted(
                rows,
                key=lambda r: bundle_component_index_sort_key(
                    r[1].bundle_component_index,
                    order_item_id=int(r[0].id),
                ),
            )
            for oi, meta in ordered:
                ln = line_by_oi.get(int(oi.id))
                if ln is None:
                    continue
                idx = int(meta.bundle_component_index) if meta.bundle_component_index is not None else None
                if idx is None or idx < 1:
                    continue
                req = int(getattr(ln, "quantity_required", None) or ln.quantity or 0)
                packed = int(getattr(ln, "quantity_packed", 0) or 0)
                done = packed >= req and req > 0
                if done:
                    packed_n += 1
                components.append(
                    {
                        "order_item_id": int(oi.id),
                        "product_id": int(ln.product_id),
                        "product_name": str(ln.product_name),
                        "quantity_required": req,
                        "quantity_packed": packed,
                        "bundle_component_index": idx,
                        "is_packed": done,
                    }
                )
            if not components:
                continue
            trees.append(
                {
                    "bundle_id": int(sample_meta.bundle_id),
                    "bundle_name": str(sample_meta.bundle_name or ""),
                    "bundle_mode": str(sample_meta.bundle_mode or ""),
                    "parent_order_line_id": int(parent_id),
                    "components_total": len(components),
                    "components_packed": packed_n,
                    "is_complete": packed_n >= len(components),
                    "components": components,
                }
            )
        except Exception:
            _LOG.exception(
                "packing bundle tree skipped order_id=%s parent_line=%s bundle_id=%s",
                order_id,
                parent_id,
                sample_meta.bundle_id,
            )
            continue
    return trees
