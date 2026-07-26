"""Special placements — map markers independent of locations / document history."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend.api.warehouse_layout import delete_special_location, update_special_location
from backend.domain.layout_geometry import get_special_locations_xy
from backend.services.special_placement_service import (
    delete_special_placement,
    list_special_placements_payload,
)


def test_delete_special_location_removes_placement_only():
    db = MagicMock()
    with patch(
        "backend.api.warehouse_layout.delete_special_placement",
        return_value=True,
    ) as mock_del:
        result = delete_special_location(15, db)
    assert result == {"ok": True}
    mock_del.assert_called_once_with(db, 15)


def test_delete_special_location_404():
    db = MagicMock()
    with patch("backend.api.warehouse_layout.delete_special_placement", return_value=False):
        try:
            delete_special_location(99, db)
            assert False, "expected HTTPException"
        except HTTPException as exc:
            assert exc.status_code == 404


def test_delete_special_placement_never_deletes_location():
    db = MagicMock()
    placement = SimpleNamespace(id=3, location_id=42)
    db.query.return_value.filter.return_value.first.return_value = placement

    assert delete_special_placement(db, 3) is True
    db.delete.assert_called_once_with(placement)
    # Only placement deleted — Location.query(...).delete never happens
    assert db.commit.called


def test_get_special_locations_xy_reads_placements():
    db = MagicMock()
    with patch(
        "backend.services.special_placement_service.get_special_placements_xy",
        return_value=((10.0, 20.0), (30.0, 40.0), (50.0, 60.0)),
    ):
        start, pack = get_special_locations_xy(db, 1)
    assert start == (10.0, 20.0)
    assert pack == (30.0, 40.0)


def test_list_payload_maps_roles():
    db = MagicMock()
    rows = [
        SimpleNamespace(id=1, role="PICK_START", x_cm=1.0, y_cm=2.0, location_id=10),
        SimpleNamespace(id=2, role="PACKING", x_cm=3.0, y_cm=4.0, location_id=11),
        SimpleNamespace(id=3, role="DOCK", x_cm=5.0, y_cm=6.0, location_id=None),
    ]
    db.query.return_value.filter.return_value.all.return_value = rows
    payload = list_special_placements_payload(db, 7)
    assert payload["pick_start"] == {"id": 1, "x": 1.0, "y": 2.0, "location_id": 10}
    assert payload["packing"] == {"id": 2, "x": 3.0, "y": 4.0, "location_id": 11}
    assert payload["dock"] == {"id": 3, "x": 5.0, "y": 6.0, "location_id": None}


def test_update_special_location_404():
    db = MagicMock()
    body = SimpleNamespace(x=1.0, y=2.0, rotation=None)
    with patch(
        "backend.api.warehouse_layout.update_special_placement_coords",
        return_value=None,
    ):
        try:
            update_special_location(8, body, db)
            assert False, "expected HTTPException"
        except HTTPException as exc:
            assert exc.status_code == 404
