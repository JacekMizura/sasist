"""API smoke tests for Supply Flow Living Plan endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_supply_flow_plan_endpoint_exists(monkeypatch):
    from backend.main import app

    client = TestClient(app)
    # Unauthenticated should fail auth, not 404 — proves route is mounted.
    r = client.get("/api/wms/supply-flow/plan", params={"tenant_id": 1, "warehouse_id": 1})
    assert r.status_code != 404
