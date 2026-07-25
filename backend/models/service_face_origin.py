"""Provenance of Rack.service_side / rotation_degrees (persisted VARCHAR)."""

from __future__ import annotations

from enum import Enum


class ServiceFaceOrigin(str, Enum):
    """
    LEGACY_DEFAULT — historical / unconscious FRONT+0; may be repaired.
    AUTO_REPAIR — set by repair/inference; may be recomputed.
    EXPLICIT — intentional user/generator face; never auto-modified.
    """

    LEGACY_DEFAULT = "LEGACY_DEFAULT"
    AUTO_REPAIR = "AUTO_REPAIR"
    EXPLICIT = "EXPLICIT"


SERVICE_FACE_ORIGIN_VALUES = frozenset(e.value for e in ServiceFaceOrigin)
