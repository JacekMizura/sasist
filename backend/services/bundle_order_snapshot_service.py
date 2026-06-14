"""Persist and read bundle component snapshots on order lines (P4.13)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from ..models.bundle import Bundle, BundleItem
from ..models.order_line_bundle_component import OrderLineBundleComponent
from ..models.product import Product


@dataclass(frozen=True)
class BundleComponentSnapshotDraft:
    bundle_id: int
    product_id: int
    product_name_snapshot: str
    sku_snapshot: Optional[str]
    ean_snapshot: Optional[str]
    quantity_per_bundle: int
    quantity_total: int
    purchase_price_net_snapshot: Optional[float]


def _product_sku_snapshot(product: Product) -> Optional[str]:
    for attr in ("symbol", "sku"):
        v = getattr(product, attr, None)
        if v is not None and str(v).strip():
            return str(v).strip()[:128]
    return None


def build_component_snapshots_from_bundle(
    bundle: Bundle,
    *,
    bundle_order_qty: int,
) -> list[BundleComponentSnapshotDraft]:
    items = sorted(bundle.items or [], key=lambda x: (x.sort_order, x.id))
    out: list[BundleComponentSnapshotDraft] = []
    for bi in items:
        p = bi.product
        if p is None:
            continue
        per = int(bi.quantity or 0)
        if per <= 0:
            continue
        total = int(bundle_order_qty) * per
        purchase: Optional[float] = None
        if p.purchase_price is not None:
            try:
                purchase = float(p.purchase_price)
            except (TypeError, ValueError):
                purchase = None
        out.append(
            BundleComponentSnapshotDraft(
                bundle_id=int(bundle.id),
                product_id=int(p.id),
                product_name_snapshot=str(p.name or f"Produkt #{p.id}")[:512],
                sku_snapshot=_product_sku_snapshot(p),
                ean_snapshot=(str(p.ean).strip()[:64] if getattr(p, "ean", None) else None),
                quantity_per_bundle=per,
                quantity_total=total,
                purchase_price_net_snapshot=purchase,
            )
        )
    return out


def build_component_snapshots(
    db: Session,
    *,
    bundle_id: int,
    tenant_id: int,
    bundle_order_qty: int,
) -> list[BundleComponentSnapshotDraft]:
    bundle = (
        db.query(Bundle)
        .options(joinedload(Bundle.items).joinedload(BundleItem.product))
        .filter(Bundle.id == int(bundle_id), Bundle.tenant_id == int(tenant_id))
        .first()
    )
    if not bundle:
        return []
    return build_component_snapshots_from_bundle(bundle, bundle_order_qty=int(bundle_order_qty))


def persist_order_line_bundle_snapshots(
    db: Session,
    *,
    order_line_id: int,
    snapshots: Sequence[BundleComponentSnapshotDraft],
) -> None:
    for snap in snapshots:
        db.add(
            OrderLineBundleComponent(
                order_line_id=int(order_line_id),
                bundle_id=int(snap.bundle_id),
                product_id=int(snap.product_id),
                product_name_snapshot=snap.product_name_snapshot,
                sku_snapshot=snap.sku_snapshot,
                ean_snapshot=snap.ean_snapshot,
                quantity_per_bundle=int(snap.quantity_per_bundle),
                quantity_total=int(snap.quantity_total),
                purchase_price_net_snapshot=snap.purchase_price_net_snapshot,
            )
        )


def snapshot_purchase_cost_total_net(
    snapshots: Iterable[OrderLineBundleComponent],
) -> Optional[float]:
    total = 0.0
    found = False
    for row in snapshots:
        if row.purchase_price_net_snapshot is None:
            continue
        found = True
        total += float(row.purchase_price_net_snapshot) * int(row.quantity_total or 0)
    return round(total, 2) if found else None


def load_snapshots_for_order_line_ids(
    db: Session,
    order_line_ids: Sequence[int],
) -> dict[int, list[OrderLineBundleComponent]]:
    if not order_line_ids:
        return {}
    rows = (
        db.query(OrderLineBundleComponent)
        .filter(OrderLineBundleComponent.order_line_id.in_(list(order_line_ids)))
        .order_by(OrderLineBundleComponent.id.asc())
        .all()
    )
    out: dict[int, list[OrderLineBundleComponent]] = {}
    for row in rows:
        out.setdefault(int(row.order_line_id), []).append(row)
    return out
