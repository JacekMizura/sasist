"""FastAPI dependencies for integration / public API key authentication."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.integration_api_key import IntegrationApiKey
from ..services.api_keys.api_key_service import extract_raw_api_key, validate_key
from ..services.api_keys.errors import ApiKeyRateLimitError, ApiKeyValidationError

_http_bearer = HTTPBearer(auto_error=False)


def client_ip_from_request(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host
    return None


def user_agent_from_request(request: Request) -> str | None:
    value = request.headers.get("user-agent")
    return value[:512] if value else None


def get_current_integration_api_key(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
    db: Session = Depends(get_db),
) -> IntegrationApiKey:
    """
    Authenticate Bearer spa_* / sasist_* keys — shared by printer registration and future Public API.
    """
    raw_key = extract_raw_api_key(cred)
    if not raw_key:
        raise HTTPException(status_code=401, detail="Integration API key required")

    try:
        return validate_key(
            db,
            raw_key,
            client_ip=client_ip_from_request(request),
            user_agent=user_agent_from_request(request),
        )
    except ApiKeyRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ApiKeyValidationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def require_integration_api_key_scope(scope: str):
    """Factory for scope-gated integration API key dependencies."""

    def _dep(key: IntegrationApiKey = Depends(get_current_integration_api_key)) -> IntegrationApiKey:
        from ..services.api_keys.scopes import require_api_key_scope

        try:
            require_api_key_scope(key, scope)
        except ApiKeyValidationError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return key

    return _dep
