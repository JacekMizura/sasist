"""
Odczyt i utrzymanie rekordów ``PickingConfig``.

Bez integracji z przypisaniami zamówień, stanem magazynowym ani MM.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Sequence, Tuple

from sqlalchemy.orm import Session, joinedload

from ..models.order_ui_status import OrderUiStatus
from ..models.picking_config import (
    AFTER_PRODUCTION_ACTION_STATUS_ONLY,
    AFTER_PRODUCTION_ACTIONS,
    PRODUCTION_EXECUTION_METHOD_PRINT,
    PRODUCTION_EXECUTION_METHOD_WMS,
    PRODUCTION_EXECUTION_METHODS,
    PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT,
    PRODUCTION_ORDER_TRIGGER_SCOPES,
    PickingConfig,
)
from ..models.location import Location
from ..models.warehouse import Warehouse
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

#: SSOT wizualnego priorytetu zamówienia: ``Order.priority_color`` (OMS flame).
#: Niższa wartość = wyższy priorytet przy doborze zbioru zbierania.
_ORDER_PRIORITY_RANK: dict[str, int] = {
    "red": 0,
    "orange": 1,
    "yellow": 2,
    "green": 3,
    "blue": 4,
    "gray": 5,
}


def order_priority_rank(order: Any) -> int:
    """Rank z ``Order.priority_color`` — brak koloru = najniższy priorytet (na końcu)."""
    pc = (getattr(order, "priority_color", None) or "").strip().lower()
    return priority_color_rank(pc)


def priority_color_rank(priority_color: str | None) -> int:
    """Rank z surowego tokenu ``priority_color`` (np. z API order row)."""
    pc = (priority_color or "").strip().lower()
    if not pc:
        return 99
    return int(_ORDER_PRIORITY_RANK.get(pc, 50))


def sort_orders_for_picking_batch(
    orders: Sequence[Any],
    *,
    order_sort: str = "date",
) -> list[Any]:
    """
    Kolejność kandydatów do zbioru zbierania:
    1) priorytet zamówienia (``priority_color``) — zawsze pierwszy klucz,
    2) skonfigurowany ``order_sort`` (date / location / courier).
    """
    if not orders:
        return []
    osrt = (order_sort or "date").strip().lower()
    if osrt not in ("date", "location", "courier"):
        osrt = "date"

    def _secondary(o: Any) -> tuple:
        if osrt == "location":
            return (int(getattr(o, "id", 0) or 0),)
        # date + courier (grupy kurierskie — ten sam fallback co dotychczas: najstarsze pierwsze)
        dt = getattr(o, "order_date", None) or getattr(o, "created_at", None) or datetime.min
        return (dt, int(getattr(o, "id", 0) or 0))

    return sorted(list(orders), key=lambda o: (order_priority_rank(o), *_secondary(o)))


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


def assert_finished_goods_buffer_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
) -> Location:
    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    if loc is None:
        raise ValueError("Lokalizacja buforowa nie istnieje.")
    if int(loc.warehouse_id) != int(warehouse_id):
        raise ValueError("Lokalizacja buforowa nie należy do wybranego magazynu.")
    wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
    if wh is None or int(getattr(wh, "tenant_id", 0) or 0) != int(tenant_id):
        raise ValueError("Lokalizacja buforowa nie należy do wybranego tenanta/magazynu.")
    if not bool(getattr(loc, "is_active", True)):
        raise ValueError("Lokalizacja buforowa musi być aktywna.")
    return loc


def _normalize_production_fields(
    *,
    is_production_mode: bool,
    status_after_production_id: int | None,
    status_on_component_shortage_id: int | None,
    finished_goods_buffer_location_id: int | None,
    production_order_trigger_scope: str | None,
    source_status_id: int,
    production_execution_method: str | None = None,
    after_production_action: str | None = None,
) -> tuple[bool, int | None, int | None, int | None, str | None, str | None, str | None]:
    if not is_production_mode:
        return False, None, None, None, None, None, None

    after_id = int(status_after_production_id) if status_after_production_id is not None else None
    shortage_id = (
        int(status_on_component_shortage_id) if status_on_component_shortage_id is not None else None
    )
    buffer_id = (
        int(finished_goods_buffer_location_id) if finished_goods_buffer_location_id is not None else None
    )
    if after_id is None:
        raise ValueError("Tryb produkcji wymaga statusu po wyprodukowaniu.")
    if shortage_id is None:
        raise ValueError("Tryb produkcji wymaga statusu przy braku komponentów.")
    if buffer_id is None:
        raise ValueError("Tryb produkcji wymaga lokalizacji buforowej produktu gotowego.")
    if after_id == int(source_status_id):
        raise ValueError("Status po wyprodukowaniu musi być inny niż status wejściowy produkcji.")
    if shortage_id == int(source_status_id):
        raise ValueError("Status przy braku komponentów musi być inny niż status wejściowy produkcji.")

    scope_raw = (production_order_trigger_scope or PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT).strip()
    if scope_raw not in PRODUCTION_ORDER_TRIGGER_SCOPES:
        raise ValueError(
            "Trigger produkcji z zamówień obsługuje obecnie wyłącznie zamówienia jednoelementowe "
            "(SINGLE_ELEMENT)."
        )
    method_raw = (production_execution_method or PRODUCTION_EXECUTION_METHOD_WMS).strip().upper()
    if method_raw not in PRODUCTION_EXECUTION_METHODS:
        raise ValueError("Sposób realizacji produkcji musi być Terminal WMS albo Wydruk zlecenia.")
    action_raw = (after_production_action or AFTER_PRODUCTION_ACTION_STATUS_ONLY).strip().upper()
    if action_raw not in AFTER_PRODUCTION_ACTIONS:
        raise ValueError(
            "Opcja „Po wyprodukowaniu” musi być „Tylko zmień status” albo „Otwórz pakowanie”."
        )
    return True, after_id, shortage_id, buffer_id, scope_raw, method_raw, action_raw


def validate_production_mode_batch(
    items: Sequence[Any],
) -> None:
    """
    Cross-config rules for production vs standard picking / packing handoff:
    - production entry status cannot also be a standard picking entry
    - production entry status unique among production configs
    - status_after_production cannot be a standard picking entry (would re-trigger picking)
    - status_after_production cannot be any production entry status
    - status_after_production unique among production configs (unambiguous packing handoff)
    """
    production_sources: set[int] = set()
    standard_sources: set[int] = set()
    after_production: set[int] = set()

    for i in items:
        is_prod = bool(getattr(i, "is_production_mode", False))
        sid = int(getattr(i, "source_status_id"))
        if is_prod:
            if sid in production_sources:
                raise ValueError(
                    "Ten sam status wejściowy produkcji nie może wystąpić w więcej niż jednej "
                    "konfiguracji produkcyjnej."
                )
            production_sources.add(sid)
            after_id = getattr(i, "status_after_production_id", None)
            if after_id is not None:
                aid = int(after_id)
                if aid in after_production:
                    raise ValueError(
                        "Ten sam status po wyprodukowaniu nie może być przypisany do więcej niż "
                        "jednej konfiguracji produkcyjnej."
                    )
                after_production.add(aid)
        else:
            standard_sources.add(sid)

    overlap = production_sources & standard_sources
    if overlap:
        raise ValueError(
            "Status produkcyjny nie może być jednocześnie używany jako status standardowego zbierania."
        )

    reentry = after_production & standard_sources
    if reentry:
        raise ValueError(
            "Status po wyprodukowaniu nie może być statusem wejściowym standardowego zbierania "
            "(ponowne uruchomienie pickingu)."
        )

    after_as_prod_source = after_production & production_sources
    if after_as_prod_source:
        raise ValueError(
            "Status po wyprodukowaniu nie może być statusem wejściowym innego trybu produkcji."
        )


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
            joinedload(PickingConfig.status_after_production),
            joinedload(PickingConfig.status_on_component_shortage),
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

    is_prod, after_prod_id, comp_shortage_id, buffer_id, trigger_scope, exec_method, after_action = (
        _normalize_production_fields(
            is_production_mode=bool(getattr(body, "is_production_mode", False)),
            status_after_production_id=getattr(body, "status_after_production_id", None),
            status_on_component_shortage_id=getattr(body, "status_on_component_shortage_id", None),
            finished_goods_buffer_location_id=getattr(body, "finished_goods_buffer_location_id", None),
            production_order_trigger_scope=getattr(body, "production_order_trigger_scope", None),
            production_execution_method=getattr(body, "production_execution_method", None),
            after_production_action=getattr(body, "after_production_action", None),
            source_status_id=int(body.source_status_id),
        )
    )
    if is_prod:
        assert_ui_status_belongs(
            db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=int(after_prod_id)
        )
        assert_ui_status_belongs(
            db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=int(comp_shortage_id)
        )
        assert_finished_goods_buffer_location(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(body.warehouse_id),
            location_id=int(buffer_id),
        )
        # Align target with after-production when production mode (status flow SSOT later).
        if int(body.target_status_id) != int(after_prod_id):
            body = body.model_copy(update={"target_status_id": int(after_prod_id)})

    existing_rows = list_picking_configs(
        db, tenant_id=int(body.tenant_id), warehouse_id=int(body.warehouse_id)
    )
    validate_production_mode_batch(
        [
            *[
                type(
                    "Cfg",
                    (),
                    {
                        "is_production_mode": bool(getattr(r, "is_production_mode", False)),
                        "source_status_id": int(r.source_status_id),
                        "status_after_production_id": getattr(r, "status_after_production_id", None),
                    },
                )()
                for r in existing_rows
            ],
            type(
                "Cfg",
                (),
                {
                    "is_production_mode": is_prod,
                    "source_status_id": int(body.source_status_id),
                    "status_after_production_id": after_prod_id,
                },
            )(),
        ]
    )

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
        is_production_mode=is_prod,
        status_after_production_id=after_prod_id,
        status_on_component_shortage_id=comp_shortage_id,
        finished_goods_buffer_location_id=buffer_id,
        production_order_trigger_scope=trigger_scope,
        production_execution_method=exec_method or PRODUCTION_EXECUTION_METHOD_WMS,
        after_production_action=after_action or AFTER_PRODUCTION_ACTION_STATUS_ONLY,
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

    is_prod, after_prod_id, comp_shortage_id, buffer_id, trigger_scope, exec_method, after_action = (
        _normalize_production_fields(
            is_production_mode=bool(getattr(body, "is_production_mode", False)),
            status_after_production_id=getattr(body, "status_after_production_id", None),
            status_on_component_shortage_id=getattr(body, "status_on_component_shortage_id", None),
            finished_goods_buffer_location_id=getattr(body, "finished_goods_buffer_location_id", None),
            production_order_trigger_scope=getattr(body, "production_order_trigger_scope", None),
            production_execution_method=getattr(body, "production_execution_method", None),
            after_production_action=getattr(body, "after_production_action", None),
            source_status_id=int(existing.source_status_id),
        )
    )
    if is_prod:
        assert_ui_status_belongs(db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=int(after_prod_id))
        assert_ui_status_belongs(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=int(comp_shortage_id)
        )
        assert_finished_goods_buffer_location(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            location_id=int(buffer_id),
        )
        body = body.model_copy(update={"target_status_id": int(after_prod_id)})

    peers = [
        r
        for r in list_picking_configs(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
        if int(r.id) != int(existing.id)
    ]
    validate_production_mode_batch(
        [
            *[
                type(
                    "Cfg",
                    (),
                    {
                        "is_production_mode": bool(getattr(r, "is_production_mode", False)),
                        "source_status_id": int(r.source_status_id),
                        "status_after_production_id": getattr(r, "status_after_production_id", None),
                    },
                )()
                for r in peers
            ],
            type(
                "Cfg",
                (),
                {
                    "is_production_mode": is_prod,
                    "source_status_id": int(existing.source_status_id),
                    "status_after_production_id": after_prod_id,
                },
            )(),
        ]
    )

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
    existing.is_production_mode = is_prod
    existing.status_after_production_id = after_prod_id
    existing.status_on_component_shortage_id = comp_shortage_id
    existing.finished_goods_buffer_location_id = buffer_id
    existing.production_order_trigger_scope = trigger_scope
    existing.production_execution_method = exec_method or PRODUCTION_EXECUTION_METHOD_WMS
    existing.after_production_action = after_action or AFTER_PRODUCTION_ACTION_STATUS_ONLY
    db.add(existing)
    db.flush()
    return existing


def picking_config_to_read(row: PickingConfig) -> PickingConfigRead:
    base = PickingConfigRead.model_validate(row)
    src = getattr(row, "source_status", None)
    tgt = getattr(row, "target_status", None)
    sh = getattr(row, "shortage_status", None)
    after_prod = getattr(row, "status_after_production", None)
    comp_sh = getattr(row, "status_on_component_shortage", None)
    buf = getattr(row, "finished_goods_buffer_location", None)
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
    scope = getattr(row, "production_order_trigger_scope", None)
    scope_out = str(scope).strip() if scope and str(scope).strip() in PRODUCTION_ORDER_TRIGGER_SCOPES else None
    method_raw = str(getattr(row, "production_execution_method", None) or PRODUCTION_EXECUTION_METHOD_WMS).strip().upper()
    method_out = method_raw if method_raw in PRODUCTION_EXECUTION_METHODS else PRODUCTION_EXECUTION_METHOD_WMS
    action_raw = str(
        getattr(row, "after_production_action", None) or AFTER_PRODUCTION_ACTION_STATUS_ONLY
    ).strip().upper()
    action_out = action_raw if action_raw in AFTER_PRODUCTION_ACTIONS else AFTER_PRODUCTION_ACTION_STATUS_ONLY
    return base.model_copy(
        update={
            "source_status_name": str(src.name) if src is not None else None,
            "target_status_name": str(tgt.name) if tgt is not None else None,
            "status_on_shortage_id": getattr(row, "status_on_shortage_id", None),
            "status_on_shortage_name": str(sh.name) if sh is not None else None,
            "all_mode": all_mode_out,
            "all_order_sort": aos_out,
            "max_all_orders": getattr(row, "max_all_orders", None),
            "is_production_mode": bool(getattr(row, "is_production_mode", False)),
            "status_after_production_id": getattr(row, "status_after_production_id", None),
            "status_on_component_shortage_id": getattr(row, "status_on_component_shortage_id", None),
            "finished_goods_buffer_location_id": getattr(row, "finished_goods_buffer_location_id", None),
            "production_order_trigger_scope": scope_out,
            "production_execution_method": method_out,
            "after_production_action": action_out,
            "status_after_production_name": str(after_prod.name) if after_prod is not None else None,
            "status_on_component_shortage_name": str(comp_sh.name) if comp_sh is not None else None,
            "finished_goods_buffer_location_name": str(buf.name) if buf is not None else None,
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
    prepared: list[tuple[WmsPickingConfigReplaceItem, str, str, tuple]] = []
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
        is_prod, after_prod_id, comp_shortage_id, buffer_id, trigger_scope, exec_method, after_action = (
            _normalize_production_fields(
                is_production_mode=bool(getattr(i, "is_production_mode", False)),
                status_after_production_id=getattr(i, "status_after_production_id", None),
                status_on_component_shortage_id=getattr(i, "status_on_component_shortage_id", None),
                finished_goods_buffer_location_id=getattr(i, "finished_goods_buffer_location_id", None),
                production_order_trigger_scope=getattr(i, "production_order_trigger_scope", None),
                production_execution_method=getattr(i, "production_execution_method", None),
                after_production_action=getattr(i, "after_production_action", None),
                source_status_id=sid,
            )
        )
        if is_prod:
            assert_ui_status_belongs(
                db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=int(after_prod_id)
            )
            assert_ui_status_belongs(
                db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=int(comp_shortage_id)
            )
            assert_finished_goods_buffer_location(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                location_id=int(buffer_id),
            )
            i = i.model_copy(
                update={
                    "target_status_id": int(after_prod_id),
                    "status_after_production_id": after_prod_id,
                    "status_on_component_shortage_id": comp_shortage_id,
                    "finished_goods_buffer_location_id": buffer_id,
                    "production_order_trigger_scope": trigger_scope,
                    "production_execution_method": exec_method,
                    "after_production_action": after_action,
                    "is_production_mode": True,
                }
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
        prepared.append(
            (
                i,
                all_mode,
                all_order_sort,
                (is_prod, after_prod_id, comp_shortage_id, buffer_id, trigger_scope, exec_method, after_action),
            )
        )

    validate_production_mode_batch([p[0] for p in prepared])

    db.query(PickingConfig).filter(
        PickingConfig.tenant_id == int(tenant_id),
        PickingConfig.warehouse_id == int(warehouse_id),
    ).delete(synchronize_session=False)

    out: list[PickingConfig] = []
    for i, all_mode, all_order_sort, prod_tuple in prepared:
        is_prod, after_prod_id, comp_shortage_id, buffer_id, trigger_scope, exec_method, after_action = prod_tuple
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
            is_production_mode=bool(is_prod),
            status_after_production_id=after_prod_id,
            status_on_component_shortage_id=comp_shortage_id,
            finished_goods_buffer_location_id=buffer_id,
            production_order_trigger_scope=trigger_scope,
            production_execution_method=exec_method or PRODUCTION_EXECUTION_METHOD_WMS,
            after_production_action=after_action or AFTER_PRODUCTION_ACTION_STATUS_ONLY,
        )
        db.add(row)
        out.append(row)
    db.flush()
    return out
