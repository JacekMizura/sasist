"""
HTML → PDF/PNG via Puppeteer (Node subprocess).
Used by DTE, warehouse reports, and legacy Jinja print path.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
RENDER_FROM_URL_SCRIPT = BACKEND_ROOT / "scripts" / "structure_report_pdf" / "render_from_url.mjs"
RENDER_STDIN_SCRIPT = BACKEND_ROOT / "scripts" / "structure_report_pdf" / "render.mjs"
RENDER_THUMBNAIL_SCRIPT = BACKEND_ROOT / "scripts" / "structure_report_pdf" / "render_thumbnail.mjs"
REPORT_TIMEOUT_MESSAGE = "Report rendering timeout - frontend not reachable or data failed to load"

_NODE_FALLBACK_PATHS = ("/usr/bin/node", "/usr/local/bin/node")

_UPLOADS_ROOT = BACKEND_ROOT / "uploads"
_UPLOAD_SRC_RE = re.compile(r'src="(/uploads/[^"]+)"')


def _inline_upload_src_urls(html: str) -> str:
    """Map /uploads/... img src to file:// so Puppeteer setContent can load logos locally."""
    uploads_root = _UPLOADS_ROOT.resolve()

    def _repl(match: re.Match[str]) -> str:
        rel = match.group(1)
        disk = (uploads_root / rel.removeprefix("/uploads/").lstrip("/")).resolve()
        try:
            disk.relative_to(uploads_root)
        except ValueError:
            return match.group(0)
        if disk.is_file():
            return f'src="{disk.as_uri()}"'
        return match.group(0)

    return _UPLOAD_SRC_RE.sub(_repl, html)


def _node_executable() -> str:
    override = (os.getenv("NODE_BIN") or "").strip()
    if override:
        path = Path(override)
        if path.is_file():
            return str(path)
        raise FileNotFoundError(f"NODE_BIN is set but not executable: {override}")
    found = shutil.which("node")
    if found:
        return found
    for candidate in _NODE_FALLBACK_PATHS:
        if Path(candidate).is_file():
            return candidate
    raise FileNotFoundError(
        "Node.js executable not found. Deploy backend with Dockerfile (Node 20). "
        f"PATH={os.environ.get('PATH', '')!r}"
    )


def _run_node_script(
    script: Path,
    *,
    timeout_sec: int,
    failure_label: str,
    stdin_payload: bytes | None = None,
    args: list[str] | None = None,
) -> bytes:
    if not script.is_file():
        raise FileNotFoundError(
            f"{failure_label}: script missing ({script}). "
            "Run: cd backend/scripts/structure_report_pdf && npm install"
        )
    node_bin = _node_executable()
    cmd = [node_bin, str(script), *(args or [])]
    try:
        proc = subprocess.run(
            cmd,
            input=stdin_payload,
            capture_output=True,
            cwd=str(script.parent),
            timeout=timeout_sec,
        )
    except subprocess.TimeoutExpired as exc:
        stderr = (exc.stderr or b"").decode("utf-8", errors="replace")
        stdout = (exc.stdout or b"").decode("utf-8", errors="replace")
        logger.error(
            "%s subprocess timeout after %ss stderr=%r stdout=%r",
            failure_label,
            timeout_sec,
            stderr,
            stdout[:2000],
            exc_info=True,
        )
        raise RuntimeError(f"{failure_label} timed out after {timeout_sec}s") from exc

    stderr = proc.stderr.decode("utf-8", errors="replace")
    if proc.returncode != 0:
        stdout_hint = proc.stdout.decode("utf-8", errors="replace")
        logger.error(
            "%s node failed returncode=%s stderr=%r stdout=%r",
            failure_label,
            proc.returncode,
            stderr,
            stdout_hint[:2000],
            exc_info=True,
        )
        if REPORT_TIMEOUT_MESSAGE in stderr:
            raise RuntimeError(REPORT_TIMEOUT_MESSAGE)
        raise RuntimeError(f"{failure_label} failed: {stderr or stdout_hint}")
    if not proc.stdout:
        logger.error(
            "%s empty stdout returncode=%s stderr=%r",
            failure_label,
            proc.returncode,
            stderr,
            exc_info=True,
        )
        raise RuntimeError(f"{failure_label} failed: empty output")
    return proc.stdout


def html_document_to_pdf_bytes(html: str, *, timeout_sec: int = 120) -> bytes:
    """Render a full HTML document to PDF via Puppeteer (stdin → stdout)."""
    html_s = _inline_upload_src_urls((html or "").strip())
    if not html_s:
        raise ValueError("Empty HTML document")
    pdf = _run_node_script(
        RENDER_STDIN_SCRIPT,
        stdin_payload=html_s.encode("utf-8"),
        timeout_sec=timeout_sec,
        failure_label="PDF generation",
    )
    if len(pdf) < 500:
        logger.warning("html_document_to_pdf_bytes: suspiciously small PDF (%d bytes)", len(pdf))
    if not pdf.startswith(b"%PDF"):
        raise RuntimeError("PDF generation failed: invalid PDF header")
    return pdf


def html_to_thumbnail_png_bytes(html: str, *, timeout_sec: int = 90) -> bytes:
    """Render HTML to PNG thumbnail (A4 viewport) via Puppeteer."""
    html_s = _inline_upload_src_urls((html or "").strip())
    if not html_s:
        raise ValueError("Empty HTML document")
    return _run_node_script(
        RENDER_THUMBNAIL_SCRIPT,
        stdin_payload=html_s.encode("utf-8"),
        timeout_sec=timeout_sec,
        failure_label="Thumbnail generation",
    )


def _frontend_report_url(path: str, warehouse_id: int, layout_id: int, tenant_id: int) -> str:
    base = os.getenv("FRONTEND_REPORT_BASE_URL", "http://localhost:5173")
    return (
        f"{base}{path}"
        f"?warehouse_id={warehouse_id}&layout_id={layout_id}&tenant_id={tenant_id}"
    )


def url_to_pdf_via_puppeteer(url: str) -> bytes:
    logger.info("Generating warehouse structure PDF from URL: %s", url)
    return _run_node_script(
        RENDER_FROM_URL_SCRIPT,
        args=[url],
        timeout_sec=30,
        failure_label="URL PDF generation",
    )


def generate_structure_report_pdf_bytes(warehouse_id: int, layout_id: int, tenant_id: int) -> bytes:
    report_url = _frontend_report_url(
        path="/report/warehouse-structure",
        warehouse_id=warehouse_id,
        layout_id=layout_id,
        tenant_id=tenant_id,
    )
    return url_to_pdf_via_puppeteer(report_url)


def generate_product_location_report_pdf_bytes(warehouse_id: int, layout_id: int, tenant_id: int) -> bytes:
    report_url = _frontend_report_url(
        path="/report/product-locations",
        warehouse_id=warehouse_id,
        layout_id=layout_id,
        tenant_id=tenant_id,
    )
    return url_to_pdf_via_puppeteer(report_url)
