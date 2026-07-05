"""
HTML -> PDF for warehouse structure reports (Puppeteer via Node).
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

_PDF_RENDER_DEBUG_TRUTHY = frozenset({"1", "true", "yes", "on"})

BACKEND_ROOT = Path(__file__).resolve().parent.parent
RENDER_FROM_URL_SCRIPT = BACKEND_ROOT / "scripts" / "structure_report_pdf" / "render_from_url.mjs"
RENDER_STDIN_SCRIPT = BACKEND_ROOT / "scripts" / "structure_report_pdf" / "render.mjs"
RENDER_THUMBNAIL_SCRIPT = BACKEND_ROOT / "scripts" / "structure_report_pdf" / "render_thumbnail.mjs"
REPORT_TIMEOUT_MESSAGE = "Report rendering timeout - frontend not reachable or data failed to load"

_NODE_FALLBACK_PATHS = ("/usr/bin/node", "/usr/local/bin/node")


def pdf_render_debug_enabled() -> bool:
    return (os.getenv("PDF_RENDER_DEBUG") or "").strip().lower() in _PDF_RENDER_DEBUG_TRUTHY


def _prepare_pdf_render_debug_env(
    *,
    html: str,
    debug_label: str | None,
) -> tuple[dict[str, str], Path | None]:
    if not pdf_render_debug_enabled():
        return os.environ.copy(), None

    run_id = uuid.uuid4().hex[:12]
    debug_dir = Path(f"/tmp/pdf_render_debug/{run_id}")
    debug_dir.mkdir(parents=True, exist_ok=True)
    (debug_dir / "00_input_html_backend_copy.html").write_text(html, encoding="utf-8")

    env = os.environ.copy()
    env["PDF_RENDER_DEBUG"] = "1"
    env["PDF_RENDER_DEBUG_DIR"] = str(debug_dir)
    if debug_label:
        env["PDF_RENDER_DEBUG_LABEL"] = debug_label[:200]

    logger.warning(
        "PDF_RENDER_DEBUG run_id=%s dir=%s label=%s html_chars=%d",
        run_id,
        debug_dir,
        debug_label or "-",
        len(html),
    )
    return env, debug_dir


def _log_pdf_render_debug_result(*, debug_dir: Path, proc: subprocess.CompletedProcess[bytes]) -> None:
    stderr = proc.stderr.decode("utf-8", errors="replace").strip()
    if stderr:
        for line in stderr.splitlines():
            if line.startswith("[PDF_RENDER_DEBUG]"):
                logger.warning("PDF_RENDER_DEBUG %s", line)
            else:
                logger.warning("PDF_RENDER_DEBUG stderr: %s", line)

    summary_path = debug_dir / "summary.json"
    if summary_path.is_file():
        try:
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            logger.warning(
                "PDF_RENDER_DEBUG summary dir=%s dom_appears_empty=%s pdf_bytes=%s stage=%s message=%s",
                debug_dir,
                summary.get("dom_appears_empty"),
                summary.get("output_pdf_bytes"),
                (summary.get("interpretation") or {}).get("stage"),
                (summary.get("interpretation") or {}).get("message"),
            )
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("PDF_RENDER_DEBUG could not read summary.json: %s", exc)
    else:
        logger.warning(
            "PDF_RENDER_DEBUG artifacts dir=%s (no summary.json — check node stderr)",
            debug_dir,
        )

    logger.warning(
        "PDF_RENDER_DEBUG compare 05_pre_pdf_screenshot.png vs 09_output.pdf in %s",
        debug_dir,
    )


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


def html_document_to_pdf_bytes(
    html: str,
    *,
    timeout_sec: int = 120,
    debug_label: str | None = None,
) -> bytes:
    """
    Render a full HTML document to PDF via Puppeteer (stdin → stdout).
    Same stack as warehouse reports; avoids extra native deps (e.g. WeasyPrint on Windows).

    Set PDF_RENDER_DEBUG=1 on the backend to write /tmp/pdf_render_debug/{run_id}/ artifacts
    (HTML, DOM probes, screenshot before page.pdf(), output PDF, browser console/errors).
    """
    if not RENDER_STDIN_SCRIPT.is_file():
        raise FileNotFoundError(
            f"Puppeteer render script missing: {RENDER_STDIN_SCRIPT}. "
            "Run: cd backend/scripts/structure_report_pdf && npm install"
        )
    html_s = (html or "").strip()
    if not html_s:
        raise ValueError("Empty HTML document")
    node_bin = _node_executable()
    env, debug_dir = _prepare_pdf_render_debug_env(html=html_s, debug_label=debug_label)
    proc = subprocess.run(
        [node_bin, str(RENDER_STDIN_SCRIPT)],
        input=html_s.encode("utf-8"),
        capture_output=True,
        cwd=str(RENDER_STDIN_SCRIPT.parent),
        timeout=timeout_sec,
        env=env,
    )
    if debug_dir is not None:
        _log_pdf_render_debug_result(debug_dir=debug_dir, proc=proc)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")
        logger.error("html_document_to_pdf_bytes node failed: %s", err)
        raise RuntimeError(f"PDF generation failed: {err or proc.stdout.decode('utf-8', errors='replace')}")
    return proc.stdout


def html_to_thumbnail_png_bytes(html: str, *, timeout_sec: int = 90) -> bytes:
    """Render HTML to PNG thumbnail (A4 viewport) via Puppeteer — same Node stack as PDF."""
    if not RENDER_THUMBNAIL_SCRIPT.is_file():
        raise FileNotFoundError(f"Thumbnail render script missing: {RENDER_THUMBNAIL_SCRIPT}")
    html_s = (html or "").strip()
    if not html_s:
        raise ValueError("Empty HTML document")
    node_bin = _node_executable()
    proc = subprocess.run(
        [node_bin, str(RENDER_THUMBNAIL_SCRIPT)],
        input=html_s.encode("utf-8"),
        capture_output=True,
        cwd=str(RENDER_THUMBNAIL_SCRIPT.parent),
        timeout=timeout_sec,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")
        logger.error("html_to_thumbnail_png_bytes node failed: %s", err)
        raise RuntimeError(f"Thumbnail generation failed: {err or proc.stdout.decode('utf-8', errors='replace')}")
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
    node_bin = _node_executable()
    proc = subprocess.run(
        [node_bin, str(RENDER_FROM_URL_SCRIPT), url],
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
