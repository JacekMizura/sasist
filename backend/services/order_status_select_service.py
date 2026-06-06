"""Selectable order panel statuses for WMS settings dropdowns (packing, direct sales, …)."""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from ..models.order_ui_status import OrderUiStatus
from ..schemas.wms_packing_settings import OrderStatusOptionOut
from ..services.order_default_new_panel_status import get_or_create_default_new_order_ui_status_id
from ..services.order_ui_status_panel import norm_order_ui_main_group

_GROUP_ORDER: tuple[str, ...] = ("NEW", "IN_PROGRESS", "DONE")

_GROUP_LABELS_PL: dict[str, str] = {
    "NEW": "Nowe",
    "IN_PROGRESS": "W toku",
    "DONE": "Zakończone",
}


def _group_display_label(row: OrderUiStatus) -> str:
    gn = getattr(row, "group_name", None)
    if gn is not None and str(gn).strip():
        return str(gn).strip()
    mg = norm_order_ui_main_group(row.main_group)
    return _GROUP_LABELS_PL.get(mg, mg)


def list_selectable_order_status_options(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> List[OrderStatusOptionOut]:
    """Active order panel statuses for settings dropdowns (no runtime-only rows)."""
    rows = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
            OrderUiStatus.is_active.is_(True),
        )
        .order_by(
            OrderUiStatus.sort_group.asc(),
            OrderUiStatus.main_group.asc(),
            OrderUiStatus.sort_subgroup.asc(),
            OrderUiStatus.sort_status.asc(),
            OrderUiStatus.sort_order.asc(),
            OrderUiStatus.id.asc(),
        )
        .all()
    )
    gidx = {g: i for i, g in enumerate(_GROUP_ORDER)}
    rows.sort(
        key=lambda r: (
            gidx.get(norm_order_ui_main_group(r.main_group), 99),
            int(getattr(r, "sort_subgroup", 0) or 0),
            int(getattr(r, "sort_status", 0) or int(r.sort_order or 0)),
            int(r.id),
        )
    )
    out: List[OrderStatusOptionOut] = []
    for r in rows:
        sn = getattr(r, "subgroup_name", None)
        subgroup = str(sn).strip() if sn is not None and str(sn).strip() else None
        out.append(
            OrderStatusOptionOut(
                id=int(r.id),
                name=str(r.name or "").strip() or f"#{r.id}",
                main_group=norm_order_ui_main_group(r.main_group),
                subgroup_name=subgroup,
                group_display_name=_group_display_label(r),
            )
        )
    return out


def resolve_order_status_id_with_fallback(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    configured_id: Optional[int],
) -> Optional[int]:
    """Return configured id when still active; else first active status or system default NEW."""
    options = list_selectable_order_status_options(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    valid_ids = {int(o.id) for o in options}
    if configured_id is not None and int(configured_id) in valid_ids:
        return int(configured_id)
    if options:
        return int(options[0].id)
    try:
        return int(get_or_create_default_new_order_ui_status_id(db, int(tenant_id), int(warehouse_id)))
    except Exception:
        return None


def resolve_order_status_id_by_legacy_name_hints(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    legacy_key: str,
) -> Optional[int]:
    """Map deprecated direct-sales string keys to a panel status id."""
    key = (legacy_key or "").strip().lower()
    hints: dict[str, tuple[str, ...]] = {
        "new": ("nowe",),
        "paid": ("opłacone", "oplacone", "paid"),
        "ready": ("gotowe do wydania", "gotowe", "ready"),
        "completed": ("zakończone", "zakonczone", "spakowane", "completed", "done"),
    }
    names = hints.get(key)
    if not names:
        return None
    options = list_selectable_order_status_options(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    lowered = {int(o.id): (o.name or "").strip().lower() for o in options}
    for nid, nm in lowered.items():
        for hint in names:
            if hint in nm or nm == hint:
                return nid
    if key == "new":
        try:
            return int(get_or_create_default_new_order_ui_status_id(db, int(tenant_id), int(warehouse_id)))
        except Exception:
            return None
    if key == "completed":
        for o in options:
            if norm_order_ui_main_group(o.main_group) == "DONE":
                return int(o.id)
    return None
