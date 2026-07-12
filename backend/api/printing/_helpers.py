"""Printing API — shared helpers."""

from __future__ import annotations

from fastapi import HTTPException

from ...services.printing.errors import PrintingError


def raise_printing_error(exc: PrintingError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
