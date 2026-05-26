"""Supplier catalog: GET /api/supplier-products/ — products + warehouse materials for a supplier."""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models.carton import Carton
from ..models.inbound_delivery import DeliveryItem, InboundDelivery
from ..models.manufacturer import Manufacturer
from ..models.packaging_material import PackagingMaterial
from ..models.product import Product
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from ..schemas.supplier_products import ManufacturerLinkedOut, SupplierCatalogPriceTier, SupplierProductCatalogItem
from ..services.delivery_line_pricing import pick_unit_net_from_steps, tier_steps_for_catalog_product, tier_steps_for_catalog_wm
from ..services.product_inventory_snapshot_service import _on_hand_visible_by_product, _reserved_by_product
from ..utils.product_vat import product_vat_rate_percent

router = APIRouter(prefix="/supplier-products", tags=["Supplier catalog"])


def _catalog_tier_models(steps: List[Tuple[float, float]]) -> List[SupplierCatalogPriceTier]:
    return [SupplierCatalogPriceTier(qty_from=float(a), unit_net=float(b)) for a, b in steps]


def _manufacturer_name_map(db: Session, pairs: List[Tuple[SupplierProduct, Product]]) -> Dict[int, str]:
    mids = {int(pr.manufacturer_id) for _, pr in pairs if getattr(pr, "manufacturer_id", None) is not None}
    name_by_mid: Dict[int, str] = {}
    if mids:
        for mid, mname in db.query(Manufacturer.id, Manufacturer.name).filter(Manufacturer.id.in_(mids)).all():
            name_by_mid[int(mid)] = (mname or "").strip() or f"#{mid}"
    return name_by_mid


def _catalog_item_from_pair(
    link: SupplierProduct,
    pr: Product,
    supplier_id: int,
    name_by_mid: Dict[int, str],
    stock_on_hand: Optional[float] = None,
    stock_reserved: Optional[float] = None,
) -> SupplierProductCatalogItem:
    ds = getattr(pr, "default_supplier_id", None)
    pp = link.purchase_price
    tier_steps = tier_steps_for_catalog_product(link)
    tier_models = _catalog_tier_models(tier_steps)
    list_at_one, _ = pick_unit_net_from_steps(tier_steps, 1.0)
    display_net = float(list_at_one) if list_at_one is not None else (float(pp) if pp is not None else None)
    moq = link.min_order_qty
    img = (pr.image_url or "").strip() if pr.image_url else None
    mid_raw = getattr(pr, "manufacturer_id", None)
    mid_i = int(mid_raw) if mid_raw is not None else None
    lid = int(link.id)
    return SupplierProductCatalogItem(
        row_uid=f"sp:{supplier_id}:{lid}",
        catalog_kind="product",
        id=lid,
        supplier_id=int(supplier_id),
        product_id=int(pr.id),
        wm_kind=None,
        wm_id=None,
        warehouse_id=None,
        name=(pr.name or "").strip(),
        sku=(pr.symbol or "").strip() or None,
        ean=(pr.ean or "").strip() or None,
        image_url=img or None,
        purchase_price=display_net,
        price_tiers=tier_models,
        lead_time_days=int(link.lead_time_days) if link.lead_time_days is not None else None,
        min_order_qty=float(moq) if moq is not None else None,
        purchase_pack_qty=None,
        free_shipping_threshold_net=None,
        vat_rate=product_vat_rate_percent(getattr(pr, "metadata_json", None)),
        is_default_supplier=bool(ds is not None and int(ds) == int(supplier_id)),
        manufacturer_id=mid_i,
        manufacturer_name=name_by_mid.get(mid_i) if mid_i is not None else None,
        stock_on_hand=stock_on_hand,
        stock_reserved=stock_reserved,
    )


def _wm_carton_catalog_item(c: Carton, supplier_id: int) -> SupplierProductCatalogItem:
    wid = str(c.id).strip()
    wh_id = int(c.warehouse_id)
    prod = getattr(c, "producer", None)
    mid_raw = getattr(c, "producer_id", None)
    mid_i = int(mid_raw) if mid_raw is not None else None
    mname = (getattr(prod, "name", None) or "").strip() or None if prod is not None else None
    hint = getattr(c, "last_purchase_price_net", None)
    if hint is None:
        hint = getattr(c, "purchase_price", None)
    hint_f = float(hint) if hint is not None and float(hint) > 0 else None
    tier_steps = tier_steps_for_catalog_wm(c)
    tier_models = _catalog_tier_models(tier_steps)
    list_at_one, _ = pick_unit_net_from_steps(tier_steps, 1.0)
    list_net = float(list_at_one) if list_at_one is not None else hint_f
    img = (getattr(c, "image_url", None) or "").strip() or None
    sku_own = (getattr(c, "sku", None) or "").strip() or None
    sku_sup = (getattr(c, "supplier_sku", None) or "").strip() or None
    display_sku = sku_own or sku_sup
    vat = float(getattr(c, "vat_rate_pct", 23) or 23)
    moq = getattr(c, "moq", None)
    return SupplierProductCatalogItem(
        row_uid=f"ct:{wh_id}:{wid}",
        catalog_kind="carton",
        id=None,
        supplier_id=int(supplier_id),
        product_id=None,
        wm_kind="carton",
        wm_id=wid,
        warehouse_id=wh_id,
        name=(c.name or "").strip() or "Karton",
        sku=display_sku,
        ean=(getattr(c, "ean", None) or "").strip() or None,
        image_url=img or None,
        purchase_price=list_net,
        price_tiers=tier_models,
        lead_time_days=int(c.lead_time_days) if getattr(c, "lead_time_days", None) is not None else None,
        min_order_qty=float(moq) if moq is not None else None,
        purchase_pack_qty=float(getattr(c, "purchase_pack_qty"))
        if getattr(c, "purchase_pack_qty", None) is not None
        else None,
        free_shipping_threshold_net=float(getattr(c, "free_shipping_threshold_net"))
        if getattr(c, "free_shipping_threshold_net", None) is not None
        else None,
        vat_rate=vat,
        is_default_supplier=True,
        manufacturer_id=mid_i,
        manufacturer_name=mname,
        stock_on_hand=float(getattr(c, "stock", 0) or 0),
        stock_reserved=float(getattr(c, "reserved_qty", 0) or 0),
    )


def _wm_packaging_catalog_item(m: PackagingMaterial, supplier_id: int) -> SupplierProductCatalogItem:
    mid_s = str(m.id).strip()
    wh_id = int(m.warehouse_id)
    prod = getattr(m, "producer", None)
    mid_raw = getattr(m, "producer_id", None)
    mid_i = int(mid_raw) if mid_raw is not None else None
    mname = (getattr(prod, "name", None) or "").strip() or None if prod is not None else None
    hint = getattr(m, "last_purchase_price_net", None)
    if hint is None:
        hint = getattr(m, "purchase_price", None)
    hint_f = float(hint) if hint is not None and float(hint) > 0 else None
    tier_steps = tier_steps_for_catalog_wm(m)
    tier_models = _catalog_tier_models(tier_steps)
    list_at_one, _ = pick_unit_net_from_steps(tier_steps, 1.0)
    list_net = float(list_at_one) if list_at_one is not None else hint_f
    img = (getattr(m, "image_url", None) or "").strip() or None
    sku_own = (getattr(m, "sku", None) or "").strip() or None
    sku_sup = (getattr(m, "supplier_sku", None) or "").strip() or None
    display_sku = sku_own or sku_sup
    vat = float(getattr(m, "vat_rate_pct", 23) or 23)
    moq = getattr(m, "moq", None)
    return SupplierProductCatalogItem(
        row_uid=f"pk:{wh_id}:{mid_s}",
        catalog_kind="packaging",
        id=None,
        supplier_id=int(supplier_id),
        product_id=None,
        wm_kind="packaging",
        wm_id=mid_s,
        warehouse_id=wh_id,
        name=(m.name or "").strip() or "Materiał pakowy",
        sku=display_sku,
        ean=None,
        image_url=img or None,
        purchase_price=list_net,
        price_tiers=tier_models,
        lead_time_days=int(m.lead_time_days) if getattr(m, "lead_time_days", None) is not None else None,
        min_order_qty=float(moq) if moq is not None else None,
        purchase_pack_qty=float(getattr(m, "purchase_pack_qty"))
        if getattr(m, "purchase_pack_qty", None) is not None
        else None,
        free_shipping_threshold_net=float(getattr(m, "free_shipping_threshold_net"))
        if getattr(m, "free_shipping_threshold_net", None) is not None
        else None,
        vat_rate=vat,
        is_default_supplier=True,
        manufacturer_id=mid_i,
        manufacturer_name=mname,
        stock_on_hand=float(getattr(m, "stock", 0) or 0),
        stock_reserved=float(getattr(m, "reserved_qty", 0) or 0),
    )


def _normalize_catalog_scope(raw: Optional[str]) -> str:
    s = (raw or "all").strip().lower()
    if s in ("products", "cartons", "packaging", "all"):
        return s
    return "all"


@router.get("/top", response_model=List[SupplierProductCatalogItem])
def list_supplier_top_products(
    tenant_id: int = Query(..., ge=1),
    supplier_id: int = Query(..., ge=1),
    manufacturer_id: Optional[int] = Query(
        None,
        ge=1,
        description="When set, only top products from this manufacturer (same as main catalog filter).",
    ),
    db: Session = Depends(get_db),
):
    """
    Up to **5** products in this supplier's catalog with the highest historical order volume.

    Based on ``delivery_items`` joined to ``deliveries`` for this tenant and supplier,
    excluding **draft** and **cancelled** deliveries. Ranked by total ``quantity_ordered``,
    then by number of order lines. Cheap: aggregate limited to 50 product ids before catalog join.
    """
    sup = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()
    if not sup:
        return []

    stats_subq = (
        db.query(
            DeliveryItem.product_id.label("pid"),
            func.count(DeliveryItem.id).label("n_lines"),
            func.coalesce(func.sum(DeliveryItem.quantity_ordered), 0).label("tot_qty"),
        )
        .join(InboundDelivery, InboundDelivery.id == DeliveryItem.delivery_id)
        .filter(
            InboundDelivery.tenant_id == tenant_id,
            InboundDelivery.supplier_id == supplier_id,
            InboundDelivery.status.notin_(["draft", "cancelled"]),
            DeliveryItem.product_id.isnot(None),
        )
        .group_by(DeliveryItem.product_id)
    ).subquery()

    ranked = (
        db.query(stats_subq.c.pid, stats_subq.c.n_lines, stats_subq.c.tot_qty)
        .order_by(stats_subq.c.tot_qty.desc(), stats_subq.c.n_lines.desc())
        .limit(50)
        .all()
    )
    pids_ordered = [int(r.pid) for r in ranked if r.pid is not None]
    if not pids_ordered:
        return []

    q = (
        db.query(SupplierProduct, Product)
        .join(Product, Product.id == SupplierProduct.product_id)
        .filter(
            SupplierProduct.supplier_id == supplier_id,
            Product.tenant_id == tenant_id,
            SupplierProduct.product_id.in_(pids_ordered),
        )
    )
    if manufacturer_id is not None:
        q = q.filter(Product.manufacturer_id == manufacturer_id)

    pairs = q.all()
    name_by_mid = _manufacturer_name_map(db, pairs)
    pids_tenant = [int(pr.id) for _, pr in pairs]
    on_h = _on_hand_visible_by_product(db, tenant_id, None, pids_tenant)
    resv = _reserved_by_product(db, tenant_id, None, pids_tenant)
    by_pid = {int(pr.id): (link, pr) for link, pr in pairs}

    out: List[SupplierProductCatalogItem] = []
    for pid in pids_ordered:
        pair = by_pid.get(pid)
        if not pair:
            continue
        link, pr = pair
        pr_id = int(pr.id)
        out.append(
            _catalog_item_from_pair(
                link,
                pr,
                supplier_id,
                name_by_mid,
                stock_on_hand=on_h.get(pr_id),
                stock_reserved=resv.get(pr_id),
            )
        )
        if len(out) >= 5:
            break
    return out


@router.get("/", response_model=List[SupplierProductCatalogItem])
def list_supplier_products(
    tenant_id: int = Query(..., ge=1),
    supplier_id: int = Query(..., ge=1),
    search: Optional[str] = Query(
        None,
        description="Optional filter: name, SKU, supplier SKU, or EAN (products only for EAN).",
    ),
    manufacturer_id: Optional[int] = Query(
        None,
        ge=1,
        description="Manufacturer filter: product.manufacturer_id or WM producer_id.",
    ),
    catalog_scope: str = Query(
        "all",
        description="products | cartons | packaging | all — which catalog sections to return.",
    ),
    db: Session = Depends(get_db),
):
    """
    Supplier offer: linked **products** and/or **warehouse materials** (cartons, packaging)
    assigned to this supplier in any warehouse of the tenant.
    """
    sup = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()
    if not sup:
        return []

    scope = _normalize_catalog_scope(catalog_scope)
    term = f"%{search.strip()}%" if search and search.strip() else None
    out: List[SupplierProductCatalogItem] = []

    if scope in ("products", "all"):
        q = (
            db.query(SupplierProduct, Product)
            .join(Product, Product.id == SupplierProduct.product_id)
            .filter(
                SupplierProduct.supplier_id == supplier_id,
                Product.tenant_id == tenant_id,
            )
            .order_by(Product.name.asc())
        )
        if manufacturer_id is not None:
            q = q.filter(Product.manufacturer_id == manufacturer_id)
        if term:
            q = q.filter(
                or_(
                    Product.name.ilike(term),
                    Product.symbol.ilike(term),
                    Product.ean.ilike(term),
                )
            )
        pairs = q.all()
        name_by_mid = _manufacturer_name_map(db, pairs)
        pids = [int(pr.id) for _, pr in pairs]
        on_h = _on_hand_visible_by_product(db, tenant_id, None, pids)
        resv = _reserved_by_product(db, tenant_id, None, pids)
        for link, pr in pairs:
            out.append(
                _catalog_item_from_pair(
                    link,
                    pr,
                    supplier_id,
                    name_by_mid,
                    stock_on_hand=on_h.get(int(pr.id)),
                    stock_reserved=resv.get(int(pr.id)),
                )
            )

    if scope in ("cartons", "all"):
        cq = (
            db.query(Carton)
            .options(joinedload(Carton.producer), selectinload(Carton.price_tiers))
            .filter(Carton.tenant_id == int(tenant_id), Carton.supplier_id == int(supplier_id))
            .order_by(Carton.name.asc())
        )
        if manufacturer_id is not None:
            cq = cq.filter(Carton.producer_id == int(manufacturer_id))
        if term:
            cq = cq.filter(
                or_(
                    Carton.name.ilike(term),
                    func.coalesce(Carton.sku, "").ilike(term),
                    func.coalesce(Carton.supplier_sku, "").ilike(term),
                )
            )
        for c in cq.all():
            out.append(_wm_carton_catalog_item(c, supplier_id))

    if scope in ("packaging", "all"):
        pq = (
            db.query(PackagingMaterial)
            .options(joinedload(PackagingMaterial.producer), selectinload(PackagingMaterial.price_tiers))
            .filter(PackagingMaterial.tenant_id == int(tenant_id), PackagingMaterial.supplier_id == int(supplier_id))
            .order_by(PackagingMaterial.name.asc())
        )
        if manufacturer_id is not None:
            pq = pq.filter(PackagingMaterial.producer_id == int(manufacturer_id))
        if term:
            pq = pq.filter(
                or_(
                    PackagingMaterial.name.ilike(term),
                    func.coalesce(PackagingMaterial.sku, "").ilike(term),
                    func.coalesce(PackagingMaterial.supplier_sku, "").ilike(term),
                )
            )
        for m in pq.all():
            out.append(_wm_packaging_catalog_item(m, supplier_id))

    out.sort(key=lambda x: (x.name or "").lower())
    return out


@router.get("/linked-manufacturers", response_model=List[ManufacturerLinkedOut])
def list_supplier_linked_manufacturers(
    tenant_id: int = Query(..., ge=1),
    supplier_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Manufacturers present on this supplier's catalog (products + WM rows), for PO filters."""
    sup = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()
    if not sup:
        return []
    mids: set[int] = set()
    pairs = (
        db.query(SupplierProduct, Product)
        .join(Product, Product.id == SupplierProduct.product_id)
        .filter(SupplierProduct.supplier_id == supplier_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .all()
    )
    for _, pr in pairs:
        mid = getattr(pr, "manufacturer_id", None)
        if mid is not None:
            mids.add(int(mid))
    for c in (
        db.query(Carton)
        .filter(Carton.tenant_id == tenant_id, Carton.supplier_id == supplier_id)
        .all()
    ):
        pid = getattr(c, "producer_id", None)
        if pid is not None:
            mids.add(int(pid))
    for m in (
        db.query(PackagingMaterial)
        .filter(PackagingMaterial.tenant_id == tenant_id, PackagingMaterial.supplier_id == supplier_id)
        .all()
    ):
        pid = getattr(m, "producer_id", None)
        if pid is not None:
            mids.add(int(pid))
    if not mids:
        return []
    rows = (
        db.query(Manufacturer)
        .filter(Manufacturer.tenant_id == tenant_id, Manufacturer.id.in_(sorted(mids)))
        .order_by(Manufacturer.name.asc())
        .all()
    )
    return [
        ManufacturerLinkedOut(id=int(m.id), name=(m.name or "").strip() or f"#{m.id}", active=bool(m.active))
        for m in rows
    ]
