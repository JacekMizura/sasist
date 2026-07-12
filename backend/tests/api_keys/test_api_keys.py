"""Integration API keys tests."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database import get_db
from backend.main import app
from backend.models.integration_api_key import IntegrationApiKey
from backend.platform_state import mark_tier0_ready
from backend.services.api_keys.api_key_service import create_key, hash_api_key
from backend.services.api_keys.scopes import require_api_key_scope
from backend.tests.printing._helpers import (
    auth_headers,
    create_printing_test_engine,
    make_session_factory,
    user_override,
)


class ApiKeysTestCase(unittest.TestCase):
    engine = None
    SessionLocal = None
    db: Session | None = None

    @classmethod
    def setUpClass(cls) -> None:
        mark_tier0_ready()
        cls.engine = create_printing_test_engine()
        cls.SessionLocal = make_session_factory(cls.engine)

        def _override_get_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_current_user] = lambda: user_override()
        cls.client = TestClient(app, raise_server_exceptions=True)

    @classmethod
    def tearDownClass(cls) -> None:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    def setUp(self) -> None:
        assert self.SessionLocal is not None
        self.db = self.SessionLocal()
        with self.engine.begin() as conn:
            conn.execute(__import__("sqlalchemy").text("DELETE FROM integration_api_keys"))
            conn.execute(__import__("sqlalchemy").text("DELETE FROM printer_agents"))

    def tearDown(self) -> None:
        if self.db is not None:
            self.db.close()


class TestApiKeysAdmin(ApiKeysTestCase):
    def test_create_list_and_revoke(self):
        create = self.client.post(
            "/api/settings/api-keys",
            params={"tenant_id": 1},
            json={"name": "Office printer", "type": "printer_agent", "warehouse_id": 1},
        )
        self.assertEqual(create.status_code, 200, create.text)
        body = create.json()
        self.assertTrue(body["plain_key"].startswith("spa_"))
        self.assertEqual(body["key"]["scopes"], ["printing.agent"])

        listed = self.client.get("/api/settings/api-keys", params={"tenant_id": 1})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()["items"]), 1)

        key_id = body["key"]["id"]
        revoked = self.client.patch(f"/api/settings/api-keys/{key_id}/revoke", params={"tenant_id": 1})
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(revoked.json()["status"], "revoked")

    def test_rotate_creates_new_key(self):
        create = self.client.post(
            "/api/settings/api-keys",
            params={"tenant_id": 1},
            json={"name": "Rotate me", "type": "integration"},
        )
        key_id = create.json()["key"]["id"]
        rotated = self.client.post(f"/api/settings/api-keys/{key_id}/rotate", params={"tenant_id": 1})
        self.assertEqual(rotated.status_code, 200, rotated.text)
        self.assertEqual(rotated.json()["rotated_from_id"], key_id)
        self.assertNotEqual(rotated.json()["key"]["id"], key_id)


class TestAgentRegisterWithApiKey(ApiKeysTestCase):
    def test_register_with_bearer_api_key(self):
        create = self.client.post(
            "/api/settings/api-keys",
            params={"tenant_id": 1},
            json={"name": "WH1 agent", "type": "printer_agent", "warehouse_id": 2},
        )
        plain_key = create.json()["plain_key"]

        response = self.client.post(
            "/api/printing/agents/register",
            headers=auth_headers(plain_key),
            json={
                "machine_id": "WIN-APIKEY-001",
                "name": "API Key PC",
                "version": "1.0.0",
                "printers": [],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertTrue(data["token"].startswith("spt_"))
        self.assertEqual(data["tenant_id"], 1)
        self.assertEqual(data["warehouse_id"], 2)

        with self.SessionLocal() as db:
            row = db.query(IntegrationApiKey).filter(IntegrationApiKey.key_hash == hash_api_key(plain_key)).first()
            assert row is not None
            self.assertGreaterEqual(int(row.usage_count or 0), 1)
            require_api_key_scope(row, "printing.agent")

        usage = self.client.get(
            f"/api/settings/api-keys/{create.json()['key']['id']}/usage",
            params={"tenant_id": 1},
        )
        self.assertEqual(usage.status_code, 200)
        self.assertGreaterEqual(usage.json()["total_usage_count"], 1)

    def test_legacy_register_still_works(self):
        response = self.client.post(
            "/api/printing/agents/register",
            params={"tenant_id": 1},
            json={
                "machine_id": "WIN-LEGACY-001",
                "name": "Legacy PC",
                "version": "1.0.0",
                "warehouse_id": 1,
                "printers": [],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["token"].startswith("spt_"))

    def test_ip_restriction_blocks_unknown_ip(self):
        with self.SessionLocal() as db:
            _row, plain = create_key(
                db,
                tenant_id=1,
                name="IP locked",
                key_type="printer_agent",
                warehouse_id=1,
                created_by=1,
                allowed_ips=["203.0.113.10"],
            )
            db.commit()

        response = self.client.post(
            "/api/printing/agents/register",
            headers={**auth_headers(plain), "X-Forwarded-For": "198.51.100.1"},
            json={
                "machine_id": "WIN-IP-001",
                "name": "IP PC",
                "version": "1.0.0",
                "printers": [],
            },
        )
        self.assertEqual(response.status_code, 401)

    def test_expired_key_rejected(self):
        with self.SessionLocal() as db:
            _row, plain = create_key(
                db,
                tenant_id=1,
                name="Expired",
                key_type="printer_agent",
                warehouse_id=1,
                created_by=1,
                expires_at=datetime.utcnow() - timedelta(hours=1),
            )
            db.commit()

        response = self.client.post(
            "/api/printing/agents/register",
            headers=auth_headers(plain),
            json={
                "machine_id": "WIN-EXP-001",
                "name": "Expired PC",
                "version": "1.0.0",
                "printers": [],
            },
        )
        self.assertEqual(response.status_code, 401)

    def test_missing_scope_rejected(self):
        with self.SessionLocal() as db:
            _row, plain = create_key(
                db,
                tenant_id=1,
                name="No print scope",
                key_type="printer_agent",
                warehouse_id=1,
                created_by=1,
                scopes=["orders.read"],
            )
            db.commit()

        response = self.client.post(
            "/api/printing/agents/register",
            headers=auth_headers(plain),
            json={
                "machine_id": "WIN-NOSCOPE-001",
                "name": "No scope PC",
                "version": "1.0.0",
                "printers": [],
            },
        )
        self.assertEqual(response.status_code, 401)
