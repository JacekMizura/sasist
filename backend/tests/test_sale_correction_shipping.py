"""RETURN sale correction — shipping + economic ledger (source_sale_document_item_id)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.commerce_operational import Payment, PaymentTransaction
from backend.models.customer import Customer, CustomerAddress
from backend.models.document_series import DocumentSeries
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.return_status import ReturnStatus
from backend.models.sale_document import SaleDocument
from backend.models.sale_document_item import LINE_KIND_PRODUCT, LINE_KIND_SHIPPING, SaleDocumentItem
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_return import WmsOrderReturn
from backend.models.wms_rmz_line import RMZLine
from backend.services.sale_document_buyer_snapshot import serialize_buyer_snapshot
from backend.services.sale_documents import SaleCorrectionError, issue_sale_correction_for_return
from backend.services.sale_documents.items_snapshot import list_sale_document_items
from backend.services.sale_documents.return_correction_adapter import build_correction_scope_hash
from backend.services.wms_sale_document_service import create_sale_document

BUYER = serialize_buyer_snapshot(
    {
        "customer_id": 1,
        "name": "Acme",
        "company_name": "Acme",
        "nip": "5250000000",
        "email": "a@example.com",
        "phone": None,
        "address": {"street": "Ul.", "city": "Wawa", "postal_code": "00-001", "country_code": "PL"},
    }
)


def _db():
    engine = create_engine("sqlite:///:memory:")
    for m in (
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
        Payment,
        PaymentTransaction,
        ReturnStatus,
        WmsOrderReturn,
        RMZLine,
    ):
        m.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH"))
    db.add(Customer(id=1, tenant_id=1, first_name="", last_name="", company_name="Acme", nip="5250000000"))
    db.add(Product(id=10, tenant_id=1, name="Widget", sku="W10"))
    db.add(Product(id=11, tenant_id=1, name="Gadget", sku="G11"))
    db.add(
        ReturnStatus(
            id=1, tenant_id=1, warehouse_id=1, name="Done", type="done_success", transition_key="success"
        )
    )
    db.commit()
    return db


def _series(db, *, count_shipping=True):
    sid = str(uuid.uuid4())
    row = DocumentSeries(
        id=sid,
        tenant_id=1,
        warehouse_id=1,
        name="FV",
        prefix="FV",
        series_type="SALE",
        subtype="INVOICE",
        numbering_start=1,
        numbering_format="{PREFIX}/{NUMBER}",
        count_shipping_cost_always=count_shipping,
        shipping_cost_name="Przesyłka kurierska",
        vat_calc_shipping="DEFAULT",
        is_active=True,
    )
    db.add(row)
    db.flush()
    return row


def _kor(db):
    sid = str(uuid.uuid4())
    row = DocumentSeries(
        id=sid,
        tenant_id=1,
        warehouse_id=1,
        name="KOR",
        prefix="KOR",
        series_type="CORRECTION",
        subtype="CORRECTION",
        numbering_start=1,
        numbering_format="{PREFIX}/{NUMBER}",
        is_active=True,
    )
    db.add(row)
    db.flush()
    return row


def _seed_return_with_primary(db, *, shipping=19.99, with_shipping_on_doc=True, accepted=1):
    series = _series(db, count_shipping=with_shipping_on_doc)
    _kor(db)
    order = Order(
        id=200,
        tenant_id=1,
        warehouse_id=1,
        number="O-200",
        customer_id=1,
        status="packed",
        currency="PLN",
        value=123.0 + float(shipping or 0),
        import_metadata_json=json.dumps({"shipping_cost": shipping}),
        created_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()
    oi = OrderItem(
        id=2001,
        order_id=200,
        product_id=10,
        quantity=2,
        unit_price=50.0,
        total_price=100.0,
        vat_percent=23.0,
        metadata_json=json.dumps({"line_gross_total": 123.0}),
    )
    db.add(oi)
    db.commit()
    doc = create_sale_document(
        db,
        order=order,
        series_id=str(series.id),
        tenant_id=1,
        warehouse_id=1,
        panel_document_type="INVOICE",
    )
    ret = WmsOrderReturn(
        id=80,
        tenant_id=1,
        warehouse_id=1,
        order_id=200,
        rmz_number="RMZ-80",
        return_type="RMA",
        status_id=1,
        lines_json="[]",
        warehouse_document_id=900,
    )
    db.add(ret)
    db.flush()
    db.add(
        RMZLine(
            rmz_id=80,
            order_item_id=2001,
            product_id=10,
            accepted_qty=accepted,
            damaged_b_qty=0,
            damaged_c_qty=0,
            rejected_qty=0,
        )
    )
    db.commit()
    return doc, ret, order, series


def test_a_b_products_only_default():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=True)
    result = issue_sale_correction_for_return(
        db, tenant_id=1, return_id=80, include_shipping_cost=False
    )
    db.commit()
    assert result.reused_existing is False
    assert result.no_new_delta is False
    items = list_sale_document_items(db, str(result.document.id))
    assert all(str(i.line_kind) == LINE_KIND_PRODUCT for i in items)
    assert all(i.source_sale_document_item_id is not None for i in items)


def test_c_d_e_f_g_include_shipping_line():
    db = _db()
    src, _ret, _order, _series = _seed_return_with_primary(db, shipping=19.99, with_shipping_on_doc=True)
    src_ship = next(i for i in list_sale_document_items(db, str(src.id)) if str(i.line_kind) == LINE_KIND_SHIPPING)
    result = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    items = list_sale_document_items(db, str(result.document.id))
    ships = [i for i in items if str(i.line_kind) == LINE_KIND_SHIPPING]
    assert len(ships) == 1
    ship = ships[0]
    assert float(ship.quantity) == -1.0
    assert ship.order_item_id is None
    assert ship.source_sale_document_item_id == src_ship.id
    assert ship.name == src_ship.name
    assert abs(float(ship.line_gross) + abs(float(src_ship.line_gross))) < 0.001


def test_c_d_products_then_shipping_only_second_kor():
    """Critical gap fix: false→true must not re-credit products."""
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=True)
    r1 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    db.commit()
    r2 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    assert r1.document.id != r2.document.id
    assert r2.reused_existing is False
    items2 = list_sale_document_items(db, str(r2.document.id))
    assert all(str(i.line_kind) == LINE_KIND_SHIPPING for i in items2)
    assert len(items2) == 1
    assert items2[0].source_sale_document_item_id is not None
    r3 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    assert r3.no_new_delta is True
    assert r3.document.id == r2.document.id


def test_g_accepted_qty_grows_additional_delta_only():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=False, accepted=1)
    r1 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    db.commit()
    line = db.query(RMZLine).filter(RMZLine.rmz_id == 80).one()
    line.accepted_qty = 2
    db.commit()
    r2 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    db.commit()
    assert r2.no_new_delta is False
    assert r2.document.id != r1.document.id
    items = list_sale_document_items(db, str(r2.document.id))
    assert len(items) == 1
    assert float(items[0].quantity) == -1.0
    assert items[0].source_sale_document_item_id is not None


def test_h_accepted_qty_reduced_blocked():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=False, accepted=2)
    issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    db.commit()
    line = db.query(RMZLine).filter(RMZLine.rmz_id == 80).one()
    line.accepted_qty = 1
    db.commit()
    with pytest.raises(SaleCorrectionError) as ei:
        issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    assert ei.value.code == "CORRECTION_SCOPE_REDUCED_AFTER_ISSUE"


def test_j_shipping_never_second_negative():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=True)
    issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    ret2 = WmsOrderReturn(
        id=81,
        tenant_id=1,
        warehouse_id=1,
        order_id=200,
        rmz_number="RMZ-81",
        return_type="RMA",
        status_id=1,
        lines_json="[]",
        warehouse_document_id=901,
    )
    db.add(ret2)
    db.flush()
    db.add(
        RMZLine(
            rmz_id=81,
            order_item_id=2001,
            product_id=10,
            accepted_qty=1,
            damaged_b_qty=0,
            damaged_c_qty=0,
            rejected_qty=0,
        )
    )
    db.commit()
    with pytest.raises(SaleCorrectionError) as ei:
        issue_sale_correction_for_return(db, tenant_id=1, return_id=81, include_shipping_cost=True)
    assert ei.value.code == "CORRECTION_OVER_SOURCE"


def test_m_n_legacy_without_shipping():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=False)
    ok = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    db.commit()
    assert ok.document is not None
    with pytest.raises(SaleCorrectionError) as ei:
        issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    assert ei.value.code == "SOURCE_SHIPPING_NOT_AVAILABLE"


def test_true_then_false_no_shipping_reversal():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=True)
    r1 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    r2 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    db.commit()
    assert r2.no_new_delta is True
    assert r2.document.id == r1.document.id
    all_corr = (
        db.query(SaleDocument)
        .filter(SaleDocument.document_kind == "CORRECTION", SaleDocument.business_source_id == "80")
        .all()
    )
    assert len(all_corr) == 1


def test_p_totals_include_shipping_delta():
    db = _db()
    _seed_return_with_primary(db, shipping=19.99, with_shipping_on_doc=True)
    result = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    corr = result.document
    items = list_sale_document_items(db, str(corr.id))
    sum_gross = round(sum(float(i.line_gross or 0) for i in items), 2)
    assert abs(float(corr.total_gross) - sum_gross) < 0.01


def test_o_mapper_pdf_lines_include_shipping():
    db = _db()
    _seed_return_with_primary(db, shipping=19.99, with_shipping_on_doc=True)
    result = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    corr = result.document
    order = db.query(Order).filter(Order.id == 200).one()
    from backend.services.sale_document_mapper import resolve_sale_document_financials

    fin = resolve_sale_document_financials(db, corr, order)
    ship_lines = [ln for ln in fin["lines"] if ln.get("line_kind") == LINE_KIND_SHIPPING]
    assert len(ship_lines) == 1
    assert float(ship_lines[0]["quantity"]) == -1.0


def test_i_second_product_only_new_line():
    db = _db()
    series = _series(db, count_shipping=False)
    _kor(db)
    order = Order(
        id=200,
        tenant_id=1,
        warehouse_id=1,
        number="O-200",
        customer_id=1,
        status="packed",
        currency="PLN",
        value=246.0,
        import_metadata_json="{}",
        created_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()
    db.add(
        OrderItem(
            id=2001,
            order_id=200,
            product_id=10,
            quantity=2,
            unit_price=50.0,
            total_price=100.0,
            vat_percent=23.0,
            metadata_json=json.dumps({"line_gross_total": 123.0}),
        )
    )
    db.add(
        OrderItem(
            id=2002,
            order_id=200,
            product_id=11,
            quantity=2,
            unit_price=50.0,
            total_price=100.0,
            vat_percent=23.0,
            metadata_json=json.dumps({"line_gross_total": 123.0}),
        )
    )
    db.commit()
    create_sale_document(
        db, order=order, series_id=str(series.id), tenant_id=1, warehouse_id=1, panel_document_type="INVOICE"
    )
    ret = WmsOrderReturn(
        id=80,
        tenant_id=1,
        warehouse_id=1,
        order_id=200,
        rmz_number="RMZ-80",
        return_type="RMA",
        status_id=1,
        lines_json="[]",
        warehouse_document_id=900,
    )
    db.add(ret)
    db.flush()
    db.add(
        RMZLine(
            rmz_id=80,
            order_item_id=2001,
            product_id=10,
            accepted_qty=1,
            damaged_b_qty=0,
            damaged_c_qty=0,
            rejected_qty=0,
        )
    )
    db.commit()
    r1 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80)
    db.commit()
    db.add(
        RMZLine(
            rmz_id=80,
            order_item_id=2002,
            product_id=11,
            accepted_qty=1,
            damaged_b_qty=0,
            damaged_c_qty=0,
            rejected_qty=0,
        )
    )
    db.commit()
    r2 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80)
    db.commit()
    items = list_sale_document_items(db, str(r2.document.id))
    assert len(items) == 1
    assert int(items[0].order_item_id) == 2002


def test_legacy_correction_without_fk_blocks():
    db = _db()
    src, _ret, _o, _s = _seed_return_with_primary(db, with_shipping_on_doc=False)
    r1 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80)
    db.commit()
    # Simulate legacy row: clear FK
    for it in list_sale_document_items(db, str(r1.document.id)):
        it.source_sale_document_item_id = None
    db.commit()
    line = db.query(RMZLine).filter(RMZLine.rmz_id == 80).one()
    line.accepted_qty = 2
    db.commit()
    with pytest.raises(SaleCorrectionError) as ei:
        issue_sale_correction_for_return(db, tenant_id=1, return_id=80)
    assert ei.value.code == "LEGACY_CORRECTION_SCOPE_AMBIGUOUS"


def test_scope_hash_unit():
    products = [
        {
            "line_kind": LINE_KIND_PRODUCT,
            "source_sale_document_item_id": 1,
            "order_item_id": 1,
            "quantity": -1,
            "line_gross": -10,
            "vat_percent": 23,
        }
    ]
    with_ship = products + [
        {
            "line_kind": LINE_KIND_SHIPPING,
            "source_sale_document_item_id": 99,
            "quantity": -1,
            "line_gross": -19.99,
            "line_net": -16.25,
            "line_vat": -3.74,
            "vat_percent": 23,
            "name": "Ship",
        }
    ]
    assert build_correction_scope_hash(products) != build_correction_scope_hash(with_ship)
