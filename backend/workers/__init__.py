"""Isolated background workers — one file per worker."""

from __future__ import annotations

from typing import Any

__all__ = [
    "get_job_document_number",
    "process_document_job",
    "process_pending_document_jobs",
    "run_reservation_lifecycle_worker",
    "require_production_schema_valid",
]


def __getattr__(name: str) -> Any:
    if name in ("get_job_document_number", "process_document_job", "process_pending_document_jobs"):
        from .document_generation_worker import (
            get_job_document_number,
            process_document_job,
            process_pending_document_jobs,
        )

        return {
            "get_job_document_number": get_job_document_number,
            "process_document_job": process_document_job,
            "process_pending_document_jobs": process_pending_document_jobs,
        }[name]
    if name == "run_reservation_lifecycle_worker":
        from .reservation_expiration_worker import run_reservation_lifecycle_worker

        return run_reservation_lifecycle_worker
    if name == "require_production_schema_valid":
        from .schema_guard import require_production_schema_valid

        return require_production_schema_valid
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
