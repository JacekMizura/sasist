"""Seed default commercial document templates in label template library (Dokumenty)."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.label_template import SavedLabelTemplate
from .document_print_template_catalog import PRINT_TEMPLATE_PRESETS

logger = logging.getLogger(__name__)

_DOCUMENT_TEMPLATE_TYPES: dict[str, dict] = {
    "document_receipt": {"preset_id": 2, "label_pl": "Paragon"},
    "document_invoice": {"preset_id": 1, "label_pl": "Faktura VAT"},
    "document_wz": {"preset_id": 3, "label_pl": "WZ"},
    "document_correction": {"preset_id": 4, "label_pl": "Korekta"},
}

_PLACEHOLDER_LINES = [
    "{{document.number}}",
    "{{document.date}}",
    "{{customer.name}}",
    "{{customer.address}}",
    "{{items}}",
    "{{summary.net}}",
    "{{summary.gross}}",
    "{{payment.method}}",
]


def _build_template_json(*, preset_id: int, label_pl: str, jinja_file: str) -> str:
    elements = []
    y = 12.0
    for line in _PLACEHOLDER_LINES:
        elements.append(
            {
                "id": f"ph-{line}",
                "type": "text",
                "x": 10,
                "y": y,
                "width": 190,
                "height": 8,
                "content": line,
                "fontSize": 10,
                "fontWeight": "normal",
                "align": "left",
            }
        )
        y += 9.0
    payload = {
        "widthMm": 210,
        "heightMm": 297,
        "template_type": "document",
        "documentPresetId": preset_id,
        "jinjaTemplate": jinja_file,
        "label": label_pl,
        "elements": elements,
    }
    return json.dumps(payload, ensure_ascii=False)


def seed_default_document_label_templates(db: Session, *, tenant_id: int = 1) -> int:
    """Idempotent — one default template per document subtype for tenant."""
    created = 0
    tid = int(tenant_id)
    for template_type, meta in _DOCUMENT_TEMPLATE_TYPES.items():
        preset_id = int(meta["preset_id"])
        preset = PRINT_TEMPLATE_PRESETS.get(preset_id) or {}
        jinja_file = str(preset.get("file") or "")
        name = f"{meta['label_pl']} — szablon domyślny"

        existing = (
            db.query(SavedLabelTemplate)
            .filter(
                SavedLabelTemplate.tenant_id == tid,
                SavedLabelTemplate.template_type == template_type,
                SavedLabelTemplate.name == name,
            )
            .first()
        )
        if existing is not None:
            continue

        row = SavedLabelTemplate(
            tenant_id=tid,
            name=name,
            template_type=template_type,
            template_json=_build_template_json(
                preset_id=preset_id,
                label_pl=str(meta["label_pl"]),
                jinja_file=jinja_file,
            ),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
        created += 1
        logger.info(
            "[document_label_template.seed] tenant_id=%s type=%s name=%s",
            tid,
            template_type,
            name,
        )

    if created:
        db.commit()
    return created
