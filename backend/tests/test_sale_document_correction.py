"""Sale document correction domain pipeline — issue KOR from RETURN/RMZ."""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.commerce_operational import Payment
from backend.models.customer import Customer, CustomerAddress
from backend.models.document_series import DocumentSeries
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.return_status import ReturnStatus
from backend.models.sale_document import SaleDocument
from backend.models.sale_document_item import SaleDocumentItem
from backend.models.sale_document_stock_link import SaleDocumentStockLink
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_return import WmsOrderReturn
from backend.models.wms_rmz_line import RMZLine
from backend.services.sale_document_buyer_snapshot import serialize_buyer_snapshot
from backend.services.sale_document_mapper import map_sale_document, resolve_sale_document_financials
from backend.services.sale_documents import (
    SaleCorrectionError,
    issue_sale_correction_for_return,
    list_corrections_for_source,
)
from backend.services.sale_documents.correction_financials import compute_totals_from_sale_document_items
from backend.services.wms_sale_document_service import create_sale_document

BUYER_SNAP = serialize_buyer_snapshot(
    {
        "customer_id": 1,
        "name": "Acme Sp. z o.o.",
        "company_name": "Acme Sp. z o.o.",
        "nip": "5250000000",
        "email": "a@example.com",
        "phone": None,
        "address": {"street": "Ul. Test", "city": "Warszawa", "postal_code": "00-001", "country_code": "PL"},
    }
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Customer,
        CustomerAddress,
        Product,
        Order,
        OrderItem,
        DocumentSeries,
        SaleDocument,
        SaleDocumentItem,
        SaleDocumentStockLink,
        ReturnStatus,
        Payment,
        WmsOrderReturn,
        RMZLine,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    db.add(
        Customer(
            id=1,
            tenant_id=1,
            first_name="",
            last_name="",
            company_name="Acme Sp. z o.o.",
            nip="5250000000",
            email="a@example.com",
        )
    )
    db.add(Product(id=10, tenant_id=1, name="Produkt A", sku="A-1", ean="100"))
    db.add(Product(id=11, tenant_id=1, name="Produkt B", sku="B-1", ean="101"))
    db.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="ORD-100",
            customer_id=1,
            status="packed",
            currency="PLN",
        )
    )
    db.add(OrderItem(id=1001, order_id=100, product_id=10, quantity=3, unit_price=100.0, total_price=300.0))
    db.add(OrderItem(id=1002, order_id=100, product_id=11, quantity=2, unit_price=50.0, total_price=100.0))
    db.add(
        ReturnStatus(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            name="Zakończony",
            type="done_success",
            transition_key="success",
        )
    )
    sale_series = DocumentSeries(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        name="FV",
        code="FV",
        prefix="FV",
        series_type="SALE",
        subtype="INVOICE",
        numbering_start=1,
        is_active=True,
    )
    kor_series = DocumentSeries(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        name="KOR",
        code="KOR",
        prefix="KOR",
        series_type="CORRECTION",
        subtype="CORRECTION",
        numbering_start=1,
        is_active=True,
    )
    sale_series.correction_series_id = kor_series.id
    db.add(sale_series)
    db.add(kor_series)
    db.commit()
    return db, sale_series, kor_series


def _persist_buyer(db, *, row, order, panel_document_type, customer=None):
    row.buyer_json = BUYER_SNAP


def _create_invoice(db, sale_series, *, panel="INVOICE", series=None):
    order = db.query(Order).filter(Order.id == 100).one()
    ser = series or sale_series
    with patch("backend.services.wms_sale_document_service.persist_buyer_snapshot", side_effect=_persist_buyer):
        doc = create_sale_document(
            db,
            order=order,
            series_id=str(ser.id),
            tenant_id=1,
            warehouse_id=1,
            panel_document_type=panel,
        )
    db.commit()
    return doc


def _make_return(db, *, accepted_a=1, rejected_a=0, accepted_b=0, warehouse_doc_id=55):
    ret = WmsOrderReturn(
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        rmz_number=f"RMZ-{uuid.uuid4().hex[:8]}",
        return_type="RMA",
        status_id=1,
        lines_json="[]",
        warehouse_document_id=warehouse_doc_id,
        created_at=datetime.utcnow(),
    )
    db.add(ret)
    db.flush()
    db.add(
        RMZLine(
            rmz_id=int(ret.id),
            order_item_id=1001,
            product_id=10,
            quantity=3,
            accepted_qty=accepted_a,
            rejected_qty=rejected_a,
            damaged_b_qty=0,
            damaged_c_qty=0,
        )
    )
    if accepted_b:
        db.add(
            RMZLine(
                rmz_id=int(ret.id),
                order_item_id=1002,
                product_id=11,
                quantity=2,
                accepted_qty=accepted_b,
                rejected_qty=0,
                damaged_b_qty=0,
                damaged_c_qty=0,
            )
        )
    db.commit()
    return ret


def test_primary_invoice_and_no_duplicate():
    db, sale_series, _ = _session()
    d1 = _create_invoice(db, sale_series)
    assert d1.document_kind == "PRIMARY"
    items = db.query(SaleDocumentItem).filter(SaleDocumentItem.sale_document_id == d1.id).all()
    assert len(items) >= 1
    d2 = _create_invoice(db, sale_series)
    assert d2.id == d1.id


def test_issue_correction_partial_and_idempotent():
    db, sale_series, _ = _session()
    primary = _create_invoice(db, sale_series)
    ret = _make_return(db, accepted_a=1, rejected_a=1)
    corr, reused = issue_sale_correction_for_return(db, tenant_id=1, return_id=int(ret.id))
    db.commit()
    assert reused is False
    assert corr.document_kind == "CORRECTION"
    assert corr.source_sale_document_id == primary.id
    assert corr.series_type == "CORRECTION"
    assert "KOR" in str(corr.document_number)

    lines = db.query(SaleDocumentItem).filter(SaleDocumentItem.sale_document_id == corr.id).all()
    assert len(lines) == 1
    assert float(lines[0].quantity) == -1.0
    assert float(lines[0].line_gross) < 0
    totals = compute_totals_from_sale_document_items(lines)
    assert totals["total_gross"] < 0

    corr2, reused2 = issue_sale_correction_for_return(db, tenant_id=1, return_id=int(ret.id))
    db.commit()
    assert reused2 is True
    assert corr2.id == corr.id
    assert len(list_corrections_for_source(db, tenant_id=1, source_sale_document_id=str(primary.id))) == 1


def test_buyer_snapshot_stable_after_customer_change():
    db, sale_series, _ = _session()
    _create_invoice(db, sale_series)
    ret = _make_return(db, accepted_a=1)
    cust = db.query(Customer).filter(Customer.id == 1).one()
    cust.company_name = "CHANGED LIVE"
    cust.nip = "1111111111"
    db.commit()
    corr, _ = issue_sale_correction_for_return(db, tenant_id=1, return_id=int(ret.id))
    db.commit()
    assert "CHANGED" not in str(corr.buyer_json or "")
    assert "5250000000" in str(corr.buyer_json or "")


def test_receipt_rejected():
    db, sale_series, _ = _session()
    receipt_series = DocumentSeries(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        name="PA",
        code="PA",
        prefix="PA",
        series_type="SALE",
        subtype="RECEIPT",
        numbering_start=1,
        is_active=True,
    )
    db.add(receipt_series)
    db.commit()
    primary = _create_invoice(db, sale_series, panel="PARAGON", series=receipt_series)
    ret = _make_return(db, accepted_a=1)
    with pytest.raises(SaleCorrectionError) as ei:
        issue_sale_correction_for_return(
            db,
            tenant_id=1,
            return_id=int(ret.id),
            source_sale_document_id=str(primary.id),
        )
    assert ei.value.code == "CORRECTION_NOT_SUPPORTED_FOR_DOCUMENT_TYPE"


def test_not_ready_without_warehouse_commit():
    db, sale_series, _ = _session()
    _create_invoice(db, sale_series)
    ret = _make_return(db, accepted_a=1, warehouse_doc_id=None)
    with pytest.raises(SaleCorrectionError) as ei:
        issue_sale_correction_for_return(db, tenant_id=1, return_id=int(ret.id))
    assert ei.value.code == "RETURN_NOT_READY"


def test_mapper_uses_persisted_correction_lines():
    db, sale_series, _ = _session()
    _create_invoice(db, sale_series)
    ret = _make_return(db, accepted_a=1)
    corr, _ = issue_sale_correction_for_return(db, tenant_id=1, return_id=int(ret.id))
    db.commit()
    oi = db.query(OrderItem).filter(OrderItem.id == 1001).one()
    oi.quantity = 99
    db.commit()
    order = db.query(Order).filter(Order.id == 100).one()
    fin = resolve_sale_document_financials(db, corr, order)
    assert fin["from_persisted_items"] is True
    assert float(fin["lines"][0]["quantity"]) == -1.0
    dto = map_sale_document(db, doc=corr, order=order, mode="detail", refresh_db=False)
    assert dto["doc_type"] == "KOR"
    assert dto["source_sale_document_id"] == corr.source_sale_document_id


def test_foreign_tenant_rejected():
    db, sale_series, _ = _session()
    _create_invoice(db, sale_series)
    ret = _make_return(db, accepted_a=1)
    with pytest.raises(SaleCorrectionError) as ei:
        issue_sale_correction_for_return(db, tenant_id=2, return_id=int(ret.id))
    assert ei.value.code in ("RETURN_MISSING", "TENANT_MISMATCH", "SOURCE_DOCUMENT_MISSING")


def test_multiple_lines_correction():
    db, sale_series, _ = _session()
    _create_invoice(db, sale_series)
    ret = _make_return(db, accepted_a=2, accepted_b=1)
    corr, _ = issue_sale_correction_for_return(db, tenant_id=1, return_id=int(ret.id))
    db.commit()
    lines = db.query(SaleDocumentItem).filter(SaleDocumentItem.sale_document_id == corr.id).all()
    assert len(lines) == 2
    assert sorted(float(x.quantity) for x in lines) == [-2.0, -1.0]
