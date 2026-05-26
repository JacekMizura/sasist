"""Eksport/import JSON szablonów etykiet (bez zmiany logiki druku)."""

from __future__ import annotations

import json
import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.label_template import SavedLabelTemplate
from ..services.label_template_serializer import (
    SCHEMA_VERSION,
    apply_import,
    build_export_document,
    parse_import_payload,
    validate_export_item,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portability", tags=["Label template portability"])

TENANT_ID = 1


class ExportIdsBody(BaseModel):
    tenant_id: int = Field(default=TENANT_ID, ge=1)
    ids: list[int] = Field(..., min_length=1)


class ImportPreviewBody(BaseModel):
    tenant_id: int = Field(default=TENANT_ID, ge=1)
    payload: dict[str, Any]


class ImportCommitBody(BaseModel):
    tenant_id: int = Field(default=TENANT_ID, ge=1)
    mode: Literal["create_new", "overwrite_by_name", "duplicate_suffix"]
    templates: list[dict[str, Any]] = Field(default_factory=list)
    default_group_id: int | None = None


@router.post("/export")
def export_label_templates_json(body: ExportIdsBody, db: Session = Depends(get_db)):
    """Eksport wielu szablonów do jednego pliku JSON."""
    tid = body.tenant_id
    rows = (
        db.query(SavedLabelTemplate)
        .filter(SavedLabelTemplate.tenant_id == tid, SavedLabelTemplate.id.in_(body.ids))
        .order_by(SavedLabelTemplate.id)
        .all()
    )
    if len(rows) != len(set(body.ids)):
        found = {r.id for r in rows}
        missing = [i for i in body.ids if i not in found]
        raise HTTPException(status_code=404, detail=f"Nie znaleziono szablonów o id: {missing}")
    doc = build_export_document(rows)
    return doc


@router.post("/import-preview")
def import_label_templates_preview(body: ImportPreviewBody, db: Session = Depends(get_db)):
    """Walidacja pliku importu — zwraca listę szablonów i błędy."""
    _ = db
    items, errors = parse_import_payload(body.payload)
    raw_list = body.payload.get("templates") if isinstance(body.payload, dict) else None
    previews: list[dict[str, Any]] = []
    if isinstance(raw_list, list):
        for i, raw in enumerate(raw_list):
            if not isinstance(raw, dict):
                previews.append({"index": i, "name": None, "template_type": None, "valid": False, "error": "nie jest obiektem JSON"})
                continue
            err = validate_export_item(raw, i)
            previews.append(
                {
                    "index": i,
                    "name": raw.get("name"),
                    "template_type": raw.get("template_type"),
                    "source_id": raw.get("source_id"),
                    "valid": err is None,
                    "error": err,
                }
            )
    return {
        "schema_version": body.payload.get("schema_version") if isinstance(body.payload, dict) else None,
        "kind": body.payload.get("kind") if isinstance(body.payload, dict) else None,
        "valid_count": len(items),
        "error_count": len(errors),
        "errors": errors,
        "previews": previews,
        "normalized_templates": items,
    }


@router.post("/import-commit")
def import_label_templates_commit(body: ImportCommitBody, db: Session = Depends(get_db)):
    """Zapis szablonów po wyborze strategii kolizji nazw."""
    if not body.templates:
        raise HTTPException(status_code=400, detail="Brak szablonów do importu")
    errors: list[str] = []
    clean: list[dict[str, Any]] = []
    for i, t in enumerate(body.templates):
        if not isinstance(t, dict):
            errors.append(f"[{i}] nie jest obiektem")
            continue
        err = validate_export_item(t, i)
        if err:
            errors.append(err)
            continue
        tj = t.get("template_json")
        if isinstance(tj, dict):
            tj = json.dumps(tj, ensure_ascii=False)
        clean.append(
            {
                "name": str(t.get("name", "")).strip() or "Import",
                "template_type": t.get("template_type"),
                "template_json": str(tj),
            }
        )
    if errors and not clean:
        raise HTTPException(status_code=400, detail="; ".join(errors[:5]))
    try:
        summary = apply_import(
            db,
            body.tenant_id,
            clean,
            mode=body.mode,
            default_group_id=body.default_group_id,
        )
    except Exception as e:
        logger.exception("label import commit failed")
        raise HTTPException(status_code=500, detail=str(e)) from e
    summary["validation_errors"] = errors
    return summary
