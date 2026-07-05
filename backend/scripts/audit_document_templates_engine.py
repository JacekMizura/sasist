#!/usr/bin/env python3
"""Full Document Template Engine audit — starters, pipeline, BASE/PARTIAL, helpers.

Run: python -m backend.scripts.audit_document_templates_engine
Output: memory/document-templates-engine-audit-report.md
"""

from __future__ import annotations

import json
import re
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.db.document_template_schema import STARTERS_DIR, ensure_document_template_schema
from backend.document_templates.constants import (
    DOCUMENT_KINDS,
    SYSTEM_BASE_TEMPLATE_CODE,
    SYSTEM_PARTIAL_CODES,
    TEMPLATE_ROLE_BASE,
    TEMPLATE_ROLE_PARTIAL,
    VERSION_STATUS_PUBLISHED,
)
from backend.document_templates.dto.resolved_document_template import ResolvedDocumentTemplate
from backend.document_templates.models import (
    DocumentTemplate,
    DocumentTemplateKind,
    DocumentTemplateStarter,
    DocumentTemplateVersion,
)
from backend.document_templates.render.helper_registry import get_twig_helper_registry
from backend.document_templates.render.output_formats import DocumentOutputFormat
from backend.document_templates.render.render_pipeline import render_for_format
from backend.document_templates.services.context_pipeline_orchestrator import (
    build_context_pipeline,
    build_sample_context,
)
from backend.document_templates.services.context_schema_registry import fields_for_schema_key
from backend.document_templates.services.dependency_graph_service import DependencyGraphService
from backend.document_templates.services.document_migration_service import (
    _default_partial_pins,
    _system_base_published_version,
)
from backend.document_templates.services.live_validation_service import (
    JINJA2_BUILTIN_FILTERS,
    extract_twig_function_calls,
    validate_twig_live,
)
from backend.document_templates.services.template_resolution_service import _load_base_chain, _load_pin_map
from backend.document_templates.services.twig_parse_service import (
    collect_all_include_codes,
    extract_extends_target,
    extract_include_document_codes,
)
from backend.models.tenant import Tenant

REPORT_PATH = Path(__file__).resolve().parents[2] / "memory" / "document-templates-engine-audit-report.md"

_VAR_RE = re.compile(r"\{\{\s*(.*?)\s*\}\}", re.DOTALL)
_FILTER_RE = re.compile(r"\|\s*(\w+)")
_FUNC_RE = re.compile(r"\b(\w+)\s*\(")


@dataclass
class StarterAuditRow:
    kind_code: str
    family_code: str
    provider_key: str
    schema_key: str
    has_starter_file: bool
    html: str = "—"
    pdf: str = "—"
    validation: str = "—"
    provider: str = "—"
    base: str = "—"
    partials: str = "—"
    helpers: str = "—"
    filters: str = "—"
    result: str = "—"
    errors: list[str] = field(default_factory=list)


def _setup_db() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    ensure_document_template_schema(engine)
    db = sessionmaker(bind=engine)()
    if db.query(Tenant).filter(Tenant.id == 1).first() is None:
        db.add(Tenant(id=1, name="Demo", company_name="Demo Sp. z o.o."))
        db.commit()
        ensure_document_template_schema(engine)
    return db


def _starter_content(kind_code: str) -> str | None:
    path = STARTERS_DIR / f"{kind_code}.twig"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    try:
        from backend.document_templates.starters.compose_starters import starter_twig_for_kind

        return starter_twig_for_kind(kind_code)
    except Exception:
        return None


def _resolve_production_like(
    db: Session,
    *,
    tenant_id: int,
    twig_content: str,
) -> tuple[ResolvedDocumentTemplate | None, str | None]:
    """Resolve like migration/production — explicit BASE + all default partial pins."""
    base_version = _system_base_published_version(db, tenant_id=tenant_id)
    extends_target = extract_extends_target(twig_content)
    if extends_target and base_version is None:
        return None, "Brak opublikowanego BASE systemowego (base_document)."
    partial_pins = _default_partial_pins(db, tenant_id=tenant_id)
    if extends_target:
        needed = collect_all_include_codes(twig_content)
        missing = [c for c in needed if c not in partial_pins]
        if missing:
            return None, f"Brak pinów partiali systemowych: {', '.join(missing)}"
    base_chain: list[tuple[str, str]] = []
    partials: dict[str, str] = {}
    if extends_target and base_version:
        chain, chain_partials = _load_base_chain(db, int(base_version.id))
        base_chain.extend(chain)
        partials.update(chain_partials)
    if partial_pins:
        fake = DocumentTemplateVersion(
            template_id=0,
            version_number=0,
            status="draft",
            twig_content=twig_content,
            partial_pins_json=json.dumps(partial_pins),
        )
        partials.update(_load_pin_map(db, fake))
    return (
        ResolvedDocumentTemplate(
            main_template_name="__document__",
            main_twig_content=twig_content,
            base_chain=tuple(base_chain),
            partials=partials,
        ),
        None,
    )


def _resolve_preview_strict(
    db: Session,
    *,
    twig_content: str,
    extends_version_id: int | None,
    partial_pins_json: str | None,
) -> ResolvedDocumentTemplate:
    """Preview WITHOUT auto-resolve — only explicit pins."""
    base_chain: list[tuple[str, str]] = []
    partials: dict[str, str] = {}
    if extends_version_id:
        chain, chain_partials = _load_base_chain(db, int(extends_version_id))
        base_chain.extend(chain)
        partials.update(chain_partials)
    if partial_pins_json:
        fake = DocumentTemplateVersion(
            template_id=0,
            version_number=0,
            status="draft",
            twig_content=twig_content,
            partial_pins_json=partial_pins_json,
        )
        partials.update(_load_pin_map(db, fake))
    return ResolvedDocumentTemplate(
        main_template_name="__document__",
        main_twig_content=twig_content,
        base_chain=tuple(base_chain),
        partials=partials,
    )


def _flatten_keys(obj: Any, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{prefix}.{k}" if prefix else str(k)
            keys.add(path)
            keys |= _flatten_keys(v, path)
    elif isinstance(obj, list) and obj:
        keys |= _flatten_keys(obj[0], f"{prefix}[]")
    return keys


def _extract_used_roots(twig: str) -> set[str]:
    roots: set[str] = set()
    helpers = set(get_twig_helper_registry().functions()) | set(get_twig_helper_registry().filters()) | JINJA2_BUILTIN_FILTERS
    for m in _VAR_RE.finditer(twig):
        expr = m.group(1).strip()
        if re.match(r"^\w+\s*\(", expr) or expr.startswith("'") or expr.startswith('"'):
            continue
        root = re.split(r"\||\(|\s", expr)[0].strip().split(".")[0]
        if root and root not in helpers and root not in {"loop", "true", "false", "none", "null"}:
            roots.add(root.split("[")[0])
    return roots


def _extract_filters(twig: str) -> set[str]:
    found: set[str] = set()
    for m in _VAR_RE.finditer(twig):
        for fm in _FILTER_RE.finditer(m.group(1)):
            found.add(fm.group(1))
    return found


def _extract_functions(twig: str) -> set[str]:
    return extract_twig_function_calls(twig)


def _check_provider_fields(ctx: dict[str, Any], used_roots: set[str]) -> list[str]:
    available = _flatten_keys(ctx)
    available_roots = {p.split(".")[0].split("[")[0] for p in available}
    missing = sorted(r for r in used_roots if r not in available_roots)
    return missing


def audit_starter(db: Session, kind_row: dict[str, str]) -> StarterAuditRow:
    kind_code = str(kind_row["code"])
    row = StarterAuditRow(
        kind_code=kind_code,
        family_code=str(kind_row["family_code"]),
        provider_key=str(kind_row["provider_key"]),
        schema_key=str(kind_row["schema_key"]),
        has_starter_file=(STARTERS_DIR / f"{kind_code}.twig").is_file(),
    )
    twig = _starter_content(kind_code)
    if not twig:
        row.result = "FAIL"
        row.errors.append("Brak pliku startera (.twig) i brak compose_starters.")
        return row

    schema_fields = fields_for_schema_key(row.schema_key)
    schema_paths = {f["path"] for f in schema_fields}
    schema_roots = {p.split(".")[0].split("[")[0] for p in schema_paths}

    sample_ctx: dict[str, Any] = {}

    # Validation
    issues = validate_twig_live(twig, known_fields=schema_fields)
    if issues:
        row.validation = f"FAIL ({len(issues)})"
        for i in issues[:5]:
            row.errors.append(f"Walidacja L{i.line}: [{i.code}] {i.message}")
    else:
        row.validation = "OK"

    # Helpers / filters
    reg_helpers = set(get_twig_helper_registry().functions())
    reg_filters = set(get_twig_helper_registry().filters()) | JINJA2_BUILTIN_FILTERS
    used_funcs = _extract_functions(twig)
    used_filters = _extract_filters(twig)
    missing_funcs = sorted(f for f in used_funcs if f not in reg_helpers)
    missing_filters = sorted(f for f in used_filters if f not in reg_filters)
    row.helpers = "OK" if not missing_funcs else f"FAIL: {', '.join(missing_funcs)}"
    row.filters = "OK" if not missing_filters else f"FAIL: {', '.join(missing_filters)}"
    for f in missing_funcs:
        row.errors.append(f"Niezarejestrowana funkcja: {f}")
    for f in missing_filters:
        row.errors.append(f"Niezarejestrowany filtr: {f}")

    # Provider / sample context
    try:
        sample_ctx = build_sample_context(db, tenant_id=1, kind_code=kind_code)
        pipeline_ctx = build_context_pipeline(db, tenant_id=1, kind_code=kind_code, params={"sample": True})
        used_roots = _extract_used_roots(twig)
        available_roots = {p.split(".")[0].split("[")[0] for p in _flatten_keys(sample_ctx)}
        loop_vars = {"row", "item", "loc", "loop"}
        missing_provider = sorted(r for r in used_roots if r not in available_roots and r not in loop_vars)
        missing_schema = sorted(r for r in used_roots if r not in schema_roots and r not in loop_vars)
        if missing_provider:
            row.provider = f"FAIL ctx: {', '.join(missing_provider[:6])}"
            row.errors.append(f"Provider sample brak pól: {', '.join(missing_provider)}")
        else:
            row.provider = "OK"
        if missing_schema:
            row.errors.append(f"Schema registry brak rootów: {', '.join(missing_schema)}")
        if set(_flatten_keys(sample_ctx)) != set(_flatten_keys(pipeline_ctx)):
            row.errors.append("build_sample_context ≠ build_context_pipeline(sample=True) — rozjazd pipeline")
    except Exception as exc:
        row.provider = "FAIL"
        row.errors.append(f"Provider: {exc}")
        sample_ctx = {}

    # BASE / partials metadata
    extends = extract_extends_target(twig)
    includes = extract_include_document_codes(twig)
    base_version = _system_base_published_version(db, tenant_id=1)
    default_pins = _default_partial_pins(db, tenant_id=1)
    if extends:
        row.base = "OK" if base_version else "FAIL brak BASE"
        missing_partials = [c for c in includes if c not in default_pins]
        row.partials = "OK" if not missing_partials else f"FAIL brak: {', '.join(missing_partials)}"
        if not base_version:
            row.errors.append("extends bez opublikowanego BASE systemowego")
        for c in missing_partials:
            row.errors.append(f"include_document '{c}' bez systemowego partiala")
    else:
        row.base = "— (plain)"
        row.partials = "—" if not includes else f"includes: {len(includes)} bez extends"

    # Production-like render
    resolved, resolve_err = _resolve_production_like(db, tenant_id=1, twig_content=twig)
    if resolve_err:
        row.html = "FAIL"
        row.pdf = "FAIL"
        row.errors.append(f"Resolve produkcyjny: {resolve_err}")
    else:
        try:
            html = render_for_format(resolved, sample_ctx, DocumentOutputFormat.HTML)
            row.html = "OK" if html and len(str(html)) > 100 else "FAIL empty"
        except Exception as exc:
            row.html = "FAIL"
            row.errors.append(f"HTML: {exc}")
            row.errors.append(traceback.format_exc().splitlines()[-1])
        try:
            pdf = render_for_format(resolved, sample_ctx, DocumentOutputFormat.PDF)
            row.pdf = "OK" if pdf and len(bytes(pdf)) > 500 else "FAIL empty"
        except Exception as exc:
            row.pdf = "FAIL"
            row.errors.append(f"PDF: {exc}")

    # Preview strict (no pins) — dokumentacja zachowania
    if extends and not row.errors:
        try:
            strict = _resolve_preview_strict(db, twig_content=twig, extends_version_id=None, partial_pins_json=None)
            render_for_format(strict, sample_ctx, DocumentOutputFormat.HTML)
            row.errors.append("UWAGA: preview strict bez pinów przeszedł — powinien failować jak produkcja")
        except Exception:
            pass  # expected

    row.result = "OK" if row.html == "OK" and row.pdf == "OK" and row.validation == "OK" and row.provider == "OK" and not missing_funcs and not missing_filters else "FAIL"
    return row


def audit_base_partial_system(db: Session) -> dict[str, Any]:
    tenant_id = 1
    base_tpl = (
        db.query(DocumentTemplate)
        .filter(DocumentTemplate.tenant_id == tenant_id, DocumentTemplate.template_code == SYSTEM_BASE_TEMPLATE_CODE)
        .first()
    )
    partials = (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.tenant_id == tenant_id,
            DocumentTemplate.template_role == TEMPLATE_ROLE_PARTIAL,
        )
        .all()
    )
    partial_codes = {p.template_code for p in partials}
    expected = set(SYSTEM_PARTIAL_CODES)
    orphaned_partials = sorted(partial_codes - expected)
    missing_partials = sorted(expected - partial_codes)

    all_starter_twigs = []
    for k in DOCUMENT_KINDS:
        c = _starter_content(str(k["code"]))
        if c:
            all_starter_twigs.append(c)
    referenced_partials: set[str] = set()
    for twig in all_starter_twigs:
        referenced_partials |= set(extract_include_document_codes(twig))
    base_content = ""
    if base_tpl:
        bv = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == int(base_tpl.id),
                DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
            )
            .first()
        )
        if bv:
            base_content = str(bv.twig_content)
            referenced_partials |= set(extract_include_document_codes(base_content))

    unused_partials = sorted(expected & partial_codes - referenced_partials)
    unreferenced_in_starters = sorted(referenced_partials - expected)

    cycles: list[str] = []
    if base_tpl:
        bv = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == int(base_tpl.id),
                DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
            )
            .first()
        )
        if bv:
            graph = DependencyGraphService(db)
            cycle = graph.detect_cycles_for_version(int(bv.id))
            if cycle:
                cycles.append(" → ".join(cycle))

    kinds_with_starters = {str(k["code"]) for k in DOCUMENT_KINDS if _starter_content(str(k["code"]))}
    kinds_without = sorted(str(k["code"]) for k in DOCUMENT_KINDS if str(k["code"]) not in kinds_with_starters)

    partial_files = list((STARTERS_DIR / "partials").glob("*.twig"))
    disk_partial_codes = {p.stem for p in partial_files}
    disk_orphans = sorted(disk_partial_codes - expected - {"document_header_wrapper"})

    return {
        "base_exists": base_tpl is not None,
        "base_published": base_tpl is not None and db.query(DocumentTemplateVersion).filter(
            DocumentTemplateVersion.template_id == int(base_tpl.id),
            DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
        ).first()
        is not None,
        "missing_system_partials": missing_partials,
        "orphaned_db_partials": orphaned_partials,
        "unused_system_partials": unused_partials,
        "referenced_unknown_partials": unreferenced_in_starters,
        "cycles": cycles,
        "kinds_without_starter": kinds_without,
        "disk_orphan_partial_files": disk_orphans,
        "document_header_wrapper_on_disk": (STARTERS_DIR / "partials" / "document_header_wrapper.twig").is_file(),
    }


def audit_helpers() -> dict[str, Any]:
    reg = get_twig_helper_registry()
    funcs = sorted(reg.functions())
    filters = sorted(reg.filters())
    all_twig = ""
    for p in STARTERS_DIR.rglob("*.twig"):
        all_twig += p.read_text(encoding="utf-8") + "\n"
    used_funcs = _extract_functions(all_twig)
    used_filters = _extract_filters(all_twig)
    registered_funcs = set(funcs)
    registered_filters = set(filters) | JINJA2_BUILTIN_FILTERS
    unregistered_used_funcs = sorted(used_funcs - registered_funcs)
    unregistered_used_filters = sorted(used_filters - registered_filters)
    unused_registered_funcs = sorted(set(funcs) - used_funcs - {"company_logo"})
    return {
        "registered_functions": funcs,
        "registered_filters": filters,
        "jinja2_builtin_filters_count": len(JINJA2_BUILTIN_FILTERS),
        "unregistered_used_functions": unregistered_used_funcs,
        "unregistered_used_filters": unregistered_used_filters,
        "unused_registered_functions": unused_registered_funcs,
    }


def audit_preview_vs_production(db: Session) -> dict[str, Any]:
    """Compare preview_document vs strict production resolve — same pipeline rules."""
    import json

    from backend.document_templates.errors import DocumentRenderError
    from backend.document_templates.services.document_render_service import (
        preview_document,
        resolve_draft_template,
    )

    twig = _starter_content("wz") or ""
    findings: list[str] = []
    base_version = _system_base_published_version(db, tenant_id=1)
    partial_pins = _default_partial_pins(db, tenant_id=1)
    pins_json = json.dumps(partial_pins) if partial_pins else None
    extends_id = int(base_version.id) if base_version else None

    preview_with_pins = "SKIP"
    if extends_id and pins_json:
        try:
            preview_document(
                db,
                tenant_id=1,
                kind_code="wz",
                template=twig,
                context_mode="sample",
                extends_version_id=extends_id,
                partial_pins_json=pins_json,
            )
            preview_with_pins = "OK"
        except Exception as exc:
            preview_with_pins = f"FAIL: {exc}"

    try:
        resolve_draft_template(
            db,
            template=twig,
            extends_version_id=None,
            partial_pins_json=None,
        )
        preview_strict = "OK (unexpected)"
        findings.append("Preview strict bez pinów renderuje — niezgodne z produkcją")
    except DocumentRenderError as exc:
        preview_strict = f"FAIL (expected): {exc.code}: {exc}"
    except Exception as exc:
        preview_strict = f"FAIL (expected): {type(exc).__name__}: {exc}"

    resolved, err = _resolve_production_like(db, tenant_id=1, twig_content=twig)
    if err:
        production = f"FAIL: {err}"
    else:
        try:
            ctx = build_sample_context(db, tenant_id=1, kind_code="wz")
            render_for_format(resolved, ctx, DocumentOutputFormat.HTML)
            production = "OK"
        except Exception as exc:
            production = f"FAIL: {exc}"

    try:
        resolve_draft_template(
            db,
            template=twig,
            extends_version_id=extends_id,
            partial_pins_json=pins_json,
        )
        draft_with_pins = "OK"
    except Exception as exc:
        draft_with_pins = f"FAIL: {exc}"

    try:
        resolve_draft_template(
            db,
            template=twig,
            extends_version_id=None,
            partial_pins_json=None,
        )
        draft_auto_resolve = True
        findings.append("resolve_draft_template bez pinów nie odrzucił szablonu — ROZJAZD z produkcją")
    except DocumentRenderError:
        draft_auto_resolve = False

    return {
        "wz_preview_with_explicit_pins": preview_with_pins,
        "wz_preview_strict_no_pins": preview_strict,
        "wz_production_like": production,
        "draft_resolve_with_pins": draft_with_pins,
        "draft_resolve_auto_base_without_pins": draft_auto_resolve,
        "findings": findings,
    }


def render_report(
    rows: list[StarterAuditRow],
    base_partial: dict[str, Any],
    helpers: dict[str, Any],
    preview_cmp: dict[str, Any],
) -> str:
    ok_count = sum(1 for r in rows if r.result == "OK")
    fail_count = len(rows) - ok_count
    lines = [
        "# Document Template Engine — raport audytu",
        "",
        f"**Data audytu:** 2026-07-05",
        f"**Starterów (kindów):** {len(rows)} | **OK:** {ok_count} | **FAIL:** {fail_count}",
        "",
        "## 1. Tabela starterów",
        "",
        "| Dokument | HTML | PDF | Walidacja | Provider | BASE | Partiale | Helpery | Filtry | Wynik |",
        "|----------|------|-----|-----------|----------|------|----------|---------|--------|-------|",
    ]
    for r in rows:
        lines.append(
            f"| {r.kind_code} | {r.html} | {r.pdf} | {r.validation} | {r.provider} | {r.base} | {r.partials} | {r.helpers} | {r.filters} | **{r.result}** |"
        )

    lines.extend(["", "## 2. Szczegóły błędów per starter", ""])
    for r in rows:
        if r.errors:
            lines.append(f"### `{r.kind_code}` ({r.family_code}, provider={r.provider_key})")
            for e in r.errors:
                lines.append(f"- {e}")
            lines.append("")

    lines.extend(
        [
            "## 3. Integralność pipeline",
            "",
            "| Warstwa | SSOT | Uwagi |",
            "|---------|------|-------|",
            "| Provider | `build_domain_print_context` + `build_global_print_context_dto` | sample via `params.sample=True` |",
            "| ContextPipeline | `build_context_pipeline` / `build_sample_context` | `normalize_print_context()` mapuje aliasy → `document` |",
            "| ContextSchemaRegistry | `fields_for_schema_key()` | Rozszerzony w stabilizacji 2026-07-05 |",
            "| VariableSchemaService | `build_variable_schema()` → registry + sample enrich | Jedno źródło pól dla edytora |",
            "| ValidationService (live) | `validate_twig_live(known_fields=schema.fields)` | + JINJA2_BUILTIN_FILTERS |",
            "| TemplateResolutionService | `_load_base_chain` + `_load_pin_map` | Wymaga jawnych pinów |",
            "| RenderPipeline | `render_for_format` | Ten sam dla HTML/PDF |",
            "",
            "### Preview vs produkcja (WZ jako referencja)",
            "",
        ]
    )
    for k, v in preview_cmp.items():
        if k != "findings":
            lines.append(f"- **{k}:** `{v}`")
    if preview_cmp.get("findings"):
        lines.append("")
        lines.append("**Krytyczne rozjazdy:**")
        for f in preview_cmp["findings"]:
            lines.append(f"- {f}")

    lines.extend(["", "## 4. System BASE i PARTIAL", ""])
    for k, v in base_partial.items():
        lines.append(f"- **{k}:** `{v}`")

    lines.extend(["", "## 5. Helpery i filtry", ""])
    lines.append(f"- Zarejestrowane funkcje ({len(helpers['registered_functions'])}): `{', '.join(helpers['registered_functions'])}`")
    lines.append(f"- Zarejestrowane filtry ({len(helpers['registered_filters'])}): `{', '.join(helpers['registered_filters'])}`")
    lines.append(f"- Jinja2 builtins w walidacji: {helpers['jinja2_builtin_filters_count']}")
    if helpers["unregistered_used_functions"]:
        lines.append(f"- **Używane, niezarejestrowane funkcje:** `{', '.join(helpers['unregistered_used_functions'])}`")
    if helpers["unregistered_used_filters"]:
        lines.append(f"- **Używane, niezarejestrowane filtry:** `{', '.join(helpers['unregistered_used_filters'])}`")
    if helpers["unused_registered_functions"]:
        lines.append(f"- Nieużywane zarejestrowane funkcje: `{', '.join(helpers['unused_registered_functions'][:10])}`")

    lines.extend(
        [
            "",
            "## 6. Rekomendacje (bez implementacji)",
            "",
            "1. Zweryfikować istniejące szablony w DB bez pinów BASE/partials — preview i produkcja wymagają jawnych pinów.",
            "2. Dodać testy helperów (obecnie brak dedykowanych testów per helper poza `test_render_template_interface`).",
            "3. Rozważyć usunięcie `document_header_wrapper.twig` jeśli osierocony.",
            "",
            "## 7. Testy automatyczne istniejące",
            "",
            "- `backend/tests/document_templates/test_document_templates_engine.py`",
            "- `backend/tests/document_templates/test_document_templates_v2.py`",
            "- `backend/tests/document_templates/test_document_templates_stabilization.py`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    db = _setup_db()
    rows = [audit_starter(db, dict(k)) for k in DOCUMENT_KINDS]
    base_partial = audit_base_partial_system(db)
    helpers = audit_helpers()
    preview_cmp = audit_preview_vs_production(db)
    ok_count = sum(1 for r in rows if r.result == "OK")
    fail_count = len(rows) - ok_count
    report = render_report(rows, base_partial, helpers, preview_cmp)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"Audit complete: {REPORT_PATH} ({ok_count} OK, {fail_count} FAIL)")
    db.close()


if __name__ == "__main__":
    main()
