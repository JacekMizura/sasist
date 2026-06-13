"""User warehouse assignments + active warehouse context (multi-WH foundation)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..auth.roles import is_super_role
from ..auth.warehouse_access_config import wms_warehouse_assignment_enforcement_enabled
from ..models.app_user import AppUser, UserWmsProfile
from ..models.user_warehouse_assignment import UserWarehouseAssignment
from ..models.warehouse import Warehouse
from .app_user_admin_service import ensure_wms_profile


class UserWarehouseAccessError(HTTPException):
    def __init__(self, detail: str = "Brak dostępu do tego magazynu.") -> None:
        super().__init__(status_code=403, detail=detail)


def _assignment_rows(db: Session, user_id: int) -> list[UserWarehouseAssignment]:
    return (
        db.query(UserWarehouseAssignment)
        .filter(UserWarehouseAssignment.user_id == int(user_id))
        .order_by(UserWarehouseAssignment.is_default.desc(), UserWarehouseAssignment.warehouse_id.asc())
        .all()
    )


def has_explicit_assignments(db: Session, user_id: int) -> bool:
    return (
        db.query(UserWarehouseAssignment.id)
        .filter(UserWarehouseAssignment.user_id == int(user_id))
        .limit(1)
        .first()
        is not None
    )


def _legacy_all_warehouses_fallback(db: Session) -> list[int]:
    return [int(r[0]) for r in db.query(Warehouse.id).order_by(Warehouse.id.asc()).all()]


def list_operable_warehouse_ids(db: Session, user: AppUser) -> list[int]:
    """Warehouse IDs the user may operate on. No assignments → empty when enforcement on."""
    if is_super_role(user.role):
        return _legacy_all_warehouses_fallback(db)

    rows = _assignment_rows(db, int(user.id))
    if not rows:
        if wms_warehouse_assignment_enforcement_enabled():
            return []
        return _legacy_all_warehouses_fallback(db)

    return sorted(
        {
            int(r.warehouse_id)
            for r in rows
            if bool(r.can_operate)
        }
    )


def list_operable_warehouses(db: Session, user: AppUser) -> list[Warehouse]:
    ids = list_operable_warehouse_ids(db, user)
    if not ids:
        return []
    return (
        db.query(Warehouse)
        .filter(Warehouse.id.in_(ids))
        .order_by(Warehouse.name.asc(), Warehouse.id.asc())
        .all()
    )


def user_can_operate_warehouse(db: Session, user: AppUser, warehouse_id: int) -> bool:
    wid = int(warehouse_id)
    if wid <= 0:
        return False
    if is_super_role(user.role):
        return db.query(Warehouse.id).filter(Warehouse.id == wid).first() is not None
    if not has_explicit_assignments(db, int(user.id)):
        if wms_warehouse_assignment_enforcement_enabled():
            return False
        return db.query(Warehouse.id).filter(Warehouse.id == wid).first() is not None
    row = (
        db.query(UserWarehouseAssignment)
        .filter(
            UserWarehouseAssignment.user_id == int(user.id),
            UserWarehouseAssignment.warehouse_id == wid,
            UserWarehouseAssignment.can_operate.is_(True),
        )
        .first()
    )
    return row is not None


def assert_user_can_operate_warehouse(db: Session, user: AppUser, warehouse_id: int) -> None:
    if not user_can_operate_warehouse(db, user, int(warehouse_id)):
        raise UserWarehouseAccessError()


def default_assignment_warehouse_id(db: Session, user_id: int, operable_ids: list[int]) -> int | None:
    if not operable_ids:
        return None
    row = (
        db.query(UserWarehouseAssignment.warehouse_id)
        .filter(
            UserWarehouseAssignment.user_id == int(user_id),
            UserWarehouseAssignment.is_default.is_(True),
            UserWarehouseAssignment.can_operate.is_(True),
        )
        .first()
    )
    if row is not None and int(row[0]) in operable_ids:
        return int(row[0])
    profile = db.query(UserWmsProfile).filter(UserWmsProfile.user_id == int(user_id)).first()
    if profile is not None and profile.default_warehouse_id is not None:
        dw = int(profile.default_warehouse_id)
        if dw in operable_ids:
            return dw
    return operable_ids[0]


def resolve_active_warehouse_id(db: Session, user: AppUser) -> int | None:
    operable = list_operable_warehouse_ids(db, user)
    if not operable:
        return None
    profile = ensure_wms_profile(db, int(user.id))
    active = getattr(profile, "active_warehouse_id", None)
    if active is not None and int(active) in operable:
        return int(active)
    wid = default_assignment_warehouse_id(db, int(user.id), operable)
    if wid is not None:
        profile.active_warehouse_id = int(wid)
        db.flush()
    return wid


def set_active_warehouse(db: Session, user: AppUser, warehouse_id: int) -> int:
    wid = int(warehouse_id)
    assert_user_can_operate_warehouse(db, user, wid)
    profile = ensure_wms_profile(db, int(user.id))
    profile.active_warehouse_id = wid
    db.flush()
    return wid


def ensure_active_warehouse_on_login(db: Session, user: AppUser) -> int | None:
    return resolve_active_warehouse_id(db, user)


def sync_user_warehouse_assignments(
    db: Session,
    *,
    user_id: int,
    warehouse_ids: list[int],
    default_warehouse_id: int | None = None,
) -> None:
    """Replace assignments for admin user edit (from WMS profile warehouse_ids)."""
    db.query(UserWarehouseAssignment).filter(UserWarehouseAssignment.user_id == int(user_id)).delete(
        synchronize_session=False
    )
    seen: set[int] = set()
    ordered: list[int] = []
    for wid in warehouse_ids:
        w = int(wid)
        if w in seen:
            continue
        if db.query(Warehouse.id).filter(Warehouse.id == w).first() is None:
            continue
        seen.add(w)
        ordered.append(w)

    default_id = int(default_warehouse_id) if default_warehouse_id is not None else None
    if default_id is not None and default_id not in ordered:
        ordered.append(default_id)
    if default_id is None and ordered:
        default_id = ordered[0]

    now = datetime.utcnow()
    for wid in ordered:
        db.add(
            UserWarehouseAssignment(
                user_id=int(user_id),
                warehouse_id=wid,
                is_default=bool(default_id is not None and wid == default_id),
                can_operate=True,
                created_at=now,
                updated_at=now,
            )
        )
    db.flush()


def warehouse_context_payload(db: Session, user: AppUser) -> dict[str, Any]:
    whs = list_operable_warehouses(db, user)
    active_id = resolve_active_warehouse_id(db, user)
    assignments = []
    if has_explicit_assignments(db, int(user.id)):
        for row in _assignment_rows(db, int(user.id)):
            assignments.append(
                {
                    "warehouse_id": int(row.warehouse_id),
                    "is_default": bool(row.is_default),
                    "can_operate": bool(row.can_operate),
                }
            )
    return {
        "active_warehouse_id": active_id,
        "warehouses": [{"id": int(w.id), "name": str(w.name or f"Magazyn #{w.id}")} for w in whs],
        "show_warehouse_selector": len(whs) > 1,
        "assignments": assignments,
        "uses_legacy_all_warehouses": (
            not wms_warehouse_assignment_enforcement_enabled()
            and not has_explicit_assignments(db, int(user.id))
            and not is_super_role(user.role)
        ),
        "wms_warehouse_enforcement": wms_warehouse_assignment_enforcement_enabled(),
    }
