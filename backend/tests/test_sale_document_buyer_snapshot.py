"""Immutable buyer snapshot — creation, mapper precedence, PDF/reprint immutability.

  python -m pytest backend/tests/test_sale_document_buyer_snapshot.py -q
"""

from __future__ import annotations

import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.direct_sale.retail_customer_service import RETAIL_CUSTOMER_EMAIL_SUFFIX, RETAIL_DISPLAY_NAME
from backend.services.sale_document_buyer_snapshot import (
    build_buyer_snapshot,
    buyer_snapshot_to_display,
    parse_buyer_snapshot,
    persist_buyer_snapshot,
    serialize_buyer_snapshot,
)
from backend.services.sale_document_mapper import map_sale_document
from backend.services.sale_document_pdf_service import _build_sale_context


def _customer(
    *,
    customer_id: int = 1,
    company_name: str = "ABC Sp. z o.o.",
    nip: str = "1111111111",
    street: str = "Stara",
    house: str = "1",
    postal: str = "00-001",
    city: str = "Warszawa",
    retail: bool = False,
) -> SimpleNamespace:
    addr = SimpleNamespace(
        id=10,
        street=street,
        house_number=house,
        apartment_number=None,
        postal_code=postal,
        city=city,
        country_code="PL",
        is_default=True,
    )
    email = f"retail+1{RETAIL_CUSTOMER_EMAIL_SUFFIX}" if retail else "b2b@test.pl"
    return SimpleNamespace(
        id=customer_id,
        first_name="" if not retail else RETAIL_DISPLAY_NAME,
        last_name="",
        company_name=RETAIL_DISPLAY_NAME if retail else company_name,
        nip=None if retail else nip,
        email=email,
        phone="500600700",
        country_code="PL",
        addresses=[addr] if not retail else [],
    )


def _order(
    *,
    customer_id: int | None = 1,
    addresses_json: str | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=100,
        customer_id=customer_id,
        addresses_json=addresses_json,
        number="ORD-100",
        items=[],
        currency="PLN",
        source="direct-sales",
        order_channel="DIRECT_SALE",
        fulfillment_mode="IMMEDIATE",
        customer_name=None,
        city=None,
        country=None,
    )


def _sale_doc(*, buyer_json: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=str(uuid.uuid4()),
        order_id=100,
        tenant_id=1,
        warehouse_id=1,
        document_series_id="s1",
        document_type_id="s1",
        document_subtype="INVOICE",
        panel_document_type="INVOICE",
        series_type="SALE",
        document_number="FV/2026/001",
        total_net=100.0,
        total_gross=123.0,
        total_vat=23.0,
        payment_id=None,
        payment_method="CASH",
        payment_status="PAID",
        payment_captured_at=None,
        payment_external_transaction_id=None,
        created_at=None,
        buyer_json=buyer_json,
    )


def _item() -> SimpleNamespace:
    product = SimpleNamespace(name="Prod", sku="SKU1", symbol=None, metadata_json=None)
    return SimpleNamespace(
        id=1,
        product_id=5,
        product=product,
        quantity=1,
        unit_price=100.0,
        total_price=100.0,
        vat_percent=23.0,
        metadata_json='{"line_gross_total": 123.0, "price_input_mode": "NETTO"}',
        oms_line_status=None,
        parent_bundle_order_item_id=None,
        source_movement_id=None,
    )


class TestBuyerSnapshotBuild(unittest.TestCase):
    def test_fv_customer_with_address(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        cust = _customer()
        snap = build_buyer_snapshot(db, order=_order(), customer=cust, panel_document_type="INVOICE")
        self.assertEqual(snap["name"], "ABC Sp. z o.o.")
        self.assertEqual(snap["nip"], "1111111111")
        self.assertIsNotNone(snap["address"])
        self.assertEqual(snap["address"]["street"], "Stara")
        self.assertEqual(snap["address"]["house_number"], "1")

    def test_fv_uses_customer_not_shipping_when_only_shipping_in_order(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        shipping_only = {
            "shipping": {
                "name": "Jan Odbiorca",
                "street": "Magazynowa",
                "house_number": "50",
                "postal_code": "02-002",
                "city": "Warszawa",
            }
        }
        order = _order(addresses_json=json.dumps(shipping_only))
        cust = _customer(company_name="Firma ABC", nip="1111111111", street="Stara", house="1")
        snap = build_buyer_snapshot(db, order=order, customer=cust, panel_document_type="INVOICE")
        self.assertEqual(snap["name"], "Firma ABC")
        self.assertEqual(snap["nip"], "1111111111")
        self.assertEqual(snap["address"]["street"], "Stara")
        self.assertNotIn("Jan", snap.get("first_name") or "")
        self.assertNotIn("Magazynowa", snap["address"]["street"])

    def test_marketplace_order_billing_without_customer(self):
        db = MagicMock()
        billing = {
            "billing": {
                "company_name": "Market ABC",
                "nip": "9876543210",
                "street": "Allegro 5",
                "postal_code": "30-001",
                "city": "Kraków",
            }
        }
        order = _order(customer_id=None, addresses_json=json.dumps(billing))
        snap = build_buyer_snapshot(db, order=order, customer=None, panel_document_type="INVOICE")
        self.assertEqual(snap["name"], "Market ABC")
        self.assertEqual(snap["nip"], "9876543210")
        self.assertEqual(snap["address"]["street"], "Allegro")
        self.assertEqual(snap["address"]["house_number"], "5")

    def test_pa_retail_customer(self):
        db = MagicMock()
        cust = _customer(retail=True)
        snap = build_buyer_snapshot(db, order=_order(customer_id=99), customer=cust, panel_document_type="PARAGON")
        self.assertEqual(snap["name"], RETAIL_DISPLAY_NAME)

    def test_pa_named_customer(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        cust = _customer(company_name="Jan Kowalski", nip=None)
        snap = build_buyer_snapshot(db, order=_order(), customer=cust, panel_document_type="PARAGON")
        self.assertEqual(snap["name"], "Jan Kowalski")


class TestMapperPrecedence(unittest.TestCase):
    def _map_with(self, *, doc, customer, order):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        return map_sale_document(
            db,
            doc=doc,
            order=order,
            customer=customer,
            mode="detail",
            refresh_db=False,
        )

    def test_snapshot_wins_over_mutated_customer(self):
        snapshot = serialize_buyer_snapshot(
            {
                "customer_id": 1,
                "name": "ABC",
                "company_name": "ABC",
                "nip": "111",
                "address": {"street": "Stara 1", "city": "Warszawa", "postal_code": "00-001", "country_code": "PL"},
            }
        )
        doc = _sale_doc(buyer_json=snapshot)
        order = _order()
        order.items = [_item()]
        mutated = _customer(company_name="XYZ", nip="222", street="Nowa", house="5")
        dto = self._map_with(doc=doc, customer=mutated, order=order)
        self.assertEqual(dto["buyer"]["name"], "ABC")
        self.assertEqual(dto["buyer"]["nip"], "111")
        self.assertIn("Stara 1", dto["buyer"]["address"])

    def test_legacy_null_buyer_json_uses_live_customer(self):
        doc = _sale_doc(buyer_json=None)
        order = _order()
        order.items = [_item()]
        live = _customer(company_name="XYZ", nip="222")
        dto = self._map_with(doc=doc, customer=live, order=order)
        self.assertEqual(dto["buyer"]["name"], "XYZ")
        self.assertIsNone(doc.buyer_json)

    def test_pdf_context_uses_snapshot_not_live(self):
        snapshot = serialize_buyer_snapshot({"customer_id": 1, "name": "ABC", "nip": "111", "address": None})
        doc = _sale_doc(buyer_json=snapshot)
        order = _order()
        order.items = [_item()]
        mutated = _customer(company_name="XYZ", nip="222")
        dto = self._map_with(doc=doc, customer=mutated, order=order)
        ctx = _build_sale_context(dto)
        self.assertEqual(ctx["customer"]["name"], "ABC")


class TestPersistAndCorrection(unittest.TestCase):
    def test_persist_writes_buyer_json(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        row = SimpleNamespace(buyer_json=None)
        order = _order()
        cust = _customer()
        persist_buyer_snapshot(db, row=row, order=order, panel_document_type="INVOICE", customer=cust)
        self.assertIsNotNone(row.buyer_json)
        parsed = parse_buyer_snapshot(row.buyer_json)
        self.assertEqual(parsed["name"], "ABC Sp. z o.o.")


class TestCreateSaleDocumentIntegration(unittest.TestCase):
    @patch("backend.services.wms_sale_document_service.persist_buyer_snapshot")
    @patch("backend.services.wms_sale_document_service.allocate_next_document_number")
    def test_create_sale_document_invokes_buyer_snapshot(self, mock_alloc, mock_persist):
        from backend.services.wms_sale_document_service import create_sale_document

        mock_alloc.return_value = "FV/2026/0001"
        db = MagicMock()
        ds = SimpleNamespace(
            id="series-1",
            tenant_id=1,
            warehouse_id=1,
            series_type="SALE",
            subtype="INVOICE",
            code="WH1",
        )
        order = SimpleNamespace(
            id=10,
            tenant_id=1,
            warehouse_id=1,
            customer_id=1,
            currency="PLN",
            import_metadata_json=None,
            sales_document_number=None,
            items=[],
        )
        order_loaded = SimpleNamespace(id=10, items=[], currency="PLN", customer_id=1)

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            q.order_by.return_value = q
            q.options.return_value = q
            name = getattr(model, "__name__", "")
            if name == "SaleDocument":
                q.first.return_value = None
            elif name == "DocumentSeries":
                q.first.return_value = ds
            elif name == "Order":
                q.first.return_value = order_loaded
            elif name == "Customer":
                q.first.return_value = _customer(company_name="Pack Buyer")
            else:
                q.first.return_value = None
            return q

        db.query.side_effect = query_side

        doc = create_sale_document(
            db,
            order=order,
            series_id="series-1",
            tenant_id=1,
            warehouse_id=1,
            panel_document_type="INVOICE",
        )
        self.assertIsNotNone(doc)
        mock_persist.assert_called_once()
        call_kw = mock_persist.call_args.kwargs
        self.assertEqual(call_kw["panel_document_type"], "INVOICE")
        self.assertEqual(call_kw["order"].id, 10)


if __name__ == "__main__":
    unittest.main()
