"""Normalizacja adresów z GUS — wielkie litery, spacje, title case."""

from __future__ import annotations

import re
from typing import Any

_ABBR_UPPER = frozenset({"UL.", "AL.", "OS.", "NR", "LOK.", "M.", "UL", "AL", "OS"})


def collapse_spaces(raw: str | None) -> str:
    return re.sub(r"\s+", " ", str(raw or "").strip())


def title_case_pl(raw: str | None) -> str | None:
    s = collapse_spaces(raw)
    if not s:
        return None
    parts: list[str] = []
    for token in s.split(" "):
        up = token.upper()
        if up in _ABBR_UPPER or (len(token) <= 2 and token.isalpha()):
            parts.append(up.rstrip(".") + ("." if up.endswith(".") or up in {"UL", "AL", "OS"} else ""))
        else:
            parts.append(token[:1].upper() + token[1:].lower() if len(token) > 1 else token.upper())
    return " ".join(parts)


def normalize_postal_code(raw: str | None) -> str | None:
    s = collapse_spaces(raw)
    if not s:
        return None
    digits = re.sub(r"\D", "", s)
    if len(digits) == 5:
        return f"{digits[0:2]}-{digits[2:5]}"
    return s


def split_street_and_number(street: str | None, house: str | None) -> tuple[str | None, str | None]:
    st = collapse_spaces(street)
    hn = collapse_spaces(house)
    if hn or not st:
        return st or None, hn or None
    m = re.match(r"^(.*?)[,\s]+(\d+[A-Za-z]?(/\d+[A-Za-z]?)?)$", st)
    if m:
        return collapse_spaces(m.group(1)) or None, m.group(2)
    return st, None


def normalize_address_payload(payload: dict[str, Any]) -> None:
    """Mutuje payload — pola adresowe po pobraniu z GUS."""
    street, house = split_street_and_number(payload.get("street"), payload.get("house_number"))
    payload["street"] = title_case_pl(street)
    payload["house_number"] = collapse_spaces(house) or None
    apt = collapse_spaces(payload.get("apartment_number"))
    payload["apartment_number"] = apt or None
    payload["postal_code"] = normalize_postal_code(payload.get("postal_code"))
    payload["city"] = title_case_pl(payload.get("city"))
    payload["voivodeship"] = title_case_pl(payload.get("voivodeship"))
    payload["company_name"] = title_case_pl(payload.get("company_name"))
