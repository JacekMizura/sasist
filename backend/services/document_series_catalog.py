"""Canonical operational document series — single source of truth for seed/repair/API."""

from __future__ import annotations

from typing import TypedDict

# Monthly numbering: PZ/2026/06/000001
DEFAULT_NUMBERING_FORMAT = "{PREFIX}/{YEAR}/{MONTH}/{NUMBER}"


class OperationalSeriesSpec(TypedDict, total=False):
    name: str
    subtype: str
    prefix: str
    series_type: str
    numbering_format: str
    padding_length: int
    is_default: bool
    monthly_reset: bool
    yearly_reset: bool
    code: str


OPERATIONAL_WAREHOUSE_SERIES: list[OperationalSeriesSpec] = [
    {"series_type": "WAREHOUSE", "subtype": "PZ", "prefix": "PZ", "name": "PZ — przyjęcia"},
    {"series_type": "WAREHOUSE", "subtype": "WZ", "prefix": "WZ", "name": "WZ — wydania"},
    {"series_type": "WAREHOUSE", "subtype": "MM", "prefix": "MM", "name": "MM — przesunięcia magazynowe"},
    {"series_type": "WAREHOUSE", "subtype": "RW", "prefix": "RW", "name": "RW — rozchód wewnętrzny"},
    {"series_type": "WAREHOUSE", "subtype": "PW", "prefix": "PW", "name": "PW — przychód wewnętrzny"},
]

OPERATIONAL_SALE_SERIES: list[OperationalSeriesSpec] = [
    {"series_type": "SALE", "subtype": "INVOICE", "prefix": "FV", "name": "FV — faktura VAT"},
    {"series_type": "SALE", "subtype": "RECEIPT", "prefix": "PA", "name": "PA — paragon"},
]

OPERATIONAL_CORRECTION_SERIES: list[OperationalSeriesSpec] = [
    {"series_type": "CORRECTION", "subtype": "CORRECTION", "prefix": "KOR", "name": "KOR — korekta"},
]

ALL_OPERATIONAL_SERIES: list[OperationalSeriesSpec] = (
    OPERATIONAL_WAREHOUSE_SERIES + OPERATIONAL_SALE_SERIES + OPERATIONAL_CORRECTION_SERIES
)


def normalize_series_spec(spec: OperationalSeriesSpec) -> dict:
    """Full seed row dict with consistent monthly numbering defaults."""
    st = str(spec.get("series_type") or "WAREHOUSE").strip().upper()
    sub = str(spec["subtype"]).strip().upper()
    prefix = str(spec.get("prefix") or sub).strip().upper()
    return {
        "name": str(spec.get("name") or f"{sub} — domyślna"),
        "subtype": sub,
        "prefix": prefix,
        "series_type": st,
        "numbering_format": str(spec.get("numbering_format") or DEFAULT_NUMBERING_FORMAT),
        "padding_length": int(spec.get("padding_length") or 6),
        "is_default": bool(spec.get("is_default", True)),
        "monthly_reset": bool(spec.get("monthly_reset", True)),
        "yearly_reset": bool(spec.get("yearly_reset", False)),
        "code": str(spec.get("code") or ""),
    }


def required_subtype_keys() -> list[tuple[str, str]]:
    return [(normalize_series_spec(s)["series_type"], normalize_series_spec(s)["subtype"]) for s in ALL_OPERATIONAL_SERIES]
