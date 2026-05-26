"""Resolve display + image for stock document / WMS receipt lines (products + WM catalog)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Optional

from sqlalchemy.orm import Session

from ..models.carton import Carton
from ..models.packaging_material import PackagingMaterial
from ..models.product import Product

if TYPE_CHECKING:
    from ..models.inbound_delivery import DeliveryItem
    from ..models.stock_document import StockDocumentItem

ReceiptItemType = Literal["product", "carton", "packaging_material"]


def _strip(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    t = str(s).strip()
    return t or None


def _product_sku(p: Product) -> Optional[str]:
    for attr in ("sku", "symbol"):
        v = getattr(p, attr, None)
        if v is not None:
            t = str(v).strip()
            if t:
                return t
    return None


@dataclass(frozen=True)
class ReceiptLineVisuals:
    item_type: Optional[ReceiptItemType]
    item_id: Optional[str]
    name: str
    sku: Optional[str]
    ean: Optional[str]
    image_url: Optional[str]
    unit: Optional[str]
    """WM lines: set received on read so putaway_completed is true without bin putaway."""
    putaway_quantity_read_override: Optional[float] = None


def resolve_receipt_line_visuals(
    db: Session,
    tenant_id: int,
    row: "StockDocumentItem",
    di: Optional["DeliveryItem"],
    p: Optional[Product],
) -> ReceiptLineVisuals:
    """
    Snapshot-first (delivery line), then live catalog.

    Used for GET stock documents / WMS receiving so workers see photos for cartons + packaging.
    """
    tid = int(tenant_id)

    snap_name = _strip(getattr(di, "item_name", None)) if di else None
    snap_sku = _strip(getattr(di, "item_sku", None)) if di else None
    snap_ean = _strip(getattr(di, "item_ean", None)) if di else None
    snap_photo = _strip(getattr(di, "item_photo_url", None)) if di else None
    snap_unit = _strip(getattr(di, "item_unit", None)) if di else None

    pid = getattr(row, "product_id", None)
    if pid is not None:
        item_type: Optional[ReceiptItemType] = "product"
        item_id = str(int(pid))
        name = snap_name or (_strip(getattr(p, "name", None)) if p else None) or "Pozycja"
        sku = snap_sku or (_product_sku(p) if p else None)
        ean = snap_ean or (_strip(getattr(p, "ean", None)) if p else None)
        img = snap_photo or (_strip(getattr(p, "image_url", None)) if p else None)
        unit = snap_unit or (_strip(getattr(p, "unit", None)) if p else None)
        return ReceiptLineVisuals(
            item_type=item_type,
            item_id=item_id,
            name=name,
            sku=sku,
            ean=ean,
            image_url=img,
            unit=unit,
            putaway_quantity_read_override=None,
        )

    k = (getattr(row, "wm_kind", None) or "").strip().lower()
    wid = (getattr(row, "wm_id", None) or "").strip()
    if k in ("carton", "packaging") and wid:
        itype: ReceiptItemType = "packaging_material" if k == "packaging" else "carton"
        put_ov = float(getattr(row, "received_quantity", 0) or 0)
        if k == "carton":
            c = db.query(Carton).filter(Carton.id == wid, Carton.tenant_id == tid).first()
            name = snap_name or (_strip(getattr(c, "name", None)) if c else None) or "Karton"
            sku_o = _strip(getattr(c, "sku", None)) if c else None
            sku_s = _strip(getattr(c, "supplier_sku", None)) if c else None
            sku = snap_sku or sku_o or sku_s
            ean = snap_ean or (_strip(getattr(c, "ean", None)) if c else None)
            live_img = _strip(getattr(c, "image_url", None)) if c else None
            img = snap_photo or live_img
            unit = snap_unit or "szt."
            return ReceiptLineVisuals(
                item_type=itype,
                item_id=wid,
                name=name,
                sku=sku,
                ean=ean,
                image_url=img,
                unit=unit,
                putaway_quantity_read_override=put_ov,
            )
        m = db.query(PackagingMaterial).filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == tid).first()
        name = snap_name or (_strip(getattr(m, "name", None)) if m else None) or "Materiał pakowy"
        sku_o = _strip(getattr(m, "sku", None)) if m else None
        sku_s = _strip(getattr(m, "supplier_sku", None)) if m else None
        sku = snap_sku or sku_o or sku_s
        ean = snap_ean
        live_img = _strip(getattr(m, "image_url", None)) if m else None
        img = snap_photo or live_img
        unit = snap_unit or (_strip(getattr(m, "unit", None)) if m else None)
        return ReceiptLineVisuals(
            item_type=itype,
            item_id=wid,
            name=name,
            sku=sku,
            ean=ean,
            image_url=img,
            unit=unit,
            putaway_quantity_read_override=put_ov,
        )

    # Fallback (orphan line)
    return ReceiptLineVisuals(
        item_type=None,
        item_id=None,
        name=snap_name or "Pozycja",
        sku=snap_sku,
        ean=snap_ean,
        image_url=snap_photo,
        unit=snap_unit,
        putaway_quantity_read_override=None,
    )
