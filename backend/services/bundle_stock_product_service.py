"""B1 — Auto shadow Product for STOCK bundles (UX simplification; inventory unchanged)."""

from __future__ import annotations

import json
import logging
from typing import Any, Literal, Optional

from sqlalchemy import func, inspect, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.bundle import Bundle, BundleItem
from ..models.product import Product
from ..models.product_composition import ProductComposition, ProductCompositionLine
from ..schemas.composition import CompositionLineWrite
from .bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION, normalize_bundle_operational_mode
from .composition_engine_service import CompositionError, _deactivate_siblings

logger = logging.getLogger(__name__)

SHADOW_META_FLAG = "is_bundle_stock_shadow"
SHADOW_BUNDLE_ID_KEY = "shadow_bundle_id"
SyncAction = Literal["create", "update"]

# Mirrors PostgreSQL uq_product_tenant_ean — applies to all product rows (incl. soft-deleted).
EAN_CONFLICT_MESSAGE = "EAN jest już używany przez inny produkt."
SKU_CONFLICT_MESSAGE = "SKU jest już używany przez inny produkt."


class BundleStockProductError(Exception):
    def __init__(self, message: str, *, code: str = "bundle_stock_product") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _log_sync(
    *,
    bundle_id: int,
    linked_product_id: Optional[int],
    action: SyncAction,
    product_id: Optional[int],
) -> None:
    logger.info(
        "[BUNDLE_STOCK_SYNC] bundle_id=%s linked_product_id=%s action=%s product_id=%s",
        bundle_id,
        linked_product_id if linked_product_id is not None else "NULL",
        action,
        product_id if product_id is not None else "NULL",
    )


def _meta_dict(raw: Any) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def is_bundle_stock_shadow_product(product: Product) -> bool:
    return bool(_meta_dict(getattr(product, "metadata_json", None)).get(SHADOW_META_FLAG))


def shadow_bundle_id_from_product(product: Product) -> Optional[int]:
    raw = _meta_dict(getattr(product, "metadata_json", None)).get(SHADOW_BUNDLE_ID_KEY)
    if raw is None:
        return None
    try:
        bid = int(raw)
        return bid if bid > 0 else None
    except (TypeError, ValueError):
        return None


def _set_shadow_metadata(product: Product, *, bundle_id: int) -> None:
    meta = _meta_dict(getattr(product, "metadata_json", None))
    meta[SHADOW_META_FLAG] = True
    meta[SHADOW_BUNDLE_ID_KEY] = int(bundle_id)
    product.metadata_json = json.dumps(meta, ensure_ascii=False)


def _strip_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _bundle_operational_mode(bundle: Bundle) -> str:
    return normalize_bundle_operational_mode(
        str(getattr(bundle, "bundle_fulfillment_mode", None) or ON_DEMAND_ASSEMBLY),
        stock_mode=getattr(bundle, "stock_mode", None),
        fulfillment_mode=getattr(bundle, "fulfillment_mode", None),
    )


def _normalize_identifier(value: Any) -> Optional[str]:
    return _strip_str(value)


def _product_ean_matches(column_ean, normalized_ean: str):
    """Case-insensitive trimmed match — application-level; DB stores stripped values on sync."""
    return func.lower(func.trim(func.coalesce(column_ean, ""))) == normalized_ean.lower()


def _product_sku_or_symbol_matches(normalized_sku: str):
    sku_low = normalized_sku.lower()
    return or_(
        func.lower(func.trim(func.coalesce(Product.sku, ""))) == sku_low,
        func.lower(func.trim(func.coalesce(Product.symbol, ""))) == sku_low,
    )


def map_product_integrity_error(exc: IntegrityError) -> None:
    """Map unhandled products UNIQUE violations to BundleStockProductError (HTTP 400)."""
    orig = getattr(exc, "orig", None)
    detail = str(orig or exc)
    detail_lower = detail.lower()
    if "uq_product_tenant_ean" in detail_lower or (
        "unique" in detail_lower and "ean" in detail_lower and "products" in detail_lower
    ):
        raise BundleStockProductError(EAN_CONFLICT_MESSAGE, code="ean_conflict") from exc
    raise exc


def _postgres_products_sequence_state(db: Session) -> str:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return "n/a"
    try:
        row = db.execute(text("SELECT last_value, is_called FROM products_id_seq")).fetchone()
        if row is not None:
            return f"last_value={int(row[0])} is_called={bool(row[1])}"
    except Exception as exc:
        return f"error({type(exc).__name__}: {exc})"
    return "unknown"


def _log_shadow_resolve_decision(
    db: Session,
    *,
    bundle_id: int,
    linked_product_id: Optional[int],
    action: SyncAction,
    product_id: Optional[int],
    resolve_reason: str,
) -> None:
    max_product_id = db.query(func.max(Product.id)).scalar()
    logger.info(
        "[BUNDLE_STOCK_CREATE] action=%s bundle_id=%s linked_product_id=%s resolve=%s "
        "generated_product_id=%s sequence_value=%s max_product_id=%s",
        action,
        bundle_id,
        linked_product_id if linked_product_id is not None else "NULL",
        resolve_reason,
        product_id if product_id is not None else "pending",
        _postgres_products_sequence_state(db),
        max_product_id if max_product_id is not None else "NULL",
    )


def _validate_identifier_uniqueness(
    db: Session,
    *,
    tenant_id: int,
    sku: Optional[str],
    ean: Optional[str],
    exclude_product_id: Optional[int] = None,
    exclude_bundle_id: Optional[int] = None,
) -> None:
    """
    Pre-flush identifier checks for shadow product sync.

    Product EAN: mirrors DB ``uq_product_tenant_ean (tenant_id, ean)`` — includes soft-deleted rows.
    Product SKU/symbol: application-level only (no products-table UNIQUE on sku/symbol in schema).
    Bundle EAN/SKU: active bundles only (no bundle-table UNIQUE constraints in schema).
    """
    sku_n = _normalize_identifier(sku)
    ean_n = _normalize_identifier(ean)
    if not sku_n and not ean_n:
        return

    if ean_n:
        pq = db.query(Product.id).filter(
            Product.tenant_id == int(tenant_id),
            _product_ean_matches(Product.ean, ean_n),
        )
        if exclude_product_id is not None:
            pq = pq.filter(Product.id != int(exclude_product_id))
        if pq.first() is not None:
            raise BundleStockProductError(EAN_CONFLICT_MESSAGE, code="ean_conflict")

        bq = db.query(Bundle.id).filter(
            Bundle.tenant_id == int(tenant_id),
            Bundle.deleted_at.is_(None),
            _product_ean_matches(Bundle.ean, ean_n),
        )
        if exclude_bundle_id is not None:
            bq = bq.filter(Bundle.id != int(exclude_bundle_id))
        bconflict = bq.first()
        if bconflict is not None:
            raise BundleStockProductError(
                f"EAN „{ean_n}” jest już używany przez zestaw #{int(bconflict[0])}.",
                code="ean_conflict",
            )

    if sku_n:
        pq = db.query(Product.id).filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
            _product_sku_or_symbol_matches(sku_n),
        )
        if exclude_product_id is not None:
            pq = pq.filter(Product.id != int(exclude_product_id))
        if pq.first() is not None:
            raise BundleStockProductError(SKU_CONFLICT_MESSAGE, code="sku_conflict")

        bq = db.query(Bundle.id).filter(
            Bundle.tenant_id == int(tenant_id),
            Bundle.deleted_at.is_(None),
            func.lower(func.trim(func.coalesce(Bundle.sku, ""))) == sku_n.lower(),
        )
        if exclude_bundle_id is not None:
            bq = bq.filter(Bundle.id != int(exclude_bundle_id))
        bconflict = bq.first()
        if bconflict is not None:
            raise BundleStockProductError(
                f"SKU „{sku_n}” jest już używany przez zestaw #{int(bconflict[0])}.",
                code="sku_conflict",
            )


def _sync_bundle_fields_to_product(bundle: Bundle, product: Product) -> None:
    product.name = str(bundle.name or "").strip() or product.name
    sku = _strip_str(bundle.sku)
    product.sku = sku
    product.symbol = sku
    product.ean = _strip_str(bundle.ean)
    if bundle.sale_price is not None:
        product.sale_price = bundle.sale_price
    if bundle.image_url:
        product.image_url = str(bundle.image_url).strip() or None
    if getattr(bundle, "length_mm", None) is not None:
        product.length = float(bundle.length_mm)
    if getattr(bundle, "width_mm", None) is not None:
        product.width = float(bundle.width_mm)
    if getattr(bundle, "height_mm", None) is not None:
        product.height = float(bundle.height_mm)
    if getattr(bundle, "weight_kg", None) is not None:
        product.weight = float(bundle.weight_kg)
    l_, w_, h_ = product.length or 0, product.width or 0, product.height or 0
    if l_ and w_ and h_:
        product.volume = (l_ * w_ * h_) / 1000.0
    if getattr(bundle, "extra_cost_packaging_net", None) is not None:
        product.extra_cost_packaging_net = bundle.extra_cost_packaging_net
    _set_shadow_metadata(product, bundle_id=int(bundle.id))


def _load_product_by_id(db: Session, *, product_id: int, tenant_id: int) -> Optional[Product]:
    product = db.get(Product, int(product_id))
    if product is None:
        return None
    if int(product.tenant_id) != int(tenant_id):
        raise BundleStockProductError(
            f"Powiązany produkt #{int(product_id)} należy do innego tenant.",
            code="tenant_mismatch",
        )
    return product


def _find_shadow_product_by_bundle_id(db: Session, *, tenant_id: int, bundle_id: int) -> Optional[Product]:
    """Fallback when linked_product_id is NULL but shadow product already exists (orphan / failed commit)."""
    candidates = (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.metadata_json.isnot(None),
            or_(
                Product.metadata_json.like(f'%"shadow_bundle_id": {int(bundle_id)}%'),
                Product.metadata_json.like(f'%"shadow_bundle_id":{int(bundle_id)}%'),
            ),
        )
        .all()
    )
    for product in candidates:
        if shadow_bundle_id_from_product(product) == int(bundle_id):
            return product
    return None


def _bundle_items(db: Session, bundle: Bundle) -> list[BundleItem]:
    """Fresh items after PUT delete/re-add (relationship cache may be stale)."""
    if bundle.id is None:
        return list(bundle.items or [])
    return (
        db.query(BundleItem)
        .filter(BundleItem.bundle_id == int(bundle.id))
        .order_by(BundleItem.sort_order.asc(), BundleItem.id.asc())
        .all()
    )


def _composition_lines_from_bundle_items(items: list[BundleItem]) -> list[CompositionLineWrite]:
    out: list[CompositionLineWrite] = []
    for idx, it in enumerate(sorted(items, key=lambda x: (x.sort_order or 0, x.id or 0))):
        out.append(
            CompositionLineWrite(
                component_product_id=int(it.product_id),
                quantity=float(int(it.quantity or 1)),
                waste_percent=0.0,
                sort_order=int(it.sort_order or idx),
            )
        )
    return out


def _sync_manufacturing_composition(db: Session, bundle: Bundle, product_id: int) -> None:
    items = _bundle_items(db, bundle)
    if not items:
        return
    lines = _composition_lines_from_bundle_items(items)
    for ln in lines:
        if int(ln.component_product_id) == int(product_id):
            raise BundleStockProductError(
                "Kompozycja nie może zawierać gotowego SKU jako składnika.",
                code="self_reference",
            )

    comp = (
        db.query(ProductComposition)
        .filter(
            ProductComposition.tenant_id == int(bundle.tenant_id),
            ProductComposition.product_id == int(product_id),
            ProductComposition.composition_mode == "manufacturing",
            ProductComposition.is_active.is_(True),
        )
        .first()
    )
    comp_name = f"{str(bundle.name or 'Zestaw').strip()} — BOM"
    if comp is None:
        comp = ProductComposition(
            tenant_id=int(bundle.tenant_id),
            product_id=int(product_id),
            composition_mode="manufacturing",
            name=comp_name,
            version="1",
            yield_quantity=1.0,
            is_active=True,
        )
        db.add(comp)
        db.flush()
    else:
        comp.name = comp_name

    comp.lines.clear()
    for idx, ln in enumerate(lines):
        comp.lines.append(
            ProductCompositionLine(
                component_product_id=int(ln.component_product_id),
                quantity=float(ln.quantity),
                waste_percent=0.0,
                sort_order=int(ln.sort_order if ln.sort_order is not None else idx),
            )
        )
    comp.is_active = True
    _deactivate_siblings(db, comp)
    db.flush()


def _resolve_shadow_product(db: Session, bundle: Bundle) -> tuple[Product, SyncAction]:
    """
    Resolve existing shadow product (UPDATE) or create new one (INSERT).

    Order:
    1. bundles.linked_product_id → db.get(Product)
    2. metadata shadow_bundle_id fallback (orphan shadow after partial save)
    3. INSERT new Product (only when no existing shadow)
    """
    tenant_id = int(bundle.tenant_id)
    bundle_id = int(bundle.id)
    linked_raw = getattr(bundle, "linked_product_id", None)

    if linked_raw is not None and int(linked_raw) > 0:
        product = _load_product_by_id(db, product_id=int(linked_raw), tenant_id=tenant_id)
        if product is not None:
            _log_shadow_resolve_decision(
                db,
                bundle_id=bundle_id,
                linked_product_id=int(linked_raw),
                action="update",
                product_id=int(product.id),
                resolve_reason="linked_product_id_hit",
            )
            return product, "update"

    product = _find_shadow_product_by_bundle_id(db, tenant_id=tenant_id, bundle_id=bundle_id)
    if product is not None:
        bundle.linked_product_id = int(product.id)
        _log_shadow_resolve_decision(
            db,
            bundle_id=bundle_id,
            linked_product_id=int(linked_raw) if linked_raw is not None else None,
            action="update",
            product_id=int(product.id),
            resolve_reason="shadow_bundle_id_metadata_hit",
        )
        return product, "update"

    _log_shadow_resolve_decision(
        db,
        bundle_id=bundle_id,
        linked_product_id=int(linked_raw) if linked_raw is not None else None,
        action="create",
        product_id=None,
        resolve_reason="insert_new_no_linked_no_shadow",
    )
    product = Product(
        tenant_id=tenant_id,
        name=str(bundle.name or "").strip() or f"Zestaw #{bundle_id}",
    )
    db.add(product)
    try:
        db.flush()
    except IntegrityError as exc:
        _log_shadow_resolve_decision(
            db,
            bundle_id=bundle_id,
            linked_product_id=int(linked_raw) if linked_raw is not None else None,
            action="create",
            product_id=getattr(product, "id", None),
            resolve_reason="insert_flush_failed_products_pkey",
        )
        raise
    _log_shadow_resolve_decision(
        db,
        bundle_id=bundle_id,
        linked_product_id=int(linked_raw) if linked_raw is not None else None,
        action="create",
        product_id=int(product.id),
        resolve_reason="insert_new_flushed",
    )
    return product, "create"


def ensure_shadow_product_for_stock_bundle(db: Session, bundle: Bundle) -> Optional[int]:
    """
    For STOCK_PRODUCTION: create or sync shadow Product and set bundle.linked_product_id.
    For ON_DEMAND: clear linked_product_id (shadow product remains for history).
    Returns linked product id or None.
    """
    mode = _bundle_operational_mode(bundle)
    if mode != STOCK_PRODUCTION:
        bundle.linked_product_id = None
        return None

    linked_before = getattr(bundle, "linked_product_id", None)
    product, action = _resolve_shadow_product(db, bundle)

    _validate_identifier_uniqueness(
        db,
        tenant_id=int(bundle.tenant_id),
        sku=_strip_str(bundle.sku),
        ean=_strip_str(bundle.ean),
        exclude_product_id=int(product.id),
        exclude_bundle_id=int(bundle.id) if bundle.id else None,
    )

    # Never db.add() on persistent product — UPDATE path only mutates attributes.
    state = inspect(product)
    if action == "update" and not state.persistent:
        raise BundleStockProductError(
            f"Shadow product #{product.id} nie jest przypięty do sesji — błąd synchronizacji.",
            code="session_state",
        )

    _sync_bundle_fields_to_product(bundle, product)
    bundle.linked_product_id = int(product.id)

    _log_sync(
        bundle_id=int(bundle.id),
        linked_product_id=int(linked_before) if linked_before is not None else None,
        action=action,
        product_id=int(product.id),
    )

    try:
        _sync_manufacturing_composition(db, bundle, int(product.id))
    except CompositionError as exc:
        raise BundleStockProductError(str(exc.message), code=str(exc.code)) from exc

    logger.info(
        "[BUNDLE_SAVE] stage=shadow_product_done bundle_id=%s action=%s product_id=%s",
        int(bundle.id),
        action,
        int(product.id),
    )

    return int(product.id)


def apply_stock_bundle_product_adapter(db: Session, bundle: Bundle) -> None:
    """Hook after bundle persist — idempotent."""
    ensure_shadow_product_for_stock_bundle(db, bundle)
