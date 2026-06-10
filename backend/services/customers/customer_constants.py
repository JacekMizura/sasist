"""Customer CRM enums and flag helpers."""

from __future__ import annotations

import json
from typing import Any

CUSTOMER_TYPES = frozenset({"retail", "wholesale", "company", "marketplace", "b2b"})
CUSTOMER_STATUSES = frozenset({"active", "blocked", "archived"})
CUSTOMER_FLAGS = frozenset({"vip", "debtor", "priority", "suspicious"})

CUSTOMER_TYPE_DEFAULT = "retail"
CUSTOMER_STATUS_DEFAULT = "active"

CUSTOMER_BLOCKED_MESSAGE = "Klient jest zablokowany"


def normalize_customer_type(raw: object) -> str:
    val = str(raw or "").strip().lower()
    return val if val in CUSTOMER_TYPES else CUSTOMER_TYPE_DEFAULT


def normalize_customer_status(raw: object) -> str:
    val = str(raw or "").strip().lower()
    return val if val in CUSTOMER_STATUSES else CUSTOMER_STATUS_DEFAULT


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


def infer_customer_type(customer: Any) -> str:
    explicit = normalize_customer_type(getattr(customer, "customer_type", None))
    if getattr(customer, "customer_type", None):
        return explicit
    company = str(getattr(customer, "company_name", None) or "").strip()
    nip = str(getattr(customer, "nip", None) or "").strip()
    if company or nip:
        return "company"
    doc = str(getattr(customer, "default_document_type", None) or "").strip().upper()
    if doc == "INVOICE":
        return "company"
    return CUSTOMER_TYPE_DEFAULT


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
