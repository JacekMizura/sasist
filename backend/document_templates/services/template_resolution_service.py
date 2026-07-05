"""Resolve pinned template versions into ResolvedDocumentTemplate."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from ..constants import VERSION_STATUS_PUBLISHED
from ..dto.resolved_document_template import ResolvedDocumentTemplate
from ..errors import DocumentTemplateError
from ..models import DocumentTemplate, DocumentTemplateVersion, DocumentTemplateVersionPartialPin
from ..services.twig_parse_service import collect_all_include_codes


def resolve_plain_twig(twig_content: str) -> ResolvedDocumentTemplate:
    return ResolvedDocumentTemplate(
        main_template_name="__plain__",
        main_twig_content=str(twig_content or ""),
    )


def resolve_version_to_document_template(db: Session, *, version_id: int) -> ResolvedDocumentTemplate:
    version = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(version_id)).first()
    if version is None:
        raise DocumentTemplateError("Wersja szablonu nie istnieje.", code="not_found")
    return _resolve_version_row(db, version)


def resolve_published_template_version(
    db: Session,
    *,
    template_id: int,
    version_id: int | None = None,
) -> ResolvedDocumentTemplate:
    if version_id is not None:
        version = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.id == int(version_id),
                DocumentTemplateVersion.template_id == int(template_id),
            )
            .first()
        )
    else:
        version = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == int(template_id),
                DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
            )
            .order_by(DocumentTemplateVersion.version_number.desc())
            .first()
        )
    if version is None:
        raise DocumentTemplateError("Brak wersji szablonu.", code="no_version")
    return _resolve_version_row(db, version)


def _resolve_version_row(db: Session, version: DocumentTemplateVersion) -> ResolvedDocumentTemplate:
    template = version.template
    main_name = str(template.template_code or "__document__")
    base_chain: list[tuple[str, str]] = []
    partials: dict[str, str] = {}

    if version.extends_version_id:
        chain_versions, chain_partials = _load_base_chain(db, int(version.extends_version_id))
        base_chain.extend(chain_versions)
        partials.update(chain_partials)

    partials.update(_load_pin_map(db, version))

    return ResolvedDocumentTemplate(
        main_template_name=main_name,
        main_twig_content=str(version.twig_content),
        base_chain=tuple(base_chain),
        partials=partials,
        document_version_id=int(version.id),
    )


def _load_base_chain(db: Session, base_version_id: int) -> tuple[list[tuple[str, str]], dict[str, str]]:
    chain: list[tuple[str, str]] = []
    partials: dict[str, str] = {}
    seen: set[int] = set()
    current_id = base_version_id
    depth = 0
    while current_id and depth < 32:
        if current_id in seen:
            raise DocumentTemplateError("Cykl zależności BASE.", code="dependency_cycle")
        seen.add(current_id)
        row = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(current_id)).first()
        if row is None:
            break
        tpl = row.template
        code = str(tpl.template_code or f"base_{row.id}")
        chain.append((code, str(row.twig_content)))
        partials.update(_load_pin_map(db, row))
        current_id = int(row.extends_version_id) if row.extends_version_id else 0
        depth += 1
    chain.reverse()
    return chain, partials


def _load_pin_map(db: Session, version: DocumentTemplateVersion) -> dict[str, str]:
    pins: dict[str, str] = {}
    rows: list[DocumentTemplateVersionPartialPin | tuple[str, int]] = list(version.partial_pins or [])
    if not rows and version.partial_pins_json:
        try:
            data = json.loads(version.partial_pins_json)
            rows = [(str(k), int(v)) for k, v in data.items()]
        except (TypeError, ValueError, json.JSONDecodeError):
            rows = []

    for item in rows:
        if isinstance(item, DocumentTemplateVersionPartialPin):
            code = str(item.partial_code)
            pvid = int(item.partial_version_id)
        else:
            code, pvid = item
        partial_version = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == pvid).first()
        if partial_version is None:
            raise DocumentTemplateError(f"Partial '{code}' — brak wersji {pvid}.", code="partial_not_found")
        partial_tpl = partial_version.template
        partial_code = str(partial_tpl.template_code or code)
        pins[partial_code] = str(partial_version.twig_content)
        nested = collect_all_include_codes(partial_version.twig_content)
        for nested_code in nested:
            if nested_code in pins:
                continue
            nested_pins = _load_pin_map(db, partial_version)
            if nested_code in nested_pins:
                pins[nested_code] = nested_pins[nested_code]
    return pins
