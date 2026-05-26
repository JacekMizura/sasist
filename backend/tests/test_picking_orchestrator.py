"""
Testy Picking Orchestrator (logika bez bazy).

Uruchomienie:
  python -m pytest backend/tests/test_picking_orchestrator.py -q
"""

from backend.schemas.picking_assignment import PickingAssignmentConfig
from backend.schemas.picking_orchestration import PickingOrchestrationConfig
from backend.services.picking_orchestrator import (
    _cart_family_from_ctype,
    _mode_needs_family,
)


def test_mode_needs_family():
    assert _mode_needs_family("BULK") == "bulk"
    assert _mode_needs_family("SCANNED_CART") == "bulk"
    assert _mode_needs_family("BASKETS") == "baskets"
    assert _mode_needs_family("MOBILE") is None


def test_cart_family_from_ctype():
    assert _cart_family_from_ctype("BULK") == "bulk"
    assert _cart_family_from_ctype("MULTI") == "baskets"
    assert _cart_family_from_ctype("UNKNOWN") is None


def test_orchestration_config_defaults():
    c = PickingOrchestrationConfig(
        mode_single="MOBILE",
        mode_multi="BASKETS",
        assignment=PickingAssignmentConfig(),
    )
    assert c.mode_single == "MOBILE"
    assert c.assignment.allow_bulk is True
