"""CRUD for virtual product bundles (no inventory)."""

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.bundle import Bundle, BundleItem
from ..models.inventory import Inventory
from ..models.product import Product
from ..schemas.bundle import (
    BundleBulkDeleteBody,
    BundleCreateBody,
    BundleExpandLine,
    BundleExpandResponse,
    BundleItemRead,
    BundleRead,
    BundleUpdateBody,
)
from ..schemas.entity_delete import EntityBulkDeleteResult, entity_bulk_delete_result_from_service_dict
from ..services.bundle_operational_mode import (
    legacy_fields_for_mode,
    normalize_bundle_operational_mode,
)
from ..services.bundle_pricing_service import compute_bundle_pricing, component_purchase_prices
from ..services.bundle_stock_product_service import (
    BundleStockProductError,
    apply_stock_bundle_product_adapter,
    map_product_integrity_error,
)
from ..services.delete_service import delete_bundle_transaction, delete_bundles_bulk_transaction

router = APIRouter(prefix="/bundles", tags=["Bundles"])
logger = logging.getLogger(__name__)


def _inventory_qty_by_product_ids(db: Session, tenant_id: int, product_ids: List[int]) -> Dict[int, int]:
    """Single aggregated query: SUM(inventory.quantity) per product (same semantics as product list)."""
    if not product_ids:
        return {}
    rows = (
        db.query(Inventory.product_id, func.sum(Inventory.quantity).label("qty"))
        .filter(Inventory.tenant_id == tenant_id, Inventory.product_id.in_(product_ids))
        .group_by(Inventory.product_id)
        .all()
    )
    out: Dict[int, int] = {}
    for r in rows:
        q = r.qty
        out[int(r.product_id)] = int(round(float(q))) if q is not None else 0
    return out


def _compute_calculated_stock(items: List[BundleItem], stock_map: Dict[int, int]) -> Optional[int]:
    """min(floor(stock / required_qty)) over components; None if no items."""
    if not items:
        return None
    parts: List[int] = []
    for it in sorted(items, key=lambda x: (x.sort_order or 0, x.id or 0)):
        pid = int(it.product_id)
        req = max(1, int(it.quantity or 1))
        st = int(stock_map.get(pid, 0))
        parts.append(st // req)
    return min(parts) if parts else None


def _operational_mode_from_bundle(b: Bundle) -> str:
    raw = getattr(b, "bundle_fulfillment_mode", None)
    return normalize_bundle_operational_mode(
        str(raw) if raw is not None else None,
        stock_mode=getattr(b, "stock_mode", None),
        fulfillment_mode=getattr(b, "fulfillment_mode", None),
    )


def _resolve_operational_mode_from_body(body) -> str:
    explicit = getattr(body, "bundle_fulfillment_mode", None)
    if explicit:
        return normalize_bundle_operational_mode(
            str(explicit),
            stock_mode=getattr(body, "stock_mode", None),
            fulfillment_mode=getattr(body, "fulfillment_mode", None),
        )
    return normalize_bundle_operational_mode(
        None,
        stock_mode=getattr(body, "stock_mode", None),
        fulfillment_mode=getattr(body, "fulfillment_mode", None),
    )


def _apply_operational_mode(bundle: Bundle, mode: str) -> None:
    stock_mode, fulfillment_mode = legacy_fields_for_mode(mode)
    bundle.bundle_fulfillment_mode = mode
    bundle.stock_mode = stock_mode
    bundle.fulfillment_mode = fulfillment_mode


def _serialize_bundle(db: Session, b: Bundle, stock_map: Dict[int, int]) -> BundleRead:
    raw_items = list(b.items or [])
    product_ids = [int(it.product_id) for it in raw_items]
    pricing = compute_bundle_pricing(db, int(b.tenant_id), b)
    purchase_by_pid = component_purchase_prices(db, int(b.tenant_id), product_ids)
    items_out: List[BundleItemRead] = []
    for it in sorted(raw_items, key=lambda x: (x.sort_order, x.id)):
        p = it.product
        pid = int(it.product_id)
        pst = int(stock_map.get(pid, 0))
        meta_raw = getattr(it, "metadata_json", None)
        meta_s = str(meta_raw).strip() if meta_raw is not None and str(meta_raw).strip() else None
        items_out.append(
            BundleItemRead(
                id=it.id,
                product_id=pid,
                quantity=int(it.quantity),
                sort_order=int(it.sort_order or 0),
                product_name=p.name if p else None,
                product_sku=(p.sku or p.symbol) if p else None,
                product_stock=pst,
                product_purchase_price=purchase_by_pid.get(pid),
                metadata_json=meta_s,
            )
        )
    calc = _compute_calculated_stock(raw_items, stock_map)
    img = (getattr(b, "image_url", None) or "").strip() or None
    meta_raw = getattr(b, "metadata_json", None)
    meta_s = str(meta_raw).strip() if meta_raw is not None and str(meta_raw).strip() else None
    operational_mode = _operational_mode_from_bundle(b)
    stock_mode, fulfillment_mode = legacy_fields_for_mode(operational_mode)
    linked_pid = getattr(b, "linked_product_id", None)
    linked_pid_int = int(linked_pid) if linked_pid is not None else None
    physical_stock = (
        int(stock_map.get(linked_pid_int, 0))
        if linked_pid_int is not None and operational_mode == "STOCK_PRODUCTION"
        else None
    )
    packaging_stored = float(getattr(b, "extra_cost_packaging_net", 0) or 0)
    production_stored = float(getattr(b, "production_cost_net", 0) or 0)
    return BundleRead(
        id=b.id,
        tenant_id=b.tenant_id,
        name=b.name,
        sku=b.sku,
        ean=b.ean,
        sale_price=float(b.sale_price) if b.sale_price is not None else None,
        extra_cost_packaging_net=packaging_stored,
        production_cost_net=production_stored,
        purchase_cost=pricing.get("purchase_cost"),
        materials_cost=pricing.get("materials_cost"),
        packaging_cost=pricing.get("packaging_cost"),
        production_cost=pricing.get("production_cost"),
        total_cost=pricing.get("total_cost"),
        selling_price_net=pricing.get("selling_price_net"),
        selling_price_gross=pricing.get("selling_price_gross"),
        margin_value=pricing.get("margin_value"),
        margin_percent=pricing.get("margin_percent"),
        active=bool(b.active),
        image_url=img,
        length_mm=float(b.length_mm) if getattr(b, "length_mm", None) is not None else None,
        width_mm=float(b.width_mm) if getattr(b, "width_mm", None) is not None else None,
        height_mm=float(b.height_mm) if getattr(b, "height_mm", None) is not None else None,
        weight_kg=float(b.weight_kg) if getattr(b, "weight_kg", None) is not None else None,
        metadata_json=meta_s,
        bundle_fulfillment_mode=operational_mode,
        fulfillment_mode=fulfillment_mode,
        stock_mode=stock_mode,
        linked_product_id=linked_pid_int,
        physical_stock=physical_stock,
        calculated_stock=calc,
        items=items_out,
    )


def _validate_bundle_items(db: Session, tenant_id: int, items: list) -> None:
    if not items:
        return
    pids = {int(it.product_id) for it in items}
    rows = (
        db.query(Product.id, Product.tenant_id)
        .filter(Product.id.in_(pids))
        .all()
    )
    by_id = {int(r.id): int(r.tenant_id) for r in rows}
    missing = [pid for pid in pids if pid not in by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown product_id: {missing}")
    wrong = [pid for pid in pids if by_id.get(pid) != int(tenant_id)]
    if wrong:
        raise HTTPException(status_code=400, detail=f"Products not in tenant: {wrong}")


def _normalize_active_filter(v: str) -> str:
    s = (v or "active").strip().lower()
    if s in ("all", "active", "inactive"):
        return s
    return "active"


@router.get("/", response_model=List[BundleRead])
def list_bundles(
    tenant_id: int = Query(..., ge=1),
    search: Optional[str] = Query(None, description="Match name, sku, or ean (partial); ignored if name or ean_sku set"),
    name: Optional[str] = Query(None, description="Filter by name (partial); AND with ean_sku when both set"),
    ean_sku: Optional[str] = Query(None, description="Filter by SKU or EAN (partial); AND with name when both set"),
    active_filter: str = Query(
        "active",
        description="active | inactive | all",
    ),
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    stock_min: Optional[int] = Query(None, ge=0),
    stock_max: Optional[int] = Query(None, ge=0),
    db: Session = Depends(get_db),
):
    af = _normalize_active_filter(active_filter)
    q = db.query(Bundle).filter(Bundle.tenant_id == tenant_id, Bundle.deleted_at.is_(None))
    if af == "active":
        q = q.filter(Bundle.active.is_(True))
    elif af == "inactive":
        q = q.filter(Bundle.active.is_(False))

    has_split = (name and name.strip()) or (ean_sku and ean_sku.strip())
    if has_split:
        if name and name.strip():
            q = q.filter(Bundle.name.ilike(f"%{name.strip()}%"))
        if ean_sku and ean_sku.strip():
            t = f"%{ean_sku.strip()}%"
            q = q.filter(or_(Bundle.sku.ilike(t), Bundle.ean.ilike(t)))
    elif search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(Bundle.name.ilike(term), Bundle.sku.ilike(term), Bundle.ean.ilike(term)))

    if price_min is not None:
        q = q.filter(Bundle.sale_price.isnot(None), Bundle.sale_price >= float(price_min))
    if price_max is not None:
        q = q.filter(Bundle.sale_price.isnot(None), Bundle.sale_price <= float(price_max))

    rows = q.options(joinedload(Bundle.items).joinedload(BundleItem.product)).order_by(Bundle.name).all()

    all_pids: List[int] = []
    for b in rows:
        lp = getattr(b, "linked_product_id", None)
        if lp is not None:
            all_pids.append(int(lp))
        for it in b.items or []:
            all_pids.append(int(it.product_id))
    stock_map = _inventory_qty_by_product_ids(db, tenant_id, list(set(all_pids)))

    out: List[BundleRead] = []
    for b in rows:
        br = _serialize_bundle(db, b, stock_map)
        cs = br.calculated_stock
        eff = 0 if cs is None else int(cs)
        if stock_min is not None and eff < int(stock_min):
            continue
        if stock_max is not None and eff > int(stock_max):
            continue
        out.append(br)
    return out


@router.post("/bulk-delete", response_model=EntityBulkDeleteResult)
def bundles_bulk_delete(body: BundleBulkDeleteBody, db: Session = Depends(get_db)):
    result = delete_bundles_bulk_transaction(db, int(body.tenant_id), body.ids)
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)


@router.get("/{bundle_id}/expand", response_model=BundleExpandResponse)
def expand_bundle(
    bundle_id: int,
    tenant_id: int = Query(..., ge=1),
    quantity: int = Query(1, ge=1, le=999999),
    db: Session = Depends(get_db),
):
    b = (
        db.query(Bundle)
        .options(joinedload(Bundle.items).joinedload(BundleItem.product))
        .filter(Bundle.id == bundle_id, Bundle.tenant_id == tenant_id)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if getattr(b, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if not b.active:
        raise HTTPException(status_code=400, detail="Bundle is inactive")
    items = sorted(b.items or [], key=lambda x: (x.sort_order, x.id))
    if not items:
        raise HTTPException(status_code=400, detail="Bundle has no components")
    lines: List[BundleExpandLine] = []
    for bi in items:
        p = bi.product
        if not p:
            raise HTTPException(status_code=400, detail=f"Component product {bi.product_id} missing")
        lines.append(
            BundleExpandLine(
                product_id=p.id,
                product_name=p.name,
                sku=p.sku or p.symbol,
                quantity=int(bi.quantity) * int(quantity),
            )
        )
    return BundleExpandResponse(
        bundle_id=b.id,
        bundle_name=b.name,
        quantity=quantity,
        lines=lines,
    )


@router.get("/{bundle_id}", response_model=BundleRead)
def get_bundle(
    bundle_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    b = (
        db.query(Bundle)
        .options(joinedload(Bundle.items).joinedload(BundleItem.product))
        .filter(Bundle.id == bundle_id, Bundle.tenant_id == tenant_id)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if getattr(b, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Bundle not found")
    pids = [int(it.product_id) for it in (b.items or [])]
    lp = getattr(b, "linked_product_id", None)
    if lp is not None:
        pids.append(int(lp))
    stock_map = _inventory_qty_by_product_ids(db, tenant_id, pids)
    return _serialize_bundle(db, b, stock_map)


def _apply_stock_adapter_or_http(db: Session, bundle: Bundle) -> None:
    try:
        apply_stock_bundle_product_adapter(db, bundle)
    except BundleStockProductError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    except IntegrityError as exc:
        db.rollback()
        try:
            map_product_integrity_error(exc)
        except BundleStockProductError as mapped:
            raise HTTPException(status_code=400, detail=mapped.message) from mapped
        raise HTTPException(status_code=400, detail="Konflikt identyfikatora produktu.") from exc


@router.get("/{bundle_id}/warehouse-stock")
def get_bundle_warehouse_stock(
    bundle_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    """Magazyn gotowego zestawu STOCK — payload jak GET /products/{id}/ (B1 UX)."""
    from ..services.product_detail_service import build_product_detail_payload

    b = db.query(Bundle).filter(Bundle.id == bundle_id, Bundle.tenant_id == tenant_id).first()
    if not b or getattr(b, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if _operational_mode_from_bundle(b) != STOCK_PRODUCTION:
        raise HTTPException(status_code=400, detail="Bundle is not STOCK_PRODUCTION")
    lp = getattr(b, "linked_product_id", None)
    if lp is None or int(lp) <= 0:
        raise HTTPException(
            status_code=409,
            detail="Zapisz zestaw w trybie produkcji magazynowej, aby zobaczyć stan.",
        )
    return build_product_detail_payload(
        db,
        product_id=int(lp),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
    )


@router.post("/", response_model=BundleRead, status_code=201)
def create_bundle(body: BundleCreateBody, db: Session = Depends(get_db)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Bundle must have at least one component")
    _validate_bundle_items(db, body.tenant_id, body.items)
    img = (body.image_url or "").strip() or None if body.image_url is not None else None
    meta = (body.metadata_json or "").strip() or None if body.metadata_json is not None else None
    operational_mode = _resolve_operational_mode_from_body(body)
    b = Bundle(
        tenant_id=body.tenant_id,
        name=body.name.strip(),
        sku=(body.sku or "").strip() or None,
        ean=(body.ean or "").strip() or None,
        sale_price=body.sale_price,
        extra_cost_packaging_net=body.extra_cost_packaging_net,
        production_cost_net=body.production_cost_net,
        active=bool(body.active),
        image_url=img,
        length_mm=body.length_mm,
        width_mm=body.width_mm,
        height_mm=body.height_mm,
        weight_kg=body.weight_kg,
        metadata_json=meta,
    )
    _apply_operational_mode(b, operational_mode)
    db.add(b)
    db.flush()
    for it in body.items:
        db.add(
            BundleItem(
                bundle_id=b.id,
                product_id=int(it.product_id),
                quantity=int(it.quantity),
                sort_order=int(it.sort_order),
            )
        )
    db.flush()
    _apply_stock_adapter_or_http(db, b)
    db.commit()
    b = (
        db.query(Bundle)
        .options(joinedload(Bundle.items).joinedload(BundleItem.product))
        .filter(Bundle.id == b.id)
        .first()
    )
    pids = [int(x.product_id) for x in (b.items or [])]
    lp = getattr(b, "linked_product_id", None)
    if lp is not None:
        pids.append(int(lp))
    stock_map = _inventory_qty_by_product_ids(db, body.tenant_id, pids)
    return _serialize_bundle(db, b, stock_map)


@router.put("/{bundle_id}", response_model=BundleRead)
def update_bundle(
    bundle_id: int,
    body: BundleUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    linked_before = None
    b = db.query(Bundle).filter(Bundle.id == bundle_id, Bundle.tenant_id == tenant_id).first()
    if b:
        linked_before = getattr(b, "linked_product_id", None)
    logger.info(
        "[BUNDLE_SAVE] stage=start bundle_id=%s tenant_id=%s mode=%s linked_product_id=%s item_count=%s",
        bundle_id,
        tenant_id,
        getattr(body, "bundle_fulfillment_mode", None),
        linked_before if linked_before is not None else "NULL",
        len(body.items or []),
    )
    if not b:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if getattr(b, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if not body.items:
        raise HTTPException(status_code=400, detail="Bundle must have at least one component")
    _validate_bundle_items(db, tenant_id, body.items)
    operational_mode = _resolve_operational_mode_from_body(body)
    b.name = body.name.strip()
    b.sku = (body.sku or "").strip() or None
    b.ean = (body.ean or "").strip() or None
    b.sale_price = body.sale_price
    b.extra_cost_packaging_net = body.extra_cost_packaging_net
    b.production_cost_net = body.production_cost_net
    b.active = bool(body.active)
    if body.image_url is not None:
        b.image_url = (body.image_url or "").strip() or None
    b.length_mm = body.length_mm
    b.width_mm = body.width_mm
    b.height_mm = body.height_mm
    b.weight_kg = body.weight_kg
    if body.metadata_json is not None:
        b.metadata_json = (body.metadata_json or "").strip() or None
    _apply_operational_mode(b, operational_mode)
    db.query(BundleItem).filter(BundleItem.bundle_id == b.id).delete(synchronize_session=False)
    for it in body.items:
        db.add(
            BundleItem(
                bundle_id=b.id,
                product_id=int(it.product_id),
                quantity=int(it.quantity),
                sort_order=int(it.sort_order),
            )
        )
    db.flush()
    logger.info(
        "[BUNDLE_SAVE] stage=items_flushed bundle_id=%s linked_product_id=%s",
        bundle_id,
        getattr(b, "linked_product_id", None) if getattr(b, "linked_product_id", None) is not None else "NULL",
    )
    logger.info("[BUNDLE_SAVE] stage=shadow_product bundle_id=%s", bundle_id)
    _apply_stock_adapter_or_http(db, b)
    logger.info(
        "[BUNDLE_SAVE] stage=bom_sync bundle_id=%s linked_product_id=%s",
        bundle_id,
        getattr(b, "linked_product_id", None) if getattr(b, "linked_product_id", None) is not None else "NULL",
    )
    logger.info("[BUNDLE_SAVE] stage=commit bundle_id=%s", bundle_id)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.exception(
            "[BUNDLE_SAVE] stage=commit_failed bundle_id=%s linked_product_id=%s exc_type=%s exc=%s",
            bundle_id,
            getattr(b, "linked_product_id", None) if getattr(b, "linked_product_id", None) is not None else "NULL",
            type(exc).__name__,
            exc,
        )
        try:
            map_product_integrity_error(exc)
        except BundleStockProductError as mapped:
            raise HTTPException(status_code=400, detail=mapped.message) from mapped
        raise HTTPException(status_code=400, detail="Konflikt identyfikatora produktu.") from exc
    except Exception as exc:
        logger.exception(
            "[BUNDLE_SAVE] stage=commit_failed bundle_id=%s linked_product_id=%s exc_type=%s exc=%s",
            bundle_id,
            getattr(b, "linked_product_id", None) if getattr(b, "linked_product_id", None) is not None else "NULL",
            type(exc).__name__,
            exc,
        )
        raise
    logger.info(
        "[BUNDLE_SAVE] stage=commit_ok bundle_id=%s linked_product_id=%s",
        bundle_id,
        getattr(b, "linked_product_id", None),
    )
    b = (
        db.query(Bundle)
        .options(joinedload(Bundle.items).joinedload(BundleItem.product))
        .filter(Bundle.id == bundle_id)
        .first()
    )
    pids = [int(x.product_id) for x in (b.items or [])]
    lp = getattr(b, "linked_product_id", None)
    if lp is not None:
        pids.append(int(lp))
    stock_map = _inventory_qty_by_product_ids(db, tenant_id, pids)
    logger.info("[BUNDLE_SAVE] stage=pricing_sync bundle_id=%s", bundle_id)
    return _serialize_bundle(db, b, stock_map)


@router.delete("/{bundle_id}", response_model=EntityBulkDeleteResult)
def delete_bundle(
    bundle_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    result = delete_bundle_transaction(db, tenant_id, bundle_id)
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)
