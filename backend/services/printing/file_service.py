"""Persist print job PDF files for agent download."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

PRINTING_FILES_SUBDIR = "printing"


def printing_files_dir() -> Path:
    base = Path(__file__).resolve().parents[2] / "uploads" / PRINTING_FILES_SUBDIR
    base.mkdir(parents=True, exist_ok=True)
    return base


def job_pdf_path(job_id: int) -> Path:
    return printing_files_dir() / f"{job_id}.pdf"


def save_job_pdf(job_id: int, pdf_bytes: bytes) -> Path:
    path = job_pdf_path(job_id)
    path.write_bytes(pdf_bytes)
    logger.info("Saved print job PDF job_id=%s path=%s bytes=%s", job_id, path, len(pdf_bytes))
    return path


def load_job_pdf(job_id: int) -> bytes | None:
    path = job_pdf_path(job_id)
    if not path.is_file():
        return None
    return path.read_bytes()


def delete_job_pdf(job_id: int) -> None:
    path = job_pdf_path(job_id)
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        logger.warning("Could not delete print job PDF job_id=%s", job_id, exc_info=True)
