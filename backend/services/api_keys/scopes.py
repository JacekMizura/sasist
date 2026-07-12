"""API key scope parsing and enforcement."""

from __future__ import annotations

import json
from typing import Any

from ...models.integration_api_key import IntegrationApiKey
from .constants import API_KEY_SCOPES, DEFAULT_SCOPES_BY_TYPE, FULL_ACCESS_SCOPE
from .errors import ApiKeyValidationError


def default_scopes_for_type(key_type: str) -> list[str]:
    normalized = (key_type or "").strip().lower()
    return list(DEFAULT_SCOPES_BY_TYPE.get(normalized, []))


def normalize_scope_list(scopes: list[str] | None, *, key_type: str | None = None) -> list[str]:
    if not scopes:
        if key_type:
            return default_scopes_for_type(key_type)
        return []
    normalized: list[str] = []
    for scope in scopes:
        value = str(scope or "").strip()
        if not value:
            continue
        if value not in API_KEY_SCOPES:
            raise ApiKeyValidationError(f"Unknown scope: {value}", code="api_key_invalid_scope")
        if value not in normalized:
            normalized.append(value)
    return normalized


def parse_scopes_json(raw: str | None) -> list[str]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiKeyValidationError("Invalid scopes_json", code="api_key_invalid_scope") from exc
    if not isinstance(data, list):
        raise ApiKeyValidationError("scopes_json must be a JSON array", code="api_key_invalid_scope")
    return normalize_scope_list([str(item) for item in data])


def scopes_to_json(scopes: list[str]) -> str:
    return json.dumps(scopes, ensure_ascii=False)


def get_key_scopes(row: IntegrationApiKey) -> list[str]:
    if row.scopes_json:
        return parse_scopes_json(row.scopes_json)
    return default_scopes_for_type(row.type)


def key_has_scope(row: IntegrationApiKey, scope: str) -> bool:
    scopes = get_key_scopes(row)
    if FULL_ACCESS_SCOPE in scopes:
        return True
    return scope in scopes


def require_api_key_scope(row: IntegrationApiKey, scope: str) -> None:
    if not key_has_scope(row, scope):
        raise ApiKeyValidationError(
            f"Missing required scope: {scope}",
            code="api_key_missing_scope",
        )


def parse_allowed_ips_json(raw: str | None) -> list[str]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiKeyValidationError("Invalid allowed_ips_json", code="api_key_invalid_ip") from exc
    if not isinstance(data, list):
        raise ApiKeyValidationError("allowed_ips_json must be a JSON array", code="api_key_invalid_ip")
    ips: list[str] = []
    for item in data:
        value = str(item or "").strip()
        if value and value not in ips:
            ips.append(value[:64])
    return ips


def allowed_ips_to_json(ips: list[str] | None) -> str | None:
    if not ips:
        return None
    cleaned = [str(item).strip()[:64] for item in ips if str(item or "").strip()]
    return json.dumps(cleaned, ensure_ascii=False) if cleaned else None


def validate_client_ip(row: IntegrationApiKey, client_ip: str | None) -> None:
    allowed = parse_allowed_ips_json(row.allowed_ips_json)
    if not allowed:
        return
    if not client_ip:
        raise ApiKeyValidationError("Client IP required", code="api_key_ip_denied")
    if client_ip not in allowed:
        raise ApiKeyValidationError("API key not allowed from this IP", code="api_key_ip_denied")
