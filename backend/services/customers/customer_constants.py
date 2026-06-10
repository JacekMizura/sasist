"""Customer CRM enums and flag helpers."""

from __future__ import annotations

import json
from typing import Any

CUSTOMER_TYPES = frozenset({"retail", "wholesale", "company"})
CUSTOMER_STATUSES = frozenset({"active", "blocked", "archived"})
CUSTOMER_FLAGS = frozenset({"vip", "debtor", "priority", "suspicious", "requires_invoice", "marketplace"})
SALES_CHANNELS = frozenset(
    {"store", "ecommerce", "allegro", "amazon", "phone", "b2b_portal", "marketplace_other"}
)

CUSTOMER_TYPE_DEFAULT = "retail"
CUSTOMER_STATUS_DEFAULT = "active"
SALES_CHANNEL_DEFAULT = "store"

LEGACY_CUSTOMER_TYPE_MAP = {
    "b2b": "wholesale",
    "marketplace": "retail",
}

CUSTOMER_BLOCKED_MESSAGE = "Klient jest zablokowany"


def normalize_customer_type(raw: object) -> str:
    val = str(raw or "").strip().lower()
    val = LEGACY_CUSTOMER_TYPE_MAP.get(val, val)
    return val if val in CUSTOMER_TYPES else CUSTOMER_TYPE_DEFAULT


def resolve_customer_type_input(raw: object) -> tuple[str, dict[str, bool]]:
    """
    Map API/legacy input to canonical type + optional flag patches.
    marketplace → retail + marketplace flag; b2b → wholesale.
    """
    val = str(raw or "").strip().lower()
    if val == "marketplace":
        return "retail", {"marketplace": True}
    if val == "b2b":
        return "wholesale", {}
    return normalize_customer_type(val), {}


def normalize_customer_status(raw: object) -> str:
    val = str(raw or "").strip().lower()
    return val if val in CUSTOMER_STATUSES else CUSTOMER_STATUS_DEFAULT


def normalize_sales_channel(raw: object) -> str:
    val = str(raw or "").strip().lower()
    return val if val in SALES_CHANNELS else SALES_CHANNEL_DEFAULT


def parse_customer_flags(raw: object) -> dict[str, bool]:
    if raw is None or str(raw).strip() == "":
        return {}
    if isinstance(raw, dict):
        src = raw
    else:
        try:
            src = json.loads(str(raw))
        except (json.JSONDecodeError, TypeError, ValueError):
            return {}
    if not isinstance(src, dict):
        return {}
    out: dict[str, bool] = {}
    for key in CUSTOMER_FLAGS:
        if key in src:
            out[key] = bool(src[key])
    return out


def dump_customer_flags(flags: dict[str, bool]) -> str:
    clean = {k: bool(v) for k, v in flags.items() if k in CUSTOMER_FLAGS and bool(v)}
    return json.dumps(clean, ensure_ascii=False, separators=(",", ":"))


def merge_customer_flags(current: dict[str, bool], patch: dict[str, bool]) -> dict[str, bool]:
    merged = dict(current)
    for key in CUSTOMER_FLAGS:
        if key in patch:
            merged[key] = bool(patch[key])
    return merged


def infer_customer_type(customer: Any) -> str:
    if getattr(customer, "customer_type", None):
        return normalize_customer_type(getattr(customer, "customer_type", None))
    company = str(getattr(customer, "company_name", None) or "").strip()
    nip = str(getattr(customer, "nip", None) or "").strip()
    if company or nip:
        return "company"
    doc = str(getattr(customer, "default_document_type", None) or "").strip().upper()
    if doc == "INVOICE":
        return "company"
    return CUSTOMER_TYPE_DEFAULT


def infer_sales_channel(customer: Any) -> str:
    if getattr(customer, "sales_channel", None):
        return normalize_sales_channel(getattr(customer, "sales_channel", None))
    return SALES_CHANNEL_DEFAULT


def order_excluded_from_customer_stats(order: Any) -> bool:
    status = str(getattr(order, "status", None) or "").strip().upper()
    if status in {"CANCELLED", "CANCELED", "ANULOWANE", "ANULOWANY", "DRAFT"}:
        return True
    ous = getattr(order, "order_ui_status", None)
    if ous is not None:
        mg = str(getattr(ous, "main_group", None) or "").strip().upper()
        if mg in {"CANCELLED", "CANCELED", "DRAFT", "ANULOWANE"}:
            return True
    return False
