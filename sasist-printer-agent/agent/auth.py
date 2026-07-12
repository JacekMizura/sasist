"""Agent registration and token persistence."""

from __future__ import annotations

import logging
import platform
import uuid
from typing import TYPE_CHECKING

from .api import ApiError, SasistApiClient
from .config import AgentConfig, merge_and_save, save_config
from .printers import list_windows_printers

if TYPE_CHECKING:
    pass

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
    return {
        "machine_id": config.machine_id,
        "name": config.computer_name,
        "version": config.version,
        "warehouse_id": config.warehouse_id,
        "printers": list_windows_printers(),
    }


def register_if_needed(config: AgentConfig) -> tuple[AgentConfig, SasistApiClient]:
    config = ensure_machine_id(config)
    config = ensure_computer_name(config)

    if not config.server_url:
        raise ValueError("server_url is required in config.json")

    client = SasistApiClient(
        server_url=config.server_url,
        tenant_id=config.tenant_id,
        token=config.token,
    )

    if config.has_token:
        logger.info("Using existing agent token")
        return config, client

    logger.info("No token found — registering agent")
    return sync_agent_registration(config, client)


def sync_agent_registration(config: AgentConfig, client: SasistApiClient | None = None) -> tuple[AgentConfig, SasistApiClient]:
    config = ensure_machine_id(config)
    config = ensure_computer_name(config)

    if client is None:
        client = SasistApiClient(
            server_url=config.server_url,
            tenant_id=config.tenant_id,
            token=config.token,
        )

    payload = build_register_payload(config)
    response = client.register_agent(payload)

    token = str(response.get("token") or "").strip()
    machine_id = str(response.get("machine_id") or config.machine_id).strip()
    agent_id = int(response.get("agent_id") or config.agent_id or 0)
    if not token:
        raise ApiError("Registration did not return a token")

    config = merge_and_save(
        config,
        {
            "token": token,
            "machine_id": machine_id,
            "agent_id": agent_id,
            "computer_name": config.computer_name,
        },
    )
    client.set_token(config.token)
    logger.info("Agent registered agent_id=%s machine_id=%s", response.get("agent_id"), machine_id)
    return config, client


def save_token(config: AgentConfig, token: str) -> AgentConfig:
    config.token = token.strip()
    save_config(config)
    return config
