"""
Limit paczek bez potwierdzenia kierownika (umowa własna).

Działa wyłącznie gdy włączona wielopaczkowość w ustawieniach pakowania magazynu.
Zgoda kierownika jest jednorazowa na zamówienie (nie na każdą kolejną paczkę).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser, UserWmsProfile
from ..models.order import Order
from ..models.wms_packing_settings import WmsPackingSettings

logger = logging.getLogger("wms.packing.multi_parcel")

#: Tag w ``UserWmsProfile.packing_permissions_json`` — nie mylić z rolą platformową.
PACKING_MANAGER_PERM = "kierownik"

MANAGER_APPROVAL_REQUIRED = "MANAGER_APPROVAL_REQUIRED"
INVALID_MANAGER_CODE = "INVALID_MANAGER_CODE"
NOT_A_MANAGER = "NOT_A_MANAGER"


def _loads_dict(raw: object | None) -> dict:
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def load_multi_parcel_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> tuple[bool, int]:
    """Zwraca ``(enable_multi_parcel, parcel_limit_without_manager_confirm)``."""
    row = (
        db.query(WmsPackingSettings)
        .filter(
            WmsPackingSettings.tenant_id == int(tenant_id),
            WmsPackingSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row is None:
        return False, 5
    raw = getattr(row, "multi_parcel_json", None)
    data = _loads_dict(raw if isinstance(raw, str) else None)
    enabled = bool(data.get("enable_multi_parcel", False))
    try:
        limit = int(data.get("parcel_limit_without_manager_confirm", 5))
    except (TypeError, ValueError):
        limit = 5
    limit = max(0, min(99, limit))
    return enabled, limit


def packing_permissions_tags(profile: UserWmsProfile | None) -> set[str]:
    if profile is None or not profile.packing_permissions_json:
        return set()
    try:
        arr = json.loads(profile.packing_permissions_json)
    except json.JSONDecodeError:
        return set()
    if not isinstance(arr, list):
        return set()
    return {str(x).strip() for x in arr if x is not None and str(x).strip()}


def user_has_packing_manager_permission(db: Session, user: Optional[AppUser]) -> bool:
    """
    Uprawnienie „Kierownik” w profilu WMS.

    Świadomie BEZ automatycznego nadania dla admina / super — tylko jawny tag.
    """
    if user is None:
        return False
    row = db.query(UserWmsProfile).filter(UserWmsProfile.user_id == int(user.id)).first()
    return PACKING_MANAGER_PERM in packing_permissions_tags(row)


def order_has_multi_parcel_manager_approval(order: Order) -> bool:
    return getattr(order, "packing_multi_parcel_manager_approved_at", None) is not None


def clear_multi_parcel_manager_approval(order: Order) -> None:
    order.packing_multi_parcel_manager_approved_at = None
    order.packing_multi_parcel_manager_approved_by_user_id = None


def _count_packaging_ids(packaging_carton_ids: list[str] | None) -> int:
    seen: set[str] = set()
    n = 0
    for raw in packaging_carton_ids or []:
        cid = str(raw or "").strip()
        if not cid or cid in seen:
            continue
        seen.add(cid)
        n += 1
    return n


def evaluate_extra_parcel_gate(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    current_user: Optional[AppUser],
    intended_packaging_count: int,
) -> dict[str, Any]:
    """
    Czy wolno utworzyć/zaakceptować ``intended_packaging_count`` paczek.

    Zwraca dict:
      allowed: bool
      requires_manager_approval: bool
      enable_multi_parcel: bool
      limit: int
      message: str | None
    """
    enabled, limit = load_multi_parcel_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    count = max(0, int(intended_packaging_count))
    if not enabled:
        return {
            "allowed": True,
            "requires_manager_approval": False,
            "enable_multi_parcel": False,
            "limit": limit,
            "message": None,
        }
    if count <= limit:
        return {
            "allowed": True,
            "requires_manager_approval": False,
            "enable_multi_parcel": True,
            "limit": limit,
            "message": None,
        }
    if user_has_packing_manager_permission(db, current_user):
        return {
            "allowed": True,
            "requires_manager_approval": False,
            "enable_multi_parcel": True,
            "limit": limit,
            "message": None,
        }
    if order_has_multi_parcel_manager_approval(order):
        return {
            "allowed": True,
            "requires_manager_approval": False,
            "enable_multi_parcel": True,
            "limit": limit,
            "message": None,
        }
    return {
        "allowed": False,
        "requires_manager_approval": True,
        "enable_multi_parcel": True,
        "limit": limit,
        "message": (
            "Limit paczek bez potwierdzenia został przekroczony. "
            "Zeskanuj kod kierownika, aby dodać kolejną paczkę."
        ),
    }


def assert_finish_packaging_count_allowed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    current_user: Optional[AppUser],
    packaging_carton_ids: list[str] | None,
) -> None:
    """Twarda bramka finish — ValueError z kodem ``MANAGER_APPROVAL_REQUIRED``."""
    n = _count_packaging_ids(packaging_carton_ids)
    gate = evaluate_extra_parcel_gate(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order=order,
        current_user=current_user,
        intended_packaging_count=n,
    )
    if not gate["allowed"]:
        raise ValueError(MANAGER_APPROVAL_REQUIRED)


def find_user_by_barcode_login_code(db: Session, barcode: str) -> Optional[AppUser]:
    code = (barcode or "").strip()
    if not code:
        return None
    profile = (
        db.query(UserWmsProfile)
        .filter(UserWmsProfile.barcode_login_code == code)
        .first()
    )
    if profile is None:
        return None
    user = db.query(AppUser).filter(AppUser.id == int(profile.user_id)).first()
    if user is None or not bool(getattr(user, "is_active", True)):
        return None
    return user


def approve_multi_parcel_by_manager_barcode(
    db: Session,
    *,
    order: Order,
    barcode: str,
) -> AppUser:
    """
    Zeskanowany kod musi należeć do użytkownika z uprawnieniem ``kierownik``.
    Ustawia jednorazową zgodę na zamówieniu.
    """
    manager = find_user_by_barcode_login_code(db, barcode)
    if manager is None:
        raise ValueError(INVALID_MANAGER_CODE)
    if not user_has_packing_manager_permission(db, manager):
        raise ValueError(NOT_A_MANAGER)
    order.packing_multi_parcel_manager_approved_at = datetime.utcnow()
    order.packing_multi_parcel_manager_approved_by_user_id = int(manager.id)
    db.add(order)
    return manager
