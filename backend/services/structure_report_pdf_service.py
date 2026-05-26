"""
HTML -> PDF for warehouse structure reports (Puppeteer via Node).
"""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
RENDER_FROM_URL_SCRIPT = BACKEND_ROOT / "scripts" / "structure_report_pdf" / "render_from_url.mjs"
RENDER_STDIN_SCRIPT = BACKEND_ROOT / "scripts" / "structure_report_pdf" / "render.mjs"
REPORT_TIMEOUT_MESSAGE = "Report rendering timeout - frontend not reachable or data failed to load"


def html_document_to_pdf_bytes(html: str, *, timeout_sec: int = 120) -> bytes:
    """
    Render a full HTML document to PDF via Puppeteer (stdin → stdout).
    Same stack as warehouse reports; avoids extra native deps (e.g. WeasyPrint on Windows).
    """
    if not RENDER_STDIN_SCRIPT.is_file():
        raise FileNotFoundError(
            f"Puppeteer render script missing: {RENDER_STDIN_SCRIPT}. "
            "Run: cd backend/scripts/structure_report_pdf && npm install"
        )
    html_s = (html or "").strip()
    if not html_s:
        raise ValueError("Empty HTML document")
    proc = subprocess.run(
        ["node", str(RENDER_STDIN_SCRIPT)],
        input=html_s.encode("utf-8"),
        capture_output=True,
        cwd=str(RENDER_STDIN_SCRIPT.parent),
        timeout=timeout_sec,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")
        logger.error("html_document_to_pdf_bytes node failed: %s", err)
        raise RuntimeError(f"PDF generation failed: {err or proc.stdout.decode('utf-8', errors='replace')}")
    return proc.stdout


def _frontend_report_url(path: str, warehouse_id: int, layout_id: int, tenant_id: int) -> str:
    base = os.getenv("FRONTEND_REPORT_BASE_URL", "http://localhost:5173")
    return (
        f"{base}{path}"
        f"?warehouse_id={warehouse_id}&layout_id={layout_id}&tenant_id={tenant_id}"
    )


def url_to_pdf_via_puppeteer(url: str) -> bytes:
    if not RENDER_FROM_URL_SCRIPT.is_file():
        raise FileNotFoundError(
            f"Puppeteer render script missing: {RENDER_FROM_URL_SCRIPT}. "
            "Run: cd backend/scripts/structure_report_pdf && npm install"
        )
    logger.info("Generating warehouse structure PDF from URL: %s", url)
    proc = subprocess.run(
        ["node", str(RENDER_FROM_URL_SCRIPT), url],
        capture_output=True,
        cwd=str(RENDER_FROM_URL_SCRIPT.parent),
        timeout=30,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")
        logger.error("structure_report_pdf (url) node failed: %s", err)
        if REPORT_TIMEOUT_MESSAGE in err:
            raise RuntimeError(REPORT_TIMEOUT_MESSAGE)
        raise RuntimeError(f"PDF generation failed: {err or proc.stdout.decode('utf-8', errors='replace')}")
    return proc.stdout


def generate_structure_report_pdf_bytes(warehouse_id: int, layout_id: int, tenant_id: int) -> bytes:
    report_url = _frontend_report_url(
        path="/report/warehouse-structure",
        warehouse_id=warehouse_id,
        layout_id=layout_id,
        tenant_id=tenant_id,
    )
    try:
        return url_to_pdf_via_puppeteer(report_url)
    except subprocess.TimeoutExpired as exc:
        logger.error("structure_report_pdf subprocess timed out for URL: %s", report_url)
        raise RuntimeError(REPORT_TIMEOUT_MESSAGE) from exc


def generate_product_location_report_pdf_bytes(warehouse_id: int, layout_id: int, tenant_id: int) -> bytes:
    report_url = _frontend_report_url(
        path="/report/product-locations",
        warehouse_id=warehouse_id,
        layout_id=layout_id,
        tenant_id=tenant_id,
    )
    try:
        return url_to_pdf_via_puppeteer(report_url)
    except subprocess.TimeoutExpired as exc:
        logger.error("product_location_report_pdf subprocess timed out for URL: %s", report_url)
        raise RuntimeError(REPORT_TIMEOUT_MESSAGE) from exc
