"""Integration API key lifecycle — create, validate, revoke, rotate."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import Any

from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from ...models.integration_api_key import IntegrationApiKey
from ...services.audit_service import log_audit_entry
from .constants import API_KEY_PREFIXES, API_KEY_TYPES, DEFAULT_API_KEY_PREFIX, PUBLIC_API_KEY_PREFIX
from .errors import ApiKeyError, ApiKeyNotFoundError, ApiKeyValidationError
from .rate_limit import check_validation_rate_limit
from .scopes import (
    allowed_ips_to_json,
    default_scopes_for_type,
    get_key_scopes,
    normalize_scope_list,
    parse_allowed_ips_json,
    require_api_key_scope,
    scopes_to_json,
    validate_client_ip,
)

KEY_RANDOM_BYTES = 32


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()


def extract_raw_api_key(cred: HTTPAuthorizationCredentials | None) -> str | None:
    if cred is None or cred.scheme.lower() != "bearer":
        return None
    token = cred.credentials.strip()
    if any(token.startswith(prefix) for prefix in API_KEY_PREFIXES):
        return token
    return None


def _prefix_for_type(key_type: str) -> str:
    if key_type == "public_api":
        return PUBLIC_API_KEY_PREFIX
    return DEFAULT_API_KEY_PREFIX


def generate_api_key(*, prefix: str = DEFAULT_API_KEY_PREFIX) -> tuple[str, str, str]:
    normalized_prefix = prefix if prefix.endswith("_") else f"{prefix}_"
    token_part = secrets.token_urlsafe(KEY_RANDOM_BYTES)
    plain = f"{normalized_prefix}{token_part}"
    return plain, hash_api_key(plain), plain[: min(len(plain), 16)]


def _is_key_usable(row: IntegrationApiKey, *, now: datetime | None = None) -> bool:
    reference = now or datetime.utcnow()
    if not row.is_active:
        return False
    if row.revoked_at is not None:
        return False
    if row.expires_at is not None and row.expires_at <= reference:
        return False
    return True


def _serialize_key(row: IntegrationApiKey, *, warehouse_name: str | None = None) -> dict[str, Any]:
    scopes = get_key_scopes(row)
    allowed_ips = parse_allowed_ips_json(row.allowed_ips_json)
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "description": row.description,
        "key_prefix": row.key_prefix,
        "type": row.type,
        "scopes": scopes,
        "warehouse_id": row.warehouse_id,
        "warehouse_name": warehouse_name,
        "allowed_ips": allowed_ips,
        "created_by": row.created_by,
        "created_by_user_id": row.created_by,
        "created_at": row.created_at,
        "last_used_at": row.last_used_at,
        "last_used_ip": row.last_used_ip,
        "last_used_user_agent": row.last_used_user_agent,
        "usage_count": int(row.usage_count or 0),
        "expires_at": row.expires_at,
        "revoked_at": row.revoked_at,
        "is_active": bool(row.is_active) and row.revoked_at is None,
        "status": _status_label(row),
    }


def serialize_key_usage(row: IntegrationApiKey) -> dict[str, Any]:
    return {
        "created_at": row.created_at,
        "last_used_at": row.last_used_at,
        "last_used_ip": row.last_used_ip,
        "last_used_user_agent": row.last_used_user_agent,
        "total_usage_count": int(row.usage_count or 0),
    }


def _status_label(row: IntegrationApiKey, *, now: datetime | None = None) -> str:
    reference = now or datetime.utcnow()
    if row.revoked_at is not None:
        return "revoked"
    if not row.is_active:
        return "disabled"
    if row.expires_at is not None and row.expires_at <= reference:
        return "expired"
    return "active"


def _warehouse_names(db: Session, rows: list[IntegrationApiKey]) -> dict[int, str]:
    ids = {int(row.warehouse_id) for row in rows if row.warehouse_id is not None}
    if not ids:
        return {}
    from sqlalchemy import text

    names: dict[int, str] = {}
    for wh_id in sorted(ids):
        result = db.execute(text("SELECT name FROM warehouses WHERE id = :id"), {"id": wh_id}).first()
        if result is not None and result[0]:
            names[wh_id] = str(result[0])
        else:
            names[wh_id] = f"Magazyn #{wh_id}"
    return names


def list_keys(db: Session, *, tenant_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.tenant_id == tenant_id)
        .order_by(IntegrationApiKey.created_at.desc(), IntegrationApiKey.id.desc())
        .all()
    )
    wh_names = _warehouse_names(db, rows)
    return [
        _serialize_key(row, warehouse_name=wh_names.get(int(row.warehouse_id)) if row.warehouse_id else None)
        for row in rows
    ]


def create_key(
    db: Session,
    *,
    tenant_id: int,
    name: str,
    key_type: str,
    warehouse_id: int | None,
    created_by: int | None,
    description: str | None = None,
    scopes: list[str] | None = None,
    allowed_ips: list[str] | None = None,
    expires_at: datetime | None = None,
) -> tuple[IntegrationApiKey, str]:
    normalized_type = (key_type or "").strip().lower()
    if normalized_type not in API_KEY_TYPES:
        raise ApiKeyError(f"Invalid key type: {key_type}")

    if normalized_type == "printer_agent" and warehouse_id is None:
        raise ApiKeyError("warehouse_id is required for printer_agent keys")

    if normalized_type != "printer_agent" and warehouse_id is not None:
        raise ApiKeyError("warehouse_id is only allowed for printer_agent keys")

    normalized_scopes = normalize_scope_list(scopes, key_type=normalized_type)
    plain, key_hash, key_prefix = generate_api_key(prefix=_prefix_for_type(normalized_type))
    row = IntegrationApiKey(
        tenant_id=tenant_id,
        name=name.strip(),
        description=(description or "").strip() or None,
        key_hash=key_hash,
        key_prefix=key_prefix,
        type=normalized_type,
        scopes_json=scopes_to_json(normalized_scopes),
        warehouse_id=warehouse_id,
        allowed_ips_json=allowed_ips_to_json(allowed_ips),
        created_by=created_by,
        expires_at=expires_at,
        is_active=True,
        usage_count=0,
    )
    db.add(row)
    db.flush()
    log_audit_entry(
        db,
        user_id=created_by,
        action="api_key.create",
        entity_type="integration_api_key",
        entity_id=row.id,
        detail={
            "name": row.name,
            "type": row.type,
            "warehouse_id": row.warehouse_id,
            "scopes": normalized_scopes,
        },
    )
    return row, plain


def get_key_or_404(db: Session, *, tenant_id: int, key_id: int) -> IntegrationApiKey:
    row = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.id == key_id, IntegrationApiKey.tenant_id == tenant_id)
        .first()
    )
    if row is None:
        raise ApiKeyNotFoundError()
    return row


def revoke_key(
    db: Session,
    *,
    tenant_id: int,
    key_id: int,
    user_id: int | None,
) -> IntegrationApiKey:
    row = get_key_or_404(db, tenant_id=tenant_id, key_id=key_id)
    now = datetime.utcnow()
    row.is_active = False
    row.revoked_at = now
    log_audit_entry(
        db,
        user_id=user_id,
        action="api_key.revoke",
        entity_type="integration_api_key",
        entity_id=row.id,
        detail={"name": row.name, "type": row.type},
    )
    return row


def regenerate_key(
    db: Session,
    *,
    tenant_id: int,
    key_id: int,
    user_id: int | None,
) -> tuple[IntegrationApiKey, str]:
    row = get_key_or_404(db, tenant_id=tenant_id, key_id=key_id)
    if row.revoked_at is not None:
        raise ApiKeyError("Cannot regenerate a revoked key")

    plain, key_hash, key_prefix = generate_api_key(prefix=_prefix_for_type(row.type))
    row.key_hash = key_hash
    row.key_prefix = key_prefix
    row.is_active = True
    row.revoked_at = None
    log_audit_entry(
        db,
        user_id=user_id,
        action="api_key.regenerate",
        entity_type="integration_api_key",
        entity_id=row.id,
        detail={"name": row.name, "type": row.type},
    )
    return row, plain


def rotate_key(
    db: Session,
    *,
    tenant_id: int,
    key_id: int,
    user_id: int | None,
) -> tuple[IntegrationApiKey, str]:
    old_row = get_key_or_404(db, tenant_id=tenant_id, key_id=key_id)
    if old_row.revoked_at is not None:
        raise ApiKeyError("Cannot rotate a revoked key")

    now = datetime.utcnow()
    old_row.is_active = False
    old_row.revoked_at = now

    plain, key_hash, key_prefix = generate_api_key(prefix=_prefix_for_type(old_row.type))
    new_row = IntegrationApiKey(
        tenant_id=old_row.tenant_id,
        name=old_row.name,
        description=old_row.description,
        key_hash=key_hash,
        key_prefix=key_prefix,
        type=old_row.type,
        scopes_json=old_row.scopes_json,
        warehouse_id=old_row.warehouse_id,
        allowed_ips_json=old_row.allowed_ips_json,
        created_by=user_id or old_row.created_by,
        expires_at=old_row.expires_at,
        is_active=True,
        usage_count=0,
    )
    db.add(new_row)
    db.flush()

    log_audit_entry(
        db,
        user_id=user_id,
        action="api_key.rotate",
        entity_type="integration_api_key",
        entity_id=new_row.id,
        detail={"name": new_row.name, "type": new_row.type, "rotated_from_id": old_row.id},
    )
    return new_row, plain


def delete_key(
    db: Session,
    *,
    tenant_id: int,
    key_id: int,
    user_id: int | None,
) -> None:
    row = get_key_or_404(db, tenant_id=tenant_id, key_id=key_id)
    log_audit_entry(
        db,
        user_id=user_id,
        action="api_key.delete",
        entity_type="integration_api_key",
        entity_id=row.id,
        detail={"name": row.name, "type": row.type},
    )
    db.delete(row)


def record_key_usage(
    db: Session,
    row: IntegrationApiKey,
    *,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    row.last_used_at = datetime.utcnow()
    row.usage_count = int(row.usage_count or 0) + 1
    if client_ip:
        row.last_used_ip = client_ip[:64]
    if user_agent:
        row.last_used_user_agent = user_agent[:512]
    db.flush()


def validate_key(
    db: Session,
    raw_key: str,
    *,
    expected_type: str | None = None,
    required_scope: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> IntegrationApiKey:
    normalized = (raw_key or "").strip()
    if not normalized:
        raise ApiKeyValidationError("Missing API key", code="api_key_missing")

    rate_scope = client_ip or "global"
    check_validation_rate_limit(scope=f"validate:{rate_scope}")

    row = db.query(IntegrationApiKey).filter(IntegrationApiKey.key_hash == hash_api_key(normalized)).first()
    if row is None:
        raise ApiKeyValidationError("Invalid API key", code="api_key_invalid")

    if not _is_key_usable(row):
        raise ApiKeyValidationError("API key is not active", code="api_key_inactive")

    if expected_type is not None and row.type != expected_type:
        raise ApiKeyValidationError(
            f"API key type must be {expected_type}",
            code="api_key_wrong_type",
        )

    validate_client_ip(row, client_ip)

    if required_scope is not None:
        require_api_key_scope(row, required_scope)

    record_key_usage(db, row, client_ip=client_ip, user_agent=user_agent)
    return row


def get_key_usage(db: Session, *, tenant_id: int, key_id: int) -> dict[str, Any]:
    row = get_key_or_404(db, tenant_id=tenant_id, key_id=key_id)
    return serialize_key_usage(row)
