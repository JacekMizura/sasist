"""Tests for shipping display / logo resolution used by packing cards."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.utils.order_shipping_display import order_shipping_display, resolve_order_shipping_display


def test_order_shipping_display_from_row_with_logo():
    row = SimpleNamespace(id="sm-1", name="Allegro One", logo_url="/uploads/allegro.png")
    order = SimpleNamespace(shipping_method_row=row, shipping_method=None)
    name, logo, sid = order_shipping_display(order)
    assert name == "Allegro One"
    assert logo == "/uploads/allegro.png"
    assert sid == "sm-1"


def test_resolve_looks_up_logo_by_name_when_row_has_none():
    order = SimpleNamespace(
        shipping_method_row=None,
        shipping_method="Allegro One",
        shipping_method_id=None,
        tenant_id=1,
        warehouse_id=1,
    )
    method = SimpleNamespace(
        id="sm-allegro",
        name="Allegro One",
        code="ALLEGRO_ONE",
        logo_url="/uploads/9140a284753f4b788bb773a6b1e357f6.png",
        aliases_json='["allegro one","allegro smart"]',
    )
    q = MagicMock()
    q.filter.return_value = q
    q.all.return_value = [method]
    q.first.return_value = None
    db = MagicMock()
    db.query.return_value = q

    name, logo, sid = resolve_order_shipping_display(order, db, tenant_id=1, warehouse_id=1)
    assert name == "Allegro One"
    assert logo == "/uploads/9140a284753f4b788bb773a6b1e357f6.png"
    assert sid == "sm-allegro"


def test_resolve_keeps_existing_logo_without_db_lookup():
    row = SimpleNamespace(id="sm-1", name="DPD", logo_url="/uploads/dpd.png")
    order = SimpleNamespace(shipping_method_row=row, shipping_method="DPD")
    name, logo, sid = resolve_order_shipping_display(order, db=None)
    assert logo == "/uploads/dpd.png"
    assert name == "DPD"
    assert sid == "sm-1"
