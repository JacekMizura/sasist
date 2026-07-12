"""Agent bearer token generation, hashing, and FastAPI auth dependency."""

from __future__ import annotations

import hashlib
import secrets

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.printing.printer_agent import PrinterAgent
from .constants import AGENT_TOKEN_PREFIX
from .errors import AgentAuthError, AgentNotFoundError

_http_bearer = HTTPBearer(auto_error=False)


def generate_agent_token() -> str:
    return f"{AGENT_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"


def hash_agent_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_agent_token(db: Session, token: str) -> PrinterAgent:
    if not token or not token.startswith(AGENT_TOKEN_PREFIX):
        raise AgentAuthError("Invalid agent token")
    token_hash = hash_agent_token(token)
    agent = db.query(PrinterAgent).filter(PrinterAgent.token_hash == token_hash).first()
    if agent is None:
        raise AgentNotFoundError("Agent not found")
    return agent


def get_current_agent(
    cred: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
    db: Session = Depends(get_db),
) -> PrinterAgent:
    if cred is None or cred.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return verify_agent_token(db, cred.credentials)
    except AgentAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except AgentNotFoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
