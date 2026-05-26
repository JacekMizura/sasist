"""
Eksport / import szablonów etykiet (SavedLabelTemplate) — JSON z polem schema_version.

Nie modyfikuje ścieżek druku PDF; walidacja przez validate_template_json.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..models.label_template import SavedLabelTemplate
from .label_render_service import validate_template_json

LABEL_EXPORT_KIND = "wms_label_templates"
SCHEMA_VERSION = 1

_DANGEROUS_SUBSTR = re.compile(r"<\s*script|javascript\s*:", re.IGNORECASE)


def _strip_cycles(obj: Any) -> Any:
    """Zwraca strukturę JSON-safe (bez obiektów niestandardowych)."""
    return json.loads(json.dumps(obj, default=str))


def template_row_to_export_item(row: SavedLabelTemplate) -> dict[str, Any]:
    raw = row.template_json or ""
    if isinstance(raw, dict):
        raw = json.dumps(raw, ensure_ascii=False)
    return {
        "source_id": row.id,
        "name": (row.name or "").strip() or "Bez nazwy",
        "template_type": row.template_type,
        "group_id": getattr(row, "group_id", None),
        "template_json": raw,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def build_export_document(rows: list[SavedLabelTemplate]) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "kind": LABEL_EXPORT_KIND,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "templates": [template_row_to_export_item(r) for r in rows],
    }


def _reject_dangerous_string(s: str) -> str | None:
    if _DANGEROUS_SUBSTR.search(s or ""):
        return "Potencjalnie niebezpieczna zawartość w template_json"
    return None


def validate_export_item(item: Any, index: int) -> str | None:
    if not isinstance(item, dict):
        return f"templates[{index}] musi być obiektem"
    name = item.get("name")
    if not name or not str(name).strip():
        return f"templates[{index}]: brak nazwy"
    ttype = item.get("template_type")
    if ttype is not None and not isinstance(ttype, str):
        return f"templates[{index}]: template_type musi być stringiem lub null"
    tj = item.get("template_json")
    if tj is None:
        return f"templates[{index}]: brak template_json"
    if isinstance(tj, dict):
        tj_str = json.dumps(tj, ensure_ascii=False)
    elif isinstance(tj, str):
        tj_str = tj
    else:
        return f"templates[{index}]: template_json musi być stringiem lub obiektem JSON"
    dang = _reject_dangerous_string(tj_str)
    if dang:
        return f"templates[{index}]: {dang}"
    err = validate_template_json(tj_str)
    if err:
        return f"templates[{index}]: {err}"
    return None


def parse_import_payload(data: Any) -> tuple[list[dict[str, Any]], list[str]]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return [], ["Plik musi być obiektem JSON"]
    kind = data.get("kind")
    if kind is not None and kind != LABEL_EXPORT_KIND:
        errors.append(f"Nieznany kind: {kind!r} (oczekiwano {LABEL_EXPORT_KIND!r} lub brak)")
    templates = data.get("templates")
    if not isinstance(templates, list):
        return [], ["Brak tablicy 'templates'"]
    out: list[dict[str, Any]] = []
    for i, item in enumerate(templates):
        err = validate_export_item(item, i)
        if err:
            errors.append(err)
            continue
        assert isinstance(item, dict)
        tj = item["template_json"]
        if isinstance(tj, dict):
            tj_str = json.dumps(_strip_cycles(tj), ensure_ascii=False)
        else:
            tj_str = str(tj)
        out.append(
            {
                "source_id": item.get("source_id"),
                "name": str(item.get("name", "")).strip(),
                "template_type": item.get("template_type"),
                "group_id": item.get("group_id"),
                "template_json": tj_str,
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
            }
        )
    return out, errors


def _free_name(db: Session, tenant_id: int, base: str, template_type: str | None) -> str:
    name = base
    n = 1
    while True:
        q = db.query(SavedLabelTemplate).filter(SavedLabelTemplate.tenant_id == tenant_id, SavedLabelTemplate.name == name)
        if template_type:
            q = q.filter(SavedLabelTemplate.template_type == template_type)
        if q.first() is None:
            return name
        n += 1
        name = f"{base} ({n})"


def apply_import(
    db: Session,
    tenant_id: int,
    items: list[dict[str, Any]],
    *,
    mode: str,
    default_group_id: int | None = None,
) -> dict[str, Any]:
    """
    mode: create_new | overwrite_by_name | duplicate_suffix
    """
    created = 0
    updated = 0
    skipped = 0
    details: list[dict[str, Any]] = []

    for it in items:
        name = (it.get("name") or "").strip() or "Import"
        ttype = it.get("template_type")
        tj = it.get("template_json")
        if not isinstance(tj, str):
            skipped += 1
            details.append({"name": name, "action": "skip", "reason": "invalid template_json"})
            continue
        err = validate_template_json(tj)
        if err:
            skipped += 1
            details.append({"name": name, "action": "skip", "reason": err})
            continue

        gid = default_group_id
        if mode == "create_new":
            row = SavedLabelTemplate(
                tenant_id=tenant_id,
                name=name,
                template_type=ttype,
                template_json=tj,
                group_id=gid,
            )
            db.add(row)
            db.flush()
            created += 1
            details.append({"name": name, "action": "created"})
        elif mode == "overwrite_by_name":
            q = db.query(SavedLabelTemplate).filter(
                SavedLabelTemplate.tenant_id == tenant_id,
                SavedLabelTemplate.name == name,
            )
            if ttype is not None:
                q = q.filter(SavedLabelTemplate.template_type == ttype)
            existing = q.first()
            if existing:
                existing.template_json = tj
                if ttype is not None:
                    existing.template_type = ttype
                if gid is not None:
                    existing.group_id = gid
                updated += 1
                details.append({"name": name, "action": "updated"})
            else:
                row = SavedLabelTemplate(
                    tenant_id=tenant_id,
                    name=name,
                    template_type=ttype,
                    template_json=tj,
                    group_id=gid,
                )
                db.add(row)
                db.flush()
                created += 1
                details.append({"name": name, "action": "created"})
        elif mode == "duplicate_suffix":
            final_name = _free_name(db, tenant_id, f"{name} (import)", ttype)
            row = SavedLabelTemplate(
                tenant_id=tenant_id,
                name=final_name,
                template_type=ttype,
                template_json=tj,
                group_id=gid,
            )
            db.add(row)
            db.flush()
            created += 1
            details.append({"name": final_name, "action": "created"})
        else:
            skipped += 1
            details.append({"name": name, "action": "skip", "reason": f"unknown mode {mode!r}"})

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "details": details}
