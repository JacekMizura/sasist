"""Shared constants / helpers for automation generate_document + create_from_series."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any


# (series_type, subtype) pairs with a real create handler.
GENERATE_DOCUMENT_SUPPORTED: frozenset[tuple[str, str]] = frozenset(
    {
        ("SALE", "INVOICE"),
        ("SALE", "RECEIPT"),
        ("WAREHOUSE", "WZ"),
        ("WAREHOUSE", "RESERVATION"),
    }
)


@dataclass(frozen=True)
class DocumentCreationOverrides:
    override_payment_term: bool = False
    payment_term_days: int | None = None
    override_sale_date: bool = False
    sale_date: str | None = None
    override_description: bool = False
    additional_description: str | None = None
    auto_print: bool = False
    print_station_id: int | None = None


def is_generate_document_supported(series_type: str, subtype: str) -> bool:
    return (str(series_type or "").strip().upper(), str(subtype or "").strip().upper()) in GENERATE_DOCUMENT_SUPPORTED


def parse_document_creation_overrides(config: dict[str, Any] | None) -> DocumentCreationOverrides:
    """Parse automation effect config (backward compatible with series_id-only)."""
    raw = config if isinstance(config, dict) else {}

    def _bool(key: str, *aliases: str) -> bool:
        for k in (key, *aliases):
            if k in raw:
                return bool(raw.get(k))
        return False

    override_payment = _bool("override_payment_term", "set_payment_term")
    override_sale = _bool("override_sale_date", "set_sale_date")
    override_desc = _bool("override_description", "set_additional_description")
    auto_print = _bool("auto_print", "print_automatically")

    days: int | None = None
    if override_payment:
        raw_days = raw.get("payment_term_days", raw.get("payment_term"))
        if raw_days is None or raw_days == "":
            raise ValueError("payment_term_days_required")
        try:
            days = int(raw_days)
        except (TypeError, ValueError) as exc:
            raise ValueError("payment_term_days_invalid") from exc
        if days < 0:
            raise ValueError("payment_term_days_invalid")

    sale_date: str | None = None
    if override_sale:
        sale_date = str(raw.get("sale_date") or "").strip() or None
        if not sale_date:
            raise ValueError("sale_date_required")
        try:
            date.fromisoformat(sale_date)
        except ValueError as exc:
            raise ValueError("sale_date_invalid") from exc

    description: str | None = None
    if override_desc:
        description = str(raw.get("additional_description") or raw.get("description") or "").strip() or None
        if not description:
            raise ValueError("additional_description_required")

    station_id: int | None = None
    if auto_print:
        raw_station = raw.get("print_station_id", raw.get("workstation_id"))
        if raw_station is None or str(raw_station).strip() == "":
            raise ValueError("print_station_required")
        try:
            station_id = int(raw_station)
        except (TypeError, ValueError) as exc:
            raise ValueError("print_station_invalid") from exc
        if station_id < 1:
            raise ValueError("print_station_invalid")

    return DocumentCreationOverrides(
        override_payment_term=override_payment,
        payment_term_days=days,
        override_sale_date=override_sale,
        sale_date=sale_date,
        override_description=override_desc,
        additional_description=description,
        auto_print=auto_print,
        print_station_id=station_id,
    )


def due_date_from_payment_term_days(days: int, *, base: date | None = None) -> date:
    start = base or date.today()
    return start + timedelta(days=max(0, int(days)))


def format_sale_date_pl(iso: str | None) -> str | None:
    if not iso:
        return None
    try:
        d = date.fromisoformat(str(iso).strip()[:10])
        return d.strftime("%d.%m.%Y")
    except ValueError:
        return str(iso)


def resolve_series_payment_term_text(series: Any, overrides: DocumentCreationOverrides) -> str | None:
    if overrides.override_payment_term and overrides.payment_term_days is not None:
        d = int(overrides.payment_term_days)
        return f"{d} dni" if d != 1 else "1 dzień"
    raw = str(getattr(series, "payment_term_default", None) or "").strip()
    return raw or None


def resolve_series_sale_date_iso(series: Any, order: Any, overrides: DocumentCreationOverrides) -> str | None:
    if overrides.override_sale_date and overrides.sale_date:
        return str(overrides.sale_date)[:10]
    source = str(getattr(series, "sale_date_source", None) or "ORDER_DATE").strip().upper()
    if source == "DOCUMENT_DATE":
        return date.today().isoformat()
    if source == "DELIVERY_DATE":
        for attr in ("delivery_date", "shipping_date", "promised_date"):
            val = getattr(order, attr, None)
            if isinstance(val, datetime):
                return val.date().isoformat()
            if isinstance(val, date):
                return val.isoformat()
            if isinstance(val, str) and val.strip():
                try:
                    return date.fromisoformat(val.strip()[:10]).isoformat()
                except ValueError:
                    pass
    # ORDER_DATE / MANUAL / default
    for attr in ("order_date", "created_at"):
        val = getattr(order, attr, None)
        if isinstance(val, datetime):
            return val.date().isoformat()
        if isinstance(val, date):
            return val.isoformat()
    return date.today().isoformat()


def build_issuance_overrides_dict(
    series: Any,
    order: Any,
    overrides: DocumentCreationOverrides,
) -> dict[str, Any]:
    """Materialize issuance fields for SaleDocument.buyer_json."""
    out: dict[str, Any] = {}
    term = resolve_series_payment_term_text(series, overrides)
    if term:
        out["payment_term_text"] = term
    if overrides.override_payment_term and overrides.payment_term_days is not None:
        out["payment_term_days"] = int(overrides.payment_term_days)
        out["due_date"] = due_date_from_payment_term_days(int(overrides.payment_term_days)).isoformat()
    sale_iso = resolve_series_sale_date_iso(series, order, overrides)
    if sale_iso:
        out["sale_date"] = sale_iso
    if overrides.override_description and overrides.additional_description:
        out["additional_description"] = overrides.additional_description
    return out
