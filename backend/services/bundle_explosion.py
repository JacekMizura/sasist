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
from .bundle_operational_mode import (
    ON_DEMAND_ASSEMBLY,
    STOCK_PRODUCTION,
    normalize_bundle_operational_mode,
)
from .bundle_order_snapshot_service import (
    BundleComponentSnapshotDraft,
    build_component_snapshots_from_bundle,
)
from .stock_disposition import (
    DEFAULT_STOCK_DISPOSITION,
    disposition_for_new_order_line,
    normalize_stock_disposition,
)


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
    #: Pula magazynowa do rezerwacji / pickingu (Etap 2).
    required_stock_disposition: str = DEFAULT_STOCK_DISPOSITION
    #: Etap 3A — źródłowa oferta (nullable dla legacy).
    product_sales_offer_id: Optional[int] = None
    offer_name: Optional[str] = None


@dataclass
class BundleExplosionOutput:
    lines: list[ResolvedOrderLine]
    snapshots_by_instance: dict[str, list[BundleComponentSnapshotDraft]]


@dataclass
class OrderCreateLinesResult:
    lines: list[ResolvedOrderLine]
    bundle_snapshots_by_instance: dict[str, list[BundleComponentSnapshotDraft]]


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


def _bundle_parent_meta_json(
    bundle: Bundle,
    *,
    bundle_order_qty: int,
    vat_percent: Optional[float],
    fulfillment_mode: str,
) -> str:
    payload: dict[str, Any] = {
        "oms_bundle_parent_header": True,
        "bundle_qty": int(bundle_order_qty),
        "bundle_id": int(bundle.id),
        "bundle_fulfillment_mode": fulfillment_mode,
        "bundle_name_snapshot": str(bundle.name or "")[:512],
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


def _bundle_operational_mode(bundle: Bundle) -> str:
    return normalize_bundle_operational_mode(
        getattr(bundle, "bundle_fulfillment_mode", None),
        stock_mode=getattr(bundle, "stock_mode", None),
        fulfillment_mode=getattr(bundle, "fulfillment_mode", None),
    )


def _pricing_for_bundle(
    bundle: Bundle,
    items: list[BundleItem],
    *,
    bundle_order_qty: int,
    line_unit_price_override: Optional[float],
) -> tuple[float, float, Optional[float]]:
    weights: list[tuple[BundleItem, int, float]] = []
    for bi in items:
        line_qty = int(bundle_order_qty) * int(bi.quantity)
        w = _sale_unit(bi.product) * line_qty
        weights.append((bi, line_qty, w))

    if line_unit_price_override is not None:
        target_total = float(line_unit_price_override) * int(bundle_order_qty)
    elif bundle.sale_price is not None:
        target_total = float(bundle.sale_price) * int(bundle_order_qty)
    else:
        target_total = None

    if target_total is None:
        target_total = 0.0
        for bi, line_qty, _w in weights:
            target_total += round(_sale_unit(bi.product) * line_qty, 2)

    tt = float(target_total)
    unit_bundle = round(tt / float(bundle_order_qty), 4) if bundle_order_qty else 0.0
    list_price = float(bundle.sale_price) if bundle.sale_price is not None else None
    return tt, unit_bundle, list_price


def _explode_on_demand_bundle(
    bundle: Bundle,
    *,
    bundle_order_qty: int,
    line_unit_price_override: Optional[float],
    required_stock_disposition: str,
    instance_id: str,
) -> list[ResolvedOrderLine]:
    """Nagłówek komercyjny + linie operacyjne składników."""
    mode = ON_DEMAND_ASSEMBLY
    items = sorted(bundle.items or [], key=lambda x: (x.sort_order, x.id))
    weights: list[tuple[BundleItem, int, float]] = []
    for bi in items:
        line_qty = int(bundle_order_qty) * int(bi.quantity)
        w = _sale_unit(bi.product) * line_qty
        weights.append((bi, line_qty, w))

    weight_sum = sum(w for _, _, w in weights)
    tt, unit_bundle, list_price = _pricing_for_bundle(
        bundle,
        items,
        bundle_order_qty=int(bundle_order_qty),
        line_unit_price_override=line_unit_price_override,
    )

    first_prod = items[0].product if items else None
    if first_prod is None:
        raise BundleExplosionError("Bundle has no components")
    rep_pid = int(first_prod.id)
    parent_vat = vat_percent_from_product(first_prod)

    parent_meta = _bundle_parent_meta_json(
        bundle,
        bundle_order_qty=int(bundle_order_qty),
        vat_percent=parent_vat,
        fulfillment_mode=mode,
    )
    parent_line = ResolvedOrderLine(
        product_id=rep_pid,
        quantity=int(bundle_order_qty),
        unit_price=unit_bundle,
        total_price=round(tt, 2),
        list_price=list_price,
        line_volume=0.0,
        source_bundle_id=int(bundle.id),
        bundle_instance_id=instance_id,
        metadata_json=parent_meta,
        vat_percent=parent_vat,
        is_bundle_parent=True,
        required_stock_disposition=normalize_stock_disposition(required_stock_disposition),
    )

    if weight_sum > 0:
        allocations = [tt * (w / weight_sum) for _, _, w in weights]
    else:
        n = len(weights)
        allocations = [tt / n] * n if n else []

    req_disp = normalize_stock_disposition(required_stock_disposition)
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
                required_stock_disposition=req_disp,
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
            required_stock_disposition=req_disp,
        )

    return [parent_line] + child_lines


def _explode_stock_production_bundle(
    db: Session,
    bundle: Bundle,
    *,
    bundle_order_qty: int,
    line_unit_price_override: Optional[float],
    required_stock_disposition: str,
    instance_id: str,
) -> list[ResolvedOrderLine]:
    """Tylko nagłówek z gotowym SKU (linked_product_id) — bez linii składników."""
    linked_id = getattr(bundle, "linked_product_id", None)
    if linked_id is None or int(linked_id) <= 0:
        raise BundleExplosionError(
            f"Bundle {bundle.id} (STOCK_PRODUCTION) wymaga powiązanego produktu (linked_product_id)."
        )
    linked = next(
        (bi.product for bi in (bundle.items or []) if bi.product and int(bi.product.id) == int(linked_id)),
        None,
    )
    if linked is None:
        linked = (
            db.query(Product)
            .filter(Product.id == int(linked_id), Product.tenant_id == int(bundle.tenant_id))
            .first()
        )
    if linked is None:
        raise BundleExplosionError(f"Linked product {linked_id} not found for bundle {bundle.id}")

    items = sorted(bundle.items or [], key=lambda x: (x.sort_order, x.id))
    tt, unit_bundle, list_price = _pricing_for_bundle(
        bundle,
        items,
        bundle_order_qty=int(bundle_order_qty),
        line_unit_price_override=line_unit_price_override,
    )
    parent_vat = vat_percent_from_product(linked)
    parent_meta = _bundle_parent_meta_json(
        bundle,
        bundle_order_qty=int(bundle_order_qty),
        vat_percent=parent_vat,
        fulfillment_mode=STOCK_PRODUCTION,
    )
    lv = unit_volume_dm3(linked) * int(bundle_order_qty)
    parent_line = ResolvedOrderLine(
        product_id=int(linked.id),
        quantity=int(bundle_order_qty),
        unit_price=unit_bundle,
        total_price=round(tt, 2),
        list_price=list_price,
        line_volume=lv,
        source_bundle_id=int(bundle.id),
        bundle_instance_id=instance_id,
        metadata_json=parent_meta,
        vat_percent=parent_vat,
        is_bundle_parent=True,
        required_stock_disposition=normalize_stock_disposition(required_stock_disposition),
    )
    return [parent_line]


def explode_bundle_line(
    db: Session,
    *,
    tenant_id: int,
    bundle_id: int,
    bundle_order_qty: int,
    line_unit_price_override: Optional[float],
    required_stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> BundleExplosionOutput:
    """
    Jedna linia katalogowa zestawu.

    ON_DEMAND_ASSEMBLY: nagłówek komercyjny + komponenty operacyjne + snapshot.
    STOCK_PRODUCTION: nagłówek z linked_product_id (bez linii składników) + snapshot.
    """
    bundle = _load_bundle(db, bundle_id, tenant_id)
    instance_id = str(uuid.uuid4())
    mode = _bundle_operational_mode(bundle)
    snapshots = build_component_snapshots_from_bundle(bundle, bundle_order_qty=int(bundle_order_qty))

    if mode == STOCK_PRODUCTION:
        lines = _explode_stock_production_bundle(
            db,
            bundle,
            bundle_order_qty=int(bundle_order_qty),
            line_unit_price_override=line_unit_price_override,
            required_stock_disposition=required_stock_disposition,
            instance_id=instance_id,
        )
    else:
        lines = _explode_on_demand_bundle(
            bundle,
            bundle_order_qty=int(bundle_order_qty),
            line_unit_price_override=line_unit_price_override,
            required_stock_disposition=required_stock_disposition,
            instance_id=instance_id,
        )

    return BundleExplosionOutput(
        lines=lines,
        snapshots_by_instance={instance_id: snapshots},
    )


def explode_product_line(
    *,
    product: Product,
    quantity: int,
    line_unit_price_override: Optional[float],
    required_stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    product_sales_offer_id: Optional[int] = None,
    offer_name: Optional[str] = None,
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
        required_stock_disposition=normalize_stock_disposition(required_stock_disposition),
        product_sales_offer_id=int(product_sales_offer_id) if product_sales_offer_id is not None else None,
        offer_name=(str(offer_name).strip()[:512] if offer_name and str(offer_name).strip() else None),
    )


def merge_resolved_lines(lines: list[ResolvedOrderLine]) -> list[ResolvedOrderLine]:
    """
    Merge rows that share (product_id, source_bundle_id, bundle_instance_id, is_bundle_parent,
    required_stock_disposition, product_sales_offer_id).
    """
    buckets: dict[tuple[int, Any, Any, bool, str, Any], ResolvedOrderLine] = {}
    order_keys: list[tuple[int, Any, Any, bool, str, Any]] = []
    for row in lines:
        key = (
            row.product_id,
            row.source_bundle_id,
            row.bundle_instance_id,
            row.is_bundle_parent,
            normalize_stock_disposition(row.required_stock_disposition),
            int(row.product_sales_offer_id) if row.product_sales_offer_id is not None else None,
        )
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
                required_stock_disposition=cur.required_stock_disposition,
                product_sales_offer_id=cur.product_sales_offer_id,
                offer_name=cur.offer_name or row.offer_name,
            )
    return [buckets[k] for k in order_keys]


def available_stock_for_disposition(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> float:
    sd = normalize_stock_disposition(stock_disposition)
    q = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0))
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.product_id == product_id,
            Inventory.stock_disposition == sd,
        )
        .scalar()
    )
    return float(q or 0)


def available_stock(db: Session, tenant_id: int, warehouse_id: int, product_id: int) -> float:
    """Legacy helper — sums all dispositions (prefer ``available_stock_for_disposition``)."""
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


def _resolved_line_needs_stock(r: ResolvedOrderLine) -> bool:
    """Linie zużywające stan magazynowy — komponenty ON_DEMAND + parent STOCK_PRODUCTION."""
    if not r.is_bundle_parent:
        return True
    raw = r.metadata_json
    if not raw or not str(raw).strip():
        return False
    try:
        meta = json.loads(raw)
    except json.JSONDecodeError:
        return False
    if not isinstance(meta, dict):
        return False
    mode = normalize_bundle_operational_mode(meta.get("bundle_fulfillment_mode"))
    return mode == STOCK_PRODUCTION


def validate_merged_stock(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    lines: list[ResolvedOrderLine],
) -> None:
    need_by_offer: dict[int, int] = {}
    need_by_disp: dict[tuple[int, str], int] = {}
    for r in lines:
        if not _resolved_line_needs_stock(r):
            continue
        qty = int(r.quantity)
        if getattr(r, "product_sales_offer_id", None) is not None:
            oid = int(r.product_sales_offer_id)
            need_by_offer[oid] = need_by_offer.get(oid, 0) + qty
            continue
        disp = normalize_stock_disposition(r.required_stock_disposition)
        key = (int(r.product_id), disp)
        need_by_disp[key] = need_by_disp.get(key, 0) + qty
    short = []
    from .product_sales_offers import assert_offer_quantity_available, offer_available_qty
    from .product_sales_offers.errors import OfferStockUnavailableError

    for oid, n in need_by_offer.items():
        try:
            assert_offer_quantity_available(
                db,
                offer=oid,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                quantity=float(n),
            )
        except OfferStockUnavailableError as exc:
            short.append(str(exc.detail))
    for (pid, disp), n in need_by_disp.items():
        sd = normalize_stock_disposition(disp)
        if sd == DEFAULT_STOCK_DISPOSITION:
            from .commercial_availability_service import (
                COMMERCIAL_STOCK_UNAVAILABLE_MSG,
                commercially_sellable_qty,
            )

            avail = commercially_sellable_qty(db, tenant_id, warehouse_id, pid)
            if avail + 1e-9 < n:
                short.append(COMMERCIAL_STOCK_UNAVAILABLE_MSG)
                continue
        avail = available_stock_for_disposition(db, tenant_id, warehouse_id, pid, disp)
        if avail + 1e-9 < n:
            short.append(f"product_id={pid} disposition={disp} need={n} available={avail:.0f}")
    if short:
        raise BundleExplosionError("Insufficient stock for bundle / order lines: " + "; ".join(short))


def resolve_order_create_lines(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    raw_lines: list[Any],
    check_bundle_stock: bool,
) -> OrderCreateLinesResult:
    """
    raw_lines: validated OrderCreateLine-like objects with product_id XOR bundle_id.
    """
    from .product_sales_offers import (
        disposition_for_offer,
        get_default_offer_for_product,
        resolve_effective_offer_price,
        resolve_offer_for_order_line,
    )
    from .product_sales_offers.crud_service import ensure_default_offer_for_product

    exploded: list[ResolvedOrderLine] = []
    snapshots_by_instance: dict[str, list[BundleComponentSnapshotDraft]] = {}
    for line in raw_lines:
        qty = int(line.quantity)
        if getattr(line, "bundle_id", None) is not None:
            req_disp = disposition_for_new_order_line(getattr(line, "required_stock_disposition", None))
            out = explode_bundle_line(
                db,
                tenant_id=tenant_id,
                bundle_id=int(line.bundle_id),
                bundle_order_qty=qty,
                line_unit_price_override=line.unit_price,
                required_stock_disposition=req_disp,
            )
            exploded.extend(out.lines)
            snapshots_by_instance.update(out.snapshots_by_instance)
            continue

        offer_id_raw = getattr(line, "offer_id", None)
        if offer_id_raw is not None and int(offer_id_raw) > 0:
            offer = resolve_offer_for_order_line(db, tenant_id=tenant_id, offer_id=int(offer_id_raw))
            p = db.query(Product).filter(Product.id == int(offer.product_id), Product.tenant_id == tenant_id).first()
            if not p:
                raise BundleExplosionError(f"Unknown product for offer: {offer.product_id}")
            unit_override = line.unit_price
            if unit_override is None:
                eff = resolve_effective_offer_price(db, offer)
                unit_override = eff
            exploded.append(
                explode_product_line(
                    product=p,
                    quantity=qty,
                    line_unit_price_override=unit_override,
                    required_stock_disposition=disposition_for_offer(offer),
                    product_sales_offer_id=int(offer.id),
                    offer_name=str(offer.name),
                )
            )
            continue

        pid = int(line.product_id)
        p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tenant_id).first()
        if not p:
            raise BundleExplosionError(f"Unknown product_id or wrong tenant: {pid}")
        offer = get_default_offer_for_product(db, tenant_id=tenant_id, product_id=pid)
        if offer is None:
            offer = ensure_default_offer_for_product(db, product=p)
            db.flush()
        req_disp = disposition_for_offer(offer)
        unit_override = line.unit_price
        if unit_override is None:
            unit_override = resolve_effective_offer_price(db, offer)
        exploded.append(
            explode_product_line(
                product=p,
                quantity=qty,
                line_unit_price_override=unit_override,
                required_stock_disposition=req_disp,
                product_sales_offer_id=int(offer.id),
                offer_name=str(offer.name),
            )
        )
    merged = merge_resolved_lines(exploded)
    if check_bundle_stock:
        validate_merged_stock(db, tenant_id=tenant_id, warehouse_id=warehouse_id, lines=merged)
    return OrderCreateLinesResult(lines=merged, bundle_snapshots_by_instance=snapshots_by_instance)
