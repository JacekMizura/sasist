"""PRIMARY SaleDocument shipping snapshot — immutable line_kind=SHIPPING."""

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
from backend.models.sale_document import SaleDocument
from backend.models.sale_document_item import LINE_KIND_PRODUCT, LINE_KIND_SHIPPING, SaleDocumentItem
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.sale_document_buyer_snapshot import serialize_buyer_snapshot
from backend.services.sale_document_mapper import resolve_sale_document_financials
from backend.services.sale_documents.items_snapshot import ensure_primary_items_snapshot, list_sale_document_items
from backend.services.sale_documents.shipping_snapshot import (
    resolve_sale_document_shipping_snapshot,
    resolve_shipping_vat_percent,
)
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
        Payment,
        PaymentTransaction,
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
    db.add(Product(id=10, tenant_id=1, name="Widget", sku="W-10"))
    db.commit()
    return db


def _series(db, *, count_shipping=False, vat_mode="DEFAULT", vat_rate=None, name="Koszt wysyłki"):
    sid = str(uuid.uuid4())
    row = DocumentSeries(
        id=sid,
        tenant_id=1,
        warehouse_id=1,
        name=f"FV-{sid[:8]}",
        prefix="FV",
        series_type="SALE",
        subtype="INVOICE",
        numbering_start=1,
        numbering_format="{PREFIX}/{NUMBER}",
        count_shipping_cost_always=count_shipping,
        shipping_cost_name=name,
        vat_calc_shipping=vat_mode,
        vat_rate_percent=vat_rate,
        is_active=True,
    )
    db.add(row)
    db.flush()
    return row


def _order(db, *, shipping_cost=0.0, oid=100, unit_net=100.0, qty=1, vat=23.0):
    meta = {"shipping_cost": shipping_cost} if shipping_cost is not None else {}
    order = Order(
        id=oid,
        tenant_id=1,
        warehouse_id=1,
        number=f"O-{oid}",
        customer_id=1,
        status="NEW",
        currency="PLN",
        value=float(unit_net * qty) + float(shipping_cost or 0),
        import_metadata_json=json.dumps(meta, ensure_ascii=False),
        created_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()
    item = OrderItem(
        id=oid * 10,
        order_id=oid,
        product_id=10,
        quantity=qty,
        unit_price=unit_net,
        total_price=round(unit_net * qty, 2),
        vat_percent=vat,
        metadata_json=json.dumps({"line_gross_total": round(unit_net * qty * (1 + vat / 100), 2)}),
    )
    db.add(item)
    db.commit()
    return order


def test_a_primary_without_shipping_flag():
    db = _session()
    series = _series(db, count_shipping=False)
    order = _order(db, shipping_cost=19.99)
    doc = create_sale_document(
        db, order=order, series_id=str(series.id), tenant_id=1, warehouse_id=1, panel_document_type="INVOICE"
    )
    db.commit()
    items = list_sale_document_items(db, str(doc.id))
    assert all(str(i.line_kind) == LINE_KIND_PRODUCT for i in items)
    assert not any(str(i.line_kind) == LINE_KIND_SHIPPING for i in items)
    assert abs(float(doc.total_gross) - float(items[0].line_gross)) < 0.02


def test_b_c_d_e_f_primary_with_shipping():
    db = _session()
    series = _series(db, count_shipping=True, name="Przesyłka kurierska")
    order = _order(db, shipping_cost=19.99, unit_net=100.0, vat=23.0)
    doc = create_sale_document(
        db, order=order, series_id=str(series.id), tenant_id=1, warehouse_id=1, panel_document_type="INVOICE"
    )
    db.commit()
    items = list_sale_document_items(db, str(doc.id))
    kinds = [str(i.line_kind) for i in items]
    assert LINE_KIND_PRODUCT in kinds
    assert LINE_KIND_SHIPPING in kinds
    ship = next(i for i in items if str(i.line_kind) == LINE_KIND_SHIPPING)
    assert ship.order_item_id is None
    assert ship.product_id is None
    assert ship.name == "Przesyłka kurierska"
    assert float(ship.quantity) == 1.0
    assert abs(float(ship.line_gross) - 19.99) < 0.001
    assert abs(float(ship.vat_percent) - 23.0) < 0.001
    product_gross = sum(float(i.line_gross) for i in items if str(i.line_kind) == LINE_KIND_PRODUCT)
    assert abs(float(doc.total_gross) - (product_gross + 19.99)) < 0.02


def test_g_vat_manual_and_exclude():
    db = _session()
    series = _series(db, count_shipping=True, vat_mode="MANUAL", vat_rate=8)
    order = _order(db, shipping_cost=10.0)
    snap = resolve_sale_document_shipping_snapshot(
        series=series, order=order, product_lines=[{"vat_percent": 23, "quantity": 1}]
    )
    assert snap is not None
    assert snap["vat_percent"] == 8.0

    series2 = _series(db, count_shipping=True, vat_mode="EXCLUDE")
    order2 = _order(db, shipping_cost=10.0, oid=101)
    vp = resolve_shipping_vat_percent(series=series2, order=order2, product_lines=[])
    assert vp == 0.0


def test_h_i_count_shipping_flag():
    db = _session()
    series_off = _series(db, count_shipping=False)
    order = _order(db, shipping_cost=5.0)
    assert resolve_sale_document_shipping_snapshot(series=series_off, order=order, product_lines=[]) is None
    series_on = _series(db, count_shipping=True)
    assert resolve_sale_document_shipping_snapshot(series=series_on, order=order, product_lines=[]) is not None


def test_j_k_l_immutable_after_order_and_series_change():
    db = _session()
    series = _series(db, count_shipping=True, name="Dostawa X")
    order = _order(db, shipping_cost=19.99)
    doc = create_sale_document(
        db, order=order, series_id=str(series.id), tenant_id=1, warehouse_id=1, panel_document_type="INVOICE"
    )
    db.commit()
    # mutate live order + series settings
    meta = json.loads(order.import_metadata_json)
    meta["shipping_cost"] = 99.99
    order.import_metadata_json = json.dumps(meta)
    series.shipping_cost_name = "Nowa nazwa"
    db.commit()

    fin = resolve_sale_document_financials(db, doc, order)
    assert fin["from_persisted_items"] is True
    ship_lines = [ln for ln in fin["lines"] if ln.get("line_kind") == LINE_KIND_SHIPPING]
    assert len(ship_lines) == 1
    assert abs(float(ship_lines[0]["line_gross"]) - 19.99) < 0.001
    assert ship_lines[0]["name"] == "Dostawa X"
    # Detail/PDF/reprint SSOT = same persisted financials (no live Order shipping).
    assert abs(float(fin["total_gross"]) - (sum(float(x["line_gross"]) for x in fin["lines"]))) < 0.02
    dto_lines = fin["lines"]
    assert any(
        ln.get("line_kind") == LINE_KIND_SHIPPING and abs(float(ln["line_gross"]) - 19.99) < 0.001
        for ln in dto_lines
    )


def test_p_q_retry_create_no_duplicate_shipping():
    db = _session()
    series = _series(db, count_shipping=True)
    order = _order(db, shipping_cost=12.0)
    d1 = create_sale_document(
        db, order=order, series_id=str(series.id), tenant_id=1, warehouse_id=1, panel_document_type="INVOICE"
    )
    db.commit()
    d2 = create_sale_document(
        db, order=order, series_id=str(series.id), tenant_id=1, warehouse_id=1, panel_document_type="INVOICE"
    )
    db.commit()
    assert d1.id == d2.id
    ships = [i for i in list_sale_document_items(db, str(d1.id)) if str(i.line_kind) == LINE_KIND_SHIPPING]
    assert len(ships) == 1


def test_r_s_legacy_ensure_no_shipping_backfill():
    db = _session()
    series = _series(db, count_shipping=True)
    order = _order(db, shipping_cost=40.0)
    # Simulate legacy PRIMARY with product items only (no shipping), created before feature.
    doc = SaleDocument(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        order_id=int(order.id),
        document_series_id=str(series.id),
        document_number="FV/LEGACY/1",
        panel_document_type="INVOICE",
        document_subtype="INVOICE",
        series_type="SALE",
        document_kind="PRIMARY",
        total_net=100.0,
        total_vat=23.0,
        total_gross=123.0,
        buyer_json=BUYER_SNAP,
        created_at=datetime.utcnow(),
    )
    db.add(doc)
    db.flush()
    db.add(
        SaleDocumentItem(
            sale_document_id=str(doc.id),
            line_kind=LINE_KIND_PRODUCT,
            order_item_id=db.query(OrderItem).filter(OrderItem.order_id == int(order.id)).first().id,
            product_id=10,
            position=0,
            name="Widget",
            quantity=1,
            unit_net=100,
            unit_gross=123,
            vat_percent=23,
            line_net=100,
            line_vat=23,
            line_gross=123,
        )
    )
    db.commit()
    ensure_primary_items_snapshot(db, doc=doc, order=order)
    items = list_sale_document_items(db, str(doc.id))
    assert not any(str(i.line_kind) == LINE_KIND_SHIPPING for i in items)
    assert abs(float(doc.total_gross) - 123.0) < 0.01


def test_t_correction_mapping_ignores_shipping():
    from backend.models.return_status import ReturnStatus
    from backend.models.wms_order_return import WmsOrderReturn
    from backend.models.wms_rmz_line import RMZLine
    from backend.services.sale_documents.return_correction_adapter import build_return_correction_lines

    db = _session()
    for model in (ReturnStatus, WmsOrderReturn, RMZLine):
        model.__table__.create(db.get_bind(), checkfirst=True)
    series = _series(db, count_shipping=True)
    order = _order(db, shipping_cost=19.99, unit_net=50.0, qty=2)
    doc = create_sale_document(
        db, order=order, series_id=str(series.id), tenant_id=1, warehouse_id=1, panel_document_type="INVOICE"
    )
    db.add(
        ReturnStatus(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            name="Przyjęty",
            type="done_success",
            transition_key="success",
        )
    )
    ret = WmsOrderReturn(
        id=70,
        tenant_id=1,
        warehouse_id=1,
        order_id=int(order.id),
        rmz_number="RMZ-70",
        return_type="RMA",
        status_id=1,
        lines_json="[]",
        warehouse_document_id=500,
    )
    db.add(ret)
    db.flush()
    oi = db.query(OrderItem).filter(OrderItem.order_id == int(order.id)).first()
    assert oi is not None
    db.add(
        RMZLine(
            rmz_id=70,
            order_item_id=int(oi.id),
            product_id=10,
            accepted_qty=1,
            damaged_b_qty=0,
            damaged_c_qty=0,
            rejected_qty=0,
        )
    )
    db.commit()
    lines, _scope = build_return_correction_lines(db, source=doc, return_row=ret)
    assert all(ln.get("line_kind") == LINE_KIND_PRODUCT for ln in lines)
    assert all(ln.get("order_item_id") is not None for ln in lines)
    assert not any(ln.get("line_kind") == LINE_KIND_SHIPPING for ln in lines)
