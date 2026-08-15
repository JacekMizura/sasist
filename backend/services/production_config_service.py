"""
CRUD + walidacje konfiguracji produkcji (SSOT zapisu).

Storage: ``picking_config`` z ``is_production_mode=True`` + ``name`` / ``is_active``.
Pola zbierania (strategy/modes) wypełniane domyślnymi wartościami — niewidoczne w UI Produkcji.
"""

from __future__ import annotations

from typing import Any, Optional, Sequence

from sqlalchemy.orm import Session

from ..models.picking_config import (
    AFTER_PRODUCTION_ACTION_STATUS_ONLY,
    AFTER_PRODUCTION_ACTIONS,
    PRODUCTION_EXECUTION_METHOD_WMS,
    PRODUCTION_EXECUTION_METHODS,
    PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT,
    PRODUCTION_ORDER_TRIGGER_SCOPES,
    PickingConfig,
)
from ..models.production import ProductionOrder
from ..schemas.production_config import (
    ProductionConfigCreate,
    ProductionConfigRead,
    ProductionConfigUpdate,
)
from .production_config_query import (
    get_production_config_by_id,
    list_production_configs,
)

#: Dummy picking fields — required by shared table, unused by production runtime.
_PROD_DUMMY_STRATEGY = "locations"
_PROD_DUMMY_PICK_UNIT = "products"
_PROD_DUMMY_ORDER_SORT = "date"
_PROD_DUMMY_MODE = "bulk"


def _normalize_production_payload(
    *,
    source_status_id: int,
    status_after_production_id: int | None,
    status_on_component_shortage_id: int | None,
    status_awaiting_production_id: int | None,
    finished_goods_buffer_location_id: int | None,
    production_order_trigger_scope: str | None,
    production_execution_method: str | None,
    after_production_action: str | None,
    name: str | None,
) -> tuple[str, int, int, int, int, str, str, str]:
    after_id = int(status_after_production_id) if status_after_production_id is not None else None
    shortage_id = (
        int(status_on_component_shortage_id) if status_on_component_shortage_id is not None else None
    )
    awaiting_id = (
        int(status_awaiting_production_id) if status_awaiting_production_id is not None else None
    )
    buffer_id = (
        int(finished_goods_buffer_location_id) if finished_goods_buffer_location_id is not None else None
    )
    if after_id is None:
        raise ValueError("Konfiguracja produkcji wymaga statusu po wyprodukowaniu.")
    if shortage_id is None:
        raise ValueError("Konfiguracja produkcji wymaga statusu przy braku komponentów.")
    if awaiting_id is None:
        raise ValueError("Konfiguracja produkcji wymaga statusu oczekiwania na produkcję.")
    if buffer_id is None:
        raise ValueError("Konfiguracja produkcji wymaga lokalizacji buforowej produktu gotowego.")
    if after_id == int(source_status_id):
        raise ValueError("Status po wyprodukowaniu musi być inny niż status wejściowy produkcji.")
    if shortage_id == int(source_status_id):
        raise ValueError("Status przy braku komponentów musi być inny niż status wejściowy produkcji.")
    if awaiting_id == int(source_status_id):
        raise ValueError("Status oczekiwania na produkcję musi być inny niż status wejściowy produkcji.")
    if awaiting_id == shortage_id:
        raise ValueError(
            "Status oczekiwania na produkcję musi być inny niż status przy braku komponentów."
        )
    if awaiting_id == after_id:
        raise ValueError(
            "Status oczekiwania na produkcję musi być inny niż status po wyprodukowaniu."
        )

    scope_raw = (production_order_trigger_scope or PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT).strip()
    if scope_raw not in PRODUCTION_ORDER_TRIGGER_SCOPES:
        raise ValueError(
            "Trigger produkcji z zamówień obsługuje obecnie wyłącznie zamówienia jednoelementowe "
            "(SINGLE_ELEMENT)."
        )
    method_raw = (production_execution_method or PRODUCTION_EXECUTION_METHOD_WMS).strip().upper()
    if method_raw not in PRODUCTION_EXECUTION_METHODS:
        raise ValueError("Sposób realizacji produkcji musi być WMS albo Wydruk zlecenia.")
    action_raw = (after_production_action or AFTER_PRODUCTION_ACTION_STATUS_ONLY).strip().upper()
    if action_raw not in AFTER_PRODUCTION_ACTIONS:
        raise ValueError(
            "Opcja „Po wyprodukowaniu” musi być „Zmień status” albo „Przejdź do pakowania”."
        )
    nm = (name or "").strip()
    if not nm:
        raise ValueError("Nazwa konfiguracji produkcji jest wymagana.")
    if len(nm) > 128:
        raise ValueError("Nazwa konfiguracji produkcji może mieć max. 128 znaków.")
    return nm, after_id, shortage_id, awaiting_id, buffer_id, scope_raw, method_raw, action_raw


def validate_production_config_conflicts(
    items: Sequence[Any],
    *,
    standard_source_status_ids: set[int] | None = None,
) -> None:
    """
    Cross-config rules (produkcja vs standardowe zbieranie):
    - production entry unique
    - status_after unique among production
    - status_after ≠ standard picking entry
    - status_after ≠ any production entry
    - production entry ≠ standard picking entry
    - awaiting ≠ standard picking entry / production entry / after / shortage
    """
    production_sources: set[int] = set()
    after_production: set[int] = set()
    awaiting_statuses: set[int] = set()
    shortage_statuses: set[int] = set()
    standard_sources = set(standard_source_status_ids or ())

    for i in items:
        sid = int(getattr(i, "source_status_id"))
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
        awaiting_id = getattr(i, "status_awaiting_production_id", None)
        if awaiting_id is not None:
            awaiting_statuses.add(int(awaiting_id))
        shortage_id = getattr(i, "status_on_component_shortage_id", None)
        if shortage_id is not None:
            shortage_statuses.add(int(shortage_id))

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

    if awaiting_statuses & standard_sources:
        raise ValueError(
            "Status oczekiwania na produkcję nie może być statusem wejściowym standardowego zbierania."
        )
    if awaiting_statuses & production_sources:
        raise ValueError(
            "Status oczekiwania na produkcję nie może być statusem wejściowym produkcji."
        )
    if awaiting_statuses & after_production:
        raise ValueError(
            "Status oczekiwania na produkcję nie może być statusem po wyprodukowaniu."
        )
    if awaiting_statuses & shortage_statuses:
        raise ValueError(
            "Status oczekiwania na produkcję nie może być statusem przy braku komponentów."
        )


def _standard_source_ids(db: Session, *, tenant_id: int, warehouse_id: int) -> set[int]:
    rows = (
        db.query(PickingConfig.source_status_id)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
            PickingConfig.is_production_mode.is_(False),
        )
        .all()
    )
    return {int(r[0]) for r in rows}


def _production_peer_items(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    exclude_id: int | None,
    candidate: Any,
) -> list[Any]:
    peers = list_production_configs(db, tenant_id=tenant_id, warehouse_id=warehouse_id, include_inactive=True)
    out: list[Any] = []
    for p in peers:
        if exclude_id is not None and int(p.id) == int(exclude_id):
            continue
        if not bool(getattr(p, "is_active", True)):
            continue
        out.append(p)
    if bool(getattr(candidate, "is_active", True)):
        out.append(candidate)
    return out


def production_config_to_read(row: PickingConfig) -> ProductionConfigRead:
    src = getattr(row, "source_status", None)
    after = getattr(row, "status_after_production", None)
    shortage = getattr(row, "status_on_component_shortage", None)
    awaiting = getattr(row, "status_awaiting_production", None)
    buf = getattr(row, "finished_goods_buffer_location", None)
    name = (getattr(row, "name", None) or "").strip()
    if not name and src is not None:
        name = f"Produkcja — {src.name}"
    if not name:
        name = f"Produkcja #{row.id}"
    after_id = getattr(row, "status_after_production_id", None) or getattr(row, "target_status_id", None)
    shortage_id = getattr(row, "status_on_component_shortage_id", None)
    awaiting_id = getattr(row, "status_awaiting_production_id", None)
    buffer_id = getattr(row, "finished_goods_buffer_location_id", None)
    scope = getattr(row, "production_order_trigger_scope", None) or PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT
    method = getattr(row, "production_execution_method", None) or PRODUCTION_EXECUTION_METHOD_WMS
    action = getattr(row, "after_production_action", None) or AFTER_PRODUCTION_ACTION_STATUS_ONLY
    return ProductionConfigRead.model_validate(
        {
            "id": int(row.id),
            "tenant_id": int(row.tenant_id),
            "warehouse_id": int(row.warehouse_id),
            "name": name,
            "is_active": bool(getattr(row, "is_active", True)),
            "source_status_id": int(row.source_status_id),
            "status_after_production_id": int(after_id),
            "status_on_component_shortage_id": int(shortage_id),
            "status_awaiting_production_id": int(awaiting_id) if awaiting_id is not None else None,
            "finished_goods_buffer_location_id": int(buffer_id),
            "production_order_trigger_scope": scope,
            "production_execution_method": str(method).upper(),
            "after_production_action": str(action).upper(),
            "created_at": row.created_at,
            "source_status_name": str(src.name) if src is not None else None,
            "status_after_production_name": str(after.name) if after is not None else None,
            "status_on_component_shortage_name": str(shortage.name) if shortage is not None else None,
            "status_awaiting_production_name": str(awaiting.name) if awaiting is not None else None,
            "finished_goods_buffer_location_name": str(buf.name) if buf is not None else None,
        }
    )


def create_production_config(db: Session, body: ProductionConfigCreate) -> PickingConfig:
    from .picking_config_service import (
        assert_finished_goods_buffer_location,
        assert_ui_status_belongs,
    )

    nm, after_id, shortage_id, awaiting_id, buffer_id, scope, method, action = _normalize_production_payload(
        source_status_id=int(body.source_status_id),
        status_after_production_id=body.status_after_production_id,
        status_on_component_shortage_id=body.status_on_component_shortage_id,
        status_awaiting_production_id=body.status_awaiting_production_id,
        finished_goods_buffer_location_id=body.finished_goods_buffer_location_id,
        production_order_trigger_scope=body.production_order_trigger_scope,
        production_execution_method=body.production_execution_method,
        after_production_action=body.after_production_action,
        name=body.name,
    )
    assert_ui_status_belongs(
        db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=int(body.source_status_id)
    )
    assert_ui_status_belongs(
        db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=after_id
    )
    assert_ui_status_belongs(
        db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=shortage_id
    )
    assert_ui_status_belongs(
        db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=awaiting_id
    )
    assert_finished_goods_buffer_location(
        db,
        tenant_id=int(body.tenant_id),
        warehouse_id=int(body.warehouse_id),
        location_id=buffer_id,
    )

    existing_any = (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(body.tenant_id),
            PickingConfig.warehouse_id == int(body.warehouse_id),
            PickingConfig.source_status_id == int(body.source_status_id),
        )
        .first()
    )
    if existing_any is not None:
        raise ValueError(
            "Ten status wejściowy jest już używany w konfiguracji zbierania lub produkcji."
        )

    class _Cand:
        source_status_id = int(body.source_status_id)
        status_after_production_id = after_id
        status_awaiting_production_id = awaiting_id
        status_on_component_shortage_id = shortage_id
        is_active = bool(body.is_active)

    validate_production_config_conflicts(
        _production_peer_items(
            db,
            tenant_id=int(body.tenant_id),
            warehouse_id=int(body.warehouse_id),
            exclude_id=None,
            candidate=_Cand(),
        ),
        standard_source_status_ids=_standard_source_ids(
            db, tenant_id=int(body.tenant_id), warehouse_id=int(body.warehouse_id)
        ),
    )

    row = PickingConfig(
        tenant_id=int(body.tenant_id),
        warehouse_id=int(body.warehouse_id),
        name=nm,
        is_active=bool(body.is_active),
        source_status_id=int(body.source_status_id),
        target_status_id=after_id,
        status_on_shortage_id=None,
        strategy=_PROD_DUMMY_STRATEGY,
        pick_unit=_PROD_DUMMY_PICK_UNIT,
        order_sort=_PROD_DUMMY_ORDER_SORT,
        single_mode=_PROD_DUMMY_MODE,
        multi_mode=_PROD_DUMMY_MODE,
        all_mode=_PROD_DUMMY_MODE,
        all_order_sort=_PROD_DUMMY_ORDER_SORT,
        max_single_orders=None,
        max_multi_orders=None,
        max_all_orders=None,
        is_production_mode=True,
        status_after_production_id=after_id,
        status_on_component_shortage_id=shortage_id,
        status_awaiting_production_id=awaiting_id,
        finished_goods_buffer_location_id=buffer_id,
        production_order_trigger_scope=scope,
        production_execution_method=method,
        after_production_action=action,
    )
    db.add(row)
    db.flush()
    return get_production_config_by_id(db, int(row.id)) or row


def update_production_config(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    existing: PickingConfig,
    body: ProductionConfigUpdate,
) -> PickingConfig:
    from .picking_config_service import (
        assert_finished_goods_buffer_location,
        assert_ui_status_belongs,
    )

    if not bool(getattr(existing, "is_production_mode", False)):
        raise ValueError("To nie jest konfiguracja produkcji.")
    if int(existing.tenant_id) != int(tenant_id) or int(existing.warehouse_id) != int(warehouse_id):
        raise ValueError("Konfiguracja nie należy do wskazanego magazynu.")

    nm, after_id, shortage_id, awaiting_id, buffer_id, scope, method, action = _normalize_production_payload(
        source_status_id=int(body.source_status_id),
        status_after_production_id=body.status_after_production_id,
        status_on_component_shortage_id=body.status_on_component_shortage_id,
        status_awaiting_production_id=body.status_awaiting_production_id,
        finished_goods_buffer_location_id=body.finished_goods_buffer_location_id,
        production_order_trigger_scope=body.production_order_trigger_scope,
        production_execution_method=body.production_execution_method,
        after_production_action=body.after_production_action,
        name=body.name,
    )
    new_source_id = int(body.source_status_id)
    assert_ui_status_belongs(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=new_source_id
    )
    assert_ui_status_belongs(db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=after_id)
    assert_ui_status_belongs(db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=shortage_id)
    assert_ui_status_belongs(db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=awaiting_id)
    assert_finished_goods_buffer_location(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), location_id=buffer_id
    )

    if new_source_id != int(existing.source_status_id):
        clash = (
            db.query(PickingConfig)
            .filter(
                PickingConfig.tenant_id == int(tenant_id),
                PickingConfig.warehouse_id == int(warehouse_id),
                PickingConfig.source_status_id == new_source_id,
                PickingConfig.id != int(existing.id),
            )
            .first()
        )
        if clash is not None:
            raise ValueError(
                "Ten status wejściowy jest już używany w konfiguracji zbierania lub produkcji."
            )

    class _Cand:
        source_status_id = new_source_id
        status_after_production_id = after_id
        status_awaiting_production_id = awaiting_id
        status_on_component_shortage_id = shortage_id
        is_active = bool(body.is_active)

    validate_production_config_conflicts(
        _production_peer_items(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            exclude_id=int(existing.id),
            candidate=_Cand(),
        ),
        standard_source_status_ids=_standard_source_ids(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
        ),
    )

    existing.name = nm
    existing.is_active = bool(body.is_active)
    existing.source_status_id = new_source_id
    existing.target_status_id = after_id
    existing.status_after_production_id = after_id
    existing.status_on_component_shortage_id = shortage_id
    existing.status_awaiting_production_id = awaiting_id
    existing.finished_goods_buffer_location_id = buffer_id
    existing.production_order_trigger_scope = scope
    existing.production_execution_method = method
    existing.after_production_action = action
    db.add(existing)
    db.flush()
    return get_production_config_by_id(db, int(existing.id)) or existing


def disable_production_config(db: Session, row: PickingConfig) -> PickingConfig:
    if not bool(getattr(row, "is_production_mode", False)):
        raise ValueError("To nie jest konfiguracja produkcji.")
    row.is_active = False
    db.add(row)
    db.flush()
    return row


def delete_or_disable_production_config(db: Session, row: PickingConfig) -> str:
    """
    Usuwa konfigurację, gdy brak historycznych MO; inaczej soft-disable.
    Zwraca ``deleted`` | ``disabled``.
    """
    if not bool(getattr(row, "is_production_mode", False)):
        raise ValueError("To nie jest konfiguracja produkcji.")
    mo_count = (
        db.query(ProductionOrder.id)
        .filter(ProductionOrder.picking_config_id == int(row.id))
        .limit(1)
        .count()
    )
    if mo_count > 0:
        disable_production_config(db, row)
        return "disabled"
    db.delete(row)
    db.flush()
    return "deleted"


def backfill_production_config_display_names(db: Session) -> int:
    """Uzupełnia puste ``name`` dla istniejących production-mode configs (migracja UX)."""
    rows = (
        db.query(PickingConfig)
        .filter(PickingConfig.is_production_mode.is_(True))
        .all()
    )
    n = 0
    for row in rows:
        if (getattr(row, "name", None) or "").strip():
            continue
        src = getattr(row, "source_status", None)
        if src is None:
            from ..models.order_ui_status import OrderUiStatus

            src = db.query(OrderUiStatus).filter(OrderUiStatus.id == int(row.source_status_id)).first()
        label = str(src.name).strip() if src is not None else f"#{row.source_status_id}"
        row.name = f"Produkcja — {label}"
        if getattr(row, "is_active", None) is None:
            row.is_active = True
        db.add(row)
        n += 1
    if n:
        db.flush()
    return n
