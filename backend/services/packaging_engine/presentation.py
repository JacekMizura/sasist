"""Operator-facing packaging fit labels (presentation only)."""

from __future__ import annotations

from typing import Optional


def map_reject_reason_to_operator(reason: Optional[str]) -> str:
    r = str(reason or "").strip()
    u = r.upper()
    if "WEIGHT" in u:
        return "Przekroczona dopuszczalna waga opakowania."
    if "DIMENSION" in u or "TOO_LONG" in u or "EXCEEDS" in u:
        return "Produkt jest za duży względem wymiarów użytkowych opakowania."
    if "PLACEMENT" in u or "GEOMETRIC" in u or "PACKING_FAILED" in u:
        return "Brak geometrycznego ułożenia produktów w opakowaniu."
    if "ORIENTATION" in u:
        return "Orientacja produktu nie pozwala na ułożenie w tym opakowaniu."
    if "STACK" in u:
        return "Ograniczenia układania w stos uniemożliwiają dopasowanie."
    if "MISSING" in u and "DIMENSION" in u:
        return "Brak kompletnych wymiarów produktu — dopasowanie szacunkowe."
    if "USABLE_DIMENSIONS" in u:
        return "Brak wymiarów użytkowych opakowania — dopasowanie szacunkowe."
    if r.startswith("Odrzucony:"):
        return map_reject_reason_to_operator(r.split(":", 1)[-1].strip())
    return r or "Opakowanie nie pasuje fizycznie."


def confidence_label(conf: Optional[str]) -> str:
    c = str(conf or "").strip().upper()
    if c == "EXACT":
        return "DOKŁADNE"
    if c == "ESTIMATED":
        return "SZACUNKOWE"
    return "NIEZNANE"
