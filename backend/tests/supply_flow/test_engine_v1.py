"""ETAP 3B — first real Living plan from simple engine rules."""

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
from backend.services.supply_flow.pipeline import compute_delivery_priority
from backend.services.supply_flow.constants import (
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
)
from backend.services.supply_flow.events import EVENT_MANUAL_RECOMPUTE, publish_supply_flow_event
from backend.services.supply_flow.events.buffer import clear_buffer
from backend.services.supply_flow.recompute import RecomputeRequest, request_recompute


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
        conn.execute(
            text(
                """
                CREATE TABLE inventory (
                    id INTEGER PRIMARY KEY,
                    tenant_id INTEGER,
                    warehouse_id INTEGER,
                    quantity FLOAT
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE locations (
                    id INTEGER PRIMARY KEY,
                    warehouse_id INTEGER,
                    is_active INTEGER,
                    location_type VARCHAR,
                    occupied_volume_dm3 FLOAT,
                    capacity_utilization_percent FLOAT
                )
                """
            )
        )
        conn.execute(
            text(
                "INSERT INTO locations "
                "(id, warehouse_id, is_active, location_type, occupied_volume_dm3, capacity_utilization_percent) "
                "VALUES (1, 1, 1, 'DOCK', 10, 20), (2, 1, 1, 'NORMAL', 5, 40)"
            )
        )
        conn.execute(
            text("INSERT INTO inventory (id, tenant_id, warehouse_id, quantity) VALUES (1, 1, 1, 12)")
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


def test_priority_phase_beats_awizowana():
    now = datetime.utcnow()
    p_await = compute_delivery_priority(
        phase=SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
        expected_date=None,
        phase_changed_at=now,
        recovery_open=False,
        now=now,
    )
    p_awi = compute_delivery_priority(
        phase=SUPPLY_FLOW_PHASE_AWIZOWANA,
        expected_date=None,
        phase_changed_at=now,
        recovery_open=False,
        now=now,
    )
    assert p_await > p_awi


def test_engine_builds_putaway_recommendation(db):
    d = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        warehouse_id=1,
        status="received",
        operational_phase=SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
        operational_phase_changed_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(d)
    db.flush()
    db.execute(
        text(
            "INSERT INTO stock_documents "
            "(id, tenant_id, warehouse_id, delivery_id, document_type, "
            "receiving_status, putaway_status, status) "
            "VALUES (20, 1, 1, :did, 'PZ', 'DONE', 'NOT_STARTED', 'draft')"
        ),
        {"did": int(d.id)},
    )
    db.flush()

    result = request_recompute(
        db, RecomputeRequest(tenant_id=1, warehouse_id=1, trigger="MANUAL", delivery_id=int(d.id))
    )
    db.commit()

    assert result.projection.meta.get("stage") == "v1_pipeline"
    actions = [r["action"] for r in result.projection.recommendations]
    assert "START_PUTAWAY" in actions
    assert "CONSIDER_CROSS_DOCK" in actions
    assert result.cta is not None
    assert result.cta.module == "putaway"
    assert result.cta.path == "/wms/putaway/20"
    assert result.next_action is not None
    assert result.next_action.kind == "putaway"
    assert result.projection.business_effect.get("summary")
    active = result.projection.meta.get("active_deliveries") or []
    assert any(int(x["delivery_id"]) == int(d.id) for x in active)
    assert result.projection.meta["reads"]["inventory"]["row_count"] == 1
    assert result.projection.meta["reads"]["capacity"]["dock_location_count"] == 1


def test_publish_path_still_builds_v1_plan(db):
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
        event_type=EVENT_MANUAL_RECOMPUTE,
        tenant_id=1,
        warehouse_id=1,
        delivery_id=int(d.id),
        source="test",
    )
    db.commit()
    plan = db.query(SupplyFlowPlan).filter_by(tenant_id=1, warehouse_id=1).one()
    import json

    proj = json.loads(plan.projection_json)
    assert proj["meta"]["stage"] == "v1_pipeline"
