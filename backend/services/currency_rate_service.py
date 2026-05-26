"""NBP table A FX + manual rows; resolve PLN rate for a currency on a calendar date."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.currency_exchange_rate import CurrencyExchangeRate

logger = logging.getLogger(__name__)

# EU-27 except PL (intra-EU B2B context for reverse charge when buyer is PL-based).
EU_COUNTRY_CODES = frozenset(
    {
        "AT",
        "BE",
        "BG",
        "HR",
        "CY",
        "CZ",
        "DK",
        "EE",
        "FI",
        "FR",
        "DE",
        "GR",
        "HU",
        "IE",
        "IT",
        "LV",
        "LT",
        "LU",
        "MT",
        "NL",
        "PT",
        "RO",
        "SK",
        "SI",
        "ES",
        "SE",
    }
)


def normalize_country_code(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    t = str(raw).strip().upper()
    if len(t) == 2 and t.isalpha():
        return t
    # Light aliases (UI / imports)
    aliases = {
        "POLSKA": "PL",
        "POLAND": "PL",
        "NIEMCY": "DE",
        "GERMANY": "DE",
        "FRANCE": "FR",
        "FRANCJA": "FR",
        "ITALY": "IT",
        "WŁOCHY": "IT",
        "SPAIN": "ES",
        "HISZPANIA": "ES",
    }
    return aliases.get(t)


def supplier_qualifies_intra_eu_eur(supplier_country: Optional[str], currency: str) -> bool:
    cc = normalize_country_code(supplier_country)
    cur = (currency or "").strip().upper()
    if cur != "EUR":
        return False
    if cc is None or cc == "PL":
        return False
    return cc in EU_COUNTRY_CODES


def default_tax_mode_for_supplier_currency(supplier_country: Optional[str], currency: str) -> str:
    if supplier_qualifies_intra_eu_eur(supplier_country, currency):
        return "intra_eu_reverse_charge"
    return "domestic_vat"


def _nbp_fetch_mid(currency: str, d: date) -> Optional[float]:
    code = (currency or "").strip().lower()
    if not code or code == "pln":
        return None
    url = f"https://api.nbp.pl/api/exchangerates/rates/a/{code}/{d.isoformat()}/?format=json"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "warehouse-app/1.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        rates = payload.get("rates") or []
        if not rates:
            return None
        mid = rates[0].get("mid")
        return float(mid) if mid is not None else None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError) as e:
        logger.info("NBP fetch failed for %s %s: %s", code, d, e)
        return None


def fetch_and_store_nbp_rate(db: Session, currency: str, d: date) -> Optional[CurrencyExchangeRate]:
    cur = (currency or "").strip().upper()
    if cur == "PLN":
        return None
    mid = _nbp_fetch_mid(cur, d)
    if mid is None or mid <= 0:
        return None
    existing = (
        db.query(CurrencyExchangeRate)
        .filter(
            CurrencyExchangeRate.tenant_id.is_(None),
            CurrencyExchangeRate.currency == cur,
            CurrencyExchangeRate.rate_date == d,
            CurrencyExchangeRate.source == "nbp",
        )
        .first()
    )
    if existing:
        existing.rate_to_pln = float(mid)
        existing.created_at = datetime.utcnow()
        db.flush()
        return existing
    row = CurrencyExchangeRate(
        tenant_id=None,
        currency=cur,
        rate_date=d,
        rate_to_pln=float(mid),
        source="nbp",
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def _manual_rate_for_date(db: Session, tenant_id: int, currency: str, d: date) -> Optional[CurrencyExchangeRate]:
    cur = (currency or "").strip().upper()
    row = (
        db.query(CurrencyExchangeRate)
        .filter(
            CurrencyExchangeRate.tenant_id == int(tenant_id),
            CurrencyExchangeRate.currency == cur,
            CurrencyExchangeRate.rate_date == d,
            CurrencyExchangeRate.source == "manual",
        )
        .first()
    )
    if row and float(row.rate_to_pln) > 0:
        return row
    return None


def _nbp_rate_for_date(db: Session, currency: str, d: date) -> Optional[CurrencyExchangeRate]:
    cur = (currency or "").strip().upper()
    return (
        db.query(CurrencyExchangeRate)
        .filter(
            CurrencyExchangeRate.tenant_id.is_(None),
            CurrencyExchangeRate.currency == cur,
            CurrencyExchangeRate.rate_date == d,
            CurrencyExchangeRate.source == "nbp",
        )
        .first()
    )


def resolve_rate_to_pln(
    db: Session,
    *,
    tenant_id: int,
    currency: str,
    on_date: date,
    allow_nbp_fetch: bool = False,
    max_lookback_days: int = 14,
) -> Tuple[Optional[float], Optional[date], str]:
    """Return (rate_to_pln, effective_date, source_used). PLN → (1.0, on_date, pln)."""
    cur = (currency or "").strip().upper()
    if cur == "PLN":
        return 1.0, on_date, "pln"

    d0 = on_date
    for i in range(max(1, int(max_lookback_days))):
        d = d0 - timedelta(days=i)
        m = _manual_rate_for_date(db, tenant_id, cur, d)
        if m:
            return float(m.rate_to_pln), d, "manual"
        n = _nbp_rate_for_date(db, cur, d)
        if n and float(n.rate_to_pln) > 0:
            return float(n.rate_to_pln), d, "nbp"
    if allow_nbp_fetch:
        for j in range(5):
            d = d0 - timedelta(days=j)
            fetched = fetch_and_store_nbp_rate(db, cur, d)
            if fetched and float(fetched.rate_to_pln) > 0:
                try:
                    db.commit()
                except Exception:
                    db.rollback()
                    raise
                return float(fetched.rate_to_pln), d, "nbp"
    return None, None, "none"


def upsert_manual_rate(
    db: Session,
    *,
    tenant_id: int,
    currency: str,
    rate_date: date,
    rate_to_pln: float,
) -> CurrencyExchangeRate:
    cur = (currency or "").strip().upper()
    if cur == "PLN":
        raise ValueError("Use PLN only as domestic currency")
    if rate_to_pln <= 0:
        raise ValueError("rate_to_pln must be positive")
    row = (
        db.query(CurrencyExchangeRate)
        .filter(
            CurrencyExchangeRate.tenant_id == int(tenant_id),
            CurrencyExchangeRate.currency == cur,
            CurrencyExchangeRate.rate_date == rate_date,
            CurrencyExchangeRate.source == "manual",
        )
        .first()
    )
    if row:
        row.rate_to_pln = float(rate_to_pln)
        row.created_at = datetime.utcnow()
    else:
        row = CurrencyExchangeRate(
            tenant_id=int(tenant_id),
            currency=cur,
            rate_date=rate_date,
            rate_to_pln=float(rate_to_pln),
            source="manual",
            created_at=datetime.utcnow(),
        )
        db.add(row)
    db.flush()
    return row


def list_rates(
    db: Session,
    *,
    tenant_id: int,
    currency: Optional[str],
    limit: int = 60,
) -> list[Dict[str, Any]]:
    q = db.query(CurrencyExchangeRate).filter(
        (CurrencyExchangeRate.tenant_id == int(tenant_id)) | (CurrencyExchangeRate.tenant_id.is_(None))
    )
    if currency:
        q = q.filter(CurrencyExchangeRate.currency == (currency or "").strip().upper())
    rows = q.order_by(CurrencyExchangeRate.rate_date.desc(), CurrencyExchangeRate.id.desc()).limit(limit).all()
    out: list[Dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "id": int(r.id),
                "tenant_id": int(r.tenant_id) if r.tenant_id is not None else None,
                "currency": r.currency,
                "rate_date": r.rate_date.isoformat() if r.rate_date else None,
                "rate_to_pln": float(r.rate_to_pln),
                "source": r.source,
            }
        )
    return out
