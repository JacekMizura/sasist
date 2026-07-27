"""Printing module domain errors."""

from __future__ import annotations

from typing import Any


class PrintingError(Exception):
    status_code: int = 400
    code: str | None = None

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        if status_code is not None:
            self.status_code = status_code

    def to_http_detail(self) -> str | dict[str, Any]:
        if self.code:
            return {"message": self.message, "code": self.code}
        return self.message


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
