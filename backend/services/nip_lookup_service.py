"""Polish NIP company lookup — MF whitelist API with VIES fallback for EU."""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

import httpx

_logger = logging.getLogger(__name__)

_NIP_RE = re.compile(r"^\d{10}$")


def normalize_polish_nip(raw: str) -> str | None:
    digits = re.sub(r"\D", "", str(raw or ""))
    if len(digits) != 10:
        return None
    return digits


def validate_polish_nip_checksum(nip: str) -> bool:
    d = normalize_polish_nip(nip)
    if d is None:
        return False
    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    s = sum(int(d[i]) * weights[i] for i in range(9))
    check = s % 11
    if check == 10:
        return False
    return check == int(d[9])


def lookup_polish_nip(nip: str) -> dict[str, Any]:
    """
    Fetch company data for Polish NIP.
    Returns: { ok, nip, company_name, street, postal_code, city, source, error? }
    """
    normalized = normalize_polish_nip(nip)
    if normalized is None:
        return {"ok": False, "error": "Nieprawidłowy format NIP (10 cyfr)."}
    if not validate_polish_nip_checksum(normalized):
        return {"ok": False, "error": "Nieprawidłowa suma kontrolna NIP."}

    today = date.today().isoformat()
    url = f"https://wl-api.mf.gov.pl/api/search/nip/{normalized}?date={today}"
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(url, headers={"Accept": "application/json"})
        if resp.status_code != 200:
            return {"ok": False, "error": f"Rejestr MF niedostępny (HTTP {resp.status_code})."}
        data = resp.json()
    except Exception as exc:
        _logger.warning("nip_lookup mf failed nip=%s err=%s", normalized, exc)
        return {"ok": False, "error": "Nie udało się pobrać danych z rejestru MF."}

    result = (data.get("result") or {}).get("subject") or {}
    if not result:
        return {"ok": False, "error": "Nie znaleziono podmiotu dla podanego NIP."}

    name = str(result.get("name") or "").strip()
    residence = result.get("residenceAddress") or result.get("workingAddress") or ""
    street, postal, city = _parse_polish_address(str(residence or ""))

    return {
        "ok": True,
        "nip": normalized,
        "company_name": name or None,
        "street": street or None,
        "postal_code": postal or None,
        "city": city or None,
        "source": "mf_whitelist",
    }


def _parse_polish_address(raw: str) -> tuple[str | None, str | None, str | None]:
    s = " ".join(str(raw or "").split()).strip()
    if not s:
        return None, None, None
    m = re.match(r"^(.*?)(\d{2}-\d{3})\s+(.+)$", s)
    if m:
        return m.group(1).strip(" ,") or None, m.group(2), m.group(3).strip() or None
    return s, None, None
