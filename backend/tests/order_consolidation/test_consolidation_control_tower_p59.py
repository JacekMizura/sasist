"""P5.9 — consolidation control tower tests."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from backend.models.order import Order
from backend.models.order_consolidation_alert import OrderConsolidationAlert
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_consolidation.consolidation_control_tower_service import (
    ALERT_READY_FOR_STAGING_30,
    ALERT_READY_TO_PACK_60,
    ALERT_STAGING_240,
    build_consolidation_tower_alerts,
    build_consolidation_tower_queues,
    build_consolidation_tower_racks,
    build_consolidation_tower_summary,
)
from backend.services.order_consolidation.constants import (
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_STAGED,
    ITEM_STATUS_TO_PICK,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_READY_FOR_STAGING,
    PLAN_STATUS_STAGING,
)
from backend.services.order_fulfillment_state import READY_TO_PACK


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Order,
        OrderConsolidationPlan,
        OrderConsolidationPlanItem,
        OrderConsolidationAlert,
        ConsolidationRack,
        ConsolidationRackLevel,
        RackSegment,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=2))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.add(Warehouse(id=3, tenant_id=1, name="Warszawa"))
    db.add(Product(id=101, tenant_id=1, name="Produkt A", sku="A"))
    db.commit()
    return db


def _rack_with_segment(db) -> RackSegment:
    rack = ConsolidationRack(tenant_id=1, warehouse_id=2, name="RK-01")
    db.add(rack)
    db.flush()
    level = ConsolidationRackLevel(rack_id=int(rack.id), level_index=0, name="A", is_segmented=True)
    db.add(level)
    db.flush()
    seg = RackSegment(level_id=int(level.id), segment_index=0, order_id=None, fill_percent=0.0)
    db.add(seg)
    db.commit()
    return seg


def _plan(db, *, number: str, status: str, fulfillment: str = "PICKING") -> tuple[OrderConsolidationPlan, Order]:
    order = Order(
        tenant_id=1,
        warehouse_id=2,
        number=number,
        status="NEW",
        fulfillment_state=fulfillment,
    )
    db.add(order)
    db.flush()
    plan = OrderConsolidationPlan(order_id=int(order.id), target_warehouse_id=2, status=status)
    plan.updated_at = datetime.utcnow()
    db.add(plan)
    db.flush()
    return plan, order


def test_summary_counts_and_rack_occupancy():
    db = _make_db()
    seg = _rack_with_segment(db)
    _plan(db, number="RFS-1", status=PLAN_STATUS_READY_FOR_STAGING)
    plan_st, order_st = _plan(db, number="STG-1", status=PLAN_STATUS_STAGING)
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan_st.id),
            product_id=101,
            quantity=1.0,
            source_warehouse_id=2,
            target_warehouse_id=2,
            status=ITEM_STATUS_TO_PICK,
        )
    )
    seg.order_id = int(order_st.id)
    db.commit()

    payload = build_consolidation_tower_summary(db, tenant_id=1, warehouse_id=2)
    assert payload["counts"]["READY_FOR_STAGING"] == 1
    assert payload["counts"]["STAGING"] == 1
    assert payload["rack_summary"]["total_segments"] == 1
    assert payload["rack_summary"]["occupied_segments"] == 1
    assert payload["rack_summary"]["free_segments"] == 0


def test_queues_split_by_status():
    db = _make_db()
    _rack_with_segment(db)
    _plan(db, number="RFS", status=PLAN_STATUS_READY_FOR_STAGING)
    plan_st, order_st = _plan(db, number="STG", status=PLAN_STATUS_STAGING)
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan_st.id),
            product_id=101,
            quantity=1.0,
            source_warehouse_id=2,
            target_warehouse_id=2,
            status=ITEM_STATUS_RECEIVED,
        )
    )
    plan_rtp, order_rtp = _plan(db, number="RTP", status=PLAN_STATUS_COMPLETED, fulfillment=READY_TO_PACK)
    db.commit()

    queues = build_consolidation_tower_queues(db, tenant_id=1, warehouse_id=2)
    assert len(queues["ready_for_staging"]) == 1
    assert queues["ready_for_staging"][0]["order_number"] == "RFS"
    assert len(queues["staging"]) == 1
    assert queues["staging"][0]["order_number"] == "STG"
    assert queues["staging"][0]["pending_count"] == 1
    assert len(queues["ready_to_pack"]) == 1
    assert queues["ready_to_pack"][0]["order_number"] == "RTP"
    assert len(queues["bottlenecks"]) <= 20


def test_sla_alerts_ready_for_staging_and_staging():
    db = _make_db()
    _rack_with_segment(db)
    plan_rfs, _ = _plan(db, number="OLD-RFS", status=PLAN_STATUS_READY_FOR_STAGING)
    plan_rfs.updated_at = datetime.utcnow() - timedelta(minutes=45)
    plan_st, _ = _plan(db, number="OLD-STG", status=PLAN_STATUS_STAGING)
    plan_st.updated_at = datetime.utcnow() - timedelta(minutes=300)
    db.commit()

    alerts = build_consolidation_tower_alerts(db, tenant_id=1, warehouse_id=2)
    codes = {a["code"] for a in alerts["alerts"]}
    assert ALERT_READY_FOR_STAGING_30 in codes
    assert ALERT_STAGING_240 in codes


def test_sla_alert_ready_to_pack_critical():
    db = _make_db()
    _rack_with_segment(db)
    plan, order = _plan(db, number="RTP-OLD", status=PLAN_STATUS_COMPLETED, fulfillment=READY_TO_PACK)
    plan.updated_at = datetime.utcnow() - timedelta(minutes=90)
    db.commit()

    alerts = build_consolidation_tower_alerts(db, tenant_id=1, warehouse_id=2)
    codes = {a["code"] for a in alerts["alerts"]}
    assert ALERT_READY_TO_PACK_60 in codes


def test_racks_payload_includes_segment_state():
    db = _make_db()
    seg = _rack_with_segment(db)
    plan, order = _plan(db, number="RK-ORD", status=PLAN_STATUS_STAGING)
    seg.order_id = int(order.id)
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan.id),
            product_id=101,
            quantity=1.0,
            source_warehouse_id=2,
            target_warehouse_id=2,
            status=ITEM_STATUS_STAGED,
        )
    )
    db.commit()

    racks = build_consolidation_tower_racks(db, tenant_id=1, warehouse_id=2)
    assert len(racks["racks"]) == 1
    rack = racks["racks"][0]
    assert rack["rack_name"] == "RK-01"
    assert rack["total_segments"] == 1
    assert rack["occupied_segments"] == 1
    assert rack["segments"][0]["order_number"] == "RK-ORD"
    assert rack["segments"][0]["shelf_label"].startswith("RK-01/")
