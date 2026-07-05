"""Publication validation — gate before publish."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ..dto.resolved_document_template import ResolvedDocumentTemplate
from ..errors import DocumentRenderError, DocumentTemplateError
from ..render.helper_registry import get_twig_helper_registry
from ..render.tag_registry import get_twig_tag_registry
from ..render.template_renderer import render
from ..services.context_pipeline_orchestrator import build_sample_context
from ..services.dependency_graph_service import DependencyGraphService
from ..services.template_resolution_service import resolve_version_to_document_template
from ..services.twig_parse_service import extract_extends_target, extract_include_document_codes


@dataclass
class ValidationIssue:
    line: int | None = None
    column: int | None = None
    code: str = "validation_error"
    message: str = ""
    suggestion: str | None = None


@dataclass
class ValidationReport:
    ok: bool
    issues: list[ValidationIssue] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "issues": [
                {
                    "line": i.line,
                    "column": i.column,
                    "code": i.code,
                    "message": i.message,
                    "suggestion": i.suggestion,
                }
                for i in self.issues
            ],
        }


def validate_syntax(twig_content: str) -> ValidationReport:
    from ..render._engine_backend import validate_syntax as backend_validate

    issues: list[ValidationIssue] = []
    try:
        backend_validate(twig_content)
    except DocumentRenderError as exc:
        issues.append(
            ValidationIssue(
                code=getattr(exc, "code", "syntax_error"),
                message=str(exc),
                suggestion="Sprawdź składnię tagów Twig i nawiasów.",
            )
        )
    return ValidationReport(ok=not issues, issues=issues)


def validate_publication(
    db: Session,
    *,
    version_id: int,
    kind_code: str | None = None,
    run_render: bool = True,
) -> ValidationReport:
    from ..models import DocumentTemplate, DocumentTemplateVersion

    version = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(version_id)).first()
    if version is None:
        return ValidationReport(
            ok=False,
            issues=[ValidationIssue(code="not_found", message="Wersja szablonu nie istnieje.")],
        )
    template = db.query(DocumentTemplate).filter(DocumentTemplate.id == int(version.template_id)).first()
    if template is None:
        return ValidationReport(
            ok=False,
            issues=[ValidationIssue(code="not_found", message="Szablon nie istnieje.")],
        )

    issues: list[ValidationIssue] = []
    content = str(version.twig_content or "")

    syntax_report = validate_syntax(content)
    issues.extend(syntax_report.issues)

    extends_target = extract_extends_target(content)
    if extends_target and version.extends_version_id is None:
        issues.append(
            ValidationIssue(
                code="missing_base_pin",
                message=f"Szablon rozszerza '{extends_target}', ale nie wskazano extends_version_id.",
                suggestion="Przypnij konkretną wersję BASE przed publikacją.",
            )
        )

    includes = extract_include_document_codes(content)
    pins = _load_partial_pins(version)
    for code in includes:
        if code not in pins:
            issues.append(
                ValidationIssue(
                    code="missing_partial_pin",
                    message=f"Brak przypiętej wersji partiala '{code}'.",
                    suggestion="Ustaw partial_pins_json z identyfikatorem wersji partiala.",
                )
            )

    graph = DependencyGraphService(db)
    cycle = graph.detect_cycles_for_version(int(version.id))
    if cycle:
        issues.append(
            ValidationIssue(
                code="dependency_cycle",
                message=f"Wykryto cykl zależności: {' → '.join(cycle)}",
                suggestion="Usuń cykliczne extends lub include_document.",
            )
        )

    unknown_tags = _find_unknown_custom_tags(content)
    for tag in unknown_tags:
        issues.append(
            ValidationIssue(
                code="unknown_tag",
                message=f"Nieznany tag: {tag}",
                suggestion="Użyj zarejestrowanych tagów lub helperów.",
            )
        )

    if run_render and not issues and kind_code:
        try:
            resolved = resolve_version_to_document_template(db, version_id=int(version.id))
            sample_ctx = build_sample_context(db, tenant_id=int(template.tenant_id), kind_code=kind_code)
            render(resolved, sample_ctx)
        except (DocumentRenderError, DocumentTemplateError) as exc:
            issues.append(
                ValidationIssue(
                    code=getattr(exc, "code", "render_error"),
                    message=str(exc),
                    suggestion="Popraw szablon i sprawdij podgląd przed publikacją.",
                )
            )

    return ValidationReport(ok=not issues, issues=issues)


def _load_partial_pins(version) -> dict[str, int]:
    import json

    from ..models import DocumentTemplateVersionPartialPin

    if version.partial_pins:
        return {p.partial_code: int(p.partial_version_id) for p in version.partial_pins}
    raw = version.partial_pins_json
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return {str(k): int(v) for k, v in data.items()}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def _find_unknown_custom_tags(content: str) -> list[str]:
    import re

    registry = get_twig_tag_registry()
    found = re.findall(r"\{%\s*(\w+)", content or "")
    builtins = {
        "if",
        "elif",
        "else",
        "endif",
        "for",
        "endfor",
        "set",
        "endset",
        "macro",
        "endmacro",
        "include",
        "extends",
        "block",
        "endblock",
        "raw",
        "endraw",
    }
    unknown: list[str] = []
    for tag in found:
        low = tag.lower()
        if low in builtins:
            continue
        if registry.is_known(tag):
            continue
        if tag not in unknown:
            unknown.append(tag)
    return unknown
