"""
Regression: shipping-method logo must survive alias / active edits.

  python -m pytest backend/tests/test_shipping_method_logo_persist.py -q
"""

from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.staticfiles import StaticFiles

from backend.api import shipping_methods as shipping_methods_api
from backend.database import get_db
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.shipping_method_service import dump_aliases_json

# Minimal valid PNG header + padding (StaticFiles serves bytes as-is).
_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def logo_env(tmp_path: Path):
    uploads = tmp_path / "uploads"
    uploads.mkdir(parents=True)
    # StaticPool keeps one shared in-memory DB across sessions (plain :memory: does not).
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    for model in (Tenant, Warehouse, ShippingMethod):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH"))
    db.commit()

    filename = f"{uuid.uuid4().hex}.png"
    (uploads / filename).write_bytes(_PNG_BYTES)
    logo_url = f"/uploads/{filename}"

    method_id = str(uuid.uuid4())
    now = datetime.utcnow()
    db.add(
        ShippingMethod(
            id=method_id,
            tenant_id=1,
            warehouse_id=1,
            code="DPD",
            name="DPD",
            aliases_json=dump_aliases_json(["dpd"]),
            logo_url=logo_url,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    db.commit()
    db.close()

    app = FastAPI()
    app.include_router(shipping_methods_api.router, prefix="/api")
    app.mount("/uploads", StaticFiles(directory=str(uploads)), name="uploads")

    def _override_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_db
    client = TestClient(app)
    try:
        yield {
            "client": client,
            "Session": Session,
            "method_id": method_id,
            "logo_url": logo_url,
            "uploads": uploads,
            "filename": filename,
        }
    finally:
        app.dependency_overrides.clear()

def test_alias_and_active_update_preserves_logo_and_file(logo_env):
    client: TestClient = logo_env["client"]
    method_id = logo_env["method_id"]
    logo_url = logo_env["logo_url"]

    # 1) Method has logo
    listed = client.get(
        "/api/shipping-methods/",
        params={"tenant_id": 1, "warehouse_id": 1, "active_only": False},
    )
    assert listed.status_code == 200, listed.text
    row = next(x for x in listed.json() if x["id"] == method_id)
    assert row["logo_url"] == logo_url

    # 2–3) Edit aliases + active status without sending logo_url
    updated = client.put(
        f"/api/shipping-methods/{method_id}/",
        params={"tenant_id": 1, "warehouse_id": 1},
        json={
            "aliases": ["dpd", "kurier dpd"],
            "is_active": True,
            "name": "DPD",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["logo_url"] == logo_url
    assert "kurier dpd" in (body.get("aliases") or [])

    # 5) Re-fetch still returns logo
    again = client.get(
        "/api/shipping-methods/",
        params={"tenant_id": 1, "warehouse_id": 1, "active_only": False},
    )
    assert again.status_code == 200
    row2 = next(x for x in again.json() if x["id"] == method_id)
    assert row2["logo_url"] == logo_url

    # 6) File still served under its URL
    file_res = client.get(logo_url)
    assert file_res.status_code == 200, file_res.text
    assert file_res.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_explicit_null_or_empty_logo_clears_when_field_sent(logo_env):
    client: TestClient = logo_env["client"]
    method_id = logo_env["method_id"]

    cleared = client.put(
        f"/api/shipping-methods/{method_id}/",
        params={"tenant_id": 1, "warehouse_id": 1},
        json={"logo_url": ""},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["logo_url"] is None

    # Restore for next assertion path via null (also clears with model_fields_set)
    Session = logo_env["Session"]
    db = Session()
    row = db.query(ShippingMethod).filter(ShippingMethod.id == method_id).one()
    row.logo_url = logo_env["logo_url"]
    db.commit()
    db.close()

    cleared_null = client.put(
        f"/api/shipping-methods/{method_id}/",
        params={"tenant_id": 1, "warehouse_id": 1},
        json={"logo_url": None},
    )
    assert cleared_null.status_code == 200, cleared_null.text
    assert cleared_null.json()["logo_url"] is None


def test_omit_logo_url_keeps_existing(logo_env):
    """Alias-only payload must not wipe logo (partial update)."""
    client: TestClient = logo_env["client"]
    method_id = logo_env["method_id"]
    logo_url = logo_env["logo_url"]

    r = client.put(
        f"/api/shipping-methods/{method_id}/",
        params={"tenant_id": 1, "warehouse_id": 1},
        json={"aliases": ["dpd-only"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["logo_url"] == logo_url
