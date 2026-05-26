"""Increase / decrease carton + packaging_materials.stock from supplier receipts (PZ)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.carton import Carton
from ..models.packaging_material import PackagingMaterial

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
        c.stock = float(c.stock or 0) + q
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
        m.stock = float(m.stock or 0) + q
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
        new_s = float(c.stock or 0) - q
        if new_s < -1e-5:
            raise ValueError("Niewystarczający stan kartonów do cofnięcia przyjęcia")
        c.stock = max(0.0, new_s)
    elif k == "packaging":
        m = (
            db.query(PackagingMaterial)
            .filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == int(tenant_id))
            .first()
        )
        if not m:
            raise ValueError(f"Materiał {wid} nie znaleziony — nie można cofnąć przyjęcia")
        new_s = float(m.stock or 0) - q
        if new_s < -1e-5:
            raise ValueError("Niewystarczający stan materiału do cofnięcia przyjęcia")
        m.stock = max(0.0, new_s)
    else:
        raise ValueError(f"Nieobsługiwany typ materiału magazynowego: {wm_kind}")
