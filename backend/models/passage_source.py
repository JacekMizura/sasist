"""Provenance of WarehouseRackPassage relative to template defaults (persisted VARCHAR)."""

from __future__ import annotations

from enum import Enum


class PassageSource(str, Enum):
    """
    INHERITED — materialized from template defaults; no local CAD edit.
    LOCAL — independent instance geometry (legacy / manual / local edit).
    """

    INHERITED = "INHERITED"
    LOCAL = "LOCAL"


PASSAGE_SOURCE_VALUES = frozenset(e.value for e in PassageSource)


def normalize_passage_source(value: object | None) -> PassageSource:
    """Missing / unknown → LOCAL (legacy layouts never invent INHERITED)."""
    if value is None:
        return PassageSource.LOCAL
    raw = str(value).strip().upper()
    if raw == PassageSource.INHERITED.value:
        return PassageSource.INHERITED
    return PassageSource.LOCAL
