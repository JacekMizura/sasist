"""P2.5 — tenant fulfillment assignment configuration (get / validate / save)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.tenant import Tenant
from ..models.tenant_fulfillment_configuration import TenantFulfillmentConfiguration
from ..models.tenant_warehouse import TenantWarehouse
from ..schemas.fulfillment_configuration import FulfillmentConfigurationRead, FulfillmentConfigurationUpdate
from .fulfillment_assignment.constants import (
    DEFAULT_FULFILLMENT_ASSIGNMENT_MODE,
    FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE,
    FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE,
    FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY,
    FULFILLMENT_ASSIGNMENT_MANUAL,
    FULFILLMENT_ASSIGNMENT_MODES,
)
from .tenant_default_warehouse import resolve_tenant_default_warehouse_id


class FulfillmentConfigurationError(ValueError):
    """Invalid fulfillment configuration for tenant."""


def normalize_fulfillment_assignment_mode(raw: str | None) -> str:
    mode = (raw or "").strip().upper()
    if mode not in FULFILLMENT_ASSIGNMENT_MODES:
        raise FulfillmentConfigurationError(
            f"Nieprawidłowy tryb przypisania magazynu: {raw!r}. "
            f"Dozwolone: {', '.join(FULFILLMENT_ASSIGNMENT_MODES)}."
        )
    return mode


def count_fulfillment_eligible_warehouses(db: Session, tenant_id: int) -> int:
    return int(
        db.query(TenantWarehouse)
        .filter(
            TenantWarehouse.tenant_id == int(tenant_id),
            TenantWarehouse.fulfillment_eligible.is_(True),
        )
        .count()
    )


def validate_fulfillment_assignment_mode(db: Session, tenant_id: int, mode: str) -> None:
    """Raise FulfillmentConfigurationError when mode prerequisites are not met."""
    m = normalize_fulfillment_assignment_mode(mode)
    if m == FULFILLMENT_ASSIGNMENT_MANUAL:
        return
    if m == FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE:
        try:
            resolve_tenant_default_warehouse_id(db, int(tenant_id))
        except ValueError as exc:
            raise FulfillmentConfigurationError(
                "Tryb „Domyślny magazyn” wymaga skonfigurowanego magazynu domyślnego tenanta."
            ) from exc
        return
    if m in (FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY, FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE):
        if count_fulfillment_eligible_warehouses(db, tenant_id) < 1:
            raise FulfillmentConfigurationError(
                "Tryb priorytetu realizacji wymaga co najmniej jednego magazynu z flagą „może realizować zamówienia”."
            )
        return
    raise FulfillmentConfigurationError(f"Nieobsługiwany tryb: {m}")


def get_or_create_fulfillment_configuration(db: Session, tenant_id: int) -> TenantFulfillmentConfiguration:
    tid = int(tenant_id)
    row = (
        db.query(TenantFulfillmentConfiguration)
        .filter(TenantFulfillmentConfiguration.tenant_id == tid)
        .first()
    )
    if row:
        return row
    tenant = db.query(Tenant).filter(Tenant.id == tid).first()
    if tenant is None:
        raise FulfillmentConfigurationError("Tenant not found")
    row = TenantFulfillmentConfiguration(
        tenant_id=tid,
        fulfillment_assignment_mode=DEFAULT_FULFILLMENT_ASSIGNMENT_MODE,
    )
    db.add(row)
    db.flush()
    return row


def configuration_to_read(row: TenantFulfillmentConfiguration) -> FulfillmentConfigurationRead:
    cw = getattr(row, "consolidation_warehouse_id", None)
    return FulfillmentConfigurationRead(
        tenant_id=int(row.tenant_id),
        fulfillment_assignment_mode=str(row.fulfillment_assignment_mode or DEFAULT_FULFILLMENT_ASSIGNMENT_MODE),
        consolidation_warehouse_id=int(cw) if cw is not None and int(cw) > 0 else None,
    )


def get_fulfillment_configuration(db: Session, tenant_id: int) -> FulfillmentConfigurationRead:
    row = get_or_create_fulfillment_configuration(db, tenant_id)
    return configuration_to_read(row)


def update_fulfillment_configuration(
    db: Session,
    tenant_id: int,
    body: FulfillmentConfigurationUpdate,
) -> FulfillmentConfigurationRead:
    row = get_or_create_fulfillment_configuration(db, tenant_id)
    if body.fulfillment_assignment_mode is not None:
        mode = normalize_fulfillment_assignment_mode(body.fulfillment_assignment_mode)
        validate_fulfillment_assignment_mode(db, tenant_id, mode)
        row.fulfillment_assignment_mode = mode
    if body.consolidation_warehouse_id is not None:
        cw = int(body.consolidation_warehouse_id)
        if cw <= 0:
            row.consolidation_warehouse_id = None
        else:
            tw = (
                db.query(TenantWarehouse)
                .filter(
                    TenantWarehouse.tenant_id == int(tenant_id),
                    TenantWarehouse.warehouse_id == cw,
                    TenantWarehouse.fulfillment_eligible.is_(True),
                )
                .first()
            )
            if tw is None:
                raise FulfillmentConfigurationError(
                    "Magazyn konsolidacyjny musi należeć do tenanta i mieć flagę fulfillment_eligible."
                )
            row.consolidation_warehouse_id = cw
    db.add(row)
    db.commit()
    db.refresh(row)
    return configuration_to_read(row)
