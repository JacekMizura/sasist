"""P5.8 — consolidation rack control tower tests."""

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
from backend.services.order_consolidation.constants import (
    ITEM_STATUS_IN_TRANSIT,
    ITEM_STATUS_STAGED,
    ITEM_STATUS_TO_PICK,
    PLAN_STATUS_COMPLETED,
    PLAN_STATUS_EXCEPTION,
    PLAN_STATUS_MANUAL_REVIEW_REQUIRED,
    PLAN_STATUS_STAGING,
)
from backend.services.order_consolidation.control_tower_service import (
    ALERT_EXCEPTION,
    ALERT_MANUAL_REVIEW,
    ALERT_READY_TO_PACK_30,
    ALERT_READY_TO_PACK_60,
    build_consolidation_control_tower,
)
from backend.services.order_consolidation.rack_dashboard_service import (
    SEGMENT_STATE_EXCEPTION,
    SEGMENT_STATE_READY_TO_PACK,
    SEGMENT_STATE_STAGING,
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
    db.add(Tenant(id=1, name="A", default_warehouse_id=2))
    db.add(Tenant(id=2, name="B", default_warehouse_id=4))
    db.add(Warehouse(id=1, tenant_id=1, name="Warszawa"))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.add(Warehouse(id=3, tenant_id=1, name="Gdańsk"))
    db.add(Warehouse(id=4, tenant_id=2, name="Kraków"))
    for pid, name in [(101, "Produkt A"), (102, "Produkt B"), (103, "Produkt C")]:
        db.add(Product(id=pid, tenant_id=1, name=name, sku=f"S{pid}"))
    db.commit()
    return db


def _rack_segment(db, *, tenant_id: int, warehouse_id: int, rack_name: str = "RK-01") -> RackSegment:
    rack = ConsolidationRack(tenant_id=tenant_id, warehouse_id=warehouse_id, name=rack_name)
    db.add(rack)
    db.flush()
    level = ConsolidationRackLevel(rack_id=int(rack.id), level_index=0, name="A", is_segmented=True)
    db.add(level)
    db.flush()
    seg = RackSegment(level_id=int(level.id), segment_index=0, order_id=None, fill_percent=0.0)
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return seg


def _occupy(
    db,
    *,
    seg: RackSegment,
    order_number: str,
    tenant_id: int = 1,
    plan_status: str = PLAN_STATUS_STAGING,
    order_status: str = "NEW",
    fulfillment_state: str | None = None,
    target_warehouse_id: int = 2,
    plan_updated_at: datetime | None = None,
) -> tuple[Order, OrderConsolidationPlan]:
    order = Order(
        tenant_id=tenant_id,
        warehouse_id=1,
        number=order_number,
        status=order_status,
        fulfillment_state=fulfillment_state,
    )
    db.add(order)
    db.flush()
    plan = OrderConsolidationPlan(
        order_id=int(order.id),
        target_warehouse_id=int(target_warehouse_id),
        status=plan_status,
    )
    if plan_updated_at is not None:
        plan.updated_at = plan_updated_at
        plan.created_at = plan_updated_at
    db.add(plan)
    db.flush()
    seg.order_id = int(order.id)
    db.commit()
    db.refresh(order)
    db.refresh(plan)
    db.refresh(seg)
    return order, plan


def _plan_item(
    db,
    plan: OrderConsolidationPlan,
    *,
    product_id: int,
    source_warehouse_id: int,
    status: str,
) -> OrderConsolidationPlanItem:
    it = OrderConsolidationPlanItem(
        plan_id=int(plan.id),
        product_id=int(product_id),
        quantity=1.0,
        source_warehouse_id=int(source_warehouse_id),
        target_warehouse_id=int(plan.target_warehouse_id),
        status=status,
    )
    db.add(it)
    db.commit()
    return it


def test_ready_to_pack_with_waiting_time():
    db = _make_db()
    seg = _rack_segment(db, tenant_id=1, warehouse_id=2)
    past = datetime.utcnow() - timedelta(minutes=42)
    order, plan = _occupy(
        db,
        seg=seg,
        order_number="RTP-1",
        plan_status=PLAN_STATUS_COMPLETED,
        fulfillment_state=READY_TO_PACK,
        plan_updated_at=past,
    )
    _plan_item(db, plan, product_id=101, source_warehouse_id=2, status=ITEM_STATUS_STAGED)

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    row = payload["shelves"][0]
    assert row["state"] == SEGMENT_STATE_READY_TO_PACK
    assert row["ready_to_pack_minutes"] >= 41
    assert row["missing_items"] == []
    assert payload["kpi"]["ready_to_pack_count"] == 1


def test_ready_to_pack_sla_alerts():
    db = _make_db()
    seg30 = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-30")
    seg60 = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-60")
    _, plan30 = _occupy(
        db,
        seg=seg30,
        order_number="SLA-30",
        plan_status=PLAN_STATUS_COMPLETED,
        fulfillment_state=READY_TO_PACK,
        plan_updated_at=datetime.utcnow() - timedelta(minutes=35),
    )
    _, plan60 = _occupy(
        db,
        seg=seg60,
        order_number="SLA-60",
        plan_status=PLAN_STATUS_COMPLETED,
        fulfillment_state=READY_TO_PACK,
        plan_updated_at=datetime.utcnow() - timedelta(minutes=65),
    )
    _plan_item(db, plan30, product_id=101, source_warehouse_id=2, status=ITEM_STATUS_STAGED)
    _plan_item(db, plan60, product_id=102, source_warehouse_id=2, status=ITEM_STATUS_STAGED)

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    by_order = {r["order_number"]: r for r in payload["shelves"]}
    assert any(a["code"] == ALERT_READY_TO_PACK_30 for a in by_order["SLA-30"]["alerts"])
    assert any(a["code"] == ALERT_READY_TO_PACK_60 for a in by_order["SLA-60"]["alerts"])


def test_exception_state_and_alert():
    db = _make_db()
    seg = _rack_segment(db, tenant_id=1, warehouse_id=2)
    _, plan = _occupy(db, seg=seg, order_number="EX-1", plan_status=PLAN_STATUS_EXCEPTION)
    _plan_item(db, plan, product_id=103, source_warehouse_id=1, status="SHORTAGE")

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    row = payload["shelves"][0]
    assert row["state"] == SEGMENT_STATE_EXCEPTION
    assert any(a["code"] == ALERT_EXCEPTION for a in row["alerts"])
    assert payload["kpi"]["exception_count"] == 1


def test_manual_review_required():
    db = _make_db()
    seg = _rack_segment(db, tenant_id=1, warehouse_id=2)
    _, plan = _occupy(db, seg=seg, order_number="MR-1", plan_status=PLAN_STATUS_MANUAL_REVIEW_REQUIRED)

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    row = payload["shelves"][0]
    assert row["plan_status"] == PLAN_STATUS_MANUAL_REVIEW_REQUIRED
    assert any(a["code"] == ALERT_MANUAL_REVIEW for a in row["alerts"])
    assert row["sort_tier"] == 0


def test_missing_mm_item():
    db = _make_db()
    seg = _rack_segment(db, tenant_id=1, warehouse_id=2)
    _, plan = _occupy(db, seg=seg, order_number="MM-1")
    _plan_item(db, plan, product_id=101, source_warehouse_id=1, status=ITEM_STATUS_STAGED)
    _plan_item(db, plan, product_id=102, source_warehouse_id=1, status=ITEM_STATUS_IN_TRANSIT)
    _plan_item(db, plan, product_id=103, source_warehouse_id=1, status=ITEM_STATUS_STAGED)

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    row = payload["shelves"][0]
    assert row["mm_progress_label"] == "2/3"
    missing = row["missing_items"]
    assert len(missing) == 1
    assert missing[0]["product_name"] == "Produkt B"
    assert missing[0]["source_warehouse_name"] == "Warszawa"
    assert missing[0]["status"] == ITEM_STATUS_IN_TRANSIT


def test_missing_local_item():
    db = _make_db()
    seg = _rack_segment(db, tenant_id=1, warehouse_id=2)
    _, plan = _occupy(db, seg=seg, order_number="LOC-1")
    _plan_item(db, plan, product_id=101, source_warehouse_id=2, status=ITEM_STATUS_STAGED)
    _plan_item(db, plan, product_id=102, source_warehouse_id=2, status=ITEM_STATUS_TO_PICK)

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    row = payload["shelves"][0]
    assert row["local_progress_label"] == "1/2"
    assert row["total_progress_label"] == "1/2"
    assert row["missing_items"][0]["product_name"] == "Produkt B"
    assert row["missing_items"][0]["source_warehouse_name"] == "Poznań"
    assert row["missing_items"][0]["status"] == ITEM_STATUS_TO_PICK


def test_multi_tenant_isolation():
    db = _make_db()
    seg1 = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-T1")
    seg2 = _rack_segment(db, tenant_id=2, warehouse_id=4, rack_name="RK-T2")
    _occupy(db, seg=seg1, order_number="T1-1", tenant_id=1)
    _occupy(db, seg=seg2, order_number="T2-1", tenant_id=2, target_warehouse_id=4)

    p1 = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    p2 = build_consolidation_control_tower(db, tenant_id=2, warehouse_id=4)
    assert len(p1["shelves"]) == 1
    assert p1["shelves"][0]["order_number"] == "T1-1"
    assert len(p2["shelves"]) == 1
    assert p2["shelves"][0]["order_number"] == "T2-1"


def test_multi_warehouse_isolation():
    db = _make_db()
    seg_poz = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-POZ")
    seg_gdn = _rack_segment(db, tenant_id=1, warehouse_id=3, rack_name="RK-GDN")
    _occupy(db, seg=seg_poz, order_number="WH-2")
    _occupy(db, seg=seg_gdn, order_number="WH-3", target_warehouse_id=3)

    poz = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    gdn = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=3)
    assert len(poz["shelves"]) == 1
    assert poz["shelves"][0]["order_number"] == "WH-2"
    assert len(gdn["shelves"]) == 1
    assert gdn["shelves"][0]["target_warehouse_name"] == "Gdańsk"


def test_kpi_counts_and_avg_occupation():
    db = _make_db()
    seg_free = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-F")
    seg_occ = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-O")
    _occupy(
        db,
        seg=seg_occ,
        order_number="KPI-1",
        plan_updated_at=datetime.utcnow() - timedelta(minutes=20),
    )

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    kpi = payload["kpi"]
    assert kpi["free_count"] == 1
    assert kpi["occupied_count"] == 1
    assert kpi["total_segments"] == 2
    assert kpi["avg_occupation_minutes"] >= 19.0
    assert seg_free.order_id is None


def test_sorting_exception_before_ready_before_staging():
    db = _make_db()
    seg_ex = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-EX")
    seg_rtp = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-RTP")
    seg_st = _rack_segment(db, tenant_id=1, warehouse_id=2, rack_name="RK-ST")
    _occupy(db, seg=seg_st, order_number="ST-1", plan_status=PLAN_STATUS_STAGING)
    _occupy(
        db,
        seg=seg_rtp,
        order_number="RTP-2",
        plan_status=PLAN_STATUS_COMPLETED,
        fulfillment_state=READY_TO_PACK,
    )
    _occupy(db, seg=seg_ex, order_number="EX-2", plan_status=PLAN_STATUS_EXCEPTION)

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    order_nums = [r["order_number"] for r in payload["shelves"]]
    assert order_nums.index("EX-2") < order_nums.index("RTP-2")
    assert order_nums.index("RTP-2") < order_nums.index("ST-1")
    assert payload["shelves"][0]["state"] == SEGMENT_STATE_EXCEPTION
    assert payload["shelves"][1]["state"] == SEGMENT_STATE_READY_TO_PACK
    assert payload["shelves"][2]["state"] == SEGMENT_STATE_STAGING


def test_unresolved_plan_alerts_surface():
    db = _make_db()
    seg = _rack_segment(db, tenant_id=1, warehouse_id=2)
    _, plan = _occupy(db, seg=seg, order_number="AL-1")
    db.add(
        OrderConsolidationAlert(
            plan_id=int(plan.id),
            severity="WARNING",
            code="SHORTAGE",
            message="Brak na MM",
            resolved=False,
        )
    )
    db.commit()

    payload = build_consolidation_control_tower(db, tenant_id=1, warehouse_id=2)
    row = payload["shelves"][0]
    assert row["unresolved_alert_count"] == 1
    assert any(a["code"] == "SHORTAGE" for a in row["alerts"])
