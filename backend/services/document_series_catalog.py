"""Canonical operational document series — single source of truth for seed/repair/API/UI."""

from __future__ import annotations

from typing import TypedDict

# Monthly numbering: PZ/2026/06/1
DEFAULT_NUMBERING_FORMAT = "{PREFIX}/{YEAR}/{MONTH}/{NUMBER}"


class OperationalSeriesSpec(TypedDict, total=False):
    name: str
    subtype: str
    prefix: str
    operational_code: str
    series_type: str
    numbering_format: str
    padding_length: int
    print_template_id: int
    is_default: bool
    monthly_reset: bool
    yearly_reset: bool
    warehouse_effect: bool
    code: str


def _wh(
    subtype: str,
    *,
    name: str | None = None,
    prefix: str | None = None,
    print_template_id: int | None = None,
) -> OperationalSeriesSpec:
    sub = subtype.strip().upper()
    spec: OperationalSeriesSpec = {
        "series_type": "WAREHOUSE",
        "subtype": sub,
        "operational_code": sub,
        "prefix": (prefix or sub).strip().upper(),
        "name": name or f"{sub} — domyślna",
        "warehouse_effect": True,
        "padding_length": 0,
    }
    if print_template_id is not None:
        spec["print_template_id"] = int(print_template_id)
    return spec


def _sale(
    subtype: str,
    *,
    code: str,
    name: str,
    padding_length: int = 6,
    print_template_id: int | None = None,
) -> OperationalSeriesSpec:
    spec: OperationalSeriesSpec = {
        "series_type": "SALE",
        "subtype": subtype.strip().upper(),
        "operational_code": code.strip().upper(),
        "prefix": code.strip().upper(),
        "name": name,
        "warehouse_effect": False,
        "padding_length": int(padding_length),
    }
    if print_template_id is not None:
        spec["print_template_id"] = int(print_template_id)
    return spec


OPERATIONAL_WAREHOUSE_SERIES: list[OperationalSeriesSpec] = [
    _wh("PZ", name="PZ — przyjęcia"),
    {
        "series_type": "WAREHOUSE",
        "subtype": "Z_PZ",
        "operational_code": "Z-PZ",
        "prefix": "Z-PZ",
        "name": "Zwroty",
        "numbering_format": "{PREFIX}-{YEAR}-{NUMBER}",
        "yearly_reset": True,
        "monthly_reset": False,
        "warehouse_effect": True,
        "padding_length": 0,
        "is_default": True,
    },
    _wh("WZ", name="WZ — wydania", print_template_id=3),
    _wh("MM", name="MM — przesunięcia magazynowe"),
    _wh("RW", name="RW — rozchód wewnętrzny"),
    _wh("PW", name="PW — przychód wewnętrzny"),
    _wh("ZW", name="ZW — zwrot"),
    _wh("ZD", name="ZD — dowód dostawy"),
]

OPERATIONAL_SALE_SERIES: list[OperationalSeriesSpec] = [
    _sale("INVOICE", code="FV", name="FV — faktura VAT", padding_length=6, print_template_id=1),
    _sale("RECEIPT", code="PA", name="PA — paragon", padding_length=0, print_template_id=2),
]

OPERATIONAL_CORRECTION_SERIES: list[OperationalSeriesSpec] = [
    {
        "series_type": "CORRECTION",
        "subtype": "CORRECTION",
        "operational_code": "KOR",
        "prefix": "KOR",
        "name": "KOR — korekta",
        "warehouse_effect": False,
        "print_template_id": 4,
    },
]

# Optional — legacy / extended warehouse series (not auto-seeded with bootstrap set).
OPTIONAL_WAREHOUSE_SERIES: list[OperationalSeriesSpec] = [
    _wh("PZ_RT", name="PZ zwrot RMZ (legacy)", prefix="PZR"),
    _wh("ZWZ", name="ZWZ — zwrot zewnętrzny"),
    _wh("INW", name="INW — inwentaryzacja"),
    _wh("RK", name="RK — korekta magazynowa"),
]

ALL_OPERATIONAL_SERIES: list[OperationalSeriesSpec] = (
    OPERATIONAL_WAREHOUSE_SERIES + OPERATIONAL_SALE_SERIES + OPERATIONAL_CORRECTION_SERIES
)

REQUIRED_BOOTSTRAP_COUNT = len(ALL_OPERATIONAL_SERIES)


def operational_code_for_spec(spec: OperationalSeriesSpec) -> str:
    return str(spec.get("operational_code") or spec.get("prefix") or spec["subtype"]).strip().upper()


def stock_document_type_for_subtype(subtype: str) -> str | None:
    """Map series subtype → stock_documents.document_type (warehouse ops)."""
    sub = str(subtype or "").strip().upper()
    if sub == "Z-PZ":
        sub = "Z_PZ"
    all_specs = OPERATIONAL_WAREHOUSE_SERIES + OPTIONAL_WAREHOUSE_SERIES
    known_subtypes = {str(s["subtype"]).strip().upper() for s in all_specs}
    if sub in known_subtypes:
        return sub
    return None


def route_segment_for_series(series_type: str, subtype: str, operational_code: str) -> str | None:
    st = str(series_type or "").strip().upper()
    sub = str(subtype or "").strip().upper()
    code = str(operational_code or sub).strip().upper()
    if st == "SALE":
        if sub == "INVOICE":
            return "invoices"
        if sub == "RECEIPT":
            return "receipts"
        return None
    if st == "CORRECTION":
        return "correcting"
    if st == "WAREHOUSE":
        return code.lower()
    return None


def list_path_for_series(series_type: str, subtype: str, operational_code: str) -> str | None:
    seg = route_segment_for_series(series_type, subtype, operational_code)
    if not seg:
        return None
    st = str(series_type or "").strip().upper()
    if st == "WAREHOUSE":
        return f"/documents/warehouse/{seg}"
    if st == "SALE":
        return f"/documents/sales/{seg}"
    if st == "CORRECTION":
        return f"/documents/{seg}"
    return None


def normalize_series_spec(spec: OperationalSeriesSpec) -> dict:
    """Full seed row dict with consistent monthly numbering defaults."""
    st = str(spec.get("series_type") or "WAREHOUSE").strip().upper()
    sub = str(spec["subtype"]).strip().upper()
    prefix = str(spec.get("prefix") or operational_code_for_spec(spec)).strip().upper()
    wh_effect = bool(spec.get("warehouse_effect", st == "WAREHOUSE"))
    out: dict = {
        "name": str(spec.get("name") or f"{sub} — domyślna"),
        "subtype": sub,
        "prefix": prefix,
        "operational_code": operational_code_for_spec(spec),
        "series_type": st,
        "numbering_format": str(spec.get("numbering_format") or DEFAULT_NUMBERING_FORMAT),
        "padding_length": int(spec["padding_length"]) if "padding_length" in spec else 0,
        "is_default": bool(spec.get("is_default", True)),
        "monthly_reset": bool(spec.get("monthly_reset", True)),
        "yearly_reset": bool(spec.get("yearly_reset", False)),
        "warehouse_effect": wh_effect,
        "code": str(spec.get("code") or ""),
    }
    if spec.get("print_template_id") is not None:
        out["print_template_id"] = int(spec["print_template_id"])
    return out


def required_subtype_keys() -> list[tuple[str, str]]:
    return [(normalize_series_spec(s)["series_type"], normalize_series_spec(s)["subtype"]) for s in ALL_OPERATIONAL_SERIES]


def operational_code_for_subtype(series_type: str, subtype: str, *, prefix: str = "") -> str:
    st = str(series_type or "").strip().upper()
    sub = str(subtype or "").strip().upper()
    for raw in ALL_OPERATIONAL_SERIES + OPTIONAL_WAREHOUSE_SERIES:
        n = normalize_series_spec(raw)
        if n["series_type"] == st and n["subtype"] == sub:
            return n["operational_code"]
    p = str(prefix or "").strip().upper()
    return p or sub
