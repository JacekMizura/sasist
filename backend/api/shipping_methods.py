"""CRUD for centralized shipping methods (tenant + warehouse scoped)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.shipping_method import ShippingMethod
from ..schemas.shipping_method import (
    ShippingMethodCreate,
    ShippingMethodRead,
    ShippingMethodUpdate,
    shipping_method_row_to_read,
)
from ..services.shipping_method_service import (
    OTHER_CODE,
    OTHER_NAME,
    SHIPPING_METHOD_LIST_SORT_INDEX,
    allowed_shipping_method_codes,
    CANONICAL_DISPLAY_NAME_BY_CODE,
    dump_aliases_json,
    ensure_canonical_carriers_for_warehouse,
    get_or_create_other_method,
    normalize_code,
)

router = APIRouter(prefix="/shipping-methods", tags=["Shipping methods"])


@router.get("/", response_model=list[ShippingMethodRead])
def list_shipping_methods(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    active_only: bool = Query(False, description="If true, only is_active=true"),
    db: Session = Depends(get_db),
):
    get_or_create_other_method(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    ensure_canonical_carriers_for_warehouse(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    db.commit()
    q = db.query(ShippingMethod).filter(
        ShippingMethod.tenant_id == int(tenant_id),
        ShippingMethod.warehouse_id == int(warehouse_id),
    )
    if active_only:
        q = q.filter(ShippingMethod.is_active.is_(True))
    rows = list(q.all())

    def _sort_key(m: ShippingMethod) -> tuple[int, str]:
        cc = (getattr(m, "code", None) or "").strip().upper()
        return (SHIPPING_METHOD_LIST_SORT_INDEX.get(cc, 999), (m.name or "").lower())

    rows.sort(key=_sort_key)
    return [shipping_method_row_to_read(x) for x in rows]


@router.post("/", response_model=ShippingMethodRead, status_code=201)
def create_shipping_method(body: ShippingMethodCreate, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=400,
        detail="Tworzenie nowych metod jest wyłączone — słownik to wyłącznie przewoźnicy (InPost, DPD, DHL, Orlen Paczka, Allegro One, Temu) oraz „Inne”. Edytuj aliasy i logo na liście.",
    )


@router.put("/{method_id}/", response_model=ShippingMethodRead)
def update_shipping_method(
    method_id: str,
    body: ShippingMethodUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ShippingMethod)
        .filter(
            ShippingMethod.id == str(method_id).strip(),
            ShippingMethod.tenant_id == int(tenant_id),
            ShippingMethod.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono metody dostawy.")
    prev_code = (getattr(row, "code", None) or "").strip().upper()
    if body.code is not None:
        nc = normalize_code(body.code)
        if not nc:
            raise HTTPException(status_code=400, detail="code cannot be empty")
        if prev_code == OTHER_CODE and nc != OTHER_CODE:
            raise HTTPException(status_code=400, detail="Nie można zmienić kodu metody domyślnej (OTHER).")
        if nc != prev_code:
            if nc not in allowed_shipping_method_codes():
                raise HTTPException(
                    status_code=400,
                    detail="Dozwolone kody metod to: OTHER, INPOST, DPD, DHL, ORLEN_PACZKA, ALLEGRO_ONE, Temu.",
                )
            clash = (
                db.query(ShippingMethod)
                .filter(
                    ShippingMethod.tenant_id == int(tenant_id),
                    ShippingMethod.warehouse_id == int(warehouse_id),
                    ShippingMethod.code == nc,
                    ShippingMethod.id != row.id,
                )
                .first()
            )
            if clash:
                raise HTTPException(status_code=409, detail="Metoda o tym kodzie już istnieje.")
        row.code = nc
    if body.name is not None:
        nn = body.name.strip()
        if not nn:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        fixed_carrier = CANONICAL_DISPLAY_NAME_BY_CODE.get(prev_code)
        if fixed_carrier is not None and nn != fixed_carrier:
            raise HTTPException(
                status_code=400,
                detail=f"Nazwa przewoźnika jest ustalona: „{fixed_carrier}”.",
            )
        if prev_code == OTHER_CODE and nn != OTHER_NAME:
            raise HTTPException(status_code=400, detail="Nie można zmienić nazwy metody „Inne”.")
        clash = (
            db.query(ShippingMethod)
            .filter(
                ShippingMethod.tenant_id == int(tenant_id),
                ShippingMethod.warehouse_id == int(warehouse_id),
                ShippingMethod.name == nn,
                ShippingMethod.id != row.id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="Metoda o tej nazwie już istnieje.")
        row.name = nn[:256]
    if body.aliases is not None:
        row.aliases_json = dump_aliases_json(body.aliases)
    if body.logo_url is not None:
        row.logo_url = (body.logo_url or "").strip() or None
    if body.is_active is not None:
        row.is_active = bool(body.is_active)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return shipping_method_row_to_read(row)


@router.delete("/{method_id}/")
def delete_shipping_method(
    method_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ShippingMethod)
        .filter(
            ShippingMethod.id == str(method_id).strip(),
            ShippingMethod.tenant_id == int(tenant_id),
            ShippingMethod.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono metody dostawy.")
    rc = (getattr(row, "code", None) or "").strip().upper()
    if rc in allowed_shipping_method_codes():
        raise HTTPException(
            status_code=400,
            detail="Nie można usunąć metody ze słownika przewoźników — tylko edycja aliasów i logo.",
        )
    db.delete(row)
    db.commit()
    return {"ok": True}
