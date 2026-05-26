"""
Canonical supplier field values (country, currency).

Extension point — product↔supplier linkage
-----------------------------------------
Today, assortment uses ``Product.default_supplier_id`` only. When a many-to-many
``supplier_products`` (or similar) table exists, centralize “which products belong
to supplier S” in ``supplier_product_linkage.py`` and keep this module for
enumerated supplier attributes only.
"""

from __future__ import annotations

from typing import FrozenSet, List, Optional, Tuple

# (display label stored in DB, is EU member — for future VAT rules)
SUPPLIER_COUNTRY_CHOICES: Tuple[Tuple[str, bool], ...] = (
    ("Polska", True),
    ("Niemcy", True),
    ("Francja", True),
    ("Czechy", True),
    ("Anglia", False),
    ("Hiszpania", True),
    ("Chiny", False),
)

ALLOWED_SUPPLIER_COUNTRIES: FrozenSet[str] = frozenset(c for c, _ in SUPPLIER_COUNTRY_CHOICES)

_COUNTRY_EU: dict[str, bool] = {c: eu for c, eu in SUPPLIER_COUNTRY_CHOICES}

ALLOWED_SUPPLIER_CURRENCIES: FrozenSet[str] = frozenset({"EUR", "DOL", "CNY", "CZK", "PLN"})


def country_is_eu(country: Optional[str]) -> Optional[bool]:
    """None if country empty or unknown (legacy row not in catalog)."""
    if country is None:
        return None
    t = str(country).strip()
    if not t:
        return None
    return _COUNTRY_EU.get(t)


def validate_supplier_country(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    t = str(value).strip()
    if not t:
        return None
    if t not in ALLOWED_SUPPLIER_COUNTRIES:
        raise ValueError(
            f"Invalid country: must be one of {sorted(ALLOWED_SUPPLIER_COUNTRIES)}",
        )
    return t


def validate_supplier_currency(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    t = str(value).strip().upper()
    if not t:
        return None
    if t not in ALLOWED_SUPPLIER_CURRENCIES:
        raise ValueError(
            f"Invalid currency: must be one of {sorted(ALLOWED_SUPPLIER_CURRENCIES)}",
        )
    return t


def list_country_choices() -> List[dict]:
    """For optional meta API / docs."""
    return [{"value": c, "label": c, "is_eu": eu} for c, eu in SUPPLIER_COUNTRY_CHOICES]


def list_currency_choices() -> List[str]:
    return sorted(ALLOWED_SUPPLIER_CURRENCIES)
