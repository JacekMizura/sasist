"""
Odczyt i utrzymanie rekordów ``PickingConfig``.

Bez integracji z przypisaniami zamówień, stanem magazynowym ani MM.
"""

from __future__ import annotations

from typing import Tuple

from sqlalchemy.orm import Session, joinedload

from ..models.order_ui_status import OrderUiStatus
from ..models.picking_config import PickingConfig
from ..schemas.picking_config import (
    PickingConfigCreate,
    PickingConfigMode,
    PickingConfigRead,
    PickingConfigUpdate,
)
from ..schemas.wms_picking_flow import WmsPickingConfigReplaceItem


def derive_storage_strategy(pick_unit: str, order_sort: str) -> str:
    """``strategy`` w DB: locations | orders — utrzymywane razem z pick_unit + order_sort."""
    pu = (pick_unit or "").strip().lower()
    osrt = (order_sort or "date").strip().lower()
    if pu == "products":
        return "locations"
    if osrt == "location":
        return "locations"
    return "orders"


def coalesce_pick_fields(
    strategy_in: str | None,
    pick_unit_in: str | None,
    order_sort_in: str | None,
) -> tuple[str, str, str]:
    """Zwraca (pick_unit, order_sort, strategy) dla zapisu do DB."""
    raw_os = (order_sort_in or "date").strip().lower()
    if raw_os not in ("date", "location", "courier"):
        raw_os = "date"
    if pick_unit_in:
        pu = str(pick_unit_in).strip().lower()
        if pu not in ("orders", "products"):
            pu = "orders"
        return pu, raw_os, derive_storage_strategy(pu, raw_os)
    s = (strategy_in or "orders").strip().lower()
    if s == "locations":
        return "products", "date", "locations"
    return "orders", raw_os, derive_storage_strategy("orders", raw_os)


def normalize_bulk_max_fields(
    single_mode: PickingConfigMode,
    multi_mode: PickingConfigMode,
    max_single_orders: int | None,
    max_multi_orders: int | None,
) -> Tuple[int | None, int | None]:
    """Przy trybach innnych niż ``bulk`` ignoruj limity (zapis ``NULL``)."""
    ms = max_single_orders if single_mode == "bulk" else None
    mm = max_multi_orders if multi_mode == "bulk" else None
    return ms, mm


def assert_ui_status_belongs(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int,
) -> OrderUiStatus:
    row = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == int(status_id),
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise ValueError("Status panelu nie istnieje lub nie należy do tego magazynu.")
    return row


def list_picking_configs(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> list[PickingConfig]:
    q = (
        db.query(PickingConfig)
        .options(
            joinedload(PickingConfig.source_status),
            joinedload(PickingConfig.target_status),
            joinedload(PickingConfig.shortage_status),
        )
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
        )
        .order_by(PickingConfig.id.asc())
    )
    return list(q.all())


def create_picking_config(db: Session, body: PickingConfigCreate) -> PickingConfig:
    assert_ui_status_belongs(db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=body.source_status_id)
    assert_ui_status_belongs(db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=body.target_status_id)
    shortage_id = getattr(body, "status_on_shortage_id", None)
    if shortage_id is not None:
        assert_ui_status_belongs(db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=int(shortage_id))

    ms, mm = normalize_bulk_max_fields(
        body.single_mode,
        body.multi_mode,
        body.max_single_orders,
        body.max_multi_orders,
    )
    pu, os, strat = coalesce_pick_fields(body.strategy, body.pick_unit, body.order_sort)

    row = PickingConfig(
        tenant_id=int(body.tenant_id),
        warehouse_id=int(body.warehouse_id),
        source_status_id=int(body.source_status_id),
        target_status_id=int(body.target_status_id),
        strategy=strat,
        pick_unit=pu,
        order_sort=os,
        single_mode=str(body.single_mode),
        multi_mode=str(body.multi_mode),
        max_single_orders=ms,
        max_multi_orders=mm,
        status_on_shortage_id=int(shortage_id) if shortage_id is not None else None,
    )
    db.add(row)
    db.flush()
    return row


def update_picking_config(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    body: PickingConfigUpdate,
    existing: PickingConfig,
) -> PickingConfig:
    if int(existing.source_status_id) == int(body.target_status_id):
        raise ValueError("Status docelowy musi być inny niż status źródłowy.")

    assert_ui_status_belongs(db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=body.target_status_id)
    shortage_id = getattr(body, "status_on_shortage_id", None)
    if shortage_id is not None:
        assert_ui_status_belongs(db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=int(shortage_id))

    ms, mm = normalize_bulk_max_fields(
        body.single_mode,
        body.multi_mode,
        body.max_single_orders,
        body.max_multi_orders,
    )
    pu, os, strat = coalesce_pick_fields(body.strategy, body.pick_unit, body.order_sort)

    existing.target_status_id = int(body.target_status_id)
    existing.status_on_shortage_id = int(shortage_id) if shortage_id is not None else None
    existing.strategy = strat
    existing.pick_unit = pu
    existing.order_sort = os
    existing.single_mode = str(body.single_mode)
    existing.multi_mode = str(body.multi_mode)
    existing.max_single_orders = ms
    existing.max_multi_orders = mm
    db.add(existing)
    db.flush()
    return existing


def picking_config_to_read(row: PickingConfig) -> PickingConfigRead:
    base = PickingConfigRead.model_validate(row)
    src = getattr(row, "source_status", None)
    tgt = getattr(row, "target_status", None)
    sh = getattr(row, "shortage_status", None)
    return base.model_copy(
        update={
            "source_status_name": str(src.name) if src is not None else None,
            "target_status_name": str(tgt.name) if tgt is not None else None,
            "status_on_shortage_id": getattr(row, "status_on_shortage_id", None),
            "status_on_shortage_name": str(sh.name) if sh is not None else None,
        }
    )


def replace_all_picking_configs_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    items: list[WmsPickingConfigReplaceItem],
) -> list[PickingConfig]:
    """Kasuje wszystkie ``picking_config`` dla magazynu i wstawia podaną listę (jedna transakcja na poziomie wywołania)."""
    if not items:
        raise ValueError("Wymagana jest co najmniej jedna konfiguracja (status do zbierania).")
    seen: set[int] = set()
    for i in items:
        sid = int(i.source_status_id)
        if sid in seen:
            raise ValueError("Każdy status do zbierania może wystąpić tylko raz.")
        seen.add(sid)
        assert_ui_status_belongs(db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=sid)
        assert_ui_status_belongs(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=int(i.target_status_id)
        )
        sid_short = getattr(i, "status_on_shortage_id", None)
        if sid_short is not None:
            assert_ui_status_belongs(
                db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=int(sid_short)
            )

    db.query(PickingConfig).filter(
        PickingConfig.tenant_id == int(tenant_id),
        PickingConfig.warehouse_id == int(warehouse_id),
    ).delete(synchronize_session=False)

    out: list[PickingConfig] = []
    for i in items:
        ms, mm = normalize_bulk_max_fields(
            i.single_mode,
            i.multi_mode,
            i.max_single_orders,
            i.max_multi_orders,
        )
        strat = derive_storage_strategy(str(i.pick_unit), str(i.order_sort))
        sid_short = getattr(i, "status_on_shortage_id", None)
        row = PickingConfig(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(i.source_status_id),
            target_status_id=int(i.target_status_id),
            status_on_shortage_id=int(sid_short) if sid_short is not None else None,
            strategy=strat,
            pick_unit=str(i.pick_unit),
            order_sort=str(i.order_sort),
            single_mode=str(i.single_mode),
            multi_mode=str(i.multi_mode),
            max_single_orders=ms,
            max_multi_orders=mm,
        )
        db.add(row)
        out.append(row)
    db.flush()
    return out
