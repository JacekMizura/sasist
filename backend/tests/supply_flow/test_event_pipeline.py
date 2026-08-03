"""ETAP 3A — Event Pipeline: publish → dispatcher → engine (no direct WMS→Engine)."""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inbound_delivery import DeliveryItem, InboundDelivery
from backend.models.supplier import Supplier
from backend.models.supply_flow import (
    SupplyFlowPhaseHistory,
    SupplyFlowPlan,
    SupplyFlowWarehouseConfig,
)
from backend.services.supply_flow.constants import SUPPLY_FLOW_PHASE_ROZLADUNEK
from backend.services.supply_flow.events import (
    EVENT_ETA_CHANGED,
    EVENT_NEW_DELIVERY,
    EVENT_UNLOAD_FINISHED,
    describe_pipeline,
    publish_supply_flow_event,
)
from backend.services.supply_flow.events.buffer import clear_buffer, peek_buffer
from backend.services.supply_flow.events.dispatcher import (
    dedupe_events,
    select_primary_event,
)
from backend.services.supply_flow.events.types import SupplyFlowEvent


@pytest.fixture()
def db():
    clear_buffer()
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
        conn.execute(
            text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY, tenant_id INTEGER, name VARCHAR)")
        )
        conn.execute(text("INSERT INTO warehouses (id, tenant_id, name) VALUES (1, 1, 'WH')"))
        conn.execute(
            text(
                """
                CREATE TABLE stock_documents (
                    id INTEGER PRIMARY KEY,
                    tenant_id INTEGER,
                    warehouse_id INTEGER,
                    delivery_id INTEGER,
                    document_type VARCHAR,
                    receiving_status VARCHAR,
                    putaway_status VARCHAR,
                    status VARCHAR
                )
                """
            )
        )
    Supplier.__table__.create(engine, checkfirst=True)
    InboundDelivery.__table__.create(engine, checkfirst=True)
    DeliveryItem.__table__.create(engine, checkfirst=True)
    SupplyFlowPhaseHistory.__table__.create(engine, checkfirst=True)
    SupplyFlowWarehouseConfig.__table__.create(engine, checkfirst=True)
    SupplyFlowPlan.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Supplier(id=1, tenant_id=1, name="Sup", active=True))
    session.commit()
    try:
        yield session
    finally:
        clear_buffer()
        session.close()


def test_pipeline_architecture_contract():
    info = describe_pipeline()
    assert info["module_may_call"] == ["publish_supply_flow_event"]
    assert "SupplyFlowEngine" in info["module_must_not_call"]
    assert info["flow"][0] == "WMS module"
    assert info["flow"][-1] == "LivingSupplyFlowPlan"


def test_dedupe_keeps_last_same_key():
    a = SupplyFlowEvent(
        event_type=EVENT_NEW_DELIVERY, tenant_id=1, warehouse_id=1, delivery_id=5
    )
    b = SupplyFlowEvent(
        event_type=EVENT_NEW_DELIVERY,
        tenant_id=1,
        warehouse_id=1,
        delivery_id=5,
        payload={"n": 2},
    )
    out = dedupe_events([a, b])
    assert len(out) == 1
    assert out[0].payload.get("n") == 2


def test_priority_prefers_unload_over_eta():
    eta = SupplyFlowEvent(event_type=EVENT_ETA_CHANGED, tenant_id=1, warehouse_id=1)
    unload = SupplyFlowEvent(event_type=EVENT_UNLOAD_FINISHED, tenant_id=1, warehouse_id=1)
    assert select_primary_event([eta, unload]).event_type == EVENT_UNLOAD_FINISHED


def test_publish_dispatch_creates_plan(db):
    d = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        warehouse_id=1,
        status="received",
        operational_phase=SUPPLY_FLOW_PHASE_ROZLADUNEK,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(d)
    db.flush()

    publish_supply_flow_event(
        db,
        event_type=EVENT_UNLOAD_FINISHED,
        tenant_id=1,
        warehouse_id=1,
        delivery_id=int(d.id),
        pz_id=99,
        source="test",
    )
    db.commit()

    assert peek_buffer() == []
    plan = db.query(SupplyFlowPlan).filter_by(tenant_id=1, warehouse_id=1).one()
    assert plan.last_recompute_trigger == "UNLOAD_FINISHED"
    assert d.operational_phase == "OCZEKUJE_ROZLOKOWANIA"


def test_debounce_groups_two_events_one_recompute(db):
    publish_supply_flow_event(
        db,
        event_type=EVENT_NEW_DELIVERY,
        tenant_id=1,
        warehouse_id=1,
        delivery_id=1,
        dispatch=False,
    )
    publish_supply_flow_event(
        db,
        event_type=EVENT_ETA_CHANGED,
        tenant_id=1,
        warehouse_id=1,
        delivery_id=1,
        dispatch=False,
    )
    assert len(peek_buffer()) == 2

    from backend.services.supply_flow.events import dispatch_pending_events

    result = dispatch_pending_events(db)
    db.commit()
    assert len(result.batches) == 1
    assert result.batches[0].events_after_dedupe == 2
    # NEW_DELIVERY has higher priority than ETA
    assert result.batches[0].primary_event_type == EVENT_NEW_DELIVERY
    plan = db.query(SupplyFlowPlan).filter_by(tenant_id=1, warehouse_id=1).one()
    assert plan.plan_version == 1
    assert plan.last_recompute_trigger == "NEW_DELIVERY"
