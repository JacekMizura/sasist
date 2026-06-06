"""
DATABASE CONFIGURATION

Ten plik:
- tworzy połączenie z bazą danych
- tworzy Base dla modeli SQLAlchemy
- udostępnia get_db() do dependency injection

Lokalnie:
- używa SQLite (backend/test.db)

Na Railway:
- automatycznie używa PostgreSQL z DATABASE_URL
"""

import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import (
    sessionmaker,
    declarative_base,
    Session,
    with_loader_criteria,
)

# =========================
# DATABASE URL
# =========================

_BACKEND_DIR = Path(__file__).resolve().parent
_SQLITE_PATH = _BACKEND_DIR / "test.db"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{_SQLITE_PATH.as_posix()}"
)

# Railway daje postgres://
# SQLAlchemy wymaga postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://",
        "postgresql://",
        1
    )

# =========================
# ENGINE CONFIG
# =========================

engine_kwargs = {}

# SQLite-only config
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {
        "check_same_thread": False
    }

engine = create_engine(
    DATABASE_URL,
    **engine_kwargs
)

try:
    from .db.schema_introspection import log_db_engine

    log_db_engine(engine)
except Exception:
    pass

# =========================
# SQLITE FOREIGN KEYS
# =========================

@event.listens_for(engine, "connect")
def _sqlite_enable_foreign_keys(dbapi_connection, _connection_record):
    """
    SQLite disables FK enforcement unless this PRAGMA is set per connection.
    """
    if "sqlite" not in DATABASE_URL:
        return

    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# =========================
# SESSION / BASE
# =========================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

# =========================
# CREATE TABLES
# =========================

def recycle_connection_pool() -> None:
    """Drop pooled connections after schema migration — avoids stale metadata/sessions."""
    try:
        engine.dispose()
    except Exception:
        pass


def create_all_tables() -> None:
    """
    Create every table registered on Base.metadata.

    Callers must import all ORM modules first
    so metadata is complete.
    """
    Base.metadata.create_all(bind=engine)

# =========================
# GLOBAL ACTIVE FILTERS
# =========================

@event.listens_for(Session, "do_orm_execute")
def _add_active_only_filters(execute_state):
    """
    Apply active-only filtering for soft-deletable
    layout/location models by default.

    Opt out with:
    execution_options(include_inactive=True)
    """

    if (
        not execute_state.is_select
        or execute_state.execution_options.get("include_inactive")
    ):
        return

    from .models.warehouse import Rack, Bin
    from .models.location import Location

    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            Rack,
            lambda cls: cls.is_active.is_(True),
            include_aliases=True,
        ),
        with_loader_criteria(
            Bin,
            lambda cls: cls.is_active.is_(True),
            include_aliases=True,
        ),
        with_loader_criteria(
            Location,
            lambda cls: cls.is_active.is_(True),
            include_aliases=True,
        ),
    )

# =========================
# FASTAPI DEPENDENCY
# =========================

def get_db():
    """
    Tworzy nową sesję DB na request
    i zamyka ją po zakończeniu.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as exc:
        try:
            from .observability.platform_debug import log_db_session

            log_db_session(
                phase="request_error",
                dirty=bool(db.dirty),
                active=db.is_active,
                error=f"{type(exc).__name__}: {exc}",
            )
        except Exception:
            pass
        raise
    finally:
        try:
            from .observability.platform_debug import log_db_session

            if db.dirty or db.is_active:
                log_db_session(phase="close", dirty=bool(db.dirty), active=db.is_active)
        except Exception:
            pass
        db.close()