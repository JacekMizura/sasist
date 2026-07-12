"""Printing module domain errors."""

from __future__ import annotations


class PrintingError(Exception):
    status_code: int = 400

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class AgentNotFoundError(PrintingError):
    status_code = 404


class AgentAuthError(PrintingError):
    status_code = 401


class PrinterNotFoundError(PrintingError):
    status_code = 404


class PrintJobNotFoundError(PrintingError):
    status_code = 404


class JobTransitionConflictError(PrintingError):
    status_code = 409


class TenantScopeError(PrintingError):
    status_code = 403
