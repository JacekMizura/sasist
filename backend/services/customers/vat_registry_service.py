"""Status VAT — wyłącznie rejestr MF + VIES (nie GUS)."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

import httpx

_logger = logging.getLogger(__name__)

_VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number"
_MF_TIMEOUT = httpx.Timeout(5.0, read=8.0)
_VIES_TIMEOUT = httpx.Timeout(5.0, read=10.0)


def resolve_vat_status(nip: str, *, tenant_id: int | None = None) -> dict[str, Any]:
    """
    Zwraca badge VAT niezależnie od GUS:
    vat_active, vat_ue, vat_status, vat_status_source, vat_ue_source
    """
    del tenant_id  # rezerwacja pod logi rozszerzone
    out: dict[str, Any] = {
        "vat_active": None,
        "vat_ue": None,
        "vat_status": None,
        "vat_status_source": None,
        "vat_ue_source": None,
    }
    _apply_mf_vat(nip, out)
    _apply_vies_ue(nip, out)
    return out


def _apply_mf_vat(nip: str, out: dict[str, Any]) -> None:
    today = date.today().isoformat()
    url = f"https://wl-api.mf.gov.pl/api/search/nip/{nip}?date={today}"
    try:
        with httpx.Client(timeout=_MF_TIMEOUT) as client:
            resp = client.get(url, headers={"Accept": "application/json"})
        if resp.status_code != 200:
            return
        subject = (resp.json().get("result") or {}).get("subject") or {}
    except Exception as exc:
        _logger.info("vat_mf_lookup_failed nip=%s err=%s", nip, type(exc).__name__)
        return

    if not subject:
        return

    status_vat = str(subject.get("statusVat") or "").strip()
    if status_vat:
        out["vat_status"] = status_vat
        out["vat_status_source"] = "rejestr_vat"
        out["vat_active"] = status_vat.lower() == "czynny"


def _apply_vies_ue(nip: str, out: dict[str, Any]) -> None:
    try:
        with httpx.Client(timeout=_VIES_TIMEOUT) as client:
            resp = client.post(
                _VIES_URL,
                json={"countryCode": "PL", "vatNumber": nip},
                headers={"Accept": "application/json"},
            )
        if resp.status_code != 200:
            return
        data = resp.json()
    except Exception as exc:
        _logger.info("vat_vies_lookup_failed nip=%s err=%s", nip, type(exc).__name__)
        return

    valid = data.get("valid")
    if valid is True:
        out["vat_ue"] = True
        out["vat_ue_source"] = "vies"
    elif valid is False:
        out["vat_ue"] = False
        out["vat_ue_source"] = "vies"
