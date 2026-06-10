"""GUS BIR1 SOAP client — timeout, retry, circuit breaker."""

from __future__ import annotations

import logging
import os
import time
import xml.etree.ElementTree as ET
from typing import Any
from xml.sax.saxutils import escape

import httpx

from .gus_circuit_breaker import GusCircuitBreaker, GusCircuitOpenError

_logger = logging.getLogger(__name__)

GUS_ACTION_NS = "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnętrzne"
GUS_SOAP_NS = "http://www.w3.org/2003/05/soap-envelope"
GUS_DATA_NS = "http://CIS/BIR/PUBL/2014/07"

DEFAULT_GUS_URL = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnętrzne.svc"
TEST_GUS_URL = "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnętrzne.svc"
TEST_GUS_KEY = "abcde12345abcde12345"

GUS_CONNECT_TIMEOUT = float(os.getenv("GUS_CONNECT_TIMEOUT_SEC", "5") or "5")
GUS_READ_TIMEOUT = float(os.getenv("GUS_READ_TIMEOUT_SEC", "12") or "12")
GUS_MAX_RETRIES = int(os.getenv("GUS_MAX_RETRIES", "2") or "2")


class GusBirError(Exception):
    def __init__(self, message: str, *, code: str = "gus_unavailable") -> None:
        super().__init__(message)
        self.code = code


class GusBirTimeoutError(GusBirError):
    def __init__(self, message: str = "Przekroczono czas oczekiwania na odpowiedź GUS.") -> None:
        super().__init__(message, code="gus_timeout")


def _gus_url() -> str:
    if os.getenv("GUS_USE_TEST", "").strip().lower() in ("1", "true", "yes"):
        return os.getenv("GUS_API_URL", TEST_GUS_URL).strip() or TEST_GUS_URL
    return os.getenv("GUS_API_URL", DEFAULT_GUS_URL).strip() or DEFAULT_GUS_URL


def _gus_api_key() -> str:
    key = os.getenv("GUS_API_KEY", "").strip()
    if key:
        return key
    if os.getenv("GUS_USE_TEST", "").strip().lower() in ("1", "true", "yes"):
        return TEST_GUS_KEY
    return ""


def _local_tag(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _xml_text_by_suffix(xml_text: str, suffix: str) -> str:
    if not xml_text or not str(xml_text).strip():
        return ""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return ""
    for el in root.iter():
        if _local_tag(el.tag) == suffix:
            return (el.text or "").strip()
    return ""


def _xml_rows(xml_text: str) -> list[dict[str, str]]:
    if not xml_text or not str(xml_text).strip():
        return []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    rows: list[dict[str, str]] = []
    for dane in root.iter():
        if _local_tag(dane.tag) != "dane":
            continue
        row: dict[str, str] = {}
        for child in list(dane):
            row[_local_tag(child.tag)] = (child.text or "").strip()
        if row:
            rows.append(row)
    return rows


def _envelope(action: str, body_inner: str) -> str:
    url = _gus_url()
    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="{GUS_SOAP_NS}" xmlns:ns="{GUS_DATA_NS}">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>{escape(url)}</wsa:To>
    <wsa:Action>{escape(action)}</wsa:Action>
  </soap:Header>
  <soap:Body>
    {body_inner}
  </soap:Body>
</soap:Envelope>"""


class GusBirClient:
    def __init__(self) -> None:
        self._url = _gus_url()
        self._api_key = _gus_api_key()
        self._timeout = httpx.Timeout(
            connect=GUS_CONNECT_TIMEOUT,
            read=GUS_READ_TIMEOUT,
            write=GUS_CONNECT_TIMEOUT,
            pool=GUS_CONNECT_TIMEOUT,
        )
        self._sid: str | None = None
        self._client = httpx.Client(timeout=self._timeout)

    def __enter__(self) -> GusBirClient:
        if not self._api_key:
            raise GusBirError("Integracja GUS nie jest skonfigurowana.", code="gus_unavailable")
        GusCircuitBreaker.assert_closed()
        self._sid = self._login()
        if not self._sid:
            GusCircuitBreaker.record_failure()
            raise GusBirError("Nie udało się połączyć z usługą GUS.", code="gus_unavailable")
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if exc_type is None:
            GusCircuitBreaker.record_success()
        elif exc_type not in (GusBirTimeoutError, GusCircuitOpenError):
            GusCircuitBreaker.record_failure()
        try:
            if self._sid:
                self._logout()
        except Exception:
            pass
        self._client.close()

    def _post(self, action: str, body_inner: str) -> str:
        headers = {"Content-Type": "application/soap+xml; charset=utf-8"}
        if self._sid:
            headers["sid"] = self._sid
        last_exc: Exception | None = None
        attempts = 1 + max(0, GUS_MAX_RETRIES)
        for attempt in range(attempts):
            try:
                resp = self._client.post(
                    self._url,
                    content=_envelope(action, body_inner).encode("utf-8"),
                    headers=headers,
                )
                if resp.status_code >= 400:
                    raise GusBirError("Usługa GUS zwróciła błąd.", code="gus_unavailable")
                return resp.text
            except httpx.TimeoutException as exc:
                last_exc = exc
                if attempt < attempts - 1:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                raise GusBirTimeoutError() from exc
            except httpx.NetworkError as exc:
                last_exc = exc
                if attempt < attempts - 1:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                raise GusBirError("Problem z połączeniem z usługą GUS.", code="gus_unavailable") from exc
        raise GusBirError("Problem z połączeniem z usługą GUS.", code="gus_unavailable") from last_exc

    def _login(self) -> str:
        body = f"""<ns:Zaloguj>
      <ns:pKluczUzytkownika>{escape(self._api_key)}</ns:pKluczUzytkownika>
    </ns:Zaloguj>"""
        xml = self._post(f"{GUS_ACTION_NS}/Zaloguj", body)
        return _xml_text_by_suffix(xml, "ZalogujResult")

    def _logout(self) -> None:
        body = "<ns:Wyloguj/>"
        self._post(f"{GUS_ACTION_NS}/Wyloguj", body)
        self._sid = None

    def search_by_nip(self, nip: str) -> dict[str, str]:
        params = f"<root><Nip>{nip}</Nip></root>"
        body = f"""<ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania><![CDATA[{params}]]></ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>"""
        xml = self._post(f"{GUS_ACTION_NS}/DaneSzukajPodmioty", body)
        result_xml = _xml_text_by_suffix(xml, "DaneSzukajPodmiotyResult")
        rows = _xml_rows(result_xml)
        if not rows:
            return {}
        return rows[0]

    def full_report(self, regon: str, report_name: str) -> dict[str, str]:
        regon_clean = escape(str(regon or "").strip())
        report_clean = escape(str(report_name or "").strip())
        body = f"""<ns:DanePobierzPelnyRaport>
      <ns:pRegon>{regon_clean}</ns:pRegon>
      <ns:pNazwaRaportu>{report_clean}</ns:pNazwaRaportu>
    </ns:DanePobierzPelnyRaport>"""
        xml = self._post(f"{GUS_ACTION_NS}/DanePobierzPelnyRaport", body)
        result_xml = _xml_text_by_suffix(xml, "DanePobierzPelnyRaportResult")
        rows = _xml_rows(result_xml)
        if not rows:
            return {}
        return rows[0]


def fetch_gus_company_by_nip(nip: str) -> dict[str, Any]:
    """Search GUS by NIP and pull full report + optional PKD."""
    with GusBirClient() as client:
        basic = client.search_by_nip(nip)
        if not basic:
            return {"found": False}

        regon = basic.get("Regon") or basic.get("regon") or ""
        if not regon:
            return {"found": False}

        typ = (basic.get("Typ") or basic.get("typ") or "P").strip().upper()
        if typ == "F":
            report_name = "BIR11OsFizycznaDaneOgolne"
            pkd_report = "BIR11OsFizycznaPkd"
            entity_kind = "fizyczna"
        else:
            report_name = "BIR11OsPrawna"
            pkd_report = "BIR11OsPrawnaPkd"
            entity_kind = "prawna"

        full = client.full_report(regon, report_name)
        pkd: dict[str, str] = {}
        try:
            pkd = client.full_report(regon, pkd_report)
        except Exception:
            _logger.debug("gus_pkd_skipped regon=%s", regon)

        return {
            "found": True,
            "basic": basic,
            "full": full,
            "pkd": pkd,
            "entity_kind": entity_kind,
        }
