"""UI-only connection probe — register request without persisting config."""

from __future__ import annotations

import platform
import uuid
from typing import Any

from .. import __version__
from ..api import SasistApiClient
from ..auth import build_register_payload
from ..config import AgentConfig


def prepare_probe_config(config: AgentConfig) -> AgentConfig:
    """In-memory config for a register probe (no disk writes)."""
    data = config.to_dict()
    data["version"] = __version__
    if not str(data.get("machine_id") or "").strip():
        data["machine_id"] = str(uuid.uuid4())
    if not str(data.get("computer_name") or "").strip():
        data["computer_name"] = platform.node() or "Windows-PC"
    return AgentConfig.from_dict(data)


def probe_agent_connection(config: AgentConfig) -> dict[str, Any]:
    """Call backend register with draft credentials; does not write config.json."""
    draft = prepare_probe_config(config)
    if not draft.server_url.strip():
        raise ValueError("Podaj URL serwera.")
    if not draft.api_key.strip() and not draft.uses_legacy_auth():
        raise ValueError("Podaj klucz API.")

    client = SasistApiClient(
        server_url=draft.server_url,
        token=draft.token,
        api_key=draft.api_key,
        tenant_id=draft.tenant_id,
    )
    return client.register_agent(build_register_payload(draft))
