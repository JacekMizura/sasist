"""
Status panelu po finalize wózka (priorytet ustawień braków vs konfigurator).

Uruchomienie:
  python -m pytest backend/tests/test_wms_picking_finalize_panel_status.py -q
"""

from types import SimpleNamespace

from backend.services.wms_picking_product_list_service import (
    _panel_status_after_picking_finalize,
    _panel_status_id_for_finalize_outcome,
)


def test_finalize_all_picked_uses_target_only():
    pc = SimpleNamespace(target_status_id=100, status_on_shortage_id=200)
    assert _panel_status_after_picking_finalize(shortage_reported_order_ui_status_id=50, pc=pc, kind="all_picked") == 100
    assert _panel_status_id_for_finalize_outcome(pc, "all_picked") == 100


def test_finalize_shortage_prefers_shortage_settings_status():
    pc = SimpleNamespace(target_status_id=100, status_on_shortage_id=200)
    assert _panel_status_after_picking_finalize(shortage_reported_order_ui_status_id=50, pc=pc, kind="some_missing") == 50


def test_finalize_shortage_without_global_setting_uses_target_status():
    pc = SimpleNamespace(target_status_id=100, status_on_shortage_id=200)
    assert _panel_status_after_picking_finalize(shortage_reported_order_ui_status_id=None, pc=pc, kind="some_missing") == 100
    pc2 = SimpleNamespace(target_status_id=100, status_on_shortage_id=None)
    assert _panel_status_after_picking_finalize(shortage_reported_order_ui_status_id=None, pc=pc2, kind="all_missing") == 100
