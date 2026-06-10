"""GUS lookup orchestration — BIR + MF VAT enrichment + 24h cache."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from ..nip_lookup_service import lookup_polish_nip, normalize_polish_nip, validate_polish_nip_checksum
from .gus_bir_client import GusBirError, fetch_gus_company_by_nip

_logger = logging.getLogger(__name__)

CACHE_TTL_HOURS = 24


def _parse_gus_date(raw: str | None) -> str | None:
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    if len(s) == 8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return s


def _business_status_pl(basic: dict[str, str], full: dict[str, str]) -> str:
    end = _parse_gus_date(full.get("DataZakonczeniaDzialalnosci") or basic.get("DataZakonczeniaDzialalnosci"))
    if end:
        return "Zakończona"
    suspend = _parse_gus_date(full.get("DataZawieszeniaDzialalnosci") or basic.get("DataZawieszeniaDzialalnosci"))
    resume = _parse_gus_date(full.get("DataWznowieniaDzialalnosci") or basic.get("DataWznowieniaDzialalnosci"))
    if suspend and not resume:
        return "Zawieszona"
    return "Aktywna"


def _entity_type_pl(entity_kind: str, full: dict[str, str]) -> str:
    forma = (full.get("FormaPrawna") or full.get("PodstawowaFormaPrawna") or "").strip()
    if forma:
        return forma
    if entity_kind == "fizyczna":
        return "Osoba fizyczna prowadząca działalność gospodarczą"
    return "Osoba prawna"


def _pkd_label(pkd_row: dict[str, str]) -> str | None:
    if not pkd_row:
        return None
    code = (pkd_row.get("PkdKod") or pkd_row.get("KodPkd") or "").strip()
    name = (pkd_row.get("PkdNazwa") or pkd_row.get("NazwaPkd") or "").strip()
    if code and name:
        return f"{code} — {name}"
    return code or name or None


def _address_parts(basic: dict[str, str], full: dict[str, str]) -> dict[str, str | None]:
    src = {**basic, **full}
    street = (src.get("Ulica") or "").strip()
    house = (src.get("NrNieruchomosci") or "").strip()
    apt = (src.get("NrLokalu") or "").strip()
    postal = (src.get("KodPocztowy") or "").strip()
    city = (src.get("Miejscowosc") or "").strip()
    voivodeship = (src.get("Wojewodztwo") or "").strip()
    if not street and not city:
        return {
            "street": None,
            "house_number": None,
            "apartment_number": None,
            "postal_code": postal or None,
            "city": city or None,
            "voivodeship": voivodeship or None,
        }
    return {
        "street": street or None,
        "house_number": house or None,
        "apartment_number": apt or None,
        "postal_code": postal or None,
        "city": city or None,
        "voivodeship": voivodeship or None,
    }


def _enrich_vat_from_mf(nip: str, payload: dict[str, Any]) -> None:
    """MF whitelist — status VAT (Czynny / UE)."""
    from datetime import date

    import httpx

    today = date.today().isoformat()
    url = f"https://wl-api.mf.gov.pl/api/search/nip/{nip}?date={today}"
    try:
        with httpx.Client(timeout=6.0) as client:
            resp = client.get(url, headers={"Accept": "application/json"})
        if resp.status_code != 200:
            return
        data = resp.json()
    except Exception as exc:
        _logger.debug("mf vat enrich failed nip=%s err=%s", nip, exc)
        return

    subject = (data.get("result") or {}).get("subject") or {}
    if not subject:
        return

    status_vat = str(subject.get("statusVat") or "").strip()
    if status_vat:
        payload["vat_status"] = status_vat
        payload["vat_active"] = status_vat.lower() == "czynny"

    # UE: podmiot zarejestrowany jako podatnik VAT UE (MF: accountNumbers / hasVirtualAccounts)
    account_numbers = subject.get("accountNumbers") or []
    if isinstance(account_numbers, list) and len(account_numbers) > 0:
        payload["vat_ue"] = True
    elif "unijny" in status_vat.lower() or "ue" in status_vat.lower():
        payload["vat_ue"] = True
    else:
        payload["vat_ue"] = bool(payload.get("vat_ue"))

    if not payload.get("regon") and subject.get("regon"):
        payload["regon"] = str(subject.get("regon")).strip()


def _normalize_gus_payload(raw: dict[str, Any], nip: str) -> dict[str, Any]:
    basic = raw.get("basic") or {}
    full = raw.get("full") or {}
    pkd = raw.get("pkd") or {}
    entity_kind = str(raw.get("entity_kind") or "prawna")

    name = (full.get("Nazwa") or basic.get("Nazwa") or "").strip()
    regon = (full.get("Regon") or basic.get("Regon") or "").strip()
    addr = _address_parts(basic, full)

    payload: dict[str, Any] = {
        "ok": True,
        "found": True,
        "gus_verified": True,
        "nip": nip,
        "company_name": name or None,
        "regon": regon or None,
        "street": addr["street"],
        "house_number": addr["house_number"],
        "apartment_number": addr["apartment_number"],
        "postal_code": addr["postal_code"],
        "city": addr["city"],
        "voivodeship": addr["voivodeship"],
        "business_status": _business_status_pl(basic, full),
        "activity_start_date": _parse_gus_date(
            full.get("DataRozpoczeciaDzialalnosci")
            or full.get("DataPowstania")
            or basic.get("DataRozpoczeciaDzialalnosci")
        ),
        "entity_type": _entity_type_pl(entity_kind, full),
        "pkd": _pkd_label(pkd),
        "vat_active": None,
        "vat_ue": None,
        "vat_status": None,
        "source": "gus_bir",
    }
    _enrich_vat_from_mf(nip, payload)
    return payload


def _normalize_mf_fallback(nip: str) -> dict[str, Any]:
    mf = lookup_polish_nip(nip)
    if not mf.get("ok"):
        return {"ok": False, "found": False, "error": mf.get("error") or "Nie znaleziono podmiotu."}

    payload: dict[str, Any] = {
        "ok": True,
        "found": True,
        "gus_verified": False,
        "nip": nip,
        "company_name": mf.get("company_name"),
        "regon": None,
        "street": mf.get("street"),
        "house_number": None,
        "apartment_number": None,
        "postal_code": mf.get("postal_code"),
        "city": mf.get("city"),
        "voivodeship": None,
        "business_status": None,
        "activity_start_date": None,
        "entity_type": None,
        "pkd": None,
        "vat_active": None,
        "vat_ue": None,
        "vat_status": None,
        "source": "rejestr_vat",
        "warning": "Dane z rejestru VAT (GUS niedostępny).",
    }
    _enrich_vat_from_mf(nip, payload)
    return payload


def _cache_get(db: Session, nip: str) -> dict[str, Any] | None:
    from ...models.gus_nip_cache import GusNipCache

    row = db.query(GusNipCache).filter(GusNipCache.nip == nip).first()
    if row is None or not row.payload_json:
        return None
    if row.fetched_at and datetime.utcnow() - row.fetched_at > timedelta(hours=CACHE_TTL_HOURS):
        return None
    try:
        parsed = json.loads(row.payload_json)
        if isinstance(parsed, dict):
            parsed["from_cache"] = True
            return parsed
    except (json.JSONDecodeError, TypeError):
        return None
    return None


def _cache_put(db: Session, nip: str, payload: dict[str, Any]) -> None:
    from ...models.gus_nip_cache import GusNipCache

    clean = {k: v for k, v in payload.items() if k != "from_cache"}
    row = db.query(GusNipCache).filter(GusNipCache.nip == nip).first()
    if row is None:
        row = GusNipCache(nip=nip)
        db.add(row)
    row.payload_json = json.dumps(clean, ensure_ascii=False)
    row.fetched_at = datetime.utcnow()
    db.commit()


def lookup_gus_by_nip(db: Session, nip_raw: str, *, force_refresh: bool = False) -> dict[str, Any]:
    nip = normalize_polish_nip(nip_raw)
    if nip is None:
        return {"ok": False, "found": False, "error": "Nieprawidłowy format NIP (10 cyfr)."}
    if not validate_polish_nip_checksum(nip):
        return {"ok": False, "found": False, "error": "Nieprawidłowa suma kontrolna NIP."}

    if not force_refresh:
        cached = _cache_get(db, nip)
        if cached is not None:
            return cached

    try:
        raw = fetch_gus_company_by_nip(nip, timeout=10.0)
        if not raw.get("found"):
            result = {"ok": False, "found": False, "error": "Nie znaleziono firmy w GUS dla podanego NIP."}
            return result
        payload = _normalize_gus_payload(raw, nip)
    except GusBirError as exc:
        _logger.warning("gus lookup failed nip=%s err=%s — mf fallback", nip, exc)
        payload = _normalize_mf_fallback(nip)
        if not payload.get("ok"):
            return payload
    except Exception as exc:
        _logger.warning("gus lookup unexpected nip=%s err=%s", nip, exc)
        payload = _normalize_mf_fallback(nip)
        if not payload.get("ok"):
            return {"ok": False, "found": False, "error": "Usługa GUS chwilowo niedostępna. Spróbuj ponownie później."}

    payload["from_cache"] = False
    try:
        _cache_put(db, nip, payload)
    except Exception as exc:
        _logger.warning("gus cache write failed nip=%s err=%s", nip, exc)
        db.rollback()

    return payload
