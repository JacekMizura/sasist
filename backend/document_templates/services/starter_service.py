"""Starter export / import / clone for Document Templates editor."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ..errors import DocumentKindNotFoundError, DocumentTemplateError
from ..models import DocumentTemplateKind, DocumentTemplateStarter
from ..services.template_service import get_kind_by_code


def export_starter(db: Session, *, starter_id: int) -> dict[str, Any]:
    starter = db.query(DocumentTemplateStarter).filter(DocumentTemplateStarter.id == int(starter_id)).first()
    if starter is None:
        raise DocumentTemplateError("Starter nie istnieje.", code="not_found")
    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(starter.kind_id)).first()
    return {
        "format": "document_template_starter_v1",
        "kind_code": kind.code if kind else None,
        "code": starter.code,
        "name_pl": starter.name_pl,
        "description": starter.description,
        "twig_content": starter.twig_content,
        "is_system": bool(starter.is_system),
    }


def import_starter(
    db: Session,
    *,
    kind_code: str,
    payload: dict[str, Any],
    code: str | None = None,
) -> dict[str, Any]:
    kind = get_kind_by_code(db, kind_code=kind_code)
    starter_code = str(code or payload.get("code") or "imported").strip() or "imported"
    twig = str(payload.get("twig_content") or "").strip()
    if not twig:
        raise DocumentTemplateError("Brak treści Twig w imporcie.", code="invalid_payload")

    exists = (
        db.query(DocumentTemplateStarter)
        .filter(DocumentTemplateStarter.kind_id == int(kind.id), DocumentTemplateStarter.code == starter_code)
        .first()
    )
    if exists:
        raise DocumentTemplateError(f"Starter {starter_code} już istnieje.", code="duplicate")

    row = DocumentTemplateStarter(
        kind_id=int(kind.id),
        code=starter_code,
        name_pl=str(payload.get("name_pl") or f"Import — {starter_code}"),
        description=str(payload.get("description") or "Zaimportowany starter."),
        twig_content=twig,
        is_system=False,
        sort_order=10,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": int(row.id), "kind_code": kind_code, "code": starter_code}


def clone_starter(
    db: Session,
    *,
    starter_id: int,
    new_code: str | None = None,
    name_pl: str | None = None,
) -> dict[str, Any]:
    src = db.query(DocumentTemplateStarter).filter(DocumentTemplateStarter.id == int(starter_id)).first()
    if src is None:
        raise DocumentTemplateError("Starter nie istnieje.", code="not_found")
    kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(src.kind_id)).first()
    if kind is None:
        raise DocumentKindNotFoundError()

    code = str(new_code or f"{src.code}_copy").strip()
    row = DocumentTemplateStarter(
        kind_id=int(kind.id),
        code=code,
        name_pl=str(name_pl or f"{src.name_pl} (kopia)"),
        description=src.description,
        twig_content=str(src.twig_content),
        is_system=False,
        sort_order=int(src.sort_order or 0) + 1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": int(row.id), "kind_code": kind.code, "code": code}


def export_starter_json(db: Session, *, starter_id: int) -> str:
    return json.dumps(export_starter(db, starter_id=starter_id), ensure_ascii=False, indent=2)
