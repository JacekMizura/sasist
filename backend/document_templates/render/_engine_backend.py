"""Internal template engine backend — implementation detail, not part of public API."""

from __future__ import annotations

import re
import traceback
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
        from ..services.template_resolution_service import resolve_plain_twig

        resolved = resolve_plain_twig(resolved)
    return _render_resolved(resolved, context)


def _render_plain(template: str, context: dict[str, Any]) -> str:
    """
    Render a self-contained Twig snippet (no extends / include_document).

    Templates that need a loader must go through ``resolve_plain_twig`` →
    ``_render_resolved`` (DictLoader). Callers should not hit this path for
    starters with ``{% extends %}``.
    """
    content = _normalize_include_document_tags((template or "").strip())
    if not content:
        raise DocumentRenderError("Pusty szablon Twig.", code="empty_template")
    if "{% extends" in content.lower() or "{% include" in content.lower():
        # Defensive: never render extends/include without a loader.
        from ..services.template_resolution_service import resolve_plain_twig

        return _render_resolved(resolve_plain_twig(template), context)
    try:
        # Still provide an empty DictLoader so Jinja never raises
        # "no loader for this environment specified" on accidental includes.
        env = _build_engine(DictLoader({"__plain__": content}))
        compiled = env.get_template("__plain__")
        return compiled.render(**context)
    except DocumentRenderError:
        raise
    except Exception as exc:
        tb = traceback.format_exc()
        raise DocumentRenderError(
            f"Błąd renderowania Twig: {exc}\n\nTraceback:\n{tb}",
            code="twig_error",
        ) from exc


def _render_resolved(resolved: ResolvedDocumentTemplate, context: dict[str, Any]) -> str:
    if resolved.is_legacy_plain():
        return _render_plain(resolved.main_twig_content, context)

    templates: dict[str, str] = {}
    for name, content in resolved.base_chain:
        templates[name] = _normalize_include_document_tags(content)
    for name, content in resolved.partials.items():
        templates[name] = _normalize_include_document_tags(content)
    templates[resolved.main_template_name] = _normalize_include_document_tags(resolved.main_twig_content)

    # Fill missing extends/includes from filesystem system starters (BASE + PARTIALS).
    # Covers published/migrated DOCUMENT rows that still reference base_document but
    # were resolved without pins — previously raised TemplateNotFound / no-loader.
    templates = _ensure_system_dependencies(templates)

    if not templates.get(resolved.main_template_name, "").strip():
        raise DocumentRenderError("Pusty szablon Twig.", code="empty_template")

    try:
        env = _build_engine(DictLoader(templates))
        compiled = env.get_template(resolved.main_template_name)
        return compiled.render(**context)
    except DocumentRenderError:
        raise
    except Exception as exc:
        tb = traceback.format_exc()
        raise DocumentRenderError(
            f"Błąd renderowania Twig: {exc}\n\nTraceback:\n{tb}",
            code="twig_error",
        ) from exc


_INCLUDE_RE = re.compile(
    r"""\{%\s*include\s+['"]([^'"]+)['"]\s*%\}""",
    re.IGNORECASE,
)


def _ensure_system_dependencies(templates: dict[str, str]) -> dict[str, str]:
    """Merge system BASE/PARTIAL Twig files for any unresolved extends/include names."""
    from ..services.system_starter_library import load_system_starter_templates
    from ..services.twig_parse_service import collect_all_include_codes, extract_extends_target

    out = dict(templates)
    system = load_system_starter_templates()
    pending: list[str] = []

    def _refs_from(content: str) -> list[str]:
        refs: list[str] = []
        ext = extract_extends_target(content)
        if ext:
            refs.append(ext)
        # Both include_document (raw) and include (after normalize).
        refs.extend(collect_all_include_codes(content))
        refs.extend(_INCLUDE_RE.findall(content or ""))
        return refs

    for content in out.values():
        pending.extend(_refs_from(content))

    seen: set[str] = set()
    while pending:
        code = pending.pop(0)
        if not code or code in seen:
            continue
        seen.add(code)
        if code in out and (out[code] or "").strip():
            # Still scan for nested refs.
            pending.extend(_refs_from(out[code]))
            continue
        body = system.get(code)
        if not body:
            continue
        out[code] = _normalize_include_document_tags(body)
        pending.extend(_refs_from(out[code]))
    return out
