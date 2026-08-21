"""Returns report — RMZLine grain, filters, export."""

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
    db.add(Product(id=11, tenant_id=1, name="Gadget", sku="G11", ean="5900000000011", purchase_price=8.0))
    db.add(
        ReturnStatus(
            id=1, tenant_id=1, warehouse_id=1, name="Przyjęty", type="done_success", transition_key="success"
        )
    )
    db.commit()
    return db


def _seed_return(db, *, rid=80, oid=200, accepted=1, rejected=0, dmg_b=0, product_id=10, oi_id=2001):
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
    if db.query(OrderItem).filter(OrderItem.id == oi_id).first() is None:
        db.add(
            OrderItem(
                id=oi_id,
                order_id=oid,
                product_id=product_id,
                quantity=2,
                unit_price=50.0,
                total_price=100.0,
                vat_percent=23.0,
            )
        )
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
            decision="OK" if accepted and not rejected else ("REJECTED" if rejected and not accepted else "DAMAGED"),
        )
    )
    db.commit()


def test_a_b_one_line_one_row_and_multi():
    db = _db()
    _seed_return(db, rid=80, oi_id=2001, product_id=10, accepted=1)
    _seed_return(db, rid=80, oi_id=2002, product_id=11, accepted=2)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    page = query_returns_report(db, f)
    assert page["total"] == 2
    assert len(page["items"]) == 2
    ids = {r["return_line_id"] for r in page["items"]}
    assert len(ids) == 2


def test_c_pagination():
    db = _db()
    for i in range(5):
        _seed_return(db, rid=100 + i, oid=300 + i, oi_id=3000 + i, accepted=1)
    f = ReturnsReportFilters(
        tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30), page=1, limit=2
    )
    p1 = query_returns_report(db, f)
    assert p1["total"] == 5
    assert len(p1["items"]) == 2
    assert p1["pages"] == 3


def test_k_l_m_accepted_rejected():
    db = _db()
    _seed_return(db, rid=80, accepted=1, rejected=1, dmg_b=0)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    row = query_returns_report(db, f)["items"][0]
    assert row["qty_accepted"] == 1
    assert row["qty_rejected"] == 1
    assert row["qty_commercial"] == 1
    assert abs(row["line_value"] - 50.0) < 0.01


def test_r_tenant_isolation():
    db = _db()
    _seed_return(db, rid=80)
    f = ReturnsReportFilters(tenant_id=2, warehouse_id=2, date_from=datetime.utcnow() - timedelta(days=30))
    assert query_returns_report(db, f)["total"] == 0


def test_x_kpi_matches():
    db = _db()
    _seed_return(db, rid=80, accepted=2, rejected=1)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    s = summarize_returns_report(db, f)
    assert s["returns_count"] == 1
    assert s["pieces_commercial"] == 2
    assert s["rejected_qty"] == 1
    assert abs(s["value_total"] - 100.0) < 0.01


def test_t_u_csv_utf8_and_full_filter():
    db = _db()
    _seed_return(db, rid=80, accepted=1)
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    raw = build_returns_report_csv(db, f)
    assert raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    assert "Numer zamówienia" in text
    assert "O-200" in text or "Widget" in text
    assert ";" in text.splitlines()[0]


def test_p_correction_join():
    db = _db()
    _seed_return(db, rid=80, accepted=1)
    db.add(
        SaleDocument(
            id=str(uuid.uuid4()),
            tenant_id=1,
            warehouse_id=1,
            order_id=200,
            document_series_id=str(uuid.uuid4()),
            document_type_id=str(uuid.uuid4()),
            document_number="KOR/1",
            panel_document_type="INVOICE",
            document_subtype="CORRECTION",
            series_type="CORRECTION",
            document_kind="CORRECTION",
            business_source_type="RETURN",
            business_source_id="80",
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    row = query_returns_report(db, f)["items"][0]
    assert row["correction_number"] == "KOR/1"
    assert row["correction_issued"] is True


def test_q_zpz_without_duplicate():
    db = _db()
    _seed_return(db, rid=80, accepted=1)
    zpz = StockDocument(
        id=900,
        tenant_id=1,
        warehouse_id=1,
        document_type="Z_PZ",
        document_number="Z-PZ/1",
        created_at=datetime.utcnow(),
    )
    db.add(zpz)
    db.flush()
    ret = db.query(WmsOrderReturn).filter(WmsOrderReturn.id == 80).one()
    ret.warehouse_document_id = 900
    db.commit()
    f = ReturnsReportFilters(tenant_id=1, warehouse_id=1, date_from=datetime.utcnow() - timedelta(days=30))
    page = query_returns_report(db, f)
    assert page["total"] == 1
    assert page["items"][0]["zpz_number"] == "Z-PZ/1"
    assert page["items"][0]["warehouse_committed"] is True


def test_y_empty():
    db = _db()
    f = ReturnsReportFilters(
        tenant_id=1,
        warehouse_id=1,
        date_from=datetime.utcnow() - timedelta(days=1),
        date_to=datetime.utcnow() - timedelta(hours=1),
    )
    assert query_returns_report(db, f)["total"] == 0
