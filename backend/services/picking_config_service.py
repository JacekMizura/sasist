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
    PickingConfigOrderSort,
    PickingConfigRead,
    PickingConfigUpdate,
)
from ..schemas.wms_picking_flow import WmsPickingConfigReplaceItem

#: Intersection of single∩multi container modes — only these may be stored as ``all_mode``.
ALL_ORDER_COMPATIBLE_MODES: frozenset[str] = frozenset({"bulk", "scanned", "baskets"})
#: Runtime default when ``all_mode`` is NULL (not a copy of single/multi).
ALL_MODE_RUNTIME_DEFAULT = "bulk"


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
    *,
    all_mode: str | None = None,
    max_all_orders: int | None = None,
) -> Tuple[int | None, int | None, int | None]:
    """Przy trybach innych niż ``bulk`` ignoruj limity (zapis ``NULL``)."""
    ms = max_single_orders if single_mode == "bulk" else None
    mm = max_multi_orders if multi_mode == "bulk" else None
    am = (all_mode or "").strip().lower() if all_mode is not None else ""
    ma = max_all_orders if am == "bulk" else None
    return ms, mm, ma


def normalize_all_mode_for_storage(all_mode: str | None, *, required: bool = False) -> str | None:
    """Waliduje / normalizuje ``all_mode`` do zapisu. ``None`` = brak trwałej wartości."""
    if all_mode is None or str(all_mode).strip() == "":
        if required:
            raise ValueError(
                "Konfiguracja „Wszystkie zamówienia” wymaga metody zbierania "
                "(bulk / scanned / baskets)."
            )
        return None
    m = str(all_mode).strip().lower()
    if m not in ALL_ORDER_COMPATIBLE_MODES:
        raise ValueError(
            "„Wszystkie zamówienia” obsługuje tylko: zbieranie bez skanu wózka, "
            "ze skanem wózka lub do wózka z koszykami "
            "(bez wózka mobilnego i bez regału kompletacyjnego)."
        )
    return m


def normalize_all_order_sort_for_storage(
    all_order_sort: str | None,
    *,
    required: bool = False,
) -> str | None:
    if all_order_sort is None or str(all_order_sort).strip() == "":
        if required:
            raise ValueError("Konfiguracja „Wszystkie zamówienia” wymaga sposobu doboru zamówień.")
        return None
    s = str(all_order_sort).strip().lower()
    if s not in ("date", "location", "courier"):
        raise ValueError("Nieprawidłowy sposób doboru dla „Wszystkie zamówienia”.")
    return s


def effective_all_mode(row: PickingConfig | None) -> str:
    """Efektywny tryb all przy odczycie — bez zapisu. Nie kopiuje single/multi."""
    if row is None:
        return ALL_MODE_RUNTIME_DEFAULT
    raw = getattr(row, "all_mode", None)
    if raw is not None and str(raw).strip():
        m = str(raw).strip().lower()
        if m in ALL_ORDER_COMPATIBLE_MODES:
            return m
    return ALL_MODE_RUNTIME_DEFAULT


def effective_all_order_sort(row: PickingConfig | None) -> str:
    """Efektywna kolejność all — ``all_order_sort`` lub fallback na wspólny ``order_sort``."""
    if row is None:
        return "date"
    raw = getattr(row, "all_order_sort", None)
    if raw is not None and str(raw).strip():
        s = str(raw).strip().lower()
        if s in ("date", "location", "courier"):
            return s
    shared = (getattr(row, "order_sort", None) or "date").strip().lower()
    if shared in ("date", "location", "courier"):
        return shared
    return "date"


def resolve_order_sort_for_tour(pc: PickingConfig | None, order_type: str) -> str:
    ot = (order_type or "all").strip().lower()
    if ot == "all":
        return effective_all_order_sort(pc)
    if pc is None:
        return "date"
    shared = (getattr(pc, "order_sort", None) or "date").strip().lower()
    return shared if shared in ("date", "location", "courier") else "date"


def warehouse_has_consolidation_racks(db: Session, *, tenant_id: int, warehouse_id: int) -> bool:
    from ..models.consolidation_rack import ConsolidationRack

    row = (
        db.query(ConsolidationRack.id)
        .filter(
            ConsolidationRack.tenant_id == int(tenant_id),
            ConsolidationRack.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    return row is not None


def assert_consolidation_rack_modes_valid(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    single_mode: PickingConfigMode,
    multi_mode: PickingConfigMode,
) -> None:
    if str(single_mode).strip().lower() == "consolidation_rack":
        raise ValueError("Regał kompletacyjny jest dostępny tylko dla zamówień wieloelementowych.")
    if str(multi_mode).strip().lower() == "consolidation_rack":
        if not warehouse_has_consolidation_racks(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)):
            raise ValueError(
                "Brak skonfigurowanych regałów kompletacyjnych w magazynie — "
                "dodaj regał przed wyborem trybu „Regał kompletacyjny”."
            )


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

    assert_consolidation_rack_modes_valid(
        db,
        tenant_id=int(body.tenant_id),
        warehouse_id=int(body.warehouse_id),
        single_mode=body.single_mode,
        multi_mode=body.multi_mode,
    )

    all_mode = normalize_all_mode_for_storage(getattr(body, "all_mode", None), required=False)
    all_order_sort = normalize_all_order_sort_for_storage(
        getattr(body, "all_order_sort", None), required=False
    )
    if all_mode is not None and all_order_sort is None:
        # Gdy świadomie zapisano all_mode — wymagaj sortu (albo użyj wspólnego order_sort).
        all_order_sort = normalize_all_order_sort_for_storage(
            body.order_sort or "date", required=True
        )

    ms, mm, ma = normalize_bulk_max_fields(
        body.single_mode,
        body.multi_mode,
        body.max_single_orders,
        body.max_multi_orders,
        all_mode=all_mode,
        max_all_orders=getattr(body, "max_all_orders", None),
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
        all_mode=all_mode,
        all_order_sort=all_order_sort,
        max_single_orders=ms,
        max_multi_orders=mm,
        max_all_orders=ma,
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

    assert_consolidation_rack_modes_valid(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        single_mode=body.single_mode,
        multi_mode=body.multi_mode,
    )

    all_mode = normalize_all_mode_for_storage(getattr(body, "all_mode", None), required=False)
    all_order_sort = normalize_all_order_sort_for_storage(
        getattr(body, "all_order_sort", None), required=False
    )
    if all_mode is not None and all_order_sort is None:
        all_order_sort = normalize_all_order_sort_for_storage(
            body.order_sort or "date", required=True
        )

    ms, mm, ma = normalize_bulk_max_fields(
        body.single_mode,
        body.multi_mode,
        body.max_single_orders,
        body.max_multi_orders,
        all_mode=all_mode,
        max_all_orders=getattr(body, "max_all_orders", None),
    )
    pu, os, strat = coalesce_pick_fields(body.strategy, body.pick_unit, body.order_sort)

    existing.target_status_id = int(body.target_status_id)
    existing.status_on_shortage_id = int(shortage_id) if shortage_id is not None else None
    existing.strategy = strat
    existing.pick_unit = pu
    existing.order_sort = os
    existing.single_mode = str(body.single_mode)
    existing.multi_mode = str(body.multi_mode)
    existing.all_mode = all_mode
    existing.all_order_sort = all_order_sort
    existing.max_single_orders = ms
    existing.max_multi_orders = mm
    existing.max_all_orders = ma
    db.add(existing)
    db.flush()
    return existing


def picking_config_to_read(row: PickingConfig) -> PickingConfigRead:
    base = PickingConfigRead.model_validate(row)
    src = getattr(row, "source_status", None)
    tgt = getattr(row, "target_status", None)
    sh = getattr(row, "shortage_status", None)
    raw_all = getattr(row, "all_mode", None)
    all_mode_out: str | None = None
    if raw_all is not None and str(raw_all).strip():
        m = str(raw_all).strip().lower()
        if m in ALL_ORDER_COMPATIBLE_MODES:
            all_mode_out = m
    raw_aos = getattr(row, "all_order_sort", None)
    aos_out: PickingConfigOrderSort | None = None
    if raw_aos is not None and str(raw_aos).strip().lower() in ("date", "location", "courier"):
        aos_out = str(raw_aos).strip().lower()  # type: ignore[assignment]
    return base.model_copy(
        update={
            "source_status_name": str(src.name) if src is not None else None,
            "target_status_name": str(tgt.name) if tgt is not None else None,
            "status_on_shortage_id": getattr(row, "status_on_shortage_id", None),
            "status_on_shortage_name": str(sh.name) if sh is not None else None,
            "all_mode": all_mode_out,
            "all_order_sort": aos_out,
            "max_all_orders": getattr(row, "max_all_orders", None),
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
    prepared: list[tuple[WmsPickingConfigReplaceItem, str, str]] = []
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
        assert_consolidation_rack_modes_valid(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            single_mode=i.single_mode,
            multi_mode=i.multi_mode,
        )
        # Pełny zapis z UI: all_mode + all_order_sort wymagane.
        all_mode = normalize_all_mode_for_storage(getattr(i, "all_mode", None), required=True)
        assert all_mode is not None
        all_order_sort = normalize_all_order_sort_for_storage(
            getattr(i, "all_order_sort", None) or i.order_sort,
            required=True,
        )
        assert all_order_sort is not None
        prepared.append((i, all_mode, all_order_sort))

    db.query(PickingConfig).filter(
        PickingConfig.tenant_id == int(tenant_id),
        PickingConfig.warehouse_id == int(warehouse_id),
    ).delete(synchronize_session=False)

    out: list[PickingConfig] = []
    for i, all_mode, all_order_sort in prepared:
        ms, mm, ma = normalize_bulk_max_fields(
            i.single_mode,
            i.multi_mode,
            i.max_single_orders,
            i.max_multi_orders,
            all_mode=all_mode,
            max_all_orders=getattr(i, "max_all_orders", None),
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
            all_mode=all_mode,
            all_order_sort=all_order_sort,
            max_single_orders=ms,
            max_multi_orders=mm,
            max_all_orders=ma,
        )
        db.add(row)
        out.append(row)
    db.flush()
    return out
