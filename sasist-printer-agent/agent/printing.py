"""Download PDF and send to Windows print spooler."""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from .api import ApiError, SasistApiClient

logger = logging.getLogger(__name__)


def _resolve_pdf_url(server_url: str, pdf_url: str) -> str:
    pdf_url = pdf_url.strip()
    if pdf_url.startswith("http://") or pdf_url.startswith("https://"):
        return pdf_url
    return urljoin(server_url.rstrip("/") + "/", pdf_url.lstrip("/"))


def download_pdf(client: SasistApiClient, job: dict[str, Any], *, server_url: str) -> Path:
    job_id = job.get("id")
    payload = job.get("payload") or {}
    pdf_url = payload.get("pdf_url")
    if not pdf_url:
        raise ApiError(f"Job {job_id} missing payload.pdf_url")

    resolved = _resolve_pdf_url(server_url, str(pdf_url))
    content = client.download_url(resolved)

    temp_dir = Path(tempfile.gettempdir())
    target = temp_dir / f"sasist-print-{job_id}.pdf"
    target.write_bytes(content)
    logger.info("Downloaded PDF for job %s -> %s (%s bytes)", job_id, target, len(content))
    return target


def print_pdf(file_path: Path, printer_name: str, *, copies: int = 1) -> None:
    try:
        import win32api
    except ImportError as exc:
        raise ApiError(f"pywin32 required for printing: {exc}") from exc

    if not file_path.exists():
        raise ApiError(f"PDF file not found: {file_path}")

    count = max(1, int(copies or 1))
    params = f'/d:"{printer_name}"'
    for copy_idx in range(count):
        logger.info(
            "Printing %s to %s (copy %s/%s)",
            file_path,
            printer_name,
            copy_idx + 1,
            count,
        )
        result = win32api.ShellExecute(0, "print", str(file_path), params, ".", 0)
        if isinstance(result, int) and result <= 32:
            raise ApiError(f"ShellExecute failed with code {result} for printer {printer_name}")


def cleanup_pdf(file_path: Path) -> None:
    try:
        if file_path.exists():
            os.remove(file_path)
            logger.debug("Removed temp PDF %s", file_path)
    except OSError as exc:
        logger.warning("Could not remove temp PDF %s: %s", file_path, exc)
