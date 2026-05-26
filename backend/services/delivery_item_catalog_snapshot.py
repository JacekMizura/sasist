"""Persist and resolve purchase-order line labels (products + WM) — snapshot-first for stable history."""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from ..models.carton import Carton
from ..models.packaging_material import PackagingMaterial
from ..models.product import Product


def _strip(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    t = str(s).strip()
    return t or None


def build_snapshot_payload(db: Session, tenant_id: int, it: Any) -> Dict[str, Any]:
    """Fields to set on ``DeliveryItem`` from current catalog (call when creating / refreshing a line)."""
    tid = int(tenant_id)
    out: Dict[str, Any] = {}
    if getattr(it, "product_id", None) is not None:
        pid = int(it.product_id)
        p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tid).first()
        out["line_item_type"] = "product"
        out["line_item_ref_id"] = str(pid)
        out["source_label"] = "Produkt"
        if p:
            out["item_name"] = _strip(getattr(p, "name", None))
            sym = _strip(getattr(p, "symbol", None))
            sku_o = _strip(getattr(p, "sku", None))
            out["item_sku"] = sym or sku_o
            out["item_ean"] = _strip(getattr(p, "ean", None))
            out["item_photo_url"] = _strip(getattr(p, "image_url", None))
            out["item_unit"] = _strip(getattr(p, "unit", None))
        return out

    k = (getattr(it, "wm_kind", None) or "").strip().lower()
    wid = (getattr(it, "wm_id", None) or "").strip()
    if k == "carton" and wid:
        c = db.query(Carton).filter(Carton.id == wid, Carton.tenant_id == tid).first()
        out["line_item_type"] = "carton"
        out["line_item_ref_id"] = wid
        out["source_label"] = "Karton"
        out["item_unit"] = "szt."
        if c:
            out["item_name"] = _strip(getattr(c, "name", None))
            sku_o = _strip(getattr(c, "sku", None))
            sku_s = _strip(getattr(c, "supplier_sku", None))
            out["item_sku"] = sku_o or sku_s
            out["item_ean"] = _strip(getattr(c, "ean", None))
            out["item_photo_url"] = _strip(getattr(c, "image_url", None))
        return out

    if k == "packaging" and wid:
        m = db.query(PackagingMaterial).filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == tid).first()
        out["line_item_type"] = "packaging_material"
        out["line_item_ref_id"] = wid
        out["source_label"] = "Materiał pakowy"
        if m:
            out["item_name"] = _strip(getattr(m, "name", None))
            sku_o = _strip(getattr(m, "sku", None))
            sku_s = _strip(getattr(m, "supplier_sku", None))
            out["item_sku"] = sku_o or sku_s
            out["item_ean"] = None
            out["item_photo_url"] = _strip(getattr(m, "image_url", None))
            out["item_unit"] = _strip(getattr(m, "unit", None))
        return out

    out["line_item_type"] = "unknown"
    out["line_item_ref_id"] = None
    out["source_label"] = None
    return out


def hydrate_delivery_item_snapshots(db: Session, tenant_id: int, it: Any) -> None:
    """Write snapshot columns from catalog (before ``commit`` on new lines)."""
    payload = build_snapshot_payload(db, tenant_id, it)
    for key, val in payload.items():
        setattr(it, key, val)


def resolve_delivery_line_display(
    *,
    snapshot_name: Optional[str],
    snapshot_sku: Optional[str],
    snapshot_ean: Optional[str],
    snapshot_photo: Optional[str],
    snapshot_unit: Optional[str],
    source_label: Optional[str],
    live_product_name: Optional[str],
    live_product_symbol: Optional[str],
    live_product_ean: Optional[str],
    live_wm_name: Optional[str],
) -> dict:
    """
    Snapshot-first display fields for API / PDF.
    ``display_name`` is never empty and never ``Produkt #null``.
    """
    name = _strip(snapshot_name) or _strip(live_product_name) or _strip(live_wm_name)
    if not name:
        name = "Pozycja usunięta"
    sku = _strip(snapshot_sku) or _strip(live_product_symbol)
    ean = _strip(snapshot_ean) or _strip(live_product_ean)
    photo = _strip(snapshot_photo)
    unit = _strip(snapshot_unit)
    return {
        "display_name": name,
        "display_sku": sku,
        "display_ean": ean,
        "display_photo_url": photo,
        "display_unit": unit,
        "source_label_resolved": _strip(source_label),
    }
