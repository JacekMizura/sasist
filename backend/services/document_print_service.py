"""Commercial document print — template resolution, HTML render, PDF bytes."""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, TemplateNotFound, select_autoescape
from sqlalchemy.orm import Session

from ..models.label_template import SavedLabelTemplate
from .document_print_template_catalog import (
    DEFAULT_PRINT_TEMPLATE_ID_BY_SUBTYPE,
    PRINT_TEMPLATE_PRESETS,
    TEMPLATES_DIR,
    resolve_template_filename,
)
from .structure_report_pdf_service import RENDER_STDIN_SCRIPT

logger = logging.getLogger(__name__)

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "j2"]),
)

_PRESET_TO_TEMPLATE_TYPE: dict[int, str] = {
    1: "document_invoice",
    2: "document_receipt",
    3: "document_wz",
    4: "document_correction",
}


class PdfRendererUnavailable(RuntimeError):
    """Raised when the Node/Puppeteer PDF renderer is missing or failed."""

    def __init__(self, message: str = "PDF renderer unavailable") -> None:
        super().__init__(message)


def _inline_css_in_jinja_html(html: str) -> str:
    css_path = TEMPLATES_DIR / "sale_document_base.css"
    css = css_path.read_text(encoding="utf-8") if css_path.is_file() else ""
    return html.replace("{% include 'sale_document_base.css' %}", css)


def _load_builtin_jinja_html(preset_file: str) -> str:
    path = TEMPLATES_DIR / preset_file
    if not path.is_file():
        raise TemplateNotFound(preset_file)
    return _inline_css_in_jinja_html(path.read_text(encoding="utf-8"))


def _load_custom_template_html(db: Session, *, tenant_id: int, preset_id: int) -> tuple[str | None, str | None]:
    ttype = _PRESET_TO_TEMPLATE_TYPE.get(int(preset_id))
    if not ttype:
        return None, None
    rows = (
        db.query(SavedLabelTemplate)
        .filter(
            SavedLabelTemplate.tenant_id == int(tenant_id),
            SavedLabelTemplate.template_type == ttype,
        )
        .order_by(SavedLabelTemplate.updated_at.desc())
        .all()
    )
    for row in rows:
        try:
            data = json.loads(row.template_json or "{}")
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if int(data.get("documentPresetId") or 0) != int(preset_id):
            continue
        html = str(data.get("htmlContent") or "").strip()
        if html:
            css = str(data.get("cssContent") or "").strip()
            return html, css or None
    return None, None


def resolve_document_template(
    db: Session,
    *,
    tenant_id: int,
    print_template_id: int | None,
    print_template_path: str | None,
    document_subtype: str | None,
) -> tuple[int, str]:
    """Return (preset_id, jinja_filename) with safe subtype fallback."""
    preset_id = int(print_template_id) if print_template_id else None
    if preset_id is None or preset_id not in PRINT_TEMPLATE_PRESETS:
        sub = str(document_subtype or "").strip().upper()
        preset_id = DEFAULT_PRINT_TEMPLATE_ID_BY_SUBTYPE.get(sub, 2)
    jinja_file = resolve_template_filename(
        print_template_id=preset_id,
        print_template_path=print_template_path,
        document_subtype=document_subtype,
    )
    return int(preset_id), jinja_file


def render_document_html(
    db: Session,
    *,
    tenant_id: int,
    preset_id: int,
    jinja_file: str,
    context: dict[str, Any],
) -> str:
    custom_html, custom_css = _load_custom_template_html(db, tenant_id=tenant_id, preset_id=preset_id)
    if custom_html:
        logger.info(
            "[document_print] using custom template tenant_id=%s preset_id=%s bytes=%s",
            tenant_id,
            preset_id,
            len(custom_html),
        )
        body = custom_html
        if custom_css and "<style>" not in body.lower():
            body = f"<style>{custom_css}</style>\n{body}"
        template = _env.from_string(body)
        return template.render(**context)

    logger.info(
        "[document_print] using builtin jinja tenant_id=%s preset_id=%s file=%s path=%s",
        tenant_id,
        preset_id,
        jinja_file,
        TEMPLATES_DIR / jinja_file,
    )
    try:
        template = _env.get_template(jinja_file)
        return template.render(**context)
    except TemplateNotFound:
        logger.warning(
            "[document_print] template file missing (%s) — loading inlined fallback",
            jinja_file,
        )
        html_src = _load_builtin_jinja_html(jinja_file)
        return _env.from_string(html_src).render(**context)


def html_to_pdf_bytes(html: str, *, timeout_sec: int = 120) -> bytes:
    if not RENDER_STDIN_SCRIPT.is_file():
        logger.error("[document_print] puppeteer script missing: %s", RENDER_STDIN_SCRIPT)
        raise PdfRendererUnavailable(
            "PDF renderer unavailable: run npm install in backend/scripts/structure_report_pdf"
        )
    html_s = (html or "").strip()
    if not html_s:
        raise ValueError("Empty HTML document")
    try:
        proc = subprocess.run(
            ["node", str(RENDER_STDIN_SCRIPT)],
            input=html_s.encode("utf-8"),
            capture_output=True,
            cwd=str(RENDER_STDIN_SCRIPT.parent),
            timeout=timeout_sec,
        )
    except subprocess.TimeoutExpired as exc:
        logger.exception("[document_print] PDF renderer timed out after %ss", timeout_sec)
        raise PdfRendererUnavailable("PDF renderer unavailable: timeout") from exc
    except OSError as exc:
        logger.exception("[document_print] PDF renderer process failed to start")
        raise PdfRendererUnavailable("PDF renderer unavailable") from exc

    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")
        logger.error("[document_print] node renderer failed rc=%s stderr=%s", proc.returncode, err)
        raise PdfRendererUnavailable(f"PDF renderer unavailable: {err or 'unknown error'}")

    pdf = proc.stdout
    if not pdf or len(pdf) < 5 or not pdf.startswith(b"%PDF"):
        logger.error("[document_print] invalid PDF output (len=%s)", len(pdf or b""))
        raise PdfRendererUnavailable("PDF renderer unavailable: invalid output")
    return pdf


def build_document_pdf_from_html(
    db: Session,
    *,
    tenant_id: int,
    print_template_id: int | None,
    print_template_path: str | None,
    document_subtype: str | None,
    context: dict[str, Any],
    log_label: str,
) -> bytes:
    preset_id, jinja_file = resolve_document_template(
        db,
        tenant_id=tenant_id,
        print_template_id=print_template_id,
        print_template_path=print_template_path,
        document_subtype=document_subtype,
    )
    logger.info(
        "[document_print] start %s tenant_id=%s preset_id=%s template=%s subtype=%s",
        log_label,
        tenant_id,
        preset_id,
        jinja_file,
        document_subtype,
    )
    html = render_document_html(
        db,
        tenant_id=tenant_id,
        preset_id=preset_id,
        jinja_file=jinja_file,
        context=context,
    )
    pdf = html_to_pdf_bytes(html)
    logger.info("[document_print] done %s pdf_bytes=%s", log_label, len(pdf))
    return pdf
