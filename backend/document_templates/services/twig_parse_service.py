"""Parse Twig source for extends / include_document references."""

from __future__ import annotations

import re

_EXTENDS_RE = re.compile(r"""\{%\s*extends\s+['"]([^'"]+)['"]\s*%\}""", re.IGNORECASE)
_INCLUDE_DOCUMENT_RE = re.compile(
    r"""\{%\s*include_document\s+['"]([^'"]+)['"]\s*%\}""",
    re.IGNORECASE,
)


def extract_extends_target(twig_content: str) -> str | None:
    match = _EXTENDS_RE.search(twig_content or "")
    return match.group(1).strip() if match else None


def extract_include_document_codes(twig_content: str) -> list[str]:
    return list(dict.fromkeys(_INCLUDE_DOCUMENT_RE.findall(twig_content or "")))


def collect_all_include_codes(*contents: str) -> list[str]:
    seen: list[str] = []
    for content in contents:
        for code in extract_include_document_codes(content):
            if code not in seen:
                seen.append(code)
    return seen
