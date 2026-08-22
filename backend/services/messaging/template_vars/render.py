"""Unified template renderer — subject + body HTML/text with safe escaping."""

from __future__ import annotations

import html
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from .registry import VARIABLE_BY_KEY

logger = logging.getLogger(__name__)

# Sellasist-style {key} and legacy {{key}} — both supported.
_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{([a-zA-Z0-9_]+)\}")


@dataclass
class RenderStringResult:
    text: str
    missing_variables: list[str] = field(default_factory=list)
    unknown_variables: list[str] = field(default_factory=list)


@dataclass
class RenderResult:
    subject: str
    body: str
    missing_variables: list[str] = field(default_factory=list)
    unknown_variables: list[str] = field(default_factory=list)

    @property
    def body_html(self) -> str:
        return self.body


def _lookup(context: dict[str, Any], key: str) -> Any:
    if key in context:
        return context[key]
    defn = VARIABLE_BY_KEY.get(key)
    if defn is not None:
        if defn.key in context:
            return context[defn.key]
        for a in defn.aliases:
            if a in context:
                return context[a]
    return None


def _is_empty(raw: Any) -> bool:
    if raw is None:
        return True
    if isinstance(raw, str) and not raw.strip():
        return True
    return False


def _format_value(key: str, raw: Any, *, for_html: bool) -> str:
    defn = VARIABLE_BY_KEY.get(key)
    kind = defn.value_kind if defn else "TEXT"
    if kind == "HTML":
        return str(raw)
    if kind == "URL":
        s = str(raw).strip()
        if not for_html:
            return s
        esc = html.escape(s, quote=True)
        return f'<a href="{esc}">{esc}</a>' if s else ""
    s = str(raw)
    return html.escape(s, quote=False) if for_html else s


def _dedupe_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def render_template_string(
    template: str,
    context: dict[str, Any],
    *,
    for_html: bool = False,
) -> RenderStringResult:
    """
    Replace {key} / {{key}} placeholders.

    - Known + value → substituted (TEXT escaped when for_html)
    - Known + missing/empty → "" + missing_variables
    - Unknown (not in registry) → placeholder kept + unknown_variables
    """
    missing: list[str] = []
    unknown: list[str] = []

    def repl(m: re.Match[str]) -> str:
        key = m.group(1) or m.group(2)
        defn = VARIABLE_BY_KEY.get(key)
        if defn is None:
            unknown.append(key)
            return m.group(0)
        raw = _lookup(context, key)
        if _is_empty(raw):
            missing.append(defn.key)
            return ""
        return _format_value(defn.key, raw, for_html=for_html)

    text = _VAR_RE.sub(repl, template or "")
    return RenderStringResult(
        text=text,
        missing_variables=_dedupe_preserve(missing),
        unknown_variables=_dedupe_preserve(unknown),
    )


def render_template(
    *,
    subject_template: str,
    body_template: str,
    context: dict[str, Any],
    body_is_html: bool = True,
) -> RenderResult:
    """Render subject (plain) + body (HTML-aware) with gap reporting."""
    subj = render_template_string(subject_template, context, for_html=False)
    body = render_template_string(body_template, context, for_html=body_is_html)
    return RenderResult(
        subject=subj.text,
        body=body.text,
        missing_variables=_dedupe_preserve(subj.missing_variables + body.missing_variables),
        unknown_variables=_dedupe_preserve(subj.unknown_variables + body.unknown_variables),
    )


def log_render_gaps(
    *,
    source: str,
    template_id: int | None = None,
    missing_variables: list[str] | None = None,
    unknown_variables: list[str] | None = None,
) -> None:
    """Audit gaps without logging message body or customer PII."""
    missing = missing_variables or []
    unknown = unknown_variables or []
    if not missing and not unknown:
        return
    logger.info(
        "message_template_render_gaps source=%s template_id=%s missing=%s unknown=%s",
        source,
        template_id,
        missing,
        unknown,
    )
