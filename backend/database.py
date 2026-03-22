"""
DATABASE CONFIGURATION

Ten plik:
- tworzy połączenie z bazą danych
- tworzy Base dla modeli SQLAlchemy
- udostępnia get_db() do dependency injection

Tu NIE ma logiki biznesowej.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base, Session, with_loader_criteria

DATABASE_URL = "sqlite:///./test.db"  # Na start SQLite

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # wymagane dla SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


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
