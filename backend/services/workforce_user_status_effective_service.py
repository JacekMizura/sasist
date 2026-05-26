"""Merge role-based panel status matrix with per-user overrides."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.order_ui_status import OrderUiStatus
from ..models.workforce_status_access import WorkforceStatusAccess
from ..models.workforce_user_group import WorkforceUserStatusAccess


def _role_row(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    role: str,
    order_ui_status_id: int,
) -> WorkforceStatusAccess | None:
    return (
        db.query(WorkforceStatusAccess)
        .filter(
            WorkforceStatusAccess.tenant_id == tenant_id,
            WorkforceStatusAccess.warehouse_id == warehouse_id,
            WorkforceStatusAccess.role == role.strip(),
            WorkforceStatusAccess.order_ui_status_id == order_ui_status_id,
        )
        .first()
    )


def _user_row(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    user_id: int,
    order_ui_status_id: int,
) -> WorkforceUserStatusAccess | None:
    return (
        db.query(WorkforceUserStatusAccess)
        .filter(
            WorkforceUserStatusAccess.tenant_id == tenant_id,
            WorkforceUserStatusAccess.warehouse_id == warehouse_id,
            WorkforceUserStatusAccess.user_id == user_id,
            WorkforceUserStatusAccess.order_ui_status_id == order_ui_status_id,
        )
        .first()
    )


def _defaults_from_role_row(r: WorkforceStatusAccess | None) -> dict[str, bool]:
    if r is None:
        return {
            "can_visible": False,
            "can_edit": False,
            "can_transition": False,
            "can_process": False,
            "can_print": False,
            "can_complete": False,
        }
    return {
        "can_visible": bool(r.can_visible),
        "can_edit": bool(r.can_edit),
        "can_transition": bool(r.can_transition),
        "can_process": bool(r.can_process),
        "can_print": bool(r.can_print),
        "can_complete": bool(r.can_complete),
    }


def list_effective_status_access_for_user(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    user_id: int,
) -> list[dict]:
    u = db.query(AppUser).filter(AppUser.id == user_id).first()
    if u is None:
        return []
    role = (u.role or "user").strip()
    statuses = (
        db.query(OrderUiStatus)
        .filter(OrderUiStatus.tenant_id == tenant_id, OrderUiStatus.warehouse_id == warehouse_id)
        .order_by(OrderUiStatus.sort_order.asc(), OrderUiStatus.id.asc())
        .all()
    )
    out: list[dict] = []
    for st in statuses:
        rr = _role_row(db, tenant_id=tenant_id, warehouse_id=warehouse_id, role=role, order_ui_status_id=st.id)
        ur = _user_row(db, tenant_id=tenant_id, warehouse_id=warehouse_id, user_id=user_id, order_ui_status_id=st.id)
        role_flags = _defaults_from_role_row(rr)
        if ur is None:
            eff = dict(role_flags)
            override = False
        else:
            eff = {
                "can_visible": bool(ur.can_visible),
                "can_edit": bool(ur.can_edit),
                "can_transition": bool(ur.can_transition),
                "can_process": bool(ur.can_process),
                "can_print": bool(ur.can_print),
                "can_complete": bool(ur.can_complete),
            }
            override = eff != role_flags
        out.append(
            {
                "order_ui_status_id": st.id,
                "status_name": st.name,
                "main_group": st.main_group,
                "role": role,
                "role_can_visible": role_flags["can_visible"],
                "role_can_edit": role_flags["can_edit"],
                "role_can_transition": role_flags["can_transition"],
                "role_can_process": role_flags["can_process"],
                "role_can_print": role_flags["can_print"],
                "role_can_complete": role_flags["can_complete"],
                "effective_can_visible": eff["can_visible"],
                "effective_can_edit": eff["can_edit"],
                "effective_can_transition": eff["can_transition"],
                "effective_can_process": eff["can_process"],
                "effective_can_print": eff["can_print"],
                "effective_can_complete": eff["can_complete"],
                "has_user_override": override,
            }
        )
    return out


def save_user_status_overrides(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    user_id: int,
    items: list[dict],
) -> int:
    """Persist per-status overrides only where effective flags differ from role defaults."""
    u = db.query(AppUser).filter(AppUser.id == user_id).first()
    if u is None:
        return 0
    role = (u.role or "user").strip()
    changed = 0
    for it in items:
        oid = int(it["order_ui_status_id"])
        rr = _role_row(db, tenant_id=tenant_id, warehouse_id=warehouse_id, role=role, order_ui_status_id=oid)
        role_flags = _defaults_from_role_row(rr)
        eff = {
            "can_visible": bool(it.get("can_visible", False)),
            "can_edit": bool(it.get("can_edit", False)),
            "can_transition": bool(it.get("can_transition", False)),
            "can_process": bool(it.get("can_process", False)),
            "can_print": bool(it.get("can_print", False)),
            "can_complete": bool(it.get("can_complete", False)),
        }
        row = _user_row(db, tenant_id=tenant_id, warehouse_id=warehouse_id, user_id=user_id, order_ui_status_id=oid)
        if eff == role_flags:
            if row is not None:
                db.delete(row)
                changed += 1
            continue
        if row is None:
            row = WorkforceUserStatusAccess(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                user_id=user_id,
                order_ui_status_id=oid,
            )
            db.add(row)
        row.can_visible = eff["can_visible"]
        row.can_edit = eff["can_edit"]
        row.can_transition = eff["can_transition"]
        row.can_process = eff["can_process"]
        row.can_print = eff["can_print"]
        row.can_complete = eff["can_complete"]
        changed += 1
    return changed
