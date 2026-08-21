"""Returns report — grouped by RMZ for screen; export stays line-grain."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.customer import Customer
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.return_status import ReturnStatus
from backend.models.sale_document import SaleDocument
from backend.models.stock_document import StockDocument
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_return import WmsOrderReturn
from backend.models.wms_refund import WmsRefund
from backend.models.wms_rmz_line import RMZLine
from backend.services.returns.returns_report_service import (
    ReturnsReportFilters,
    build_returns_report_csv,
    query_returns_report,
    summarize_returns_report,
)


def _db():
    engine = create_engine("sqlite:///:memory:")
    for m in (
        Tenant,
        Warehouse,
        Customer,
        Product,
        Order,
        OrderItem,
        ReturnStatus,
        WmsOrderReturn,
        RMZLine,
        WmsRefund,
        StockDocument,
        SaleDocument,
    ):
        m.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Tenant(id=2, name="T2", default_warehouse_id=2))
    db.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    db.add(Warehouse(id=2, tenant_id=2, name="WH2"))
    db.add(
        Customer(
            id=1,
            tenant_id=1,
            first_name="Jan",
            last_name="Kowalski",
            email="jan@example.com",
            phone="500600700",
            country_code="PL",
        )
    )
    db.add(Product(id=10, tenant_id=1, name="Widget", sku="W10", ean="5900000000010", purchase_price=12.5))
    db.add(Product(id=11, tenant_id=1, name="Gadget CAT", sku="G11", ean="5900000000011", purchase_price=8.0))
    db.add(
        ReturnStatus(
            id=1, tenant_id=1, warehouse_id=1, name="Przyjęty", type="done_success", transition_key="success"
        )
    )
    db.commit()
    return db


def _ensure_order(db, oid: int):
    if db.query(Order).filter(Order.id == oid).first() is None:
        db.add(
            Order(
                id=oid,
                tenant_id=1,
                warehouse_id=1,
                number=f"O-{oid}",
                customer_id=1,
                status="packed",
                currency="PLN",
                value=100.0,
                source="Allegro",
                country="PL",
                created_at=datetime.utcnow(),
            )
        )
        db.flush()


def _ensure_return(db, *, rid: int, oid: int = 200):
    _ensure_order(db, oid)
    if db.query(WmsOrderReturn).filter(WmsOrderReturn.id == rid).first() is None:
        db.add(
            WmsOrderReturn(
                id=rid,
                tenant_id=1,
                warehouse_id=1,
                order_id=oid,
                rmz_number=f"RMZ-{rid}",
                return_type="RMA",
                status_id=1,
                lines_json="[]",
                created_at=datetime.utcnow() - timedelta(days=2),
            )
        )
        db.flush()


def _add_line(
    db,
    *,
    rid: int,
    oi_id: int,
    oid: int = 200,
    product_id: int = 10,
    accepted: int = 1,
    rejected: int = 0,
    dmg_b: int = 0,
    unit_price: float = 50.0,
    decision: str | None = None,
):
    _ensure_return(db, rid=rid, oid=oid)
    if db.query(OrderItem).filter(OrderItem.id == oi_id).first() is None:
        ret = db.query(WmsOrderReturn).filter(WmsOrderReturn.id == rid).one()
        db.add(
            OrderItem(
                id=oi_id,
                order_id=ret.order_id,
                product_id=product_id,
                quantity=accepted + rejected + dmg_b,
                unit_price=unit_price,
                total_price=unit_price * (accepted + rejected + dmg_b),
                vat_percent=23.0,
            )
        )
    if decision is None:
        if rejected and not accepted and not dmg_b:
            decision = "REJECTED"
        elif dmg_b:
            decision = "DAMAGED"
        else:
            decision = "OK"
    db.add(
        RMZLine(
            rmz_id=rid,
            order_item_id=oi_id,
            product_id=product_id,
            quantity=accepted + rejected + dmg_b,
            accepted_qty=accepted,
            rejected_qty=rejected,
            damaged_b_qty=dmg_b,
            damaged_c_qty=0,
            decision=decision,
        )
    )
    db.commit()


def test_a_one_return_one_line_one_group():
    db = _db()
    _add_line(db, rid=80, oi_id=2001, accepted=1)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    page = query_returns_report(db, f)
    assert page["total"] == 1
    assert page["total_returns"] == 1
    assert len(page["items"]) == 1
    assert page["items"][0]["aggregates"]["product_lines"] == 1
    assert len(page["items"][0]["lines"]) == 1


def test_b_one_return_25_lines_one_group():
    db = _db()
    for i in range(25):
        _add_line(db, rid=80, oi_id=3000 + i, product_id=10 if i % 2 == 0 else 11, accepted=1)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    page = query_returns_report(db, f)
    assert page["total"] == 1
    assert len(page["items"]) == 1
    assert page["items"][0]["aggregates"]["product_lines"] == 25
    assert len(page["items"][0]["lines"]) == 25


def test_c_two_returns_many_lines():
    db = _db()
    for i in range(20):
        _add_line(db, rid=80, oi_id=4000 + i, accepted=1)
    for i in range(10):
        _add_line(db, rid=81, oid=201, oi_id=5000 + i, accepted=1)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    page = query_returns_report(db, f)
    assert page["total"] == 2
    assert len(page["items"]) == 2
    lines_total = sum(len(g["lines"]) for g in page["items"])
    assert lines_total == 30


def test_d_e_pagination_by_returns_not_split():
    db = _db()
    for rid in range(100, 105):
        for i in range(5):
            _add_line(db, rid=rid, oid=300 + rid, oi_id=rid * 100 + i, accepted=1)
    f = ReturnsReportFilters(
        tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30), page=1, limit=2
    )
    p1 = query_returns_report(db, f)
    assert p1["total"] == 5
    assert len(p1["items"]) == 2
    assert p1["pages"] == 3
    for g in p1["items"]:
        assert g["aggregates"]["product_lines"] == 5
        assert len(g["lines"]) == 5


def test_f_g_h_i_aggregates():
    db = _db()
    _add_line(db, rid=80, oi_id=1, accepted=2, rejected=1, unit_price=50.0)
    _add_line(db, rid=80, oi_id=2, accepted=0, rejected=0, dmg_b=1, unit_price=10.0, product_id=11)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    agg = query_returns_report(db, f)["items"][0]["aggregates"]
    assert agg["product_lines"] == 2
    assert agg["accepted_qty"] == 2
    assert agg["rejected_qty"] == 1
    assert agg["quantity"] == 3  # 2 accepted + 1 damaged B
    assert abs(agg["value_gross"] - 110.0) < 0.01


def test_j_kpi_distinct_returns():
    db = _db()
    _add_line(db, rid=80, oi_id=1, accepted=1)
    _add_line(db, rid=80, oi_id=2, accepted=1, product_id=11)
    _add_line(db, rid=81, oid=201, oi_id=3, accepted=1)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    s = summarize_returns_report(db, f)
    assert s["returns_count"] == 2
    assert s["accepted_warehouse_qty"] == 3


def test_k_l_product_filter_parent_all_lines():
    db = _db()
    _add_line(db, rid=80, oi_id=1, product_id=10, accepted=1)  # Widget
    _add_line(db, rid=80, oi_id=2, product_id=11, accepted=1)  # Gadget CAT
    f = ReturnsReportFilters(
        tenant_id=1,
        warehouse_id=1,
        date_from=datetime.utcnow() - timedelta(days=30),
        product_query="CAT",
    )
    page = query_returns_report(db, f)
    assert page["total"] == 1
    assert len(page["items"][0]["lines"]) == 2  # full context


def test_m_tenant_isolation():
    db = _db()
    _add_line(db, rid=80, oi_id=1, accepted=1)
    f = ReturnsReportFilters(tenant_id=2, warehouse_id=2, date_from=datetime.utcnow() - timedelta(days=30))
    assert query_returns_report(db, f)["total"] == 0


def test_p_q_export_still_line_grain():
    db = _db()
    _add_line(db, rid=80, oi_id=1, accepted=1)
    _add_line(db, rid=80, oi_id=2, product_id=11, accepted=1)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    # Screen: 1 group
    assert query_returns_report(db, f)["total"] == 1
    raw = build_returns_report_csv(db, f)
    text = raw.decode("utf-8-sig")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    assert lines[0].startswith("Numer zamówienia")
    assert len(lines) == 3  # header + 2 product rows
    assert raw.startswith(b"\xef\xbb\xbf")


def test_empty_lines_label():
    db = _db()
    _ensure_return(db, rid=90)
    db.commit()
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    page = query_returns_report(db, f)
    assert page["total"] == 1
    assert page["items"][0]["aggregates"]["product_lines"] == 0
    assert page["items"][0]["aggregates"]["products_label"] == "0 produktów"
