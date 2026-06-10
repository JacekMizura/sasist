"""GUS BIR1 SOAP client (Regon API) — server-side only."""

from __future__ import annotations

import logging
import os
import xml.etree.ElementTree as ET
from typing import Any
from xml.sax.saxutils import escape

import httpx

_logger = logging.getLogger(__name__)

GUS_ACTION_NS = "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnętrzne"
GUS_SOAP_NS = "http://www.w3.org/2003/05/soap-envelope"
GUS_DATA_NS = "http://CIS/BIR/PUBL/2014/07"

DEFAULT_GUS_URL = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnętrzne.svc"
TEST_GUS_URL = "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnętrzne.svc"
TEST_GUS_KEY = "abcde12345abcde12345"


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
    def __init__(self, *, timeout: float = 10.0) -> None:
        self._url = _gus_url()
        self._api_key = _gus_api_key()
        self._timeout = timeout
        self._sid: str | None = None
        self._client = httpx.Client(timeout=timeout)

    def __enter__(self) -> GusBirClient:
        if not self._api_key:
            raise GusBirError("Integracja GUS nie jest skonfigurowana (brak klucza API).")
        self._sid = self._login()
        if not self._sid:
            raise GusBirError("Nie udało się zalogować do API GUS.")
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
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
        resp = self._client.post(
            self._url,
            content=_envelope(action, body_inner).encode("utf-8"),
            headers=headers,
        )
        if resp.status_code >= 400:
            raise GusBirError(f"API GUS niedostępne (HTTP {resp.status_code}).")
        return resp.text

    def _login(self) -> str:
        body = f"""<ns:Zaloguj>
      <ns:pKluczUzytkownika>{escape(self._api_key)}</ns:pKluczUzytkownika>
    </ns:Zaloguj>"""
        xml = self._post(f"{GUS_ACTION_NS}/Zaloguj", body)
        sid = _xml_text_by_suffix(xml, "ZalogujResult")
        return sid

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


class GusBirError(Exception):
    pass


def fetch_gus_company_by_nip(nip: str, *, timeout: float = 10.0) -> dict[str, Any]:
    """Search GUS by NIP and pull full report + optional PKD."""
    with GusBirClient(timeout=timeout) as client:
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
        pkd_rows: list[dict[str, str]] = []
        try:
            pkd_xml_key = client.full_report(regon, pkd_report)
            if pkd_xml_key:
                pkd_rows = [pkd_xml_key]
        except Exception:
            _logger.debug("gus pkd fetch skipped regon=%s", regon)

        return {
            "found": True,
            "basic": basic,
            "full": full,
            "pkd": pkd_rows[0] if pkd_rows else {},
            "entity_kind": entity_kind,
        }
