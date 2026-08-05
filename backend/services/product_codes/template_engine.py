"""
Central product code (SKU / catalog number) template engine.

v1 tokens: {CODE}, {NNNNN}
Reserved for future (registered, not yet resolved unless context provides them):
{CATEGORY} {PARENT} {YEAR} {MONTH} {DAY} {TENANT} {MANUFACTURER} {BRAND}
{NN} {NNN} {NNNN} {NNNNNN} …
"""

from __future__ import annotations

import re
from typing import Dict, Mapping, MutableMapping, Optional

TOKEN_RE = re.compile(r"\{([A-Z0-9_]+)\}")

#: Tokens implemented in v1 resolution.
V1_TOKENS = frozenset({"CODE", "NNNNN"})

#: Documented extension surface — safe to add resolvers later without changing call sites.
RESERVED_TOKENS = frozenset(
    {
        "CATEGORY",
        "PARENT",
        "YEAR",
        "MONTH",
        "DAY",
        "TENANT",
        "MANUFACTURER",
        "BRAND",
        "NN",
        "NNN",
        "NNNN",
        "NNNNN",
        "NNNNNN",
        "CODE",
    }
)

DEFAULT_TEMPLATE = "{CODE}-{NNNNN}"


def normalize_code(code: Optional[str]) -> str:
    return (code or "").strip().upper()


def normalize_template(template: Optional[str]) -> str:
    t = (template or "").strip()
    return t or DEFAULT_TEMPLATE


def sequence_key_for(*, kind: str, code: str, template: str) -> str:
    """
    Stable counter identity: kind + template with {CODE} applied, number tokens kept.
    Example: sku|WAN-{NNNNN}
    """
    tpl = normalize_template(template)
    c = normalize_code(code)
    key_tpl = TOKEN_RE.sub(
        lambda m: c if m.group(1) == "CODE" else m.group(0),
        tpl,
    )
    return f"{kind}|{key_tpl}"


def _pad_n(n: int, width: int) -> str:
    return str(max(0, int(n))).zfill(width)


def build_context(
    *,
    code: str,
    sequence_n: Optional[int] = None,
    extra: Optional[Mapping[str, str]] = None,
) -> Dict[str, str]:
    ctx: Dict[str, str] = {"CODE": normalize_code(code)}
    if sequence_n is not None:
        ctx["NNNNN"] = _pad_n(sequence_n, 5)
        ctx["NNNN"] = _pad_n(sequence_n, 4)
        ctx["NNN"] = _pad_n(sequence_n, 3)
        ctx["NN"] = _pad_n(sequence_n, 2)
        ctx["NNNNNN"] = _pad_n(sequence_n, 6)
    if extra:
        for k, v in extra.items():
            if v is not None:
                ctx[str(k).upper()] = str(v)
    return ctx


def render_template(template: str, context: Mapping[str, str], *, leave_unknown: bool = False) -> str:
    """
    Replace ``{TOKEN}`` from context.
    Unknown tokens: raise unless leave_unknown (keeps placeholder for keys / diagnostics).
    """

    def repl(match: re.Match[str]) -> str:
        token = match.group(1)
        if token in context:
            return context[token]
        if leave_unknown:
            return match.group(0)
        if token in RESERVED_TOKENS and token not in V1_TOKENS:
            raise ValueError(f"Token {{{token}}} nie jest jeszcze obsługiwany.")
        raise ValueError(f"Nieznany token szablonu: {{{token}}}")

    return TOKEN_RE.sub(repl, normalize_template(template))


def render_code(
    *,
    template: str,
    code: str,
    sequence_n: int,
    extra: Optional[Mapping[str, str]] = None,
) -> str:
    ctx = build_context(code=code, sequence_n=sequence_n, extra=extra)
    return render_template(template, ctx)


def template_requires_sequence(template: str) -> bool:
    tokens = set(TOKEN_RE.findall(normalize_template(template)))
    return bool(tokens & {"NNNNN", "NNNN", "NNN", "NN", "NNNNNN"})
