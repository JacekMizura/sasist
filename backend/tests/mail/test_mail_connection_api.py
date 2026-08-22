"""Mail account connection test API — auth semantics and structured probe results."""

from __future__ import annotations

from unittest.mock import patch

import imaplib
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.auth.tokens import create_access_token
from backend.database import get_db
from backend.main import app
from backend.models.app_user import AppUser, UserPermission
from backend.models.tenant import Tenant
from backend.services.mail.connection_errors import ProbeStatus, classify_connection_error
from backend.services.mail.connection_test import ConnectionTestResult, ProtocolProbeResult
from backend.services.secrets.credential_cipher import reset_cipher_cache_for_tests


def _auth_headers(user_id: int) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _payload(**overrides) -> dict:
    base = {
        "tenant_id": 1,
        "name": "Gmail",
        "email_address": "shop@gmail.com",
        "imap_host": "imap.gmail.com",
        "imap_port": 993,
        "imap_security": "SSL",
        "imap_username": "shop@gmail.com",
        "imap_password": "imap-app-pass",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_security": "TLS",
        "smtp_username": "shop@gmail.com",
        "smtp_password": "smtp-app-pass",
        "is_send_only": False,
        "is_active": True,
    }
    base.update(overrides)
    return base


@pytest.fixture
def mail_api_db(monkeypatch):
    monkeypatch.setenv("MAIL_CREDENTIALS_ENCRYPTION_KEY", "test-mail-api-key-stable")
    reset_cipher_cache_for_tests()
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    for model in (Tenant, AppUser, UserPermission):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T1", default_warehouse_id=1))
    db.add(
        AppUser(
            id=1,
            login="owner",
            password_hash="x",
            role="user",
            is_owner=True,
            is_active=True,
        )
    )
    db.add(
        AppUser(
            id=2,
            login="viewer",
            password_hash="x",
            role="user",
            is_owner=False,
            is_active=True,
        )
    )
    db.add(UserPermission(user_id=2, permission_key="mail.view"))
    db.commit()

    def _get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _get_db
    yield db
    app.dependency_overrides.clear()
    db.close()


@pytest.fixture
def client(mail_api_db):
    return TestClient(app, raise_server_exceptions=False)


def test_unauthenticated_test_config_returns_401(client):
    res = client.post("/api/mail/accounts/test-config", json=_payload())
    assert res.status_code == 401
    assert res.json()["detail"] == "Not authenticated"


def test_viewer_without_manage_accounts_gets_403(client):
    res = client.post(
        "/api/mail/accounts/test-config",
        json=_payload(),
        headers=_auth_headers(2),
    )
    assert res.status_code == 403
    assert "mail.manage_accounts" in res.json()["detail"]


def test_owner_test_config_not_401(client):
    result = ConnectionTestResult(
        ok=True,
        imap=ProtocolProbeResult(status=ProbeStatus.OK, message="ok"),
        smtp=ProtocolProbeResult(status=ProbeStatus.OK, message="ok"),
        message="Połączenie IMAP i SMTP działa.",
    )
    with patch("backend.api.mail.probe_account_connection", return_value=result):
        res = client.post(
            "/api/mail/accounts/test-config",
            json=_payload(),
            headers=_auth_headers(1),
        )
    assert res.status_code != 401
    assert res.status_code == 200
    body = res.json()
    assert body["imap"]["status"] == "OK"
    assert body["smtp"]["status"] == "OK"


def test_admin_role_test_config_works(client, mail_api_db):
    mail_api_db.add(
        AppUser(
            id=3,
            login="admin",
            password_hash="x",
            role="admin",
            is_owner=False,
            is_active=True,
        )
    )
    mail_api_db.commit()
    result = ConnectionTestResult(
        ok=True,
        imap=ProtocolProbeResult(status=ProbeStatus.OK, message="ok"),
        smtp=ProtocolProbeResult(status=ProbeStatus.OK, message="ok"),
    )
    with patch("backend.api.mail.probe_account_connection", return_value=result):
        res = client.post(
            "/api/mail/accounts/test-config",
            json=_payload(),
            headers=_auth_headers(3),
        )
    assert res.status_code == 200


def test_imap_ok_smtp_network_error_structured(client):
    result = ConnectionTestResult(
        ok=False,
        imap=ProtocolProbeResult(status=ProbeStatus.OK, message="Połączenie poprawne."),
        smtp=ProtocolProbeResult(
            status=ProbeStatus.NETWORK_ERROR,
            message="Serwer Sasist nie może połączyć się z serwerem SMTP.",
            diagnostics={"tcp_configured_port": {"tcp_reachable": False, "dns_resolved": True}},
        ),
        message="SMTP fail",
    )
    with patch("backend.api.mail.probe_account_connection", return_value=result):
        res = client.post(
            "/api/mail/accounts/test-config",
            json=_payload(),
            headers=_auth_headers(1),
        )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert body["imap"]["status"] == "OK"
    assert body["smtp"]["status"] == "NETWORK_ERROR"
    assert "errno" not in body["smtp"]["message"].lower()
    assert "Network is unreachable" not in body["smtp"]["message"]


def test_classify_imap_auth_error():
    assert classify_connection_error(imaplib.IMAP4.error("AUTH failed"), protocol="imap") == ProbeStatus.AUTH_ERROR


def test_classify_smtp_network_unreachable():
    import errno

    exc = OSError(errno.ENETUNREACH, "Network is unreachable")
    assert classify_connection_error(exc, protocol="smtp") == ProbeStatus.NETWORK_ERROR


def test_classify_smtp_timeout():
    assert classify_connection_error(TimeoutError(), protocol="smtp") == ProbeStatus.TIMEOUT


def test_probe_account_imap_and_smtp_independent(monkeypatch):
    monkeypatch.setenv("MAIL_CREDENTIALS_ENCRYPTION_KEY", "test-mail-key-stable-phase1")
    reset_cipher_cache_for_tests()
    from backend.models.mail import MailAccount
    from backend.services.mail.connection_test import probe_account_connection
    from backend.services.secrets.credential_cipher import encrypt_secret

    row = MailAccount(
        tenant_id=1,
        name="G",
        email_address="a@b.com",
        imap_host="imap.gmail.com",
        imap_port=993,
        imap_security="SSL",
        imap_username="a@b.com",
        imap_password_ciphertext=encrypt_secret("p"),
        smtp_host="smtp.gmail.com",
        smtp_port=587,
        smtp_security="TLS",
        smtp_username="a@b.com",
        smtp_password_ciphertext=encrypt_secret("p"),
        is_send_only=False,
    )

    with patch(
        "backend.services.mail.connection_test.test_imap_connection",
        return_value=ProtocolProbeResult(status=ProbeStatus.OK, message="ok"),
    ), patch(
        "backend.services.mail.connection_test.test_smtp_connection",
        return_value=ProtocolProbeResult(
            status=ProbeStatus.AUTH_ERROR,
            message="Nie udało się zalogować do konta. Sprawdź login i hasło aplikacji.",
        ),
    ):
        result = probe_account_connection(row)
    assert result.imap is not None and result.imap.status == ProbeStatus.OK
    assert result.smtp is not None and result.smtp.status == ProbeStatus.AUTH_ERROR
    assert result.ok is False
