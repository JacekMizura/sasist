"""Sale document correction domain — errors."""

from __future__ import annotations


class SaleCorrectionError(Exception):
    """Domain failure for sale correction issuance."""

    def __init__(self, code: str, message: str):
        self.code = str(code)
        self.message = str(message)
        super().__init__(f"{self.code}: {self.message}")
