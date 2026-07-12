"""Agent registration and token persistence."""

from __future__ import annotations

import logging
import platform
import uuid

from .api import ApiError, SasistApiClient
from .config import AgentConfig, merge_and_save
from .printers import list_windows_printers

logger = logging.getLogger(__name__)


def ensure_machine_id(config: AgentConfig) -> AgentConfig:
    if config.machine_id.strip():
        return config
    machine_id = str(uuid.uuid4())
    logger.info("Generated machine_id=%s", machine_id)
    return merge_and_save(config, {"machine_id": machine_id})


def ensure_computer_name(config: AgentConfig) -> AgentConfig:
    name = (config.computer_name or platform.node() or "Windows-PC").strip()
    if name == config.computer_name:
        return config
    return merge_and_save(config, {"computer_name": name})


def build_register_payload(config: AgentConfig) -> dict:
    payload = {
        "machine_id": config.machine_id,
        "name": config.computer_name,
        "version": config.version,
        "printers": list_windows_printers(),
    }
    if config.uses_legacy_auth():
        payload["warehouse_id"] = config.warehouse_id or 1
    return payload


def _make_client(config: AgentConfig) -> SasistApiClient:
    return SasistApiClient(
        server_url=config.server_url,
        token=config.token,
        api_key=config.api_key,
        tenant_id=config.tenant_id,
    )


def register_if_needed(config: AgentConfig) -> tuple[AgentConfig, SasistApiClient]:
    config = ensure_machine_id(config)
    config = ensure_computer_name(config)

    if not config.server_url:
        raise ValueError("server_url is required in config.json")

    client = _make_client(config)

    if config.has_token:
        logger.info("Using existing agent token")
        return config, client

    if config.has_api_key or config.uses_legacy_auth():
        logger.info("No agent token found — registering")
        return sync_agent_registration(config, client)

    raise ValueError("api_key is required in config.json (legacy: tenant_id + warehouse_id)")


def sync_agent_registration(config: AgentConfig, client: SasistApiClient | None = None) -> tuple[AgentConfig, SasistApiClient]:
    config = ensure_machine_id(config)
    config = ensure_computer_name(config)

    if client is None:
        client = _make_client(config)

    payload = build_register_payload(config)
    response = client.register_agent(payload)

    token = str(response.get("token") or "").strip()
    machine_id = str(response.get("machine_id") or config.machine_id).strip()
    agent_id = int(response.get("agent_id") or config.agent_id or 0)
    tenant_id = response.get("tenant_id")
    warehouse_id = response.get("warehouse_id")
    if not token:
        raise ApiError("Registration did not return a token")

    updates: dict = {
        "token": token,
        "machine_id": machine_id,
        "agent_id": agent_id,
        "computer_name": config.computer_name,
    }
    if tenant_id is not None:
        updates["tenant_id"] = int(tenant_id)
    if warehouse_id is not None:
        updates["warehouse_id"] = int(warehouse_id)

    config = merge_and_save(config, updates)
    client.set_token(config.token)
    if config.tenant_id is not None:
        client.tenant_id = config.tenant_id
    logger.info("Agent registered agent_id=%s machine_id=%s", agent_id, machine_id)
    return config, client
