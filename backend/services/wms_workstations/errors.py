"""WMS workstations domain errors."""

from __future__ import annotations


class WorkstationError(Exception):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class WorkstationNotFoundError(WorkstationError):
    def __init__(self, message: str = "Stanowisko nie istnieje"):
        super().__init__(message, status_code=404)
