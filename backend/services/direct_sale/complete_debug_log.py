"""Raw exception logging for direct-sale /complete — never stringify ORM objects."""

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

_SA_TYPES: tuple[type[BaseException], ...] = (
    IntegrityError,
    OperationalError,
    PendingRollbackError,
    FlushError,
    InvalidRequestError,
    SQLAlchemyError,
)


def root_complete_exception(exc: BaseException) -> BaseException:
    """Unwrap PendingRollbackError chains to the first underlying DB failure."""
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, PendingRollbackError):
            nxt = current.__cause__ or current.__context__
            if nxt is not None:
                current = nxt
                continue
        break
    return current if current is not None else exc


def log_stage_failure(
    exc: BaseException,
    *,
    stage: str,
    session_id: int | None = None,
    context: str = "pipeline",
) -> str:
    """Log the FIRST real failure at a pipeline stage — never PendingRollbackError noise."""
    root = root_complete_exception(exc)
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    logger.error(
        "[STAGE FAILED] context=%s stage=%s session_id=%s type=%s repr=%r",
        context,
        stage,
        session_id,
        type(root).__name__,
        safe_exception_repr(root),
    )
    logger.error("[STAGE FAILED] str=%s", safe_exception_str(root))
    if type(exc) is not type(root):
        logger.error(
            "[STAGE FAILED] wrapped_type=%s wrapped_str=%s",
            type(exc).__name__,
            safe_exception_str(exc),
        )
    logger.error("[STAGE FAILED] traceback:\n%s", tb)
    return tb


def rollback_db_safely(db: Session | None, *, context: str = "complete") -> None:
    if db is None:
        return
    try:
        if db.is_active:
            db.rollback()
    except Exception:
        pass


def safe_exception_str(exc: BaseException) -> str:
    """Short message — never the full SQLAlchemy statement dump."""
    root = root_complete_exception(exc)
    if isinstance(root, SQLAlchemyError):
        orig = getattr(root, "orig", None)
        if orig is not None:
            return str(orig)
        return type(root).__name__
    return str(root)


def safe_exception_repr(exc: BaseException) -> str:
    """Short repr — SQLAlchemy repr() embeds entire SQL; use orig only."""
    root = root_complete_exception(exc)
    if isinstance(root, SQLAlchemyError):
        orig = getattr(root, "orig", None)
        if orig is not None:
            return f"{type(root).__name__}(orig={orig!r})"
        return type(root).__name__
    text = repr(root)
    return text if len(text) <= 500 else text[:500] + "…"


def log_raw_exception(
    exc: BaseException,
    *,
    stage: str | None = None,
    session_id: int | None = None,
    context: str = "complete",
    traceback_str: str | None = None,
) -> str:
    """
    Log ONLY the exception object — no ORM entities, no queries, no logger.exception().
    """
    root = root_complete_exception(exc)
    tb = traceback_str or "".join(
        traceback.format_exception(type(exc), exc, exc.__traceback__)
    )
    logger.error(
        "[direct_sales.complete.raw] context=%s stage=%s session_id=%s",
        context,
        stage,
        session_id,
    )
    logger.error("EXC TYPE: %s", type(root).__name__)
    logger.error("EXC REPR: %r", safe_exception_repr(root))
    logger.error("EXC STR: %s", safe_exception_str(root))
    if isinstance(root, SQLAlchemyError):
        logger.error("SQLA ORIG: %r", getattr(root, "orig", None))
        stmt = getattr(root, "statement", None)
        if stmt is not None:
            logger.error("SQLA STMT: %s", str(stmt)[:500])
    if type(exc) is not type(root):
        logger.error("WRAPPED TYPE: %s", type(exc).__name__)
        logger.error("WRAPPED STR: %s", safe_exception_str(exc))
    logger.error("TRACEBACK:\n%s", tb)
    return tb


def raw_complete_failure_response(
    exc: BaseException,
    *,
    stage: str,
    session_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    traceback_str: str | None = None,
    db: Session | None = None,
):
    """Return flat JSON with raw exception fields only — no ORM, no DTOs."""
    from starlette.responses import JSONResponse

    rollback_db_safely(db, context=f"raw_failure:{stage}")
    root = root_complete_exception(exc)
    tb = traceback_str or "".join(
        traceback.format_exception(type(exc), exc, exc.__traceback__)
    )
    log_raw_exception(
        root,
        stage=stage,
        session_id=session_id,
        context="raw_complete_failure_response",
        traceback_str=tb,
    )

    orig = getattr(root, "orig", None)
    content: dict[str, Any] = {
        "error": "DIRECT_SALE_COMPLETE_FAILED",
        "stage": stage,
        "exc_type": type(root).__name__,
        "exc_repr": safe_exception_repr(root),
        "exc_str": safe_exception_str(root),
        "traceback": tb,
        "orig": repr(orig) if orig is not None else None,
        # Legacy aliases for frontend parsers
        "error_type": type(root).__name__,
        "message": safe_exception_str(root),
        "code": type(root).__name__,
    }
    if type(exc) is not type(root):
        content["wrapped_exc_type"] = type(exc).__name__
        content["wrapped_exc_str"] = safe_exception_str(exc)
    if session_id is not None:
        content["session_id"] = session_id
    if tenant_id is not None:
        content["tenant_id"] = tenant_id
    if warehouse_id is not None:
        content["warehouse_id"] = warehouse_id
    if orig is not None:
        content["sqlalchemy_orig"] = str(orig)
        content["sqlalchemy_orig_type"] = type(orig).__name__

    stmt = getattr(root, "statement", None)
    if stmt is not None:
        content["sql_statement"] = str(stmt)[:1000]

    response = JSONResponse(status_code=500, content=content)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


# Back-compat shim — delegate to raw response.
def real_failure_json_response(
    exc: BaseException,
    *,
    stage: str,
    session_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    traceback_str: str | None = None,
    db: Session | None = None,
):
    return raw_complete_failure_response(
        exc,
        stage=stage,
        session_id=session_id,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        traceback_str=traceback_str,
        db=db,
    )


def log_unhandled_complete_exception(
    exc: BaseException,
    *,
    session_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    stage: str | None = None,
    context: str = "complete",
    traceback_str: str | None = None,
) -> str:
    return log_raw_exception(
        exc,
        stage=stage,
        session_id=session_id,
        context=context,
        traceback_str=traceback_str,
    )


def commit_with_logging(
    db: Session,
    *,
    stage: str,
    session_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
) -> None:
    """Commit with minimal logging. On failure: log raw exception + rollback + re-raise."""
    try:
        db.commit()
    except Exception as exc:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        log_raw_exception(
            exc,
            stage=stage,
            session_id=session_id,
            context=f"commit_failed:{stage}",
            traceback_str=tb,
        )
        rollback_db_safely(db, context=f"commit_failed:{stage}")
        raise


# Deprecated — no-op to avoid accidental ORM inspect during serialization.
def log_orm_serialize_state(*_args: object, **_kwargs: object) -> None:
    return None
