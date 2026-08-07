"""Increase / decrease packaging stock via Inventory (shared WMS engine).

Legacy scalar ``cartons.stock`` / ``packaging_materials.stock`` are deprecated.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.carton import Carton
from ..models.packaging_material import PackagingMaterial
from .packaging_materials.inventory_apply import (
    apply_packaging_inventory_issue,
    apply_packaging_inventory_receive,
)
from .packaging_materials.stockable_bridge import (
    ensure_carton_stockable_product,
    ensure_packaging_stockable_product,
)

_EPS = 1e-9


def apply_wm_catalog_receive_delta(
    db: Session,
    tenant_id: int,
    wm_kind: str,
    wm_id: str,
    qty: float,
    *,
    purchase_price_net: float | None = None,
    vat_rate_pct: float | None = None,
    supplier_id: int | None = None,
    purchase_at: Optional[datetime] = None,
    warehouse_id: int | None = None,
    location_id: int | None = None,
) -> None:
    k = (wm_kind or "").strip().lower()
    wid = (wm_id or "").strip()
    if not k or not wid or float(qty or 0) <= _EPS:
        return
    q = float(qty)

    if k == "carton":
        c = db.query(Carton).filter(Carton.id == wid, Carton.tenant_id == int(tenant_id)).first()
        if not c:
            raise ValueError(f"Karton {wid} nie został znaleziony dla tej firmy")
        ensure_carton_stockable_product(db, c)
        wh = int(warehouse_id if warehouse_id is not None else c.warehouse_id)
        apply_packaging_inventory_receive(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh,
            wm_kind=k,
            wm_id=wid,
            qty=q,
            location_id=location_id,
            location_label=getattr(c, "location_label", None),
        )
        if purchase_price_net is not None:
            c.last_purchase_price_net = float(purchase_price_net)
            vr = float(vat_rate_pct if vat_rate_pct is not None else 23.0)
            c.last_purchase_price_gross = float(purchase_price_net) * (1.0 + vr / 100.0)
        if purchase_at is not None:
            c.last_purchased_at = purchase_at
        if supplier_id is not None:
            c.supplier_id = int(supplier_id)
    elif k == "packaging":
        m = (
            db.query(PackagingMaterial)
            .filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == int(tenant_id))
            .first()
        )
        if not m:
            raise ValueError(f"Materiał opakowaniowy {wid} nie został znaleziony dla tej firmy")
        ensure_packaging_stockable_product(db, m)
        wh = int(warehouse_id if warehouse_id is not None else m.warehouse_id)
        apply_packaging_inventory_receive(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh,
            wm_kind=k,
            wm_id=wid,
            qty=q,
            location_id=location_id,
            location_label=getattr(m, "location_label", None),
        )
        if purchase_price_net is not None:
            m.last_purchase_price_net = float(purchase_price_net)
            vr = float(vat_rate_pct if vat_rate_pct is not None else 23.0)
            m.last_purchase_price_gross = float(purchase_price_net) * (1.0 + vr / 100.0)
        if purchase_at is not None:
            m.last_purchased_at = purchase_at
        if supplier_id is not None:
            m.supplier_id = int(supplier_id)
    else:
        raise ValueError(f"Nieobsługiwany typ materiału magazynowego: {wm_kind}")


def update_wm_catalog_last_purchase_metadata(
    db: Session,
    tenant_id: int,
    wm_kind: str,
    wm_id: str,
    *,
    purchase_price_net: float,
    vat_rate_pct: float | None = None,
    supplier_id: int | None = None,
    purchase_at: Optional[datetime] = None,
) -> None:
    """When cały przyjęty towar poszedł od razu na rozlokowanie (to_dock=0), nadal zapisz ostatnią cenę zakupu."""
    k = (wm_kind or "").strip().lower()
    wid = (wm_id or "").strip()
    if not k or not wid:
        return
    if k == "carton":
        c = db.query(Carton).filter(Carton.id == wid, Carton.tenant_id == int(tenant_id)).first()
        if not c:
            return
        ensure_carton_stockable_product(db, c)
        c.last_purchase_price_net = float(purchase_price_net)
        vr = float(vat_rate_pct if vat_rate_pct is not None else 23.0)
        c.last_purchase_price_gross = float(purchase_price_net) * (1.0 + vr / 100.0)
        if purchase_at is not None:
            c.last_purchased_at = purchase_at
        if supplier_id is not None:
            c.supplier_id = int(supplier_id)
    elif k == "packaging":
        m = (
            db.query(PackagingMaterial)
            .filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == int(tenant_id))
            .first()
        )
        if not m:
            return
        ensure_packaging_stockable_product(db, m)
        m.last_purchase_price_net = float(purchase_price_net)
        vr = float(vat_rate_pct if vat_rate_pct is not None else 23.0)
        m.last_purchase_price_gross = float(purchase_price_net) * (1.0 + vr / 100.0)
        if purchase_at is not None:
            m.last_purchased_at = purchase_at
        if supplier_id is not None:
            m.supplier_id = int(supplier_id)


def revert_wm_catalog_receive_delta(
    db: Session,
    tenant_id: int,
    wm_kind: str,
    wm_id: str,
    qty: float,
    *,
    warehouse_id: int | None = None,
) -> None:
    k = (wm_kind or "").strip().lower()
    wid = (wm_id or "").strip()
    if not k or not wid or float(qty or 0) <= _EPS:
        return
    q = float(qty)
    if k == "carton":
        c = db.query(Carton).filter(Carton.id == wid, Carton.tenant_id == int(tenant_id)).first()
        if not c:
            raise ValueError(f"Karton {wid} nie znaleziony — nie można cofnąć przyjęcia")
        product = ensure_carton_stockable_product(db, c)
        wh = int(warehouse_id if warehouse_id is not None else c.warehouse_id)
        apply_packaging_inventory_issue(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh,
            product_id=int(product.id),
            qty=q,
            allow_negative=False,
        )
    elif k == "packaging":
        m = (
            db.query(PackagingMaterial)
            .filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == int(tenant_id))
            .first()
        )
        if not m:
            raise ValueError(f"Materiał {wid} nie znaleziony — nie można cofnąć przyjęcia")
        product = ensure_packaging_stockable_product(db, m)
        wh = int(warehouse_id if warehouse_id is not None else m.warehouse_id)
        apply_packaging_inventory_issue(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh,
            product_id=int(product.id),
            qty=q,
            allow_negative=False,
        )
    else:
        raise ValueError(f"Nieobsługiwany typ materiału magazynowego: {wm_kind}")
