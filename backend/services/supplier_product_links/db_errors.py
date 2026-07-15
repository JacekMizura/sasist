"""Map DB exceptions for supplier_products writes."""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError

_PG_DRIVER = False
try:
    from psycopg.errors import (
        ForeignKeyViolation,
        NotNullViolation,
        UndefinedColumn,
        UndefinedTable,
    )

    _PG_DRIVER = True
except ImportError:  # pragma: no cover
    try:
        from psycopg2.errors import (  # type: ignore[no-redef]
            ForeignKeyViolation,
            NotNullViolation,
            UndefinedColumn,
            UndefinedTable,
        )

        _PG_DRIVER = True
    except ImportError:  # pragma: no cover
        class _Stub(Exception):
            pass

        UndefinedTable = UndefinedColumn = ForeignKeyViolation = NotNullViolation = _Stub  # type: ignore[misc,assignment]


def error_detail(exc: BaseException) -> str:
    parts = [str(exc)]
    orig = getattr(exc, "orig", None)
    if orig is not None:
        parts.append(str(orig))
    return " | ".join(parts)


def _orig_exception(exc: BaseException) -> BaseException | None:
    return getattr(exc, "orig", None)


def is_undefined_table_error(exc: BaseException) -> bool:
    orig = _orig_exception(exc)
    if _PG_DRIVER and orig is not None and isinstance(orig, UndefinedTable):
        return True
    msg = error_detail(exc).lower()
    if "undefinedtable" in msg.replace(" ", ""):
        return True
    return "relation" in msg and "does not exist" in msg and "column" not in msg


def is_undefined_column_error(exc: BaseException) -> bool:
    orig = _orig_exception(exc)
    if _PG_DRIVER and orig is not None and isinstance(orig, UndefinedColumn):
        return True
    msg = error_detail(exc).lower()
    if "undefinedcolumn" in msg.replace(" ", ""):
        return True
    if "no such column" in msg:
        return True
    if "undefined column" in msg:
        return True
    return "column" in msg and "does not exist" in msg


def is_foreign_key_violation(exc: BaseException) -> bool:
    orig = _orig_exception(exc)
    if _PG_DRIVER and orig is not None and isinstance(orig, ForeignKeyViolation):
        return True
    if isinstance(exc, IntegrityError):
        orig = _orig_exception(exc)
        if _PG_DRIVER and orig is not None and isinstance(orig, ForeignKeyViolation):
            return True
    msg = error_detail(exc).lower()
    return "foreign key" in msg or "foreignkeyviolation" in msg.replace(" ", "")


def is_not_null_violation(exc: BaseException) -> bool:
    orig = _orig_exception(exc)
    if _PG_DRIVER and orig is not None and isinstance(orig, NotNullViolation):
        return True
    if isinstance(exc, IntegrityError):
        orig = _orig_exception(exc)
        if _PG_DRIVER and orig is not None and isinstance(orig, NotNullViolation):
            return True
    msg = error_detail(exc).lower()
    return "not-null" in msg or "not null" in msg or "null value" in msg


def is_schema_error(exc: BaseException) -> bool:
    return isinstance(exc, (OperationalError, ProgrammingError)) and (
        is_undefined_table_error(exc) or is_undefined_column_error(exc)
    )
