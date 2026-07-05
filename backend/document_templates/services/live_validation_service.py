"""Live Twig validation — syntax, unknown variables, helpers, tags."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from ..render.helper_registry import get_twig_helper_registry
from ..render.tag_registry import get_twig_tag_registry
from ..render._engine_backend import validate_syntax

_VAR_RE = re.compile(r"\{\{\s*(.*?)\s*\}\}", re.DOTALL)
_TWIG_REGION_RE = re.compile(r"\{\{.*?\}\}|\{%.*?%\}", re.DOTALL)
_FOR_RE = re.compile(r"\{%\s*for\s+(\w+)\s+in\s+([^%]+)%\}", re.IGNORECASE)
_TAG_RE = re.compile(r"\{%\s*(\w+)", re.IGNORECASE)
_FILTER_RE = re.compile(r"\|\s*(\w+)")
_FUNC_IN_TWIG_RE = re.compile(r"\b(\w+)\s*\(")
_SKIP_FUNC_NAMES = frozenset(
    {
        "if",
        "for",
        "set",
        "block",
        "extends",
        "include",
        "include_document",
        "endfor",
        "endif",
        "else",
        "elseif",
        "endblock",
        "not",
        "and",
        "or",
        "is",
        "in",
    }
)

# Jinja2 built-in filters always available at render time (even if not in helper registry).
JINJA2_BUILTIN_FILTERS = frozenset(
    {
        "default",
        "d",
        "safe",
        "escape",
        "e",
        "trim",
        "lower",
        "upper",
        "title",
        "capitalize",
        "striptags",
        "replace",
        "length",
        "first",
        "last",
        "join",
        "sort",
        "reverse",
        "batch",
        "slice",
        "abs",
        "round",
        "int",
        "float",
        "string",
        "list",
        "map",
        "select",
        "reject",
        "unique",
        "min",
        "max",
        "random",
        "format",
        "indent",
        "wordcount",
        "wordwrap",
        "center",
        "attr",
        "items",
        "urlencode",
        "tojson",
    }
)


@dataclass
class LiveValidationIssue:
    line: int | None
    column: int | None
    code: str
    message: str
    suggestion: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "line": self.line,
            "column": self.column,
            "code": self.code,
            "message": self.message,
            "suggestion": self.suggestion,
        }


def _line_col(content: str, index: int) -> tuple[int, int]:
    line = content.count("\n", 0, index) + 1
    last_nl = content.rfind("\n", 0, index)
    col = index - last_nl if last_nl >= 0 else index + 1
    return line, col


def iter_twig_syntax_regions(content: str):
    """Yield inner Twig expressions/tags — excludes raw HTML, CSS, and plain text."""
    for m in _TWIG_REGION_RE.finditer(content or ""):
        yield m.group(0)


def _twig_region_inner(region: str) -> str:
    text = region.strip()
    if text.startswith("{{") and text.endswith("}}"):
        return text[2:-2].strip()
    if text.startswith("{%") and text.endswith("%}"):
        return text[2:-2].strip()
    return text


def extract_twig_function_calls(content: str) -> set[str]:
    """Detect helper/function calls only inside Twig {{ }} and {% %} syntax."""
    found: set[str] = set()
    for region in iter_twig_syntax_regions(content):
        inner = _twig_region_inner(region)
        for m in _FUNC_IN_TWIG_RE.finditer(inner):
            fn = m.group(1)
            if fn in _SKIP_FUNC_NAMES or fn[0].isupper():
                continue
            prefix = inner[: m.start()]
            if "|" in prefix and prefix.rfind("|") > prefix.rfind("("):
                continue
            found.add(fn)
    return found


def _known_roots(fields: list[dict[str, Any]]) -> set[str]:
    roots: set[str] = set()
    for f in fields:
        path = str(f.get("path") or "")
        roots.add(path.split(".")[0].split("[")[0])
        clean = path.replace("[]", "")
        for i, part in enumerate(clean.split(".")):
            roots.add(".".join(clean.split(".")[: i + 1]))
    return roots


def validate_twig_live(
    twig_content: str,
    *,
    known_fields: list[dict[str, Any]],
    extra_roots: frozenset[str] | None = None,
) -> list[LiveValidationIssue]:
    content = twig_content or ""
    issues: list[LiveValidationIssue] = []

    try:
        validate_syntax(content)
    except Exception as exc:
        msg = str(exc)
        issues.append(
            LiveValidationIssue(
                line=1,
                column=1,
                code="syntax_error",
                message=msg,
                suggestion="Sprawdź składnię tagów {% %} i {{ }}.",
            )
        )
        return issues

    helpers = (
        set(get_twig_helper_registry().functions())
        | set(get_twig_helper_registry().filters())
        | JINJA2_BUILTIN_FILTERS
    )
    tags = set(get_twig_tag_registry().known_tags())
    roots = _known_roots(known_fields) | set(extra_roots or ())
    roots |= {"loop", "row", "item", "loc", "true", "false", "none", "null"}

    for m in _TAG_RE.finditer(content):
        tag = m.group(1).lower()
        if tag in {"endfor", "endblock", "endif", "else", "elseif", "set", "if", "for", "extends", "include", "include_document"}:
            continue
        if tag not in tags and tag not in {"endfor", "endblock"}:
            line, col = _line_col(content, m.start())
            issues.append(
                LiveValidationIssue(
                    line=line,
                    column=col,
                    code="unknown_tag",
                    message=f"Nieznany tag: {tag}",
                    suggestion="Użyj tagów z panelu „Tagi”.",
                )
            )

    for m in _VAR_RE.finditer(content):
        expr = m.group(1)
        line, col = _line_col(content, m.start())
        for fm in _FILTER_RE.finditer(expr):
            fname = fm.group(1)
            if fname not in helpers:
                issues.append(
                    LiveValidationIssue(
                        line=line,
                        column=col,
                        code="unknown_helper",
                        message=f"Nieznany filtr/funkcja: {fname}",
                        suggestion="Sprawdź panel „Funkcje”.",
                    )
                )
        base = re.split(r"\||\(|\s", expr.strip())[0].strip()
        if not base or base.startswith("'") or base.startswith('"'):
            continue
        if re.match(r"^\w+\s*\(", expr.strip()) or base in helpers:
            continue
        root = base.split(".")[0]
        if root and root not in roots and not root.isdigit():
            issues.append(
                LiveValidationIssue(
                    line=line,
                    column=col,
                    code="unknown_variable",
                    message=f"Nieznana zmienna: {base}",
                    suggestion="Wybierz pole z inspektora zmiennych.",
                )
            )

    for region in iter_twig_syntax_regions(content):
        inner = _twig_region_inner(region)
        line, col = _line_col(content, content.find(region))
        for m in _FUNC_IN_TWIG_RE.finditer(inner):
            fn = m.group(1)
            if fn in _SKIP_FUNC_NAMES or fn[0].isupper():
                continue
            prefix = inner[: m.start()]
            if "|" in prefix and prefix.rfind("|") > prefix.rfind("("):
                continue
            if fn not in helpers and fn not in tags:
                issues.append(
                    LiveValidationIssue(
                        line=line,
                        column=col,
                        code="unknown_helper",
                        message=f"Nieznana funkcja: {fn}",
                    )
                )

    return issues


def live_validation_report(twig_content: str, *, known_fields: list[dict[str, Any]]) -> dict[str, Any]:
    issues = validate_twig_live(twig_content, known_fields=known_fields)
    return {"ok": len(issues) == 0, "issues": [i.to_dict() for i in issues]}
