"""Supply Flow stage-2 — wiring: orchestration, hooks, CTA, SSOT putaway reads."""

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
from backend.services.supply_flow.constants import (
    DEFAULT_OPTIMIZATION_GOAL,
    DEFAULT_PLANNING_HORIZON_HOURS,
    RECOMPUTE_MANUAL,
    SUPPLY_FLOW_PHASE_AWIZOWANA,
    SUPPLY_FLOW_PHASE_NA_RAMPIE,
    SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    SUPPLY_FLOW_PHASE_ROZLADUNEK,
    SUPPLY_FLOW_PHASE_W_DRODZE,
)
from backend.services.supply_flow.cta import cta_for_phase
from backend.services.supply_flow.hooks import notify_unload_finished
from backend.services.supply_flow.lifecycle import (
    SupplyFlowLifecycleError,
    can_transition,
    is_purchase_phase_combination_allowed,
    set_operational_phase,
)
from backend.services.supply_flow.orchestration import advance_toward_phase
from backend.services.supply_flow.recompute import RecomputeRequest, request_recompute


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
        conn.execute(
            text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY, tenant_id INTEGER, name VARCHAR)")
        )
        conn.execute(text("INSERT INTO warehouses (id, tenant_id, name) VALUES (1, 1, 'WH')"))
        # Minimal stock_documents for putaway adapter / unload hook lookups.
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
        session.close()


def test_phase_transition_happy_path(db):
    assert can_transition(SUPPLY_FLOW_PHASE_AWIZOWANA, SUPPLY_FLOW_PHASE_W_DRODZE)
    d = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        warehouse_id=1,
        status="ordered",
        operational_phase=SUPPLY_FLOW_PHASE_AWIZOWANA,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(d)
    db.flush()
    hist = set_operational_phase(
        db,
        delivery=d,
        to_phase=SUPPLY_FLOW_PHASE_W_DRODZE,
        source="api",
        is_automatic=False,
        comment="test",
    )
    db.commit()
    assert d.operational_phase == SUPPLY_FLOW_PHASE_W_DRODZE
    assert hist.from_phase == SUPPLY_FLOW_PHASE_AWIZOWANA
    assert hist.to_phase == SUPPLY_FLOW_PHASE_W_DRODZE
    assert hist.is_automatic is False
    assert d.status == "ordered"


def test_phase_transition_rejects_invalid_jump(db):
    d = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        warehouse_id=1,
        status="draft",
        operational_phase=SUPPLY_FLOW_PHASE_AWIZOWANA,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(d)
    db.flush()
    with pytest.raises(SupplyFlowLifecycleError):
        set_operational_phase(db, delivery=d, to_phase=SUPPLY_FLOW_PHASE_ROZLADUNEK)


def test_matrix_rejects_draft_beyond_awizowana(db):
    assert is_purchase_phase_combination_allowed("draft", SUPPLY_FLOW_PHASE_AWIZOWANA)
    assert not is_purchase_phase_combination_allowed("draft", SUPPLY_FLOW_PHASE_W_DRODZE)
    d = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        warehouse_id=1,
        status="draft",
        operational_phase=SUPPLY_FLOW_PHASE_AWIZOWANA,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(d)
    db.flush()
    with pytest.raises(SupplyFlowLifecycleError, match="Niedozwolona kombinacja"):
        set_operational_phase(db, delivery=d, to_phase=SUPPLY_FLOW_PHASE_W_DRODZE)
    assert d.operational_phase == SUPPLY_FLOW_PHASE_AWIZOWANA
    assert d.status == "draft"


def test_matrix_received_allows_ramp_phases():
    assert is_purchase_phase_combination_allowed("received", SUPPLY_FLOW_PHASE_NA_RAMPIE)
    assert is_purchase_phase_combination_allowed("received", SUPPLY_FLOW_PHASE_ROZLADUNEK)
    assert not is_purchase_phase_combination_allowed("received", SUPPLY_FLOW_PHASE_AWIZOWANA)
    assert not is_purchase_phase_combination_allowed("received", SUPPLY_FLOW_PHASE_W_DRODZE)


def test_advance_received_to_oczekuje_skips_w_drodze(db):
    d = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        warehouse_id=1,
        status="received",
        operational_phase=SUPPLY_FLOW_PHASE_AWIZOWANA,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(d)
    db.flush()
    applied = advance_toward_phase(
        db, delivery=d, target_phase=SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA
    )
    db.commit()
    assert SUPPLY_FLOW_PHASE_W_DRODZE not in applied
    assert d.operational_phase == SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA
    assert d.status == "received"
    assert applied == [
        SUPPLY_FLOW_PHASE_NA_RAMPIE,
        SUPPLY_FLOW_PHASE_ROZLADUNEK,
        SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA,
    ]


def test_cta_putaway_for_oczekuje():
    cta = cta_for_phase(SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA, delivery_id=9, pz_id=3)
    assert cta is not None
    assert cta.module == "putaway"
    assert cta.path == "/wms/putaway/3"


def test_recompute_reads_config_and_sets_v1_stage(db):
    result = request_recompute(
        db,
        RecomputeRequest(tenant_id=1, warehouse_id=1, trigger=RECOMPUTE_MANUAL),
    )
    db.commit()
    assert result.plan_version == 1
    assert result.optimization_goal == DEFAULT_OPTIMIZATION_GOAL
    assert result.planning_horizon_hours == DEFAULT_PLANNING_HORIZON_HOURS
    assert result.projection.meta.get("stage") == "v1_pipeline"
    assert "config_used" in (result.projection.meta or {})

    cfg = db.query(SupplyFlowWarehouseConfig).filter_by(tenant_id=1, warehouse_id=1).one()
    assert cfg.optimization_goal == DEFAULT_OPTIMIZATION_GOAL

    row = db.query(SupplyFlowPlan).filter_by(tenant_id=1, warehouse_id=1).one()
    assert row.plan_version == 1
    assert "optimization_goal" not in SupplyFlowPlan.__table__.c

    result2 = request_recompute(
        db,
        RecomputeRequest(tenant_id=1, warehouse_id=1, trigger=RECOMPUTE_MANUAL),
    )
    db.commit()
    assert result2.plan_version == 2


def test_notify_unload_advances_and_recomputation(db):
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
    db.execute(
        text(
            "INSERT INTO stock_documents "
            "(id, tenant_id, warehouse_id, delivery_id, document_type, "
            "receiving_status, putaway_status, status) "
            "VALUES (10, 1, 1, :did, 'PZ', 'DONE', 'NOT_STARTED', 'draft')"
        ),
        {"did": int(d.id)},
    )
    db.flush()

    out = notify_unload_finished(db, tenant_id=1, pz_id=10)
    db.commit()
    assert out.get("ok") is True
    assert d.operational_phase == SUPPLY_FLOW_PHASE_OCZEKUJE_ROZLOKOWANIA
    plan = db.query(SupplyFlowPlan).filter_by(tenant_id=1, warehouse_id=1).one()
    assert plan.last_recompute_trigger == "UNLOAD_FINISHED"
    assert plan.cta_json is not None
