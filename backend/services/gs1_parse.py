"""GS1-128 / DataMatrix element string parsing (architecture for WMS scanner)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

# Application identifiers we handle in WMS receiving
AI_GTIN = "01"
AI_BATCH = "10"
AI_EXPIRY_YYMMDD = "17"
AI_SERIAL = "21"


@dataclass
class Gs1ParseResult:
    raw: str
    gtin: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    serial_number: Optional[str] = None
    application_identifiers: dict[str, str] = field(default_factory=dict)
    is_gs1: bool = False


def _parse_expiry_yyMMdd(s: str) -> Optional[date]:
    t = (s or "").strip()
    if len(t) != 6 or not t.isdigit():
        return None
    yy = int(t[0:2])
    mm = int(t[2:4])
    dd = int(t[4:6])
    year = 2000 + yy if yy < 80 else 1900 + yy
    if mm < 1 or mm > 12:
        return None
    if dd < 1:
        dd = 1
    try:
        return date(year, mm, min(dd, 28 if mm == 2 else 31))
    except ValueError:
        return None


def _parse_parenthesized_gs1(raw: str) -> Gs1ParseResult:
    """(01)gtin(10)batch(17)yymmdd(21)serial"""
    out = Gs1ParseResult(raw=raw, is_gs1=True)
    for m in re.finditer(r"\((\d{2,4})\)([^\(]*)", raw):
        ai = m.group(1)
        val = (m.group(2) or "").strip()
        out.application_identifiers[ai] = val
        if ai == AI_GTIN and val:
            out.gtin = val.lstrip("0") or val
        elif ai == AI_BATCH:
            out.batch_number = val or None
        elif ai == AI_EXPIRY_YYMMDD:
            out.expiry_date = _parse_expiry_yyMMdd(val)
        elif ai == AI_SERIAL:
            out.serial_number = val or None
    return out


def _parse_fnc1_gs1(raw: str) -> Gs1ParseResult:
    """Element strings with FNC1 / GS separators (simplified)."""
    out = Gs1ParseResult(raw=raw, is_gs1=True)
    s = raw.replace("\x1d", "|").replace("\x1e", "|")
    pos = 0
    while pos < len(s):
        if s[pos] == "|":
            pos += 1
            continue
        if pos + 2 > len(s):
            break
        ai = s[pos : pos + 2]
        pos += 2
        if ai == AI_GTIN:
            out.gtin = s[pos : pos + 14].strip()
            out.application_identifiers[ai] = out.gtin or ""
            pos += 14
        elif ai == AI_EXPIRY_YYMMDD:
            chunk = s[pos : pos + 6]
            out.expiry_date = _parse_expiry_yyMMdd(chunk)
            out.application_identifiers[ai] = chunk
            pos += 6
        else:
            end = s.find("|", pos)
            if end < 0:
                val = s[pos:].strip()
                pos = len(s)
            else:
                val = s[pos:end].strip()
                pos = end
            out.application_identifiers[ai] = val
            if ai == AI_BATCH:
                out.batch_number = val or None
            elif ai == AI_SERIAL:
                out.serial_number = val or None
    return out


def parse_gs1_scan(raw: str) -> Gs1ParseResult:
    """Best-effort GS1 parse; returns empty result if not GS1-shaped."""
    key = (raw or "").strip()
    if not key:
        return Gs1ParseResult(raw=key)
    if "(" in key and ")" in key:
        return _parse_parenthesized_gs1(key)
    if key.startswith("01") and len(key) >= 16 and key[:2].isdigit():
        return _parse_fnc1_gs1(key)
    return Gs1ParseResult(raw=key)


def scan_looks_like_gs1(raw: str) -> bool:
    key = (raw or "").strip()
    if not key:
        return False
    if "(" in key and re.search(r"\(\d{2}\)", key):
        return True
    return key.startswith("01") and len(key) >= 16
