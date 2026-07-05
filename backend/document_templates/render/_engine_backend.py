"""Internal template engine backend — implementation detail, not part of public API."""

from __future__ import annotations

import re
from typing import Any

from jinja2 import DictLoader, Environment, TemplateSyntaxError, pass_context, select_autoescape

from ..dto.resolved_document_template import ResolvedDocumentTemplate
from ..errors import DocumentRenderError
from .builtins_helpers import company_logo
from .helper_registry import get_twig_helper_registry

_engine: Environment | None = None
_CONTEXT_FUNCTIONS = frozenset({"company_logo"})
_INCLUDE_DOCUMENT_RE = re.compile(
    r"""\{%\s*include_document\s+['"]([^'"]+)['"]\s*%\}""",
    re.IGNORECASE,
)


def _normalize_include_document_tags(content: str) -> str:
    return _INCLUDE_DOCUMENT_RE.sub(r'{% include "\1" %}', content or "")


def _build_engine(loader=None) -> Environment:
    registry = get_twig_helper_registry()
    env = Environment(
        loader=loader,
        autoescape=select_autoescape(["html", "htm", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    for name, fn in registry.functions().items():
        if name in _CONTEXT_FUNCTIONS:
            if name == "company_logo":

                @pass_context
                def _company_logo(ctx) -> str:
                    return company_logo(dict(ctx))

                env.globals[name] = _company_logo
            continue
        env.globals[name] = fn
    env.filters.update(registry.filters())
    return env


def _get_plain_engine() -> Environment:
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def validate_syntax(template: str) -> None:
    content = _normalize_include_document_tags((template or "").strip())
    if not content:
        raise DocumentRenderError("Pusty szablon Twig.", code="empty_template")
    try:
        _get_plain_engine().from_string(content)
    except TemplateSyntaxError as exc:
        raise DocumentRenderError(
            f"Błąd składni Twig: {exc.message}",
            code="syntax_error",
        ) from exc
    except Exception as exc:
        raise DocumentRenderError(f"Błąd składni Twig: {exc}", code="syntax_error") from exc


def render_with_backend(resolved: ResolvedDocumentTemplate | str, context: dict[str, Any]) -> str:
    if isinstance(resolved, str):
        return _render_plain(resolved, context)
    return _render_resolved(resolved, context)


def _render_plain(template: str, context: dict[str, Any]) -> str:
    content = _normalize_include_document_tags((template or "").strip())
    if not content:
        raise DocumentRenderError("Pusty szablon Twig.", code="empty_template")
    try:
        compiled = _get_plain_engine().from_string(content)
        return compiled.render(**context)
    except DocumentRenderError:
        raise
    except Exception as exc:
        raise DocumentRenderError(f"Błąd renderowania Twig: {exc}", code="twig_error") from exc


def _render_resolved(resolved: ResolvedDocumentTemplate, context: dict[str, Any]) -> str:
    if resolved.is_legacy_plain():
        return _render_plain(resolved.main_twig_content, context)

    templates: dict[str, str] = {}
    for name, content in resolved.base_chain:
        templates[name] = _normalize_include_document_tags(content)
    for name, content in resolved.partials.items():
        templates[name] = _normalize_include_document_tags(content)
    templates[resolved.main_template_name] = _normalize_include_document_tags(resolved.main_twig_content)

    if not templates.get(resolved.main_template_name, "").strip():
        raise DocumentRenderError("Pusty szablon Twig.", code="empty_template")

    try:
        env = _build_engine(DictLoader(templates))
        compiled = env.get_template(resolved.main_template_name)
        return compiled.render(**context)
    except DocumentRenderError:
        raise
    except Exception as exc:
        raise DocumentRenderError(f"Błąd renderowania Twig: {exc}", code="twig_error") from exc
