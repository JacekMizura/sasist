"""Ordinary (BULK) cart semantics vs MULTI sections + pick progress lines."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.cart_lifecycle_extensions import compute_pick_progress
from backend.services.cart_service import (
    _order_display_customer,
    _serialize_cart_order_product_lines,
)
from backend.services.cart_stats_service import _stats_from_orders


def test_bulk_cart_has_zero_sections_in_stats():
    cart = SimpleNamespace(type="BULK", baskets=[])
    orders = [
        SimpleNamespace(
            id=1,
            basket_id=None,
            items=[
                SimpleNamespace(
                    product_id=10,
                    quantity=1,
                    parent_bundle_order_item_id=None,
                    is_bundle_parent=False,
                    replaced_from_order_item_id=None,
                )
            ],
        )
    ]
    with patch(
        "backend.services.bundle_order_item_ops.order_item_is_operational_picking_line",
        return_value=True,
    ):
        with patch(
            "backend.services.cart_stats_service._order_volume_dm3",
            return_value=1.0,
        ):
            stats = _stats_from_orders(cart, orders)
    assert stats["sections_count"] == 0
    assert stats["occupied_sections"] == 0
    assert stats["orders_count"] == 1


def test_multi_cart_counts_sections():
    baskets = [SimpleNamespace(id=1, order_id=1), SimpleNamespace(id=2, order_id=None)]
    cart = SimpleNamespace(type="MULTI", baskets=baskets)
    orders = [SimpleNamespace(id=1, basket_id=1, items=[])]
    with patch(
        "backend.services.cart_stats_service._order_volume_dm3",
        return_value=0.0,
    ):
        stats = _stats_from_orders(cart, orders)
    assert stats["sections_count"] == 2
    assert stats["occupied_sections"] == 1


def test_order_display_customer_prefers_person_over_company():
    cust = SimpleNamespace(first_name="Jan", last_name="Kowalski", company_name="ACME Sp. z o.o.")
    order = SimpleNamespace(customer=cust, addresses_json=None, source=None, order_channel=None)
    assert _order_display_customer(order) == "Jan Kowalski"


def test_order_display_customer_falls_back_to_company():
    cust = SimpleNamespace(first_name="", last_name="", company_name="ACME Sp. z o.o.")
    order = SimpleNamespace(customer=cust, addresses_json=None, source=None, order_channel=None)
    assert _order_display_customer(order) == "ACME Sp. z o.o."


def test_order_display_customer_none_when_empty():
    order = SimpleNamespace(customer=None, addresses_json=None, source=None, order_channel=None)
    assert _order_display_customer(order) is None


def test_order_display_customer_polish_billing_keys_without_crm():
    """Marketplace import: Imię/Nazwisko in billing — same as order card contact.name."""
    import json

    addresses = json.dumps(
        {
            "billing": {"Imię": "Elwira", "Nazwisko": "Bieskiewicz"},
            "shipping": {"Ulica": "Kwiatowa 1"},
        },
        ensure_ascii=False,
    )
    order = SimpleNamespace(customer=None, addresses_json=addresses, source="Allegro", order_channel=None)
    assert _order_display_customer(order) == "Elwira Bieskiewicz"


def test_order_display_customer_english_shipping_keys():
    import json

    addresses = json.dumps(
        {"shipping": {"first_name": "Anna", "last_name": "Nowak", "company": "Skip Co"}},
        ensure_ascii=False,
    )
    order = SimpleNamespace(customer=None, addresses_json=addresses, source=None, order_channel=None)
    assert _order_display_customer(order) == "Anna Nowak"


def test_order_display_customer_company_from_addresses_when_no_person():
    import json

    addresses = json.dumps({"billing": {"company_name": "Hurt Sp. z o.o."}}, ensure_ascii=False)
    order = SimpleNamespace(customer=None, addresses_json=addresses, source=None, order_channel=None)
    assert _order_display_customer(order) == "Hurt Sp. z o.o."


def test_order_display_customer_addresses_win_over_empty_crm_link():
    """Unsaved buyer data on order must not be blanked by missing CRM names."""
    import json

    cust = SimpleNamespace(first_name="", last_name="", company_name="")
    addresses = json.dumps({"billing": {"Imię": "Elwira", "Nazwisko": "Bieskiewicz"}}, ensure_ascii=False)
    order = SimpleNamespace(customer=cust, addresses_json=addresses, source=None, order_channel=None)
    assert _order_display_customer(order) == "Elwira Bieskiewicz"


def test_serialize_product_lines_include_ids_and_image():
    prod = SimpleNamespace(
        id=55,
        name="Śruba",
        sku="SKU-1",
        symbol="SYM-1",
        ean="590123",
        barcode=None,
        image_url="https://cdn.example/a.jpg;https://cdn.example/b.jpg",
    )
    item = SimpleNamespace(
        product_id=55,
        quantity=2,
        product=prod,
        offer_name_snapshot=None,
        parent_bundle_order_item_id=None,
        is_bundle_parent=False,
        replaced_from_order_item_id=None,
    )
    order = SimpleNamespace(items=[item])
    with patch(
        "backend.services.bundle_order_item_ops.order_item_is_operational_picking_line",
        return_value=True,
    ):
        lines = _serialize_cart_order_product_lines(order)
    assert len(lines) == 1
    assert lines[0]["product_id"] == 55
    assert lines[0]["image_url"] == "https://cdn.example/a.jpg"
    assert lines[0]["ean"] == "590123"
    assert lines[0]["quantity"] == 2


def test_compute_pick_progress_counts_operational_lines():
    cart = SimpleNamespace(id=7, type="BULK")
    oi1 = SimpleNamespace(id=101, quantity=1, product_id=1)
    oi2 = SimpleNamespace(id=102, quantity=1, product_id=2)
    oi3 = SimpleNamespace(id=103, quantity=1, product_id=3)
    order = SimpleNamespace(id=1, items=[oi1, oi2, oi3])

    def closed(_db, _o, it, *, session_cart_id, picked=None):
        return int(it.id) in (101, 102)

    with (
        patch(
            "backend.services.cart_stats_service.list_orders_on_cart",
            return_value=[order],
        ),
        patch(
            "backend.services.bundle_order_item_ops.order_item_is_operational_picking_line",
            return_value=True,
        ),
        patch(
            "backend.services.fulfillment_event_service.sum_pick_events_for_line_cart",
            return_value=1.0,
        ),
        patch(
            "backend.services.order_fulfillment_recompute.line_closed_for_picking_finalize",
            side_effect=closed,
        ),
    ):
        done, remaining, pct = compute_pick_progress(MagicMock(), cart)

    assert done == 2
    assert remaining == 1
    assert pct == 66.67
