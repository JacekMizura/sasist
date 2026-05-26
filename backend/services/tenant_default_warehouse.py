"""Single-warehouse convention: resolve tenant's warehouse without client sending warehouse_id."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.tenant import Tenant
from ..models.tenant_warehouse import TenantWarehouse

ERR_NO_WAREHOUSE = "Brak skonfigurowanego magazynu"
ERR_CHOOSE_WAREHOUSE_FOR_DOCUMENT = "Wybierz magazyn dla dokumentu"


def list_tenant_warehouse_ids(db: Session, tenant_id: int) -> list[int]:
    """All warehouse IDs linked to the tenant via TenantWarehouse, ascending order."""
    rows = (
        db.query(TenantWarehouse.warehouse_id)
        .filter(TenantWarehouse.tenant_id == tenant_id)
        .order_by(TenantWarehouse.warehouse_id)
        .all()
    )
    return [int(r[0]) for r in rows]


def resolve_tenant_default_warehouse_id(db: Session, tenant_id: int) -> int:
    """
    Prefer tenants.default_warehouse_id if set and linked to tenant;
    else TenantWarehouse with is_default == 1;
    else lowest warehouse_id linked to tenant.
    """
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        raise ValueError(ERR_NO_WAREHOUSE)

    override = getattr(t, "default_warehouse_id", None)
    if override is not None:
        tw = (
            db.query(TenantWarehouse)
            .filter(TenantWarehouse.tenant_id == tenant_id, TenantWarehouse.warehouse_id == int(override))
            .first()
        )
        if tw:
            return int(override)

    tw_def = (
        db.query(TenantWarehouse)
        .filter(TenantWarehouse.tenant_id == tenant_id, TenantWarehouse.is_default == 1)
        .order_by(TenantWarehouse.warehouse_id)
        .first()
    )
    if tw_def:
        return int(tw_def.warehouse_id)

    tw_any = (
        db.query(TenantWarehouse)
        .filter(TenantWarehouse.tenant_id == tenant_id)
        .order_by(TenantWarehouse.warehouse_id)
        .first()
    )
    if tw_any:
        return int(tw_any.warehouse_id)

    raise ValueError(ERR_NO_WAREHOUSE)


def resolve_quick_pick_warehouse_for_tenant(db: Session, tenant_id: int) -> int:
    """
    Used when ``warehouse_id`` query is missing or invalid for quick-pick.
    Reads ``tenant_warehouses`` (not ``warehouses.tenant_id``).

    - Exactly one row → that warehouse.
    - Several rows → row with ``is_default == 1``; if several marked default, lowest ``warehouse_id``.
    - Several rows and none default → ValueError("Brak domyślnego magazynu").
    - No rows → ValueError (no warehouses linked).
    """
    rows = (
        db.query(TenantWarehouse)
        .filter(TenantWarehouse.tenant_id == int(tenant_id))
        .order_by(TenantWarehouse.warehouse_id)
        .all()
    )
    if not rows:
        raise ValueError("Brak magazynów przypisanych do tenanta.")
    if len(rows) == 1:
        return int(rows[0].warehouse_id)
    defaults = [r for r in rows if int(r.is_default or 0) == 1]
    if len(defaults) == 1:
        return int(defaults[0].warehouse_id)
    if len(defaults) > 1:
        return int(min(defaults, key=lambda r: int(r.warehouse_id)).warehouse_id)
    raise ValueError("Brak domyślnego magazynu")
