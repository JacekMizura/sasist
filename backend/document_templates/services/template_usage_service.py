"""Search where variables, helpers, partials and base templates are used."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from ..constants import TEMPLATE_ROLE_BASE, TEMPLATE_ROLE_PARTIAL
from ..models import DocumentTemplate, DocumentTemplateKind, DocumentTemplateVersion
from ..render.helper_registry import get_twig_helper_registry

_PARTIAL_RE = re.compile(r"""include_document\s+['"]([^'"]+)['"]""", re.IGNORECASE)
_EXTENDS_RE = re.compile(r"""extends\s+['"]([^'"]+)['"]""", re.IGNORECASE)


def search_symbol_usage(
    db: Session,
    *,
    tenant_id: int,
    symbol: str,
    symbol_type: str = "variable",
) -> list[dict[str, Any]]:
    sym = str(symbol or "").strip()
    if not sym:
        return []

    templates = db.query(DocumentTemplate).filter(DocumentTemplate.tenant_id == int(tenant_id)).all()
    hits: list[dict[str, Any]] = []

    for tpl in templates:
        versions = (
            db.query(DocumentTemplateVersion)
            .filter(DocumentTemplateVersion.template_id == int(tpl.id))
            .order_by(DocumentTemplateVersion.version_number.desc())
            .all()
        )
        kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(tpl.kind_id)).first() if tpl.kind_id else None
        for ver in versions:
            content = str(ver.twig_content or "")
            lines = content.splitlines()
            matched_lines: list[int] = []

            if symbol_type == "variable":
                pattern = re.compile(re.escape(sym.replace("[]", "")))
                for idx, line in enumerate(lines, start=1):
                    if pattern.search(line):
                        matched_lines.append(idx)
            elif symbol_type == "helper":
                pattern = re.compile(rf"\b{re.escape(sym)}\s*\(|\|\s*{re.escape(sym)}\b")
                for idx, line in enumerate(lines, start=1):
                    if pattern.search(line):
                        matched_lines.append(idx)
            elif symbol_type == "partial":
                for idx, line in enumerate(lines, start=1):
                    if sym in line and "include_document" in line:
                        matched_lines.append(idx)
            elif symbol_type == "base":
                for idx, line in enumerate(lines, start=1):
                    if sym in line and "extends" in line:
                        matched_lines.append(idx)

            if not matched_lines:
                continue

            hits.append(
                {
                    "template_id": int(tpl.id),
                    "template_name": tpl.name,
                    "template_code": tpl.template_code,
                    "template_role": tpl.template_role,
                    "kind_code": kind.code if kind else None,
                    "kind_name": kind.name_pl if kind else None,
                    "version_id": int(ver.id),
                    "version_number": int(ver.version_number),
                    "status": ver.status,
                    "lines": matched_lines,
                }
            )
    return hits


def list_known_helpers() -> list[str]:
    reg = get_twig_helper_registry()
    return sorted(set(reg.functions()) | set(reg.filters()))
