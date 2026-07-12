"""Shared fixtures for printing module tests."""

from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.db.printing_schema import ensure_printing_schema
from backend.db.integration_api_keys_schema import ensure_integration_api_keys_schema


def create_printing_test_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    ensure_printing_schema(engine)
    ensure_integration_api_keys_schema(engine)
    from backend.models.app_user import AuditLog
    from sqlalchemy.schema import CreateTable

    with engine.begin() as conn:
        conn.execute(text(str(CreateTable(AuditLog.__table__).compile(dialect=engine.dialect))))
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1), (2)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, name TEXT)"))
        conn.execute(text("INSERT INTO warehouses (id, name) VALUES (1, 'Main'), (2, 'Secondary')"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS app_users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO app_users (id) VALUES (1)"))
    return engine


def make_session_factory(engine):
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def register_agent_via_api(client, *, tenant_id: int = 1, machine_id: str = "WIN-TEST-001") -> dict:
    response = client.post(
        "/api/printing/agents/register",
        params={"tenant_id": tenant_id},
        json={
            "machine_id": machine_id,
            "name": "Test PC",
            "version": "1.0.0",
            "warehouse_id": 1,
            "printers": [
                {
                    "name": "HP A4",
                    "system_name": "HP LaserJet",
                    "printer_type": "a4",
                    "is_default": True,
                },
                {
                    "name": "Zebra",
                    "system_name": "ZDesigner",
                    "printer_type": "label",
                    "is_default": True,
                },
            ],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def user_override():
    from types import SimpleNamespace

    return SimpleNamespace(id=1, login="test", role="super_admin", is_active=True)
