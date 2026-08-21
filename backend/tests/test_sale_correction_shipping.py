"""RETURN sale correction — optional include_shipping_cost from source SHIPPING snapshot."""

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


def _seed_return_with_primary(db, *, shipping=19.99, with_shipping_on_doc=True):
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
    if not with_shipping_on_doc:
        # Ensure legacy: strip any accidental shipping (flag was false so none)
        assert not any(str(i.line_kind) == LINE_KIND_SHIPPING for i in list_sale_document_items(db, str(doc.id)))
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
    return doc, ret, order, series


def test_a_b_products_only_default():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=True)
    corr, reused = issue_sale_correction_for_return(
        db, tenant_id=1, return_id=80, include_shipping_cost=False
    )
    db.commit()
    assert reused is False
    items = list_sale_document_items(db, str(corr.id))
    assert all(str(i.line_kind) == LINE_KIND_PRODUCT for i in items)
    assert not any(str(i.line_kind) == LINE_KIND_SHIPPING for i in items)


def test_c_d_e_f_g_include_shipping_line():
    db = _db()
    src, _ret, _order, _series = _seed_return_with_primary(db, shipping=19.99, with_shipping_on_doc=True)
    src_ship = next(i for i in list_sale_document_items(db, str(src.id)) if str(i.line_kind) == LINE_KIND_SHIPPING)
    corr, _ = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    items = list_sale_document_items(db, str(corr.id))
    ships = [i for i in items if str(i.line_kind) == LINE_KIND_SHIPPING]
    assert len(ships) == 1
    ship = ships[0]
    assert float(ship.quantity) == -1.0
    assert ship.order_item_id is None
    assert ship.name == src_ship.name
    assert abs(float(ship.line_gross) + abs(float(src_ship.line_gross))) < 0.001
    assert abs(float(ship.line_net) + abs(float(src_ship.line_net))) < 0.001
    assert abs(float(ship.line_vat) + abs(float(src_ship.line_vat))) < 0.001
    assert abs(float(ship.vat_percent) - float(src_ship.vat_percent)) < 0.001
    assert float(corr.total_gross) < 0


def test_h_i_immutable_vs_live_order_and_series():
    db = _db()
    src, _ret, order, series = _seed_return_with_primary(db, shipping=19.99, with_shipping_on_doc=True)
    corr, _ = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    meta = json.loads(order.import_metadata_json)
    meta["shipping_cost"] = 99.99
    order.import_metadata_json = json.dumps(meta)
    series.shipping_cost_name = "Inna nazwa"
    db.commit()
    ship = next(i for i in list_sale_document_items(db, str(corr.id)) if str(i.line_kind) == LINE_KIND_SHIPPING)
    assert abs(abs(float(ship.line_gross)) - 19.99) < 0.02
    assert ship.name == "Przesyłka kurierska"


def test_j_k_scope_hash_and_retry():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=True)
    c1, r1 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    db.commit()
    c2, r2 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    assert c1.id != c2.id
    assert r1 is False and r2 is False
    c3, r3 = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    assert c3.id == c2.id and r3 is True
    assert c1.correction_scope_hash != c2.correction_scope_hash


def test_l_no_duplicate_shipping():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=True)
    issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    # Different return same order/source — still same source shipping
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
    assert ei.value.code == "SHIPPING_ALREADY_CORRECTED"


def test_m_n_legacy_without_shipping():
    db = _db()
    _seed_return_with_primary(db, with_shipping_on_doc=False)
    ok, _ = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=False)
    db.commit()
    assert ok is not None
    with pytest.raises(SaleCorrectionError) as ei:
        issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    assert ei.value.code == "SOURCE_SHIPPING_NOT_AVAILABLE"


def test_p_totals_include_shipping_delta():
    db = _db()
    _seed_return_with_primary(db, shipping=19.99, with_shipping_on_doc=True)
    corr, _ = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    items = list_sale_document_items(db, str(corr.id))
    sum_gross = round(sum(float(i.line_gross or 0) for i in items), 2)
    assert abs(float(corr.total_gross) - sum_gross) < 0.01
    assert any(str(i.line_kind) == LINE_KIND_SHIPPING for i in items)


def test_o_mapper_pdf_lines_include_shipping():
    db = _db()
    _seed_return_with_primary(db, shipping=19.99, with_shipping_on_doc=True)
    corr, _ = issue_sale_correction_for_return(db, tenant_id=1, return_id=80, include_shipping_cost=True)
    db.commit()
    order = db.query(Order).filter(Order.id == 200).one()
    from backend.services.sale_document_mapper import resolve_sale_document_financials

    fin = resolve_sale_document_financials(db, corr, order)
    ship_lines = [ln for ln in fin["lines"] if ln.get("line_kind") == LINE_KIND_SHIPPING]
    assert len(ship_lines) == 1
    assert "Przesyłka" in str(ship_lines[0].get("name") or "")
    assert float(ship_lines[0]["quantity"]) == -1.0
    assert abs(float(fin["total_gross"]) - sum(float(ln["line_gross"]) for ln in fin["lines"])) < 0.01


def test_scope_hash_unit():
    products = [
        {
            "line_kind": LINE_KIND_PRODUCT,
            "order_item_id": 1,
            "quantity": -1,
            "line_gross": -10,
            "vat_percent": 23,
        }
    ]
    with_ship = products + [
        {
            "line_kind": LINE_KIND_SHIPPING,
            "quantity": -1,
            "line_gross": -19.99,
            "line_net": -16.25,
            "line_vat": -3.74,
            "vat_percent": 23,
            "name": "Ship",
        }
    ]
    assert build_correction_scope_hash(products) != build_correction_scope_hash(with_ship)
