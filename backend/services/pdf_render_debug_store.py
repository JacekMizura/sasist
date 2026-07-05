"""Persist and serve the latest PDF render debug bundle (PDF_RENDER_DEBUG=1 only)."""

from __future__ import annotations

import base64
import json
import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PDF_RENDER_DEBUG_LATEST_DIR = BACKEND_ROOT / "uploads" / "pdf_render_debug" / "latest"
_PDF_RENDER_DEBUG_TRUTHY = frozenset({"1", "true", "yes", "on"})

SUMMARY_FILE = "summary.json"
INPUT_HTML_FILE = "00_input_html.html"
SCREENSHOT_FILE = "05_pre_pdf_screenshot.png"
OUTPUT_PDF_FILE = "09_output.pdf"
CONSOLE_FILE = "06_browser_console.jsonl"
PAGE_ERRORS_FILE = "07_page_errors.jsonl"
FAILED_REQUESTS_FILE = "08_failed_requests.jsonl"


def pdf_render_debug_enabled() -> bool:
    return (os.getenv("PDF_RENDER_DEBUG") or "").strip().lower() in _PDF_RENDER_DEBUG_TRUTHY


def pdf_render_debug_latest_dir() -> Path:
    return PDF_RENDER_DEBUG_LATEST_DIR


def prepare_pdf_render_debug_dir() -> Path:
    """Clear and recreate uploads/pdf_render_debug/latest/ for the next run."""
    debug_dir = pdf_render_debug_latest_dir()
    if debug_dir.exists():
        shutil.rmtree(debug_dir)
    debug_dir.mkdir(parents=True, exist_ok=True)
    return debug_dir


def _read_text(path: Path) -> str | None:
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def _read_json(path: Path) -> dict | None:
    raw = _read_text(path)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _read_jsonl(path: Path) -> list[dict]:
    raw = _read_text(path)
    if not raw:
        return []
    items: list[dict] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            items.append(json.loads(line))
        except json.JSONDecodeError:
            items.append({"raw": line})
    return items


def latest_debug_bundle_exists() -> bool:
    return (PDF_RENDER_DEBUG_LATEST_DIR / SUMMARY_FILE).is_file()


def load_latest_debug_payload(*, include_screenshot_base64: bool = True) -> dict:
    base = pdf_render_debug_latest_dir()
    summary = _read_json(base / SUMMARY_FILE)
    html = _read_text(base / INPUT_HTML_FILE)
    screenshot_path = base / SCREENSHOT_FILE
    payload: dict = {
        "enabled": pdf_render_debug_enabled(),
        "debug_dir": str(base),
        "summary": summary,
        "html": html,
        "html_length": len(html) if html is not None else 0,
        "console": _read_jsonl(base / CONSOLE_FILE),
        "page_errors": _read_jsonl(base / PAGE_ERRORS_FILE),
        "request_failures": _read_jsonl(base / FAILED_REQUESTS_FILE),
        "artifacts_present": {
            "summary": (base / SUMMARY_FILE).is_file(),
            "input_html": (base / INPUT_HTML_FILE).is_file(),
            "screenshot": screenshot_path.is_file(),
            "output_pdf": (base / OUTPUT_PDF_FILE).is_file(),
            "console": (base / CONSOLE_FILE).is_file(),
            "page_errors": (base / PAGE_ERRORS_FILE).is_file(),
            "request_failures": (base / FAILED_REQUESTS_FILE).is_file(),
        },
        "links": {
            "self": "/api/document-templates/debug/pdf-render/latest",
            "html": "/api/document-templates/debug/pdf-render/latest/html",
            "screenshot": "/api/document-templates/debug/pdf-render/latest/screenshot",
            "pdf": "/api/document-templates/debug/pdf-render/latest/pdf",
        },
    }
    if include_screenshot_base64 and screenshot_path.is_file():
        payload["screenshot_base64"] = base64.b64encode(screenshot_path.read_bytes()).decode("ascii")
        payload["screenshot_media_type"] = "image/png"
    else:
        payload["screenshot_base64"] = None
    return payload


def read_latest_screenshot_bytes() -> bytes | None:
    path = pdf_render_debug_latest_dir() / SCREENSHOT_FILE
    if not path.is_file():
        return None
    return path.read_bytes()


def read_latest_html() -> str | None:
    return _read_text(pdf_render_debug_latest_dir() / INPUT_HTML_FILE)


def read_latest_pdf_bytes() -> bytes | None:
    path = pdf_render_debug_latest_dir() / OUTPUT_PDF_FILE
    if not path.is_file():
        return None
    return path.read_bytes()
