"""RMZ / Z-PZ domain errors — mapped to HTTP in API layer."""


class RmzFinalizeError(Exception):
    """Validation or business rule failure during atomic RMZ finalize."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
