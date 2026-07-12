"""API client tests with mocked HTTP."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import requests

from agent.api import ApiError, SasistApiClient


def test_register_agent_success() -> None:
    client = SasistApiClient(server_url="https://example.com", tenant_id=1)
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b'{"agent_id":1,"token":"spt_abc","machine_id":"m1"}'
    mock_response.json.return_value = {"agent_id": 1, "token": "spt_abc", "machine_id": "m1"}

    with patch.object(client._session, "request", return_value=mock_response) as req:
        result = client.register_agent({"machine_id": "m1", "name": "PC", "printers": []})

    assert result["token"] == "spt_abc"
    req.assert_called_once()
    call_kwargs = req.call_args.kwargs
    assert call_kwargs["params"]["tenant_id"] == 1
    assert "Authorization" not in req.call_args.kwargs["headers"]


def test_heartbeat_adds_bearer_token() -> None:
    client = SasistApiClient(server_url="https://example.com", tenant_id=1, token="spt_secret")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b'{"agent_id":1,"is_online":true}'
    mock_response.json.return_value = {"agent_id": 1, "is_online": True}

    with patch.object(client._session, "request", return_value=mock_response) as req:
        client.heartbeat()

    assert req.call_args.kwargs["headers"]["Authorization"] == "Bearer spt_secret"


def test_retry_on_500() -> None:
    client = SasistApiClient(server_url="https://example.com", tenant_id=1, token="spt_x")
    fail = MagicMock(status_code=503, content=b'{"detail":"busy"}')
    fail.json.return_value = {"detail": "busy"}
    ok = MagicMock(status_code=200, content=b'{"jobs":[]}')
    ok.json.return_value = {"jobs": []}

    with patch.object(client._session, "request", side_effect=[fail, ok]):
        with patch("agent.api.time.sleep"):
            jobs = client.get_pending_jobs()

    assert jobs == []


def test_connection_error_raises() -> None:
    client = SasistApiClient(server_url="https://example.com", tenant_id=1, token="spt_x")
    with patch.object(client._session, "request", side_effect=requests.ConnectionError("offline")):
        with patch("agent.api.time.sleep"):
            with pytest.raises(ApiError):
                client.get_pending_jobs()
