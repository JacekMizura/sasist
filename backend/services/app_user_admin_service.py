"""Create/update platform users with separate WMS profile persistence."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.passwords import hash_password
from ..auth.deps import explicit_permission_keys, normalize_stored_permission_keys
from ..auth.permission_catalog import PERMISSION_KEYS
from ..auth.roles import is_super_role, normalize_role_for_storage
from ..models.app_user import AppUser, AppUserWarehouse, UserPermission, UserWmsProfile
from ..models.user_warehouse_assignment import UserWarehouseAssignment
from ..models.warehouse import Warehouse
from ..models.workforce_user_group import WorkforceUserGroup
from ..schemas.app_user import (
    AppUserCreate,
    AppUserListItem,
    AppUserUpdate,
    PrimaryWorkforceGroupBadge,
    WmsProfileInput,
    WmsProfileUpdate,
)
from ..wms_operational_modes import is_valid_wms_mode


def email_taken(db: Session, email: str, *, exclude_user_id: int | None = None) -> bool:
    em = (email or "").strip().lower()
    if not em:
        return False
    q = db.query(AppUser).filter(func.lower(AppUser.email) == em)
    if exclude_user_id is not None:
        q = q.filter(AppUser.id != exclude_user_id)
    return q.first() is not None


def login_taken(db: Session, login: str, *, exclude_user_id: int | None = None) -> bool:
    lo = (login or "").strip()
    if not lo:
        return False
    q = db.query(AppUser).filter(AppUser.login == lo)
    if exclude_user_id is not None:
        q = q.filter(AppUser.id != exclude_user_id)
    return q.first() is not None


def get_wms_profile(db: Session, user_id: int) -> UserWmsProfile | None:
    return db.query(UserWmsProfile).filter(UserWmsProfile.user_id == user_id).first()


def ensure_wms_profile(db: Session, user_id: int) -> UserWmsProfile:
    p = get_wms_profile(db, user_id)
    if p is not None:
        return p
    p = UserWmsProfile(user_id=user_id)
    db.add(p)
    db.flush()
    return p


def _resolve_supervisor_user_id(db: Session, supervisor_id: int | None) -> int | None:
    if supervisor_id is None:
        return None
    sid = int(supervisor_id)
    if sid <= 0:
        return None
    if db.query(AppUser).filter(AppUser.id == sid).first() is None:
        return None
    return sid


def _normalize_warehouse_ids(db: Session, warehouse_ids: list[int]) -> list[int]:
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
    return ordered


def validate_wms_warehouse_profile(
    db: Session,
    *,
    role: str,
    warehouse_ids: list[int],
    default_warehouse_id: int | None,
    wms_operational_modes: list[str] | None,
) -> tuple[list[int], int | None]:
    """
    Normalize warehouse assignments for admin save.
    Raises ValueError with stable codes for API mapping.
    """
    ids = _normalize_warehouse_ids(db, warehouse_ids)
    dw = int(default_warehouse_id) if default_warehouse_id is not None else None

    modes = [str(m) for m in (wms_operational_modes or []) if is_valid_wms_mode(str(m))]
    is_operational_wms = bool(modes)

    if is_super_role(role):
        if dw is not None and dw not in ids:
            ids = list(dict.fromkeys([*ids, dw]))
        if dw is None and ids:
            dw = ids[0]
        return ids, dw

    if dw is not None and dw not in ids:
        raise ValueError("DEFAULT_WAREHOUSE_NOT_ASSIGNED")

    if is_operational_wms and not ids:
        raise ValueError("WMS_WAREHOUSE_REQUIRED")

    if dw is None and ids:
        dw = ids[0]

    return ids, dw


def sync_warehouse_assignments(db: Session, user_id: int, warehouse_ids: list[int], *, default_warehouse_id: int | None = None) -> None:
    from .user_warehouse_context_service import sync_user_warehouse_assignments

    sync_user_warehouse_assignments(
        db,
        user_id=user_id,
        warehouse_ids=warehouse_ids,
        default_warehouse_id=default_warehouse_id,
    )
    # Legacy mirror — keep until app_user_warehouses is removed.
    db.query(AppUserWarehouse).filter(AppUserWarehouse.user_id == user_id).delete()
    seen: set[int] = set()
    for wid in warehouse_ids:
        if wid in seen:
            continue
        seen.add(wid)
        if db.query(Warehouse).filter(Warehouse.id == wid).first() is None:
            continue
        db.add(AppUserWarehouse(user_id=user_id, warehouse_id=wid))


def apply_wms_profile_create(db: Session, user_id: int, wms: WmsProfileInput, *, role: str = "user") -> None:
    p = ensure_wms_profile(db, user_id)
    p.barcode_login_code = (wms.barcode_login_code or "").strip() or None
    p.language = wms.language or "pl"
    p.require_scan_every_product = bool(wms.require_scan_every_product)
    p.can_edit_products_preview = bool(wms.can_edit_products_preview)
    p.picker_color = (wms.picker_color or "").strip() or None
    p.packing_station_id = wms.packing_station_id
    p.default_printer_id = wms.default_printer_id
    p.timezone = (wms.timezone or "").strip() or "Europe/Warsaw"
    p.picking_permissions_json = (
        json.dumps(wms.picking_permissions, ensure_ascii=False) if wms.picking_permissions else None
    )
    p.packing_permissions_json = (
        json.dumps(wms.packing_permissions, ensure_ascii=False) if wms.packing_permissions else None
    )
    modes = [str(m) for m in (wms.wms_operational_modes or []) if is_valid_wms_mode(str(m))]
    p.wms_operational_modes_json = json.dumps(modes, ensure_ascii=False) if modes else None
    p.workforce_supervisor_user_id = wms.workforce_supervisor_user_id
    p.workforce_employment_type = (wms.workforce_employment_type or "").strip() or None
    p.workforce_shift_type = (wms.workforce_shift_type or "").strip() or None
    zids = [int(x) for x in (wms.workforce_active_warehouse_zone_ids or []) if str(x).isdigit()]
    p.workforce_active_zone_ids_json = json.dumps(zids, ensure_ascii=False) if zids else None
    p.workforce_default_workstation = (wms.workforce_default_workstation or "").strip() or None
    p.workforce_color_tag = (wms.workforce_color_tag or "").strip() or None
    ids, dw = validate_wms_warehouse_profile(
        db,
        role=role,
        warehouse_ids=list(dict.fromkeys(wms.warehouse_ids)),
        default_warehouse_id=wms.default_warehouse_id,
        wms_operational_modes=modes,
    )
    p.default_warehouse_id = dw
    sync_warehouse_assignments(db, user_id, ids, default_warehouse_id=dw)


def apply_wms_profile_update(db: Session, user_id: int, wms: WmsProfileUpdate) -> None:
    p = ensure_wms_profile(db, user_id)
    data = wms.model_dump(exclude_unset=True)
    if "barcode_login_code" in data:
        p.barcode_login_code = (data["barcode_login_code"] or "").strip() or None
    if "language" in data and data["language"] is not None:
        p.language = data["language"]
    if "default_warehouse_id" in data:
        dw = data["default_warehouse_id"]
        if dw is not None and db.query(Warehouse).filter(Warehouse.id == int(dw)).first() is None:
            p.default_warehouse_id = None
        else:
            p.default_warehouse_id = dw
    if "require_scan_every_product" in data and data["require_scan_every_product"] is not None:
        p.require_scan_every_product = bool(data["require_scan_every_product"])
    if "can_edit_products_preview" in data and data["can_edit_products_preview"] is not None:
        p.can_edit_products_preview = bool(data["can_edit_products_preview"])
    if "picker_color" in data:
        v = data["picker_color"]
        p.picker_color = None if v is None else ((str(v).strip()) or None)
    if "packing_station_id" in data:
        p.packing_station_id = data["packing_station_id"]
    if "default_printer_id" in data:
        p.default_printer_id = data["default_printer_id"]
    if "timezone" in data and data["timezone"] is not None:
        p.timezone = (data["timezone"] or "").strip() or "Europe/Warsaw"
    if "picking_permissions" in data:
        pp = data["picking_permissions"]
        p.picking_permissions_json = json.dumps(pp, ensure_ascii=False) if pp else None
    if "packing_permissions" in data:
        pp = data["packing_permissions"]
        p.packing_permissions_json = json.dumps(pp, ensure_ascii=False) if pp else None
    if "wms_operational_modes" in data and data["wms_operational_modes"] is not None:
        modes = [str(m) for m in data["wms_operational_modes"] if is_valid_wms_mode(str(m))]
        p.wms_operational_modes_json = json.dumps(modes, ensure_ascii=False) if modes else None
    if "workforce_supervisor_user_id" in data:
        p.workforce_supervisor_user_id = _resolve_supervisor_user_id(db, data["workforce_supervisor_user_id"])
    if "workforce_employment_type" in data:
        v = data["workforce_employment_type"]
        p.workforce_employment_type = None if v is None else ((str(v).strip()) or None)
    if "workforce_shift_type" in data:
        v = data["workforce_shift_type"]
        p.workforce_shift_type = None if v is None else ((str(v).strip()) or None)
    if "workforce_active_warehouse_zone_ids" in data and data["workforce_active_warehouse_zone_ids"] is not None:
        zids = [int(x) for x in data["workforce_active_warehouse_zone_ids"] if str(x).isdigit()]
        p.workforce_active_zone_ids_json = json.dumps(zids, ensure_ascii=False) if zids else None
    if "workforce_default_workstation" in data:
        v = data["workforce_default_workstation"]
        p.workforce_default_workstation = None if v is None else ((str(v).strip()) or None)
    if "workforce_color_tag" in data:
        v = data["workforce_color_tag"]
        p.workforce_color_tag = None if v is None else ((str(v).strip()) or None)

    _sync_wms_warehouse_assignments_from_profile(db, user_id, p, data)


def _assignment_warehouse_ids(db: Session, user_id: int) -> list[int]:
    rows = (
        db.query(UserWarehouseAssignment.warehouse_id)
        .filter(UserWarehouseAssignment.user_id == int(user_id))
        .order_by(UserWarehouseAssignment.warehouse_id.asc())
        .all()
    )
    return [int(r[0]) for r in rows]


def _sync_wms_warehouse_assignments_from_profile(
    db: Session,
    user_id: int,
    profile: UserWmsProfile,
    patch: dict[str, Any],
) -> None:
    if not any(k in patch for k in ("warehouse_ids", "default_warehouse_id", "wms_operational_modes")):
        return
    user = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    role = (user.role if user is not None else "user") or "user"
    if "warehouse_ids" in patch and patch["warehouse_ids"] is not None:
        wh_ids = list(dict.fromkeys(patch["warehouse_ids"]))
    else:
        wh_ids = _assignment_warehouse_ids(db, user_id)
    dw = profile.default_warehouse_id
    modes_raw = profile.wms_operational_modes_json
    modes: list[str] = []
    if modes_raw:
        try:
            parsed = json.loads(modes_raw)
            if isinstance(parsed, list):
                modes = [str(m) for m in parsed if is_valid_wms_mode(str(m))]
        except json.JSONDecodeError:
            modes = []
    ids, dw = validate_wms_warehouse_profile(
        db,
        role=role,
        warehouse_ids=wh_ids,
        default_warehouse_id=dw,
        wms_operational_modes=modes,
    )
    profile.default_warehouse_id = dw
    sync_warehouse_assignments(db, user_id, ids, default_warehouse_id=dw)


def create_user_transaction(
    db: Session,
    body: AppUserCreate,
) -> AppUser:
    login = body.login.strip()
    if login_taken(db, login):
        raise ValueError("LOGIN_EXISTS")
    email = (body.email or "").strip()
    if not email:
        raise ValueError("EMAIL_REQUIRED")
    if email_taken(db, email):
        raise ValueError("EMAIL_EXISTS")

    stored_perms = normalize_stored_permission_keys(body.permissions) or []

    office_lang = (body.language or "").strip() or "pl"
    wl = (body.wms_language or body.wms_profile.language or "pl").strip() or "pl"
    wc = (body.wms_currency or "PLN").strip() or "PLN"

    role_stored = normalize_role_for_storage(body.role)
    u = AppUser(
        login=login,
        email=email,
        password_hash=hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
        role=role_stored,
        is_active=body.is_active,
        language=office_lang,
        wms_language=wl,
        wms_currency=wc,
        phone=(body.phone or "").strip() or None,
        avatar_url=(body.avatar_url or "").strip() or None,
    )
    db.add(u)
    db.flush()

    wms_for_profile = WmsProfileInput(**{**body.wms_profile.model_dump(), "language": wl})
    apply_wms_profile_create(db, u.id, wms_for_profile, role=role_stored)

    if not is_super_role(u.role):
        for pk in stored_perms:
            db.add(UserPermission(user_id=u.id, permission_key=pk))

    if body.primary_workforce_group_id is not None:
        gid = body.primary_workforce_group_id
        if gid and db.query(WorkforceUserGroup).filter(WorkforceUserGroup.id == gid).first() is not None:
            u.primary_workforce_group_id = gid
        else:
            u.primary_workforce_group_id = None

    db.refresh(u)
    return u


def update_user_transaction(
    db: Session,
    u: AppUser,
    body: AppUserUpdate,
) -> None:
    if body.email is not None:
        email = body.email.strip()
        if not email:
            raise ValueError("EMAIL_REQUIRED")
        if email_taken(db, email, exclude_user_id=u.id):
            raise ValueError("EMAIL_EXISTS")
        u.email = email
    if body.password:
        u.password_hash = hash_password(body.password)
        u.password_must_change = False
    if body.first_name is not None:
        u.first_name = body.first_name
    if body.last_name is not None:
        u.last_name = body.last_name
    if body.phone is not None:
        u.phone = body.phone.strip() or None
    if body.avatar_url is not None:
        u.avatar_url = body.avatar_url.strip() or None
    if body.role is not None:
        u.role = normalize_role_for_storage(body.role)
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.language is not None:
        u.language = (body.language or "").strip() or "pl"

    profile_patch_fields: set[str] | None = None
    if body.wms_profile is not None:
        profile_patch_fields = set(body.wms_profile.model_dump(exclude_unset=True).keys())
        apply_wms_profile_update(db, u.id, body.wms_profile)

    if body.wms_language is not None:
        u.wms_language = (body.wms_language or "").strip() or "pl"
    elif profile_patch_fields is not None and "language" in profile_patch_fields:
        p = get_wms_profile(db, u.id)
        u.wms_language = ((p.language if p else None) or "").strip() or "pl"

    if body.wms_currency is not None:
        u.wms_currency = (body.wms_currency or "").strip() or "PLN"

    if body.primary_workforce_group_id is not None:
        gid = body.primary_workforce_group_id
        if gid and db.query(WorkforceUserGroup).filter(WorkforceUserGroup.id == gid).first() is not None:
            u.primary_workforce_group_id = gid
        else:
            u.primary_workforce_group_id = None

    if body.permissions is not None:
        stored_perms = normalize_stored_permission_keys(body.permissions) or []
        db.query(UserPermission).filter(UserPermission.user_id == u.id).delete()
        if not is_super_role(u.role):
            for pk in stored_perms:
                db.add(UserPermission(user_id=u.id, permission_key=pk))


def parse_json_list(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data]
    except json.JSONDecodeError:
        return None
    return None


def parse_json_int_list(raw: str | None) -> list[int]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            out: list[int] = []
            for x in data:
                try:
                    out.append(int(x))
                except (TypeError, ValueError):
                    continue
            return out
    except json.JSONDecodeError:
        return []
    return []


def _warehouse_ids(db: Session, user_id: int) -> list[int]:
    rows = (
        db.query(UserWarehouseAssignment.warehouse_id)
        .filter(UserWarehouseAssignment.user_id == user_id, UserWarehouseAssignment.can_operate.is_(True))
        .all()
    )
    if rows:
        return sorted({int(r[0]) for r in rows})
    rows = db.query(AppUserWarehouse.warehouse_id).filter(AppUserWarehouse.user_id == user_id).all()
    return sorted({int(r[0]) for r in rows})


def warehouse_names_for_user(db: Session, user_id: int) -> list[str]:
    ids = _warehouse_ids(db, user_id)
    if not ids:
        return []
    rows = db.query(Warehouse.id, Warehouse.name).filter(Warehouse.id.in_(ids)).all()
    by_id = {int(i): (n or "").strip() or f"#{i}" for i, n in rows}
    return [by_id.get(i, f"#{i}") for i in ids]


def warehouse_summary(db: Session, user_id: int) -> str:
    parts = warehouse_names_for_user(db, user_id)
    return ", ".join(parts)


def wms_profile_response(db: Session, user_id: int) -> dict[str, Any]:
    p = get_wms_profile(db, user_id)
    wh_ids = _warehouse_ids(db, user_id)
    if p is None:
        return {
            "barcode_login_code": None,
            "language": "pl",
            "default_warehouse_id": None,
            "active_warehouse_id": None,
            "warehouse_ids": wh_ids,
            "require_scan_every_product": False,
            "can_edit_products_preview": False,
            "picking_permissions": None,
            "packing_permissions": None,
            "picker_color": None,
            "packing_station_id": None,
            "default_printer_id": None,
            "timezone": "Europe/Warsaw",
            "wms_operational_modes": [],
            "workforce_supervisor_user_id": None,
            "workforce_employment_type": None,
            "workforce_shift_type": None,
            "workforce_active_warehouse_zone_ids": [],
            "workforce_default_workstation": None,
            "workforce_color_tag": None,
        }
    modes_raw = parse_json_list(getattr(p, "wms_operational_modes_json", None) or None) or []
    modes = [m for m in modes_raw if is_valid_wms_mode(str(m))]
    active_id = p.active_warehouse_id if p is not None else None
    return {
        "barcode_login_code": p.barcode_login_code,
        "language": p.language,
        "default_warehouse_id": p.default_warehouse_id,
        "active_warehouse_id": active_id,
        "warehouse_ids": wh_ids,
        "require_scan_every_product": bool(p.require_scan_every_product),
        "can_edit_products_preview": bool(p.can_edit_products_preview),
        "picking_permissions": parse_json_list(p.picking_permissions_json),
        "packing_permissions": parse_json_list(p.packing_permissions_json),
        "picker_color": p.picker_color,
        "packing_station_id": p.packing_station_id,
        "default_printer_id": p.default_printer_id,
        "timezone": p.timezone or "Europe/Warsaw",
        "wms_operational_modes": modes,
        "workforce_supervisor_user_id": getattr(p, "workforce_supervisor_user_id", None),
        "workforce_employment_type": getattr(p, "workforce_employment_type", None),
        "workforce_shift_type": getattr(p, "workforce_shift_type", None),
        "workforce_active_warehouse_zone_ids": parse_json_int_list(getattr(p, "workforce_active_zone_ids_json", None)),
        "workforce_default_workstation": getattr(p, "workforce_default_workstation", None),
        "workforce_color_tag": getattr(p, "workforce_color_tag", None),
    }


def primary_workforce_group_badge(db: Session, group_id: int | None) -> PrimaryWorkforceGroupBadge | None:
    if not group_id:
        return None
    g = db.query(WorkforceUserGroup).filter(WorkforceUserGroup.id == group_id).first()
    if g is None or g.archived_at is not None:
        return None
    return PrimaryWorkforceGroupBadge(
        id=g.id,
        name=g.name,
        color=g.color or "#64748b",
        icon_key=g.icon_key or "Users",
    )


def sort_app_users_list_items(items: list[AppUserListItem]) -> list[AppUserListItem]:
    """Superadmin → admin → other active roles (newest login) → inactive at bottom."""

    def sort_key(it: AppUserListItem) -> tuple:
        inactive = 0 if it.is_active else 1
        if inactive:
            rr = 0 if is_super_role(it.role) else (1 if (it.role or "").strip().lower() == "admin" else 2)
            name = f"{it.first_name or ''} {it.last_name or ''} {it.login}".strip().lower()
            return (1, rr, name)
        rr = 0 if is_super_role(it.role) else (1 if (it.role or "").strip().lower() == "admin" else 2)
        ts = it.last_login_at.timestamp() if it.last_login_at is not None else float("-inf")
        name = f"{it.first_name or ''} {it.last_name or ''} {it.login}".strip().lower()
        return (0, rr, -ts, name)

    return sorted(items, key=sort_key)


def app_user_to_list_item(db: Session, u: AppUser) -> AppUserListItem:
    wp = wms_profile_response(db, u.id)
    wms_lang = getattr(u, "wms_language", None) or wp.get("language")
    gid = getattr(u, "primary_workforce_group_id", None)
    badge = primary_workforce_group_badge(db, gid)
    modes = wp.get("wms_operational_modes") or []
    return AppUserListItem(
        id=u.id,
        login=u.login,
        email=u.email,
        first_name=u.first_name,
        last_name=u.last_name,
        role=u.role,
        is_active=u.is_active,
        language=u.language,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        phone=u.phone,
        warehouse_summary=warehouse_summary(db, u.id) or None,
        warehouse_names=warehouse_names_for_user(db, u.id),
        default_warehouse_id=wp.get("default_warehouse_id"),
        is_system_seed=bool(getattr(u, "is_system_seed", False)),
        wms_language=wms_lang,
        primary_workforce_group=badge,
        wms_operational_modes=list(modes) if isinstance(modes, list) else [],
    )
