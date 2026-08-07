"""Bridge Carton / PackagingMaterial master data ↔ Product for Inventory SSOT."""

from __future__ import annotations

from typing import Optional, Tuple

from sqlalchemy.orm import Session

from ...models.carton import Carton
from ...models.packaging_material import PackagingMaterial
from ...models.product import Product
from .constants import (
    STOCK_ITEM_KIND_CARTON,
    STOCK_ITEM_KIND_PACKAGING,
    WM_KIND_CARTON,
    WM_KIND_PACKAGING,
)


def _sku_for_carton(row: Carton) -> str:
    raw = (getattr(row, "sku", None) or "").strip()
    if raw:
        return raw[:120]
    return f"CARTON-{str(row.id)[:8]}"


def _sku_for_packaging(row: PackagingMaterial) -> str:
    raw = (getattr(row, "sku", None) or "").strip()
    if raw:
        return raw[:120]
    return f"PKG-{str(row.id)[:8]}"


def ensure_carton_stockable_product(db: Session, row: Carton) -> Product:
    """Ensure carton has a linked Product used by Inventory / RW / PZ / MM."""
    pid = getattr(row, "product_id", None)
    if pid is not None:
        prod = db.query(Product).filter(Product.id == int(pid), Product.tenant_id == int(row.tenant_id)).first()
        if prod is not None:
            if (getattr(prod, "stock_item_kind", None) or "") != STOCK_ITEM_KIND_CARTON:
                prod.stock_item_kind = STOCK_ITEM_KIND_CARTON
            if (prod.name or "") != (row.name or ""):
                prod.name = row.name
            return prod

    prod = Product(
        tenant_id=int(row.tenant_id),
        name=str(row.name or "Karton")[:255],
        sku=_sku_for_carton(row),
        ean=(getattr(row, "ean", None) or None),
        stock_item_kind=STOCK_ITEM_KIND_CARTON,
        length=float(row.length_cm) if row.length_cm is not None else None,
        width=float(row.width_cm) if row.width_cm is not None else None,
        height=float(row.height_cm) if row.height_cm is not None else None,
        weight=float(row.weight_kg) if row.weight_kg is not None else None,
        image_url=getattr(row, "image_url", None),
    )
    db.add(prod)
    db.flush()
    row.product_id = int(prod.id)
    return prod


def ensure_packaging_stockable_product(db: Session, row: PackagingMaterial) -> Product:
    pid = getattr(row, "product_id", None)
    if pid is not None:
        prod = db.query(Product).filter(Product.id == int(pid), Product.tenant_id == int(row.tenant_id)).first()
        if prod is not None:
            if (getattr(prod, "stock_item_kind", None) or "") != STOCK_ITEM_KIND_PACKAGING:
                prod.stock_item_kind = STOCK_ITEM_KIND_PACKAGING
            if (prod.name or "") != (row.name or ""):
                prod.name = row.name
            return prod

    prod = Product(
        tenant_id=int(row.tenant_id),
        name=str(row.name or "Materiał pakowy")[:255],
        sku=_sku_for_packaging(row),
        stock_item_kind=STOCK_ITEM_KIND_PACKAGING,
        unit=str(getattr(row, "unit", None) or "pcs")[:32],
        image_url=getattr(row, "image_url", None),
    )
    db.add(prod)
    db.flush()
    row.product_id = int(prod.id)
    return prod


def resolve_product_id_for_wm(db: Session, tenant_id: int, wm_kind: str, wm_id: str) -> Optional[int]:
    k = (wm_kind or "").strip().lower()
    wid = (wm_id or "").strip()
    if not k or not wid:
        return None
    if k == WM_KIND_CARTON:
        row = db.query(Carton).filter(Carton.id == wid, Carton.tenant_id == int(tenant_id)).first()
        if row is None:
            return None
        return int(ensure_carton_stockable_product(db, row).id)
    if k == WM_KIND_PACKAGING:
        row = (
            db.query(PackagingMaterial)
            .filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == int(tenant_id))
            .first()
        )
        if row is None:
            return None
        return int(ensure_packaging_stockable_product(db, row).id)
    return None


def wm_ref_for_product(db: Session, product_id: int) -> Optional[Tuple[str, str]]:
    """Return (wm_kind, wm_id) for a stockable packaging product, else None."""
    carton = db.query(Carton).filter(Carton.product_id == int(product_id)).first()
    if carton is not None:
        return WM_KIND_CARTON, str(carton.id)
    mat = db.query(PackagingMaterial).filter(PackagingMaterial.product_id == int(product_id)).first()
    if mat is not None:
        return WM_KIND_PACKAGING, str(mat.id)
    return None
