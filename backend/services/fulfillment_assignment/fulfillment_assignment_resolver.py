"""P2.5 — SSOT: resolve initial fulfillment warehouse from tenant policy (no ATP)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ..fulfillment_configuration_service import get_or_create_fulfillment_configuration
from ..tenant_default_warehouse import resolve_tenant_default_warehouse_id
from .constants import (
    FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE,
    FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE,
    FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY,
    FULFILLMENT_ASSIGNMENT_MANUAL,
)


@dataclass(frozen=True)
class FulfillmentAssignmentResolution:
    warehouse_id: int | None
    strategy: str
    requires_operator_decision: bool
    message: str | None = None


def _provisional_warehouse_id(db: Session, tenant_id: int, order: Any | None) -> int | None:
    if order is not None:
        ow = getattr(order, "warehouse_id", None)
        if ow is not None and int(ow) > 0:
            return int(ow)
    try:
        return resolve_tenant_default_warehouse_id(db, int(tenant_id))
    except ValueError:
        return None


def _resolve_by_fulfillment_priority(db: Session, tenant_id: int) -> int | None:
    from ...models.tenant_warehouse import TenantWarehouse

    row = (
        db.query(TenantWarehouse)
        .filter(
            TenantWarehouse.tenant_id == int(tenant_id),
            TenantWarehouse.fulfillment_eligible.is_(True),
        )
        .order_by(TenantWarehouse.fulfillment_priority.asc(), TenantWarehouse.warehouse_id.asc())
        .first()
    )
    if row is None:
        return None
    return int(row.warehouse_id)


def resolve_initial_fulfillment_warehouse(
    db: Session,
    *,
    tenant_id: int,
    order: Any | None = None,
) -> FulfillmentAssignmentResolution:
    """
    Resolve warehouse for order fulfillment per tenant policy.

    Does not mutate order. No ATP / auto-sourcing in P2.5.
    """
    cfg = get_or_create_fulfillment_configuration(db, int(tenant_id))
    mode = str(cfg.fulfillment_assignment_mode or FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE).strip().upper()

    if mode == FULFILLMENT_ASSIGNMENT_MANUAL:
        wid = _provisional_warehouse_id(db, tenant_id, order)
        return FulfillmentAssignmentResolution(
            warehouse_id=wid,
            strategy=FULFILLMENT_ASSIGNMENT_MANUAL,
            requires_operator_decision=True,
            message="Wymagana decyzja operatora — przypisanie magazynu realizacji (P3).",
        )

    if mode == FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE:
        wid = resolve_tenant_default_warehouse_id(db, int(tenant_id))
        return FulfillmentAssignmentResolution(
            warehouse_id=int(wid),
            strategy=FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE,
            requires_operator_decision=False,
        )

    if mode == FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY:
        wid = _resolve_by_fulfillment_priority(db, tenant_id)
        if wid is None:
            return FulfillmentAssignmentResolution(
                warehouse_id=None,
                strategy=FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY,
                requires_operator_decision=True,
                message="Brak magazynu fulfillment_eligible — skonfiguruj magazyn realizacji.",
            )
        return FulfillmentAssignmentResolution(
            warehouse_id=int(wid),
            strategy=FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY,
            requires_operator_decision=False,
        )

    if mode == FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE:
        wid = _resolve_by_fulfillment_priority(db, tenant_id)
        if wid is None:
            return FulfillmentAssignmentResolution(
                warehouse_id=None,
                strategy=FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE,
                requires_operator_decision=True,
                message="AUTO_ATP_FUTURE: brak magazynu eligible — fallback priority nieudany.",
            )
        return FulfillmentAssignmentResolution(
            warehouse_id=int(wid),
            strategy=FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE,
            requires_operator_decision=False,
            message="AUTO_ATP_FUTURE: tymczasowy fallback do priorytetu magazynów (ATP w przygotowaniu).",
        )

    wid = _provisional_warehouse_id(db, tenant_id, order)
    return FulfillmentAssignmentResolution(
        warehouse_id=wid,
        strategy=mode,
        requires_operator_decision=True,
        message=f"Nieznany tryb {mode!r} — wymagana decyzja operatora.",
    )
