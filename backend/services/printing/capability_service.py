"""Agent capability helpers (supported print formats)."""

from __future__ import annotations

import json
from typing import Any

from ...models.printing.printer_agent import PrinterAgent

KNOWN_FORMATS = frozenset({"pdf", "zpl", "raw", "html"})
DEFAULT_LEGACY_FORMATS = frozenset({"pdf"})


def normalize_formats(values: list[str] | None) -> list[str]:
    if not values:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        token = (raw or "").strip().lower()
        if token == "raw_zpl":
            token = "zpl"
        if token not in KNOWN_FORMATS or token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


def formats_to_json(formats: list[str]) -> str:
    return json.dumps({"supported_formats": normalize_formats(formats)}, ensure_ascii=False)


def parse_agent_formats(agent: PrinterAgent | None) -> set[str]:
    if agent is None:
        return set(DEFAULT_LEGACY_FORMATS)
    raw = getattr(agent, "capabilities_json", None)
    if not raw:
        # Legacy Python agents only reported PDF.
        return set(DEFAULT_LEGACY_FORMATS)
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return set(DEFAULT_LEGACY_FORMATS)
    if isinstance(parsed, dict):
        formats = parsed.get("supported_formats") or parsed.get("formats") or []
        if isinstance(formats, list):
            normalized = normalize_formats([str(x) for x in formats])
            return set(normalized) if normalized else set(DEFAULT_LEGACY_FORMATS)
    if isinstance(parsed, list):
        normalized = normalize_formats([str(x) for x in parsed])
        return set(normalized) if normalized else set(DEFAULT_LEGACY_FORMATS)
    return set(DEFAULT_LEGACY_FORMATS)


def resolve_job_format(*, job_type: str | None, payload: dict[str, Any] | None) -> str:
    payload = payload or {}
    explicit = str(payload.get("format") or "").strip().lower()
    if explicit == "raw_zpl":
        return "zpl"
    if explicit in KNOWN_FORMATS:
        return explicit
    if payload.get("zpl"):
        return "zpl"
    if payload.get("raw") and not payload.get("pdf_url"):
        return "raw"
    if payload.get("html"):
        return "html"
    jt = (job_type or "").strip().lower()
    if jt == "raw_zpl":
        return "zpl"
    if jt == "receipt" and payload.get("raw"):
        return "raw"
    return "pdf"


def agent_supports_format(agent: PrinterAgent | None, format_token: str) -> bool:
    token = (format_token or "pdf").strip().lower()
    if token == "raw_zpl":
        token = "zpl"
    return token in parse_agent_formats(agent)
