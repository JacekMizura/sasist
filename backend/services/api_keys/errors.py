"""Integration API key domain errors."""

from __future__ import annotations


class ApiKeyError(Exception):
    def __init__(self, message: str, *, code: str = "api_key_error") -> None:
        super().__init__(message)
        self.code = code


class ApiKeyNotFoundError(ApiKeyError):
    def __init__(self, message: str = "API key not found") -> None:
        super().__init__(message, code="api_key_not_found")


class ApiKeyValidationError(ApiKeyError):
    def __init__(self, message: str, *, code: str = "api_key_invalid") -> None:
        super().__init__(message, code=code)


class ApiKeyRateLimitError(ApiKeyError):
    def __init__(self, message: str = "Too many API key validation attempts") -> None:
        super().__init__(message, code="api_key_rate_limited")
