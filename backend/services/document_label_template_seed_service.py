"""Seed default commercial document templates in label template library (Dokumenty)."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from ..models.label_template import SavedLabelTemplate
from .document_print_template_catalog import PRINT_TEMPLATE_PRESETS, TEMPLATES_DIR

logger = logging.getLogger(__name__)

_DOCUMENT_SEED_SPECS: list[dict] = [
    {
        "slug": "builtin:document_receipt_a4",
        "template_type": "document_receipt",
        "preset_id": 2,
        "name": "Paragon A4",
        "category": "Dokumenty",
    },
    {
        "slug": "builtin:document_invoice_a4",
        "template_type": "document_invoice",
        "preset_id": 1,
        "name": "Faktura VAT A4",
        "category": "Dokumenty",
    },
    {
        "slug": "builtin:document_wz_a4",
        "template_type": "document_wz",
        "preset_id": 3,
        "name": "WZ A4",
        "category": "Dokumenty",
    },
    {
        "slug": "builtin:document_correction_a4",
        "template_type": "document_correction",
        "preset_id": 4,
        "name": "Korekta A4",
        "category": "Dokumenty",
    },
]

_DOCUMENT_VARIABLES = [
    "{{ document.number }}",
    "{{ document.date }}",
    "{{ customer.name }}",
    "{{ customer.address }}",
    "{{ company.name }}",
    "{{ items }}",
    "{{ totals.net }}",
    "{{ totals.vat }}",
    "{{ totals.gross }}",
    "{{ payment.method }}",
    "{{ warehouse.name }}",
]


def _load_css_text() -> str:
    css_path = TEMPLATES_DIR / "sale_document_base.css"
    return css_path.read_text(encoding="utf-8") if css_path.is_file() else ""


def _load_html_body(preset_id: int) -> str:
    preset = PRINT_TEMPLATE_PRESETS.get(int(preset_id)) or {}
    jinja_file = str(preset.get("file") or "")
    path = TEMPLATES_DIR / jinja_file
    if not path.is_file():
        return ""
    html = path.read_text(encoding="utf-8")
    return html.replace("{% include 'sale_document_base.css' %}", "")


def _find_by_seed_slug(db: Session, tenant_id: int, slug: str) -> SavedLabelTemplate | None:
    rows = (
        db.query(SavedLabelTemplate)
        .filter(SavedLabelTemplate.tenant_id == int(tenant_id))
        .all()
    )
    for row in rows:
        try:
            data = json.loads(row.template_json or "{}")
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if str(data.get("seedSlug") or "") == slug:
            return row
    return None


def _build_template_json(*, spec: dict, jinja_file: str, html_body: str, css_text: str) -> str:
    elements = []
    y = 12.0
    for line in _DOCUMENT_VARIABLES[:8]:
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
        "documentPresetId": int(spec["preset_id"]),
        "seedSlug": str(spec["slug"]),
        "category": str(spec["category"]),
        "jinjaTemplate": jinja_file,
        "htmlContent": html_body,
        "cssContent": css_text,
        "variables": list(_DOCUMENT_VARIABLES),
        "label": str(spec["name"]),
        "elements": elements,
    }
    return json.dumps(payload, ensure_ascii=False)


def seed_default_document_label_templates(db: Session, *, tenant_id: int = 1) -> int:
    """Idempotent — one built-in A4 template per document subtype (stable seedSlug)."""
    created = 0
    tid = int(tenant_id)
    css_text = _load_css_text()

    for spec in _DOCUMENT_SEED_SPECS:
        slug = str(spec["slug"])
        preset_id = int(spec["preset_id"])
        preset = PRINT_TEMPLATE_PRESETS.get(preset_id) or {}
        jinja_file = str(preset.get("file") or "")
        name = str(spec["name"])
        html_body = _load_html_body(preset_id)

        existing = _find_by_seed_slug(db, tid, slug)
        if existing is not None:
            continue

        row = SavedLabelTemplate(
            tenant_id=tid,
            name=name,
            template_type=str(spec["template_type"]),
            template_json=_build_template_json(
                spec=spec,
                jinja_file=jinja_file,
                html_body=html_body,
                css_text=css_text,
            ),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
        created += 1
        logger.info(
            "[document_label_template.seed] tenant_id=%s slug=%s name=%s preset_id=%s",
            tid,
            slug,
            name,
            preset_id,
        )

    if created:
        db.commit()
    return created


def ensure_document_label_templates_for_all_tenants(db: Session) -> int:
    """Seed document templates for every tenant (startup hook)."""
    from ..models.tenant import Tenant

    total = 0
    for (tid,) in db.query(Tenant.id).all():
        total += seed_default_document_label_templates(db, tenant_id=int(tid))
    return total
