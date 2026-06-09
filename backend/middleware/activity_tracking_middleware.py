"""HTTP middleware — log authenticated API activity for workforce telemetry."""

from __future__ import annotations

import logging
from typing import Callable

from starlette.requests import Request
from starlette.responses import Response

from ..auth.tokens import decode_access_token
from ..database import SessionLocal
from ..services.activity_module_resolver import resolve_api_activity
from ..services.user_activity_service import track_user_activity

logger = logging.getLogger(__name__)


def _user_id_from_bearer(request: Request) -> int | None:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        if payload.get("typ") != "access":
            return None
        return int(payload["sub"])
    except Exception:
        return None


def _int_query_param(request: Request, key: str) -> int | None:
    raw = request.query_params.get(key)
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


async def activity_tracking_middleware(
    request: Request,
    call_next: Callable[[Request], Response],
) -> Response:
    response = await call_next(request)
    if response.status_code >= 400:
        return response

    resolved = resolve_api_activity(request.method, request.url.path)
    if resolved is None:
        return response

    user_id = _user_id_from_bearer(request)
    if user_id is None:
        return response

    module, action = resolved
    tenant_id = _int_query_param(request, "tenant_id")
    warehouse_id = _int_query_param(request, "warehouse_id")

    db = SessionLocal()
    try:
        track_user_activity(
            db,
            user_id=user_id,
            module=module,
            action=action,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            metadata={
                "source": "api_middleware",
                "method": request.method,
                "path": request.url.path,
            },
            commit=True,
        )
    except Exception:
        logger.exception("activity_tracking_middleware failed path=%s", request.url.path)
        db.rollback()
    finally:
        db.close()

    return response
