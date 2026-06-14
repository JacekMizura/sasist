"""BundleLineResolver — single entry point for bundle line interpretation (P4.14)."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.bundle import Bundle
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.order_line_bundle_component import OrderLineBundleComponent
from ..bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION, normalize_bundle_operational_mode
from .bundle_line_context import (
    BundleComponentSnapshotView,
    BundleLineContext,
    BundlePricingContext,
)


def _meta_dict(raw: Any) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _bundle_name_from_meta(meta: dict[str, Any], bundle: Optional[Bundle]) -> str:
    snap = meta.get("bundle_name_snapshot")
    if snap is not None and str(snap).strip():
        return str(snap).strip()[:512]
    if bundle is not None and bundle.name:
        return str(bundle.name)[:512]
    return "Zestaw"


def _component_views(
    rows: list[OrderLineBundleComponent],
    *,
    order_id: int,
    order_line_id: int,
) -> tuple[BundleComponentSnapshotView, ...]:
    out: list[BundleComponentSnapshotView] = []
    for row in rows:
        oid = int(row.order_id) if getattr(row, "order_id", None) is not None else int(order_id)
        out.append(
            BundleComponentSnapshotView(
                snapshot_id=int(row.id),
                order_id=oid,
                order_line_id=int(order_line_id),
                bundle_id=int(row.bundle_id) if row.bundle_id is not None else None,
                component_product_id=int(row.product_id) if row.product_id is not None else 0,
                component_name=str(row.product_name_snapshot or ""),
                sku=row.sku_snapshot,
                ean=row.ean_snapshot,
                required_qty_per_bundle=int(row.quantity_per_bundle or 0),
                required_qty_total=int(row.quantity_total or 0),
                unit_cost_snapshot=(
                    float(row.purchase_price_net_snapshot)
                    if row.purchase_price_net_snapshot is not None
                    else None
                ),
                unit_price_snapshot=(
                    float(row.unit_price_net_snapshot)
                    if getattr(row, "unit_price_net_snapshot", None) is not None
                    else None
                ),
            )
        )
    return tuple(out)


class BundleLineResolver:
    """
    Jedyny punkt wejścia do interpretacji linii zestawu.

    Konsumenci: OMS, WMS, dokumenty magazynowe, zwroty, reklamacje, korekty, raporty.
    """

    def resolve_parent_line(self, db: Session, order_line_id: int) -> Optional[BundleLineContext]:
        parent = (
            db.query(OrderItem)
            .options(joinedload(OrderItem.bundle_component_snapshots))
            .filter(OrderItem.id == int(order_line_id), OrderItem.is_bundle_parent.is_(True))
            .first()
        )
        if parent is None:
            return None
        return self._build_context(db, parent)

    def resolve_for_order(self, db: Session, order_id: int) -> list[BundleLineContext]:
        parents = (
            db.query(OrderItem)
            .options(joinedload(OrderItem.bundle_component_snapshots))
            .filter(OrderItem.order_id == int(order_id), OrderItem.is_bundle_parent.is_(True))
            .order_by(OrderItem.id.asc())
            .all()
        )
        return [ctx for p in parents if (ctx := self._build_context(db, p)) is not None]

    def resolve_for_order_item(self, db: Session, item: OrderItem) -> Optional[BundleLineContext]:
        if bool(getattr(item, "is_bundle_parent", False)):
            return self._build_context(db, item)
        parent_id = getattr(item, "parent_bundle_order_item_id", None)
        if parent_id is not None:
            return self.resolve_parent_line(db, int(parent_id))
        return None

    def context_by_parent_line_id(self, db: Session, order_id: int) -> dict[int, BundleLineContext]:
        return {ctx.order_line_id: ctx for ctx in self.resolve_for_order(db, order_id)}

    def _build_context(self, db: Session, parent: OrderItem) -> Optional[BundleLineContext]:
        meta = _meta_dict(getattr(parent, "metadata_json", None))
        mode_raw = meta.get("bundle_fulfillment_mode")
        if mode_raw is None:
            return None
        mode = normalize_bundle_operational_mode(str(mode_raw))
        if mode not in (ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION):
            return None

        bundle_id = int(parent.source_bundle_id) if parent.source_bundle_id is not None else None
        if bundle_id is None:
            bid_meta = meta.get("bundle_id")
            if bid_meta is not None:
                try:
                    bundle_id = int(bid_meta)
                except (TypeError, ValueError):
                    bundle_id = None
        if bundle_id is None:
            return None

        bundle = db.query(Bundle).filter(Bundle.id == int(bundle_id)).first()
        bundle_name = _bundle_name_from_meta(meta, bundle)

        snap_rows = list(getattr(parent, "bundle_component_snapshots", None) or [])
        if not snap_rows:
            snap_rows = (
                db.query(OrderLineBundleComponent)
                .filter(OrderLineBundleComponent.order_line_id == int(parent.id))
                .order_by(OrderLineBundleComponent.id.asc())
                .all()
            )

        order_id = int(parent.order_id)
        components = _component_views(snap_rows, order_id=order_id, order_line_id=int(parent.id))

        component_items: tuple[OrderItem, ...] = ()
        if mode == ON_DEMAND_ASSEMBLY:
            children = (
                db.query(OrderItem)
                .filter(OrderItem.parent_bundle_order_item_id == int(parent.id))
                .order_by(OrderItem.id.asc())
                .all()
            )
            component_items = tuple(children)

        linked_product_id: Optional[int] = None
        if mode == STOCK_PRODUCTION:
            linked_product_id = int(parent.product_id)

        unit_px = float(parent.unit_price or 0.0)
        line_total = float(parent.total_price or 0.0)
        if line_total <= 0 and unit_px > 0:
            line_total = round(unit_px * int(parent.quantity or 0), 2)

        pricing = BundlePricingContext(
            commercial_unit_price_net=unit_px,
            commercial_line_total_net=line_total,
            list_price_net=float(parent.list_price) if parent.list_price is not None else None,
            vat_percent=float(parent.vat_percent) if parent.vat_percent is not None else None,
        )

        return BundleLineContext(
            order_id=order_id,
            order_line_id=int(parent.id),
            parent_order_item=parent,
            bundle_id=int(bundle_id),
            bundle_name=bundle_name,
            fulfillment_mode=mode,  # type: ignore[arg-type]
            bundle_qty=int(parent.quantity or 0),
            pricing=pricing,
            components=components,
            linked_product_id=linked_product_id,
            component_order_items=component_items,
        )


# Module-level singleton for service consumers (no HTTP endpoint in P4.14).
bundle_line_resolver = BundleLineResolver()
