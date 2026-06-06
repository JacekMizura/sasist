"""Full-fidelity logging for direct-sale /complete debugging — do not mask exceptions."""

from __future__ import annotations

import logging
import traceback
from typing import Any

from sqlalchemy.exc import (
    IntegrityError,
    InvalidRequestError,
    OperationalError,
    PendingRollbackError,
    SQLAlchemyError,
)

try:
    from sqlalchemy.exc import FlushError
except ImportError:
    FlushError = type("FlushError", (SQLAlchemyError,), {})  # type: ignore[misc,assignment]
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_SA_TYPES = (
    IntegrityError,
    OperationalError,
    PendingRollbackError,
    FlushError,
    InvalidRequestError,
    SQLAlchemyError,
)


def sqlalchemy_exception_details(exc: BaseException) -> dict[str, Any]:
    """Extract repr, str, and .orig for SQLAlchemy errors."""
    out: dict[str, Any] = {
        "error_type": type(exc).__name__,
        "repr": repr(exc),
        "message": str(exc),
    }
    orig = getattr(exc, "orig", None)
    if orig is not None:
        out["orig_type"] = type(orig).__name__
        out["orig_repr"] = repr(orig)
        out["orig_message"] = str(orig)
    if isinstance(exc, _SA_TYPES):
        out["is_sqlalchemy"] = True
    cause = exc.__cause__
    if cause is not None:
        out["cause_type"] = type(cause).__name__
        out["cause_message"] = str(cause)
        if getattr(cause, "orig", None) is not None:
            out["cause_orig"] = str(cause.orig)
    return out


def log_unhandled_complete_exception(
    exc: BaseException,
    *,
    session_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    stage: str | None = None,
    context: str = "complete",
) -> str:
    """Log full traceback + SQLAlchemy root cause. Returns traceback string."""
    tb = traceback.format_exc()
    details = sqlalchemy_exception_details(exc)
    logger.exception(
        "[direct_sales.complete] UNHANDLED EXCEPTION context=%s stage=%s session_id=%s error_type=%s",
        context,
        stage,
        session_id,
        details.get("error_type"),
    )
    logger.error(
        "[direct_sales.complete] TRACEBACK session_id=%s stage=%s\n%s",
        session_id,
        stage,
        tb,
    )
    if isinstance(exc, _SA_TYPES):
        logger.error(
            "[direct_sales.complete] SQLALCHEMY ROOT session_id=%s stage=%s repr=%s str=%s orig=%s",
            session_id,
            stage,
            repr(exc),
            str(exc),
            getattr(exc, "orig", None),
        )
    return tb


def real_failure_json_response(
    exc: BaseException,
    *,
    stage: str,
    session_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    traceback_str: str | None = None,
):
    """
    TEMP debug: flat JSON body — never wrapped in HTTPException/detail/SESSION_INVALID.
    Import JSONResponse at call site to avoid circular imports.
    """
    from starlette.responses import JSONResponse

    tb = traceback_str or traceback.format_exc()
    details = sqlalchemy_exception_details(exc)
    log_unhandled_complete_exception(
        exc,
        session_id=session_id,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        stage=stage,
        context="real_failure_json_response",
    )
    logger.exception(
        "[direct_sales.complete] REAL FAILURE stage=%s session_id=%s",
        stage,
        session_id,
    )
    logger.error("[direct_sales.complete] REAL FAILURE TRACEBACK\n%s", tb)

    content: dict[str, Any] = {
        "error": "DIRECT_SALE_COMPLETE_FAILED",
        "error_type": details["error_type"],
        "message": details["message"],
        "stage": stage,
        "traceback": tb,
        "code": details["error_type"],
    }
    if session_id is not None:
        content["session_id"] = session_id
    if details.get("orig_message"):
        content["sqlalchemy_orig"] = details["orig_message"]
    if details.get("orig_type"):
        content["sqlalchemy_orig_type"] = details["orig_type"]
    if details.get("repr"):
        content["repr"] = details["repr"]
    if details.get("cause_message"):
        content["cause_message"] = details["cause_message"]
    if details.get("cause_orig"):
        content["cause_orig"] = details["cause_orig"]

    response = JSONResponse(status_code=500, content=content)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


def build_debug_error_detail(
    exc: BaseException,
    *,
    stage: str,
    traceback_str: str | None = None,
) -> dict[str, Any]:
    """API response body with real exception — no SESSION_INVALID masking."""
    details = sqlalchemy_exception_details(exc)
    body: dict[str, Any] = {
        "error": "DIRECT_SALE_COMPLETE_FAILED",
        "stage": stage,
        "error_type": details["error_type"],
        "message": details["message"],
        "code": details["error_type"],
    }
    if details.get("orig_message"):
        body["sqlalchemy_orig"] = details["orig_message"]
    if details.get("orig_type"):
        body["sqlalchemy_orig_type"] = details["orig_type"]
    if details.get("cause_message"):
        body["cause_message"] = details["cause_message"]
    if traceback_str:
        body["traceback"] = traceback_str
    return body


def commit_with_logging(
    db: Session,
    *,
    stage: str,
    session_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
) -> None:
    """Log before/success/failure around db.commit(). Re-raises original exception."""
    logger.warning(
        "[direct_sales.commit] BEFORE stage=%s session_id=%s tenant_id=%s warehouse_id=%s "
        "dirty=%s new=%s deleted=%s is_active=%s",
        stage,
        session_id,
        tenant_id,
        warehouse_id,
        bool(db.dirty),
        bool(db.new),
        bool(db.deleted),
        db.is_active,
    )
    try:
        db.commit()
    except Exception as exc:
        tb = traceback.format_exc()
        details = sqlalchemy_exception_details(exc)
        logger.exception(
            "[direct_sales.commit] FAILED stage=%s session_id=%s tenant_id=%s error_type=%s",
            stage,
            session_id,
            tenant_id,
            details.get("error_type"),
        )
        logger.error(
            "[direct_sales.commit] FAILED TRACEBACK stage=%s session_id=%s\n%s",
            stage,
            session_id,
            tb,
        )
        if isinstance(exc, _SA_TYPES):
            logger.error(
                "[direct_sales.commit] SQLALCHEMY ROOT stage=%s repr=%s str=%s orig=%s",
                stage,
                repr(exc),
                str(exc),
                getattr(exc, "orig", None),
            )
        raise
    else:
        logger.warning(
            "[direct_sales.commit] SUCCESS stage=%s session_id=%s tenant_id=%s",
            stage,
            session_id,
            tenant_id,
        )
