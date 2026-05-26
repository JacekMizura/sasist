"""
Expand virtual bundles into real product order lines, merge by traceability key, optional stock check.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any, Optional, cast

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.bundle import Bundle, BundleItem
from ..models.inventory import Inventory
from ..models.product import Product


class BundleExplosionError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


FALLBACK_VOLUME_DM3 = 0.001


def unit_volume_dm3(product: Product) -> float:
    if product.volume is not None and product.volume > 0:
        return float(product.volume)
    l_, w_, h_ = product.length or 0, product.width or 0, product.height or 0
    if l_ and w_ and h_:
        return (l_ * w_ * h_) / 1000.0
    return FALLBACK_VOLUME_DM3


@dataclass
class ResolvedOrderLine:
    product_id: int
    quantity: int
    unit_price: float
    total_price: float
    list_price: Optional[float]
    line_volume: float
    source_bundle_id: Optional[int]
    bundle_instance_id: Optional[str]
    metadata_json: Optional[str]
    #: VAT % copied from product catalog (metadata) — order lines inherit for invoicing / summaries.
    vat_percent: Optional[float] = None
    #: Nagłówek zestawu (komercja); komponenty mają False i zerowe ``total_price`` w DB.
    is_bundle_parent: bool = False


def vat_percent_from_product(product: Product) -> Optional[float]:
    """Same keys as frontend `vatFromProductMetadata` — catalog VAT lives in metadata_json."""
    raw = getattr(product, "metadata_json", None)
    if not raw or not str(raw).strip():
        return None
    try:
        m = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(m, dict):
        return None
    for k in ("vat_rate", "vat", "vat_percent", "VAT", "stawka_vat"):
        v = m.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            fv = float(cast(float, v))
            if 0 <= fv <= 100:
                return fv
        if isinstance(v, str) and v.strip():
            try:
                fv = float(v.replace(",", ".").strip())
                if 0 <= fv <= 100:
                    return fv
            except (TypeError, ValueError):
                continue
    return None


def _financial_snapshot_meta(product: Product) -> dict[str, Any]:
    """Lightweight margin/supplier context on each line (OMS summaries)."""
    snap: dict[str, Any] = {}
    if product.purchase_price is not None:
        try:
            snap["purchase_price_net"] = float(product.purchase_price)
        except (TypeError, ValueError):
            pass
    if product.default_supplier_id is not None:
        snap["default_supplier_id"] = int(product.default_supplier_id)
    if product.sale_price is not None:
        try:
            snap["catalog_sale_price_net"] = float(product.sale_price)
        except (TypeError, ValueError):
            pass
    return snap


def _bundle_component_meta_json(
    product: Product,
    *,
    bundle_id: int,
    bundle_order_qty: int,
    display_unit_price: Optional[float] = None,
    display_line_total: Optional[float] = None,
) -> str:
    payload: dict[str, Any] = {
        "from_bundle": True,
        "bundle_qty": int(bundle_order_qty),
        "bundle_id": int(bundle_id),
        "bundle_component": True,
    }
    if display_unit_price is not None:
        payload["bundle_display_unit_price"] = float(display_unit_price)
    if display_line_total is not None:
        payload["bundle_display_line_total"] = float(display_line_total)
    payload.update(_financial_snapshot_meta(product))
    vp = vat_percent_from_product(product)
    if vp is not None:
        payload["vat_percent_catalog"] = vp
    return json.dumps(payload, ensure_ascii=False)


def _bundle_parent_meta_json(bundle: Bundle, *, bundle_order_qty: int, vat_percent: Optional[float]) -> str:
    payload: dict[str, Any] = {
        "oms_bundle_parent_header": True,
        "bundle_qty": int(bundle_order_qty),
        "bundle_id": int(bundle.id),
    }
    if vat_percent is not None:
        payload["vat_percent_catalog"] = float(vat_percent)
    return json.dumps(payload, ensure_ascii=False)


def _sale_unit(p: Product) -> float:
    if p.sale_price is not None:
        return float(p.sale_price)
    return 0.0


def _load_bundle(db: Session, bundle_id: int, tenant_id: int) -> Bundle:
    b = (
        db.query(Bundle)
        .options(joinedload(Bundle.items).joinedload(BundleItem.product))
        .filter(Bundle.id == bundle_id, Bundle.tenant_id == tenant_id)
        .first()
    )
    if not b:
        raise BundleExplosionError(f"Bundle not found: {bundle_id}")
    if not b.active:
        raise BundleExplosionError(f"Bundle is inactive: {bundle_id}")
    items = list(b.items or [])
    if not items:
        raise BundleExplosionError(f"Bundle has no components: {bundle_id}")
    for bi in items:
        if bi.product is None:
            raise BundleExplosionError(f"Bundle component product missing (bundle_item id={bi.id})")
        if int(bi.product.tenant_id) != int(tenant_id):
            raise BundleExplosionError(f"Component product {bi.product_id} wrong tenant for bundle")
        if int(bi.quantity or 0) <= 0:
            raise BundleExplosionError(f"Invalid component quantity for product {bi.product_id}")
    return b


def explode_bundle_line(
    db: Session,
    *,
    tenant_id: int,
    bundle_id: int,
    bundle_order_qty: int,
    line_unit_price_override: Optional[float],
) -> list[ResolvedOrderLine]:
    """
    Jedna linia katalogowa zestawu → nagłówek komercyjny + komponenty operacyjne (ta sama instancja UUID).

    Komponenty mają ``total_price``/``unit_price`` zerowe w rozliczeniu zamówienia (wartość tylko na nagłówku).
    Ceny składowe do UI są w ``metadata_json.bundle_display_*``.
    """
    bundle = _load_bundle(db, bundle_id, tenant_id)
    instance_id = str(uuid.uuid4())
    items = sorted(bundle.items or [], key=lambda x: (x.sort_order, x.id))

    weights: list[tuple[BundleItem, int, float]] = []
    for bi in items:
        line_qty = int(bundle_order_qty) * int(bi.quantity)
        w = _sale_unit(bi.product) * line_qty
        weights.append((bi, line_qty, w))

    weight_sum = sum(w for _, _, w in weights)

    if line_unit_price_override is not None:
        target_total = float(line_unit_price_override) * int(bundle_order_qty)
    elif bundle.sale_price is not None:
        target_total = float(bundle.sale_price) * int(bundle_order_qty)
    else:
        target_total = None

    first_prod = items[0].product if items else None
    if first_prod is None:
        raise BundleExplosionError("Bundle has no components")
    rep_pid = int(first_prod.id)
    parent_vat = vat_percent_from_product(first_prod)

    if target_total is None:
        target_total = 0.0
        for bi, line_qty, _w in weights:
            target_total += round(_sale_unit(bi.product) * line_qty, 2)

    tt = float(target_total)
    unit_bundle = round(tt / float(bundle_order_qty), 4) if bundle_order_qty else 0.0
    parent_meta = _bundle_parent_meta_json(bundle, bundle_order_qty=int(bundle_order_qty), vat_percent=parent_vat)
    parent_line = ResolvedOrderLine(
        product_id=rep_pid,
        quantity=int(bundle_order_qty),
        unit_price=unit_bundle,
        total_price=round(tt, 2),
        list_price=float(bundle.sale_price) if bundle.sale_price is not None else None,
        line_volume=0.0,
        source_bundle_id=int(bundle.id),
        bundle_instance_id=instance_id,
        metadata_json=parent_meta,
        vat_percent=parent_vat,
        is_bundle_parent=True,
    )

    if weight_sum > 0:
        allocations = [tt * (w / weight_sum) for _, _, w in weights]
    else:
        n = len(weights)
        allocations = [tt / n] * n if n else []

    child_lines: list[ResolvedOrderLine] = []
    disp_rounded: list[float] = []
    for i, (bi, line_qty, _w) in enumerate(weights):
        p = bi.product
        alloc = allocations[i] if i < len(allocations) else 0.0
        disp_tot = round(float(alloc), 2)
        disp_rounded.append(disp_tot)
        disp_unit = round(disp_tot / line_qty, 4) if line_qty else 0.0
        lv = unit_volume_dm3(p) * line_qty
        lp = float(p.sale_price) if p.sale_price is not None else None
        pvat = vat_percent_from_product(p)
        meta = _bundle_component_meta_json(
            p,
            bundle_id=int(bundle.id),
            bundle_order_qty=int(bundle_order_qty),
            display_unit_price=disp_unit,
            display_line_total=disp_tot,
        )
        child_lines.append(
            ResolvedOrderLine(
                product_id=p.id,
                quantity=line_qty,
                unit_price=0.0,
                total_price=0.0,
                list_price=lp,
                line_volume=lv,
                source_bundle_id=bundle.id,
                bundle_instance_id=instance_id,
                metadata_json=meta,
                vat_percent=pvat,
                is_bundle_parent=False,
            )
        )

    drift = round(tt - sum(disp_rounded), 2)
    if child_lines and abs(drift) >= 0.01:
        last = child_lines[-1]
        bi_last, lq_last, _w_last = weights[-1]
        p_last = bi_last.product
        prev_disp = disp_rounded[-1]
        fixed_tot = round(prev_disp + drift, 2)
        fixed_unit = round(fixed_tot / lq_last, 4) if lq_last else 0.0
        meta_fix = _bundle_component_meta_json(
            p_last,
            bundle_id=int(bundle.id),
            bundle_order_qty=int(bundle_order_qty),
            display_unit_price=fixed_unit,
            display_line_total=fixed_tot,
        )
        child_lines[-1] = ResolvedOrderLine(
            product_id=last.product_id,
            quantity=last.quantity,
            unit_price=0.0,
            total_price=0.0,
            list_price=last.list_price,
            line_volume=last.line_volume,
            source_bundle_id=last.source_bundle_id,
            bundle_instance_id=last.bundle_instance_id,
            metadata_json=meta_fix,
            vat_percent=last.vat_percent,
            is_bundle_parent=False,
        )

    return [parent_line] + child_lines


def explode_product_line(
    *,
    product: Product,
    quantity: int,
    line_unit_price_override: Optional[float],
) -> ResolvedOrderLine:
    unit = float(line_unit_price_override) if line_unit_price_override is not None else _sale_unit(product)
    tot = round(unit * quantity, 2)
    lv = unit_volume_dm3(product) * quantity
    lp = float(product.sale_price) if product.sale_price is not None else None
    vp = vat_percent_from_product(product)
    fin = _financial_snapshot_meta(product)
    meta_obj: dict[str, Any] = dict(fin)
    if vp is not None:
        meta_obj["vat_percent_catalog"] = vp
    meta_str = json.dumps(meta_obj, ensure_ascii=False) if meta_obj else None
    return ResolvedOrderLine(
        product_id=product.id,
        quantity=int(quantity),
        unit_price=unit,
        total_price=tot,
        list_price=lp,
        line_volume=lv,
        source_bundle_id=None,
        bundle_instance_id=None,
        metadata_json=meta_str,
        vat_percent=vp,
    )


def merge_resolved_lines(lines: list[ResolvedOrderLine]) -> list[ResolvedOrderLine]:
    """
    Merge rows that share (product_id, source_bundle_id, bundle_instance_id, is_bundle_parent).
    Nagłówki zestawów nigdy nie są łączone z komponentami (różny fragment klucza).
    """
    buckets: dict[tuple[int, Any, Any, bool], ResolvedOrderLine] = {}
    order_keys: list[tuple[int, Any, Any, bool]] = []
    for row in lines:
        key = (row.product_id, row.source_bundle_id, row.bundle_instance_id, row.is_bundle_parent)
        if key not in buckets:
            buckets[key] = row
            order_keys.append(key)
        else:
            cur = buckets[key]
            new_qty = cur.quantity + row.quantity
            new_total = round(cur.total_price + row.total_price, 2)
            new_unit = round(new_total / new_qty, 4) if new_qty else 0.0
            new_vol = cur.line_volume + row.line_volume
            merged_vat = cur.vat_percent if cur.vat_percent is not None else row.vat_percent
            buckets[key] = ResolvedOrderLine(
                product_id=cur.product_id,
                quantity=new_qty,
                unit_price=new_unit,
                total_price=new_total,
                list_price=cur.list_price,
                line_volume=new_vol,
                source_bundle_id=cur.source_bundle_id,
                bundle_instance_id=cur.bundle_instance_id,
                metadata_json=cur.metadata_json or row.metadata_json,
                vat_percent=merged_vat,
                is_bundle_parent=cur.is_bundle_parent,
            )
    return [buckets[k] for k in order_keys]


def available_stock(db: Session, tenant_id: int, warehouse_id: int, product_id: int) -> float:
    q = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0))
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.product_id == product_id,
        )
        .scalar()
    )
    return float(q or 0)


def validate_merged_stock(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    lines: list[ResolvedOrderLine],
) -> None:
    need: dict[int, int] = {}
    for r in lines:
        need[r.product_id] = need.get(r.product_id, 0) + int(r.quantity)
    short = []
    for pid, n in need.items():
        avail = available_stock(db, tenant_id, warehouse_id, pid)
        if avail + 1e-9 < n:
            short.append((pid, n, avail))
    if short:
        parts = [f"product_id={pid} need={n} available={avail:.0f}" for pid, n, avail in short]
        raise BundleExplosionError("Insufficient stock for bundle / order lines: " + "; ".join(parts))


def resolve_order_create_lines(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    raw_lines: list[Any],
    check_bundle_stock: bool,
) -> list[ResolvedOrderLine]:
    """
    raw_lines: validated OrderCreateLine-like objects with product_id XOR bundle_id.
    """
    exploded: list[ResolvedOrderLine] = []
    for line in raw_lines:
        qty = int(line.quantity)
        if getattr(line, "bundle_id", None) is not None:
            exploded.extend(
                explode_bundle_line(
                    db,
                    tenant_id=tenant_id,
                    bundle_id=int(line.bundle_id),
                    bundle_order_qty=qty,
                    line_unit_price_override=line.unit_price,
                )
            )
        else:
            pid = int(line.product_id)
            p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tenant_id).first()
            if not p:
                raise BundleExplosionError(f"Unknown product_id or wrong tenant: {pid}")
            exploded.append(
                explode_product_line(
                    product=p,
                    quantity=qty,
                    line_unit_price_override=line.unit_price,
                )
            )
    merged = merge_resolved_lines(exploded)
    if check_bundle_stock:
        validate_merged_stock(db, tenant_id=tenant_id, warehouse_id=warehouse_id, lines=merged)
    return merged
