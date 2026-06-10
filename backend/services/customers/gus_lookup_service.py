"""GUS lookup — orchestracja BIR, cache DB, VAT MF/VIES, logi strukturalne."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..nip_lookup_service import lookup_polish_nip, normalize_polish_nip, validate_polish_nip_checksum
from .gus_address_normalize import normalize_address_payload
from .gus_bir_client import GusBirError, GusBirTimeoutError, fetch_gus_company_by_nip
from .gus_circuit_breaker import GusCircuitOpenError
from .vat_registry_service import resolve_vat_status

_logger = logging.getLogger(__name__)

CACHE_TTL_HOURS = 24

SOURCE_LABELS = {
    "gus_bir": "GUS BIR",
    "rejestr_vat": "Rejestr VAT",
    "cache": "Pamięć podręczna",
}


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
    return {
        "street": (src.get("Ulica") or "").strip() or None,
        "house_number": (src.get("NrNieruchomosci") or "").strip() or None,
        "apartment_number": (src.get("NrLokalu") or "").strip() or None,
        "postal_code": (src.get("KodPocztowy") or "").strip() or None,
        "city": (src.get("Miejscowosc") or "").strip() or None,
        "voivodeship": (src.get("Wojewodztwo") or "").strip() or None,
    }


def _iso_utc(dt: datetime | None = None) -> str:
    ref = dt or datetime.utcnow()
    return ref.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _format_fetched_label(source_key: str, fetched_at: str | None) -> str | None:
    if not fetched_at:
        return None
    try:
        dt = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        local = dt.astimezone() if dt.tzinfo else dt
        stamp = local.strftime("%d.%m.%Y %H:%M")
    except ValueError:
        stamp = fetched_at
    label = SOURCE_LABELS.get(source_key, source_key)
    return f"Dane pobrano z {label}: {stamp}"


def _log_event(
    *,
    nip: str,
    tenant_id: int | None,
    event: str,
    duration_ms: int,
    cache_hit: bool,
    source: str,
    ok: bool,
) -> None:
    _logger.info(
        "gus_lookup %s nip=%s tenant_id=%s cache_hit=%s source=%s duration_ms=%s ok=%s",
        event,
        nip,
        tenant_id,
        cache_hit,
        source,
        duration_ms,
        ok,
    )


def _attach_vat(payload: dict[str, Any], nip: str, *, tenant_id: int | None) -> None:
    vat = resolve_vat_status(nip, tenant_id=tenant_id)
    payload["vat_active"] = vat.get("vat_active")
    payload["vat_ue"] = vat.get("vat_ue")
    payload["vat_status"] = vat.get("vat_status")
    payload["vat_status_source"] = vat.get("vat_status_source")
    payload["vat_ue_source"] = vat.get("vat_ue_source")


def _normalize_gus_payload(raw: dict[str, Any], nip: str) -> dict[str, Any]:
    basic = raw.get("basic") or {}
    full = raw.get("full") or {}
    pkd = raw.get("pkd") or {}
    entity_kind = str(raw.get("entity_kind") or "prawna")
    addr = _address_parts(basic, full)
    now = _iso_utc()

    payload: dict[str, Any] = {
        "ok": True,
        "found": True,
        "gus_verified": True,
        "nip": nip,
        "company_name": (full.get("Nazwa") or basic.get("Nazwa") or "").strip() or None,
        "regon": (full.get("Regon") or basic.get("Regon") or "").strip() or None,
        **addr,
        "business_status": _business_status_pl(basic, full),
        "activity_start_date": _parse_gus_date(
            full.get("DataRozpoczeciaDzialalnosci")
            or full.get("DataPowstania")
            or basic.get("DataRozpoczeciaDzialalnosci")
        ),
        "entity_type": _entity_type_pl(entity_kind, full),
        "pkd": _pkd_label(pkd),
        "source": "gus_bir",
        "source_label": SOURCE_LABELS["gus_bir"],
        "fetched_at": now,
        "fetched_label": _format_fetched_label("gus_bir", now),
        "from_cache": False,
        "vat_active": None,
        "vat_ue": None,
        "vat_status": None,
        "vat_status_source": None,
        "vat_ue_source": None,
        "warning": None,
        "error": None,
        "error_code": None,
    }
    normalize_address_payload(payload)
    return payload


def _normalize_mf_company_fallback(nip: str) -> dict[str, Any]:
    mf = lookup_polish_nip(nip)
    if not mf.get("ok"):
        return {
            "ok": False,
            "found": False,
            "error": mf.get("error") or "Nie znaleziono podmiotu.",
            "error_code": "not_found",
        }

    now = _iso_utc()
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
        "source": "rejestr_vat",
        "source_label": SOURCE_LABELS["rejestr_vat"],
        "fetched_at": now,
        "fetched_label": _format_fetched_label("rejestr_vat", now),
        "from_cache": False,
        "warning": "Dane firmy z rejestru VAT (GUS niedostępny). Status VAT z MF/VIES.",
        "error": None,
        "error_code": None,
        "vat_active": None,
        "vat_ue": None,
        "vat_status": None,
        "vat_status_source": None,
        "vat_ue_source": None,
    }
    normalize_address_payload(payload)
    return payload


def _error_payload(message: str, *, code: str, found: bool = False) -> dict[str, Any]:
    return {"ok": False, "found": found, "error": message, "error_code": code}


def _cache_get(db: Session, nip: str) -> dict[str, Any] | None:
    from ...models.gus_lookup_cache import GusLookupCache

    row = db.query(GusLookupCache).filter(GusLookupCache.nip == nip).first()
    if row is None or not row.payload_json:
        return None
    if row.fetched_at and datetime.utcnow() - row.fetched_at > timedelta(hours=CACHE_TTL_HOURS):
        return None
    try:
        parsed = json.loads(row.payload_json)
        if isinstance(parsed, dict):
            parsed["from_cache"] = True
            if row.fetched_at:
                iso = _iso_utc(row.fetched_at)
                parsed["fetched_at"] = iso
                src = str(parsed.get("source") or "gus_bir")
                base = _format_fetched_label(src if src in SOURCE_LABELS else "gus_bir", iso)
                parsed["fetched_label"] = f"{base} · pamięć podręczna"
            return parsed
    except (json.JSONDecodeError, TypeError):
        return None
    return None


def _cache_put(db: Session, nip: str, payload: dict[str, Any]) -> None:
    from ...models.gus_lookup_cache import GusLookupCache

    clean = {k: v for k, v in payload.items() if k != "from_cache"}
    row = db.query(GusLookupCache).filter(GusLookupCache.nip == nip).first()
    if row is None:
        row = GusLookupCache(nip=nip)
        db.add(row)
    row.payload_json = json.dumps(clean, ensure_ascii=False)
    row.fetched_at = datetime.utcnow()
    db.commit()


def lookup_gus_by_nip(
    db: Session,
    nip_raw: str,
    *,
    force_refresh: bool = False,
    tenant_id: int | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    nip = normalize_polish_nip(nip_raw)
    if nip is None:
        return _error_payload("Nieprawidłowy format NIP (10 cyfr).", code="invalid_nip_format")
    if not validate_polish_nip_checksum(nip):
        return _error_payload("Nieprawidłowa suma kontrolna NIP.", code="invalid_nip_checksum")

    if not force_refresh:
        cached = _cache_get(db, nip)
        if cached is not None:
            _attach_vat(cached, nip, tenant_id=tenant_id)
            ms = int((time.perf_counter() - started) * 1000)
            _log_event(
                nip=nip,
                tenant_id=tenant_id,
                event="cache_hit",
                duration_ms=ms,
                cache_hit=True,
                source="cache",
                ok=bool(cached.get("ok")),
            )
            return cached

    payload: dict[str, Any]
    try:
        raw = fetch_gus_company_by_nip(nip)
        if not raw.get("found"):
            ms = int((time.perf_counter() - started) * 1000)
            _log_event(
                nip=nip,
                tenant_id=tenant_id,
                event="not_found",
                duration_ms=ms,
                cache_hit=False,
                source="gus_bir",
                ok=False,
            )
            err = _error_payload("Nie znaleziono firmy dla podanego NIP.", code="not_found")
            _attach_vat(err, nip, tenant_id=tenant_id)
            return err
        payload = _normalize_gus_payload(raw, nip)
    except GusBirTimeoutError:
        _logger.warning("gus_timeout nip=%s tenant_id=%s", nip, tenant_id)
        payload = _normalize_mf_company_fallback(nip)
        if not payload.get("ok"):
            err = _error_payload("Przekroczono czas oczekiwania na odpowiedź GUS.", code="gus_timeout")
            _attach_vat(err, nip, tenant_id=tenant_id)
            return err
        payload["warning"] = "Przekroczono czas GUS — dane firmy z rejestru VAT."
        payload["error_code"] = "gus_timeout"
    except GusCircuitOpenError as exc:
        payload = _normalize_mf_company_fallback(nip)
        if not payload.get("ok"):
            err = _error_payload(str(exc), code="gus_circuit_open")
            _attach_vat(err, nip, tenant_id=tenant_id)
            return err
        payload["warning"] = str(exc)
        payload["error_code"] = "gus_circuit_open"
    except GusBirError as exc:
        _logger.warning("gus_error nip=%s tenant_id=%s code=%s", nip, tenant_id, exc.code)
        payload = _normalize_mf_company_fallback(nip)
        if not payload.get("ok"):
            err = _error_payload("Usługa GUS chwilowo niedostępna.", code=exc.code)
            _attach_vat(err, nip, tenant_id=tenant_id)
            return err
        payload["warning"] = "Usługa GUS chwilowo niedostępna — dane firmy z rejestru VAT."
        payload["error_code"] = exc.code
    except Exception:
        _logger.exception("gus_unexpected nip=%s tenant_id=%s", nip, tenant_id)
        payload = _normalize_mf_company_fallback(nip)
        if not payload.get("ok"):
            err = _error_payload("Usługa GUS chwilowo niedostępna.", code="gus_unavailable")
            _attach_vat(err, nip, tenant_id=tenant_id)
            return err
        payload["warning"] = "Usługa GUS chwilowo niedostępna — dane firmy z rejestru VAT."
        payload["error_code"] = "gus_unavailable"

    _attach_vat(payload, nip, tenant_id=tenant_id)

    ms = int((time.perf_counter() - started) * 1000)
    _log_event(
        nip=nip,
        tenant_id=tenant_id,
        event="gus_fetch",
        duration_ms=ms,
        cache_hit=False,
        source=str(payload.get("source") or "gus_bir"),
        ok=bool(payload.get("ok")),
    )

    if payload.get("ok") and payload.get("found"):
        try:
            _cache_put(db, nip, payload)
        except Exception as exc:
            _logger.warning("gus_cache_write_failed nip=%s err=%s", nip, type(exc).__name__)
            db.rollback()

    return payload
