"""P5.6 — consolidation rack dashboard tests."""

from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from backend.models.product import Product
from backend.models.order import Order
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_consolidation.constants import (
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_STAGING,
)
from backend.services.order_consolidation.rack_dashboard_service import (
    SEGMENT_STATE_EXCEPTION,
    SEGMENT_STATE_FREE,
    SEGMENT_STATE_READY_TO_PACK,
    SEGMENT_STATE_STAGING,
    build_consolidation_rack_dashboard,
)
from backend.services.order_fulfillment_state import READY_TO_PACK


def _make_db():
    engine = create_engine("sqlite:///:memory:")

    class QueryCounter:
        count = 0

    for model in (
        Tenant,
        Warehouse,
        Product,
        Order,
        OrderConsolidationPlan,
        OrderConsolidationPlanItem,
        ConsolidationRack,
        ConsolidationRackLevel,
        RackSegment,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="A", default_warehouse_id=2))
    db.add(Tenant(id=2, name="B", default_warehouse_id=4))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.add(Warehouse(id=4, tenant_id=2, name="Gdańsk"))
    for pid in (101, 102, 103, 104):
        db.add(Product(id=pid, tenant_id=1, name=f"P{pid}", sku=f"S{pid}"))
    db.commit()
    return db, engine, QueryCounter


def _rack_with_segments(db, *, tenant_id: int, warehouse_id: int, rack_name: str) -> ConsolidationRack:
    rack = ConsolidationRack(tenant_id=tenant_id, warehouse_id=warehouse_id, name=rack_name)
    db.add(rack)
    db.flush()
    level_a = ConsolidationRackLevel(rack_id=int(rack.id), level_index=0, name="A", is_segmented=True)
    level_b = ConsolidationRackLevel(rack_id=int(rack.id), level_index=1, name="B", is_segmented=True)
    db.add_all([level_a, level_b])
    db.flush()
    db.add_all(
        [
            RackSegment(level_id=int(level_a.id), segment_index=0, order_id=None, fill_percent=0.0),
            RackSegment(level_id=int(level_a.id), segment_index=1, order_id=None, fill_percent=0.0),
            RackSegment(level_id=int(level_b.id), segment_index=0, order_id=None, fill_percent=0.0),
        ]
    )
    db.commit()
    db.refresh(rack)
    return rack


def test_free_segment():
    db, _, _ = _make_db()
    _rack_with_segments(db, tenant_id=1, warehouse_id=2, rack_name="RK-01")
    payload = build_consolidation_rack_dashboard(db, tenant_id=1, warehouse_id=2)
    seg = payload["racks"][0]["levels"][0]["segments"][0]
    assert seg["state"] == SEGMENT_STATE_FREE
    assert seg["order_id"] is None
    assert payload["summary"]["free_count"] == 3
    assert payload["summary"]["occupied_count"] == 0
    assert payload["summary"]["remaining_percent"] == 100.0


def test_occupied_staging_segment():
    db, _, _ = _make_db()
    _rack_with_segments(db, tenant_id=1, warehouse_id=2, rack_name="RK-01")
    order = Order(
        tenant_id=1,
        warehouse_id=2,
        number="1234",
        status="NEW",
        addresses_json='{"billing":{"Imię":"Jan","Nazwisko":"Kowalski"}}',
    )
    db.add(order)
    db.flush()
    plan = OrderConsolidationPlan(
        order_id=int(order.id),
        target_warehouse_id=2,
        status=PLAN_STATUS_STAGING,
    )
    db.add(plan)
    db.flush()
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan.id),
            product_id=101,
            quantity=1,
            source_warehouse_id=2,
            target_warehouse_id=2,
            status="STAGED",
        )
    )
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan.id),
            product_id=102,
            quantity=1,
            source_warehouse_id=1,
            target_warehouse_id=2,
            status="RECEIVED",
        )
    )
    seg = db.query(RackSegment).filter(RackSegment.segment_index == 1).first()
    seg.order_id = int(order.id)
    seg.fill_percent = 50.0
    db.commit()

    payload = build_consolidation_rack_dashboard(db, tenant_id=1, warehouse_id=2)
    occupied = next(s for lvl in payload["racks"][0]["levels"] for s in lvl["segments"] if s["order_id"] == int(order.id))
    assert occupied["state"] == SEGMENT_STATE_STAGING
    assert occupied["order_number"] == "1234"
    assert occupied["customer_name"] == "Jan Kowalski"
    assert occupied["plan_status"] == PLAN_STATUS_STAGING
    assert occupied["mm_staging_label"] == "0/1"
    assert occupied["local_staging_label"] == "1/1"
    assert payload["summary"]["occupied_count"] == 1


def test_ready_to_pack_segment():
    db, _, _ = _make_db()
    _rack_with_segments(db, tenant_id=1, warehouse_id=2, rack_name="RK-01")
    order = Order(
        tenant_id=1,
        warehouse_id=2,
        number="5678",
        status="NEW",
        fulfillment_state=READY_TO_PACK,
    )
    db.add(order)
    db.flush()
    plan = OrderConsolidationPlan(
        order_id=int(order.id),
        target_warehouse_id=2,
        status="COMPLETED",
    )
    db.add(plan)
    db.flush()
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan.id),
            product_id=101,
            quantity=1,
            source_warehouse_id=2,
            target_warehouse_id=2,
            status="STAGED",
        )
    )
    seg = db.query(RackSegment).first()
    seg.order_id = int(order.id)
    db.commit()

    payload = build_consolidation_rack_dashboard(db, tenant_id=1, warehouse_id=2)
    occupied = next(s for lvl in payload["racks"][0]["levels"] for s in lvl["segments"] if s["order_id"])
    assert occupied["state"] == SEGMENT_STATE_READY_TO_PACK
    assert occupied["packing_ready"] is True
    assert payload["summary"]["ready_to_pack_count"] == 1


def test_exception_segment():
    db, _, _ = _make_db()
    _rack_with_segments(db, tenant_id=1, warehouse_id=2, rack_name="RK-01")
    order = Order(tenant_id=1, warehouse_id=2, number="ERR-1", status="NEW")
    db.add(order)
    db.flush()
    plan = OrderConsolidationPlan(
        order_id=int(order.id),
        target_warehouse_id=2,
        status=PLAN_STATUS_EXCEPTION,
    )
    db.add(plan)
    db.flush()
    db.add(
        OrderConsolidationPlanItem(
            plan_id=int(plan.id),
            product_id=101,
            quantity=1,
            source_warehouse_id=1,
            target_warehouse_id=2,
            status="SHORTAGE",
        )
    )
    seg = db.query(RackSegment).first()
    seg.order_id = int(order.id)
    db.commit()

    payload = build_consolidation_rack_dashboard(db, tenant_id=1, warehouse_id=2)
    occupied = next(s for lvl in payload["racks"][0]["levels"] for s in lvl["segments"] if s["order_id"])
    assert occupied["state"] == SEGMENT_STATE_EXCEPTION
    assert payload["summary"]["exception_count"] == 1


def test_multi_tenant_isolation():
    db, _, _ = _make_db()
    _rack_with_segments(db, tenant_id=1, warehouse_id=2, rack_name="RK-01")
    _rack_with_segments(db, tenant_id=2, warehouse_id=4, rack_name="RK-99")
    payload = build_consolidation_rack_dashboard(db, tenant_id=1, warehouse_id=2)
    assert len(payload["racks"]) == 1
    assert payload["racks"][0]["rack_name"] == "RK-01"


def test_no_n_plus_one():
    db, engine, counter = _make_db()

    @event.listens_for(engine, "before_cursor_execute")
    def _count_queries(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            counter.count += 1

    _rack_with_segments(db, tenant_id=1, warehouse_id=2, rack_name="RK-01")
    _rack_with_segments(db, tenant_id=1, warehouse_id=2, rack_name="RK-02")
    for i in range(4):
        order = Order(tenant_id=1, warehouse_id=2, number=f"O-{i}", status="NEW", fulfillment_state=READY_TO_PACK)
        db.add(order)
        db.flush()
        plan = OrderConsolidationPlan(
            order_id=int(order.id),
            target_warehouse_id=2,
            status="COMPLETED",
        )
        db.add(plan)
        db.flush()
        db.add(
            OrderConsolidationPlanItem(
                plan_id=int(plan.id),
                product_id=100 + i,
                quantity=1,
                source_warehouse_id=2,
                target_warehouse_id=2,
                status="STAGED",
            )
        )
        seg = db.query(RackSegment).filter(RackSegment.order_id.is_(None)).first()
        seg.order_id = int(order.id)
    db.commit()

    counter.count = 0
    build_consolidation_rack_dashboard(db, tenant_id=1, warehouse_id=2)
    event.remove(engine, "before_cursor_execute", _count_queries)
    assert counter.count <= 5, f"Expected bulk queries, got {counter.count}"
