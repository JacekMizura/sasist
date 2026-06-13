"""P3 — order fulfillment assignment lifecycle tests."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.order import Order
from backend.models.order_fulfillment_assignment_audit import OrderFulfillmentAssignmentAudit
from backend.models.tenant import Tenant
from backend.models.tenant_fulfillment_configuration import TenantFulfillmentConfiguration
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.fulfillment_assignment.constants import (
    FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE,
    FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY,
    FULFILLMENT_ASSIGNMENT_MANUAL,
)
from backend.services.fulfillment_assignment.phase_constants import (
    PHASE_FULFILLMENT_ASSIGNED,
    PHASE_PACKING,
    PHASE_PICKING,
    PHASE_UNASSIGNED,
    PHASE_WAVE_CREATED,
)
from backend.services.order_fulfillment_lifecycle_service import (
    FulfillmentWarehouseAssignmentError,
    apply_initial_fulfillment_assignment,
    assert_can_assign_fulfillment_warehouse,
    assign_order_fulfillment_warehouse,
    maybe_apply_import_warehouse_fields,
    on_packing_started,
    on_picking_started,
    on_wave_created_for_orders,
)


@pytest.fixture
def lifecycle_db():
    engine = create_engine("sqlite:///:memory:")

    Tenant.__table__.create(engine, checkfirst=True)
    Warehouse.__table__.create(engine, checkfirst=True)
    TenantWarehouse.__table__.create(engine, checkfirst=True)
    TenantFulfillmentConfiguration.__table__.create(engine, checkfirst=True)
    Order.__table__.create(engine, checkfirst=True)
    OrderFulfillmentAssignmentAudit.__table__.create(engine, checkfirst=True)

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


def _new_order(db, *, number: str, warehouse_id: int = 1) -> Order:
    order = Order(
        tenant_id=1,
        warehouse_id=warehouse_id,
        number=number,
        status="NEW",
        fulfillment_assignment_phase=PHASE_FULFILLMENT_ASSIGNED,
    )
    db.add(order)
    db.flush()
    return order


def test_manual_mode_sets_unassigned(lifecycle_db):
    db = lifecycle_db
    _set_mode(db, FULFILLMENT_ASSIGNMENT_MANUAL)
    order = _new_order(db, number="M-1")
    apply_initial_fulfillment_assignment(db, order)
    db.commit()

    assert order.fulfillment_assignment_phase == PHASE_UNASSIGNED
    assert order.warehouse_id == 1
    audits = db.query(OrderFulfillmentAssignmentAudit).filter_by(order_id=order.id).all()
    assert len(audits) == 1
    assert audits[0].strategy == FULFILLMENT_ASSIGNMENT_MANUAL


def test_default_warehouse_mode_sets_assigned(lifecycle_db):
    db = lifecycle_db
    _set_mode(db, FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE)
    order = _new_order(db, number="D-1", warehouse_id=2)
    apply_initial_fulfillment_assignment(db, order)
    db.commit()

    assert order.fulfillment_assignment_phase == PHASE_FULFILLMENT_ASSIGNED
    assert order.warehouse_id == 1


def test_fulfillment_priority_mode_sets_assigned(lifecycle_db):
    db = lifecycle_db
    _set_mode(db, FULFILLMENT_ASSIGNMENT_FULFILLMENT_PRIORITY)
    order = _new_order(db, number="P-1")
    apply_initial_fulfillment_assignment(db, order)
    db.commit()

    assert order.fulfillment_assignment_phase == PHASE_FULFILLMENT_ASSIGNED
    assert order.warehouse_id == 2


def test_manual_assign_inserts_audit(lifecycle_db):
    db = lifecycle_db
    _set_mode(db, FULFILLMENT_ASSIGNMENT_MANUAL)
    order = _new_order(db, number="A-1")
    apply_initial_fulfillment_assignment(db, order)
    db.commit()

    assign_order_fulfillment_warehouse(
        db,
        order,
        warehouse_id=2,
        reason="Decyzja operatora",
        assigned_by_user_id=99,
        strategy="MANUAL",
    )
    db.commit()

    assert order.warehouse_id == 2
    assert order.fulfillment_assignment_phase == PHASE_FULFILLMENT_ASSIGNED
    audits = (
        db.query(OrderFulfillmentAssignmentAudit)
        .filter_by(order_id=order.id)
        .order_by(OrderFulfillmentAssignmentAudit.id)
        .all()
    )
    assert len(audits) == 2
    assert audits[-1].assigned_warehouse_id == 2
    assert audits[-1].strategy == "MANUAL"
    assert audits[-1].reason == "Decyzja operatora"
    assert audits[-1].assigned_by_user_id == 99


@pytest.mark.parametrize(
    "phase, advance_fn",
    [
        (PHASE_WAVE_CREATED, lambda o: on_wave_created_for_orders([o])),
        (PHASE_PICKING, on_picking_started),
        (PHASE_PACKING, on_packing_started),
    ],
)
def test_warehouse_change_locked_after_wms_phases(lifecycle_db, phase, advance_fn):
    db = lifecycle_db
    order = _new_order(db, number=f"L-{phase}")
    advance_fn(order)
    db.commit()

    assert order.fulfillment_assignment_phase == phase
    with pytest.raises(FulfillmentWarehouseAssignmentError):
        assert_can_assign_fulfillment_warehouse(order)


def test_import_does_not_overwrite_warehouse_when_assigned(lifecycle_db):
    db = lifecycle_db
    order = _new_order(db, number="I-1", warehouse_id=1)
    order.fulfillment_assignment_phase = PHASE_FULFILLMENT_ASSIGNED
    db.commit()

    maybe_apply_import_warehouse_fields(order, import_warehouse_id=2)
    assert order.warehouse_id == 1


def test_import_may_overwrite_warehouse_when_unassigned(lifecycle_db):
    db = lifecycle_db
    order = _new_order(db, number="I-2", warehouse_id=1)
    order.fulfillment_assignment_phase = PHASE_UNASSIGNED
    db.commit()

    maybe_apply_import_warehouse_fields(order, import_warehouse_id=2)
    assert order.warehouse_id == 2
