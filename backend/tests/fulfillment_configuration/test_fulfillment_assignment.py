"""P2.5 — fulfillment assignment configuration + resolver tests."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.tenant import Tenant
from backend.models.tenant_fulfillment_configuration import TenantFulfillmentConfiguration
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.fulfillment_assignment.constants import (
    FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE,
    FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE,
    FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY,
    FULFILLMENT_ASSIGNMENT_MANUAL,
)
from backend.services.fulfillment_assignment.fulfillment_assignment_resolver import (
    resolve_initial_fulfillment_warehouse,
)
from backend.services.fulfillment_configuration_service import (
    FulfillmentConfigurationError,
    validate_fulfillment_assignment_mode,
)


@pytest.fixture
def fulfillment_cfg_db():
    engine = create_engine("sqlite:///:memory:")

    Tenant.__table__.create(engine, checkfirst=True)
    Warehouse.__table__.create(engine, checkfirst=True)
    TenantWarehouse.__table__.create(engine, checkfirst=True)
    TenantFulfillmentConfiguration.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Tenant(id=1, name="Firma", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="Warszawa"))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.add(
        TenantWarehouse(
            tenant_id=1,
            warehouse_id=1,
            role="owner",
            is_default=1,
            fulfillment_eligible=True,
            fulfillment_priority=10,
        )
    )
    db.add(
        TenantWarehouse(
            tenant_id=1,
            warehouse_id=2,
            role="operator",
            is_default=0,
            fulfillment_eligible=True,
            fulfillment_priority=5,
        )
    )
    db.commit()

    try:
        yield db
    finally:
        db.close()


def _set_mode(db, mode: str) -> None:
    row = (
        db.query(TenantFulfillmentConfiguration)
        .filter(TenantFulfillmentConfiguration.tenant_id == 1)
        .first()
    )
    if row is None:
        row = TenantFulfillmentConfiguration(tenant_id=1, fulfillment_assignment_mode=mode)
        db.add(row)
    else:
        row.fulfillment_assignment_mode = mode
    db.commit()


def test_manual_requires_operator_decision(fulfillment_cfg_db):
    db = fulfillment_cfg_db
    _set_mode(db, FULFILLMENT_ASSIGNMENT_MANUAL)
    res = resolve_initial_fulfillment_warehouse(db, tenant_id=1, order=None)
    assert res.strategy == FULFILLMENT_ASSIGNMENT_MANUAL
    assert res.requires_operator_decision is True
    assert res.warehouse_id == 1
    assert res.message


def test_default_warehouse_always_tenant_default(fulfillment_cfg_db):
    db = fulfillment_cfg_db
    _set_mode(db, FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE)
    res = resolve_initial_fulfillment_warehouse(db, tenant_id=1, order=SimpleNamespace(warehouse_id=2))
    assert res.warehouse_id == 1
    assert res.strategy == FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE
    assert res.requires_operator_decision is False


def test_fulfillment_priority_picks_lowest_priority(fulfillment_cfg_db):
    db = fulfillment_cfg_db
    _set_mode(db, FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY)
    res = resolve_initial_fulfillment_warehouse(db, tenant_id=1, order=None)
    assert res.warehouse_id == 2
    assert res.strategy == FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY
    assert res.requires_operator_decision is False


def test_validation_fails_without_fulfillment_eligible(fulfillment_cfg_db):
    db = fulfillment_cfg_db
    for tw in db.query(TenantWarehouse).all():
        tw.fulfillment_eligible = False
    db.commit()
    with pytest.raises(FulfillmentConfigurationError):
        validate_fulfillment_assignment_mode(db, 1, FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY)


def test_auto_atp_future_fallback_to_priority(fulfillment_cfg_db):
    db = fulfillment_cfg_db
    _set_mode(db, FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE)
    res = resolve_initial_fulfillment_warehouse(db, tenant_id=1, order=None)
    assert res.warehouse_id == 2
    assert res.strategy == FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE
    assert "ATP" in (res.message or "")
