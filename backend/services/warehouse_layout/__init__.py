"""Warehouse layout domain helpers (passage void, rebuild gates, audit hook)."""

from .passage_void import (
    construction_z_cm,
    count_passage_void_levels,
    find_bins_in_void,
    get_passage_void_height_cm,
    is_bin_in_void,
    structural_level_count_from_payload,
)
from .single_passage import (
    SINGLE_ENABLED_PASSAGE_ERROR,
    MultipleEnabledPassagesError,
    assert_at_most_one_enabled_passage,
    count_enabled_passages,
    has_multiple_enabled_passages,
)
from .structure_rebuild_audit import StructureRebuildAuditEvent, record_structure_rebuild
from .structure_rebuild_gates import ActiveLocationOp, find_active_ops_for_location_uuids

__all__ = [
    "ActiveLocationOp",
    "MultipleEnabledPassagesError",
    "SINGLE_ENABLED_PASSAGE_ERROR",
    "StructureRebuildAuditEvent",
    "assert_at_most_one_enabled_passage",
    "construction_z_cm",
    "count_enabled_passages",
    "count_passage_void_levels",
    "find_active_ops_for_location_uuids",
    "find_bins_in_void",
    "get_passage_void_height_cm",
    "has_multiple_enabled_passages",
    "is_bin_in_void",
    "record_structure_rebuild",
    "structural_level_count_from_payload",
]
