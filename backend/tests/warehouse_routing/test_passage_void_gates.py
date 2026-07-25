"""Passage void rules + construction Z (backend SSOT mirror of FE)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.services.warehouse_layout.passage_void import (
    construction_z_cm,
    count_passage_void_levels,
    find_bins_in_void,
    get_passage_void_height_cm,
    is_bin_in_void,
    level_heights_for_rack,
)
from backend.services.warehouse_layout_service import _bin_coords_cm


def test_void_height_single_enabled_only():
    assert get_passage_void_height_cm(
        [
            {"enabled": False, "clearance_height_cm": 160},
            {"enabled": True, "clearance_height_cm": 80},
        ]
    ) == 80
    assert get_passage_void_height_cm([{"enabled": True, "clearance_height_cm": None}]) == 0


def test_void_height_rejects_multiple_enabled():
    from backend.services.warehouse_layout.single_passage import MultipleEnabledPassagesError

    with pytest.raises(MultipleEnabledPassagesError):
        get_passage_void_height_cm(
            [
                {"enabled": True, "clearance_height_cm": 80},
                {"enabled": True, "clearance_height_cm": 160},
            ]
        )


def test_count_void_levels_matches_equal_split():
    # 200 cm / 5 → 40 each; void 80 → 2 levels
    assert count_passage_void_levels(200, 5, 80) == 2
    assert count_passage_void_levels(200, 5, 120) == 3
    assert count_passage_void_levels(200, 5, 0) == 0


def test_is_bin_in_void():
    assert is_bin_in_void(0, 2) is True
    assert is_bin_in_void(1, 2) is True
    assert is_bin_in_void(2, 2) is False


def test_find_bins_in_void_rejects_construction_indices_in_band():
    bad = find_bins_in_void(
        [
            {"label": "BAD", "level_index": 0, "segment_index": 0},
            {"label": "OK", "level_index": 2, "segment_index": 0},
        ],
        void_level_count=2,
    )
    assert len(bad) == 1
    assert bad[0]["label"] == "BAD"


def test_construction_z_cm_keeps_void_elevation():
    # 5 × 40 cm; storage at construction index 2 → z = 80
    heights = level_heights_for_rack(200, 5)
    assert heights == [40, 40, 40, 40, 40]
    assert construction_z_cm(
        rack_height_cm=200,
        structural_level_count=5,
        level_index=2,
        level_heights_cm=heights,
    ) == 80


def test_bin_coords_z_uses_full_construction_even_if_structure_trimmed():
    """Regression: trimmed storage-only internal_structure must not collapse Z."""
    rack = SimpleNamespace(
        x=0,
        y=0,
        orientation="horizontal",
        width_cm=100,
        length_cm=80,
        height_cm=200,
        levels=5,
        bins_per_level=1,
    )
    # Trimmed to 3 storage levels only (legacy bug path)
    trimmed = {
        "levels": [
            {"height_cm": 40, "locations": [{"width_cm": 100}]},
            {"height_cm": 40, "locations": [{"width_cm": 100}]},
            {"height_cm": 40, "locations": [{"width_cm": 100}]},
        ]
    }
    _x, _y, z = _bin_coords_cm(rack, level_index=2, segment_index=0, internal_structure=trimmed)
    assert z == 80.0


def test_find_active_ops_empty_input():
    from backend.services.warehouse_layout.structure_rebuild_gates import find_active_ops_for_location_uuids

    class _Dummy:
        def query(self, *a, **k):
            raise AssertionError("should not query")

    assert find_active_ops_for_location_uuids(_Dummy(), tenant_id=1, warehouse_id=1, location_uuids=[]) == []


def test_audit_hook_is_noop():
    from backend.services.warehouse_layout.structure_rebuild_audit import (
        StructureRebuildAuditEvent,
        record_structure_rebuild,
    )

    record_structure_rebuild(
        StructureRebuildAuditEvent(tenant_id=1, warehouse_id=1, source="layout_save")
    )
