"""
DATABASE CONFIGURATION

Ten plik:
- tworzy połączenie z bazą danych
- tworzy Base dla modeli SQLAlchemy
- udostępnia get_db() do dependency injection

Tu NIE ma logiki biznesowej.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./test.db"  # Na start SQLite

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # wymagane dla SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


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
