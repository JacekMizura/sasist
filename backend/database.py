"""
DATABASE CONFIGURATION

Ten plik:
- tworzy połączenie z bazą danych
- tworzy Base dla modeli SQLAlchemy
- udostępnia get_db() do dependency injection

Tu NIE ma logiki biznesowej.

SQLite plik jest zawsze ``backend/test.db`` (względem tego katalogu), niezależnie
od katalogu roboczego procesu / sposobu uruchomienia uvicorn.
"""

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base, Session, with_loader_criteria

_BACKEND_DIR = Path(__file__).resolve().parent
_SQLITE_PATH = _BACKEND_DIR / "test.db"
# as_posix() — poprawne ścieżki w URI SQLite na Windows
DATABASE_URL = f"sqlite:///{_SQLITE_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # wymagane dla SQLite
)


@event.listens_for(engine, "connect")
def _sqlite_enable_foreign_keys(dbapi_connection, _connection_record):
    """SQLite disables FK enforcement unless this PRAGMA is set per connection."""
    if engine.dialect.name != "sqlite":
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def create_all_tables() -> None:
    """
    Create every table registered on ``Base.metadata`` (idempotent).

    Callers must import all ORM modules first so metadata is complete
    (see ``main.py``: ``from . import models`` before ``create_all_tables``).
    """
    Base.metadata.create_all(bind=engine)


@event.listens_for(Session, "do_orm_execute")
def _add_active_only_filters(execute_state):
    """
    Apply active-only filtering for soft-deletable layout/location models by default.
    Opt out with execution_options(include_inactive=True) in migration/save paths.
    """
    if not execute_state.is_select or execute_state.execution_options.get("include_inactive"):
        return

    from .models.warehouse import Rack, Bin
    from .models.location import Location

    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(Rack, lambda cls: cls.is_active.is_(True), include_aliases=True),
        with_loader_criteria(Bin, lambda cls: cls.is_active.is_(True), include_aliases=True),
        with_loader_criteria(Location, lambda cls: cls.is_active.is_(True), include_aliases=True),
    )


# Dependency do FastAPI
def get_db():
    """
    Tworzy nową sesję DB na request
    i zamyka ją po zakończeniu.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
