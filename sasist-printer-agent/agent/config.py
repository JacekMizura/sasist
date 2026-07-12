"""Load and persist agent configuration."""

from __future__ import annotations

import json
import os
import platform
from copy import deepcopy
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_VERSION = "1.0.0"
DEFAULT_HEARTBEAT_SEC = 30
DEFAULT_POLL_SEC = 5
DEFAULT_UPDATE_CHECK_SEC = 6 * 60 * 60

_LEGACY_CONFIG_KEYS = frozenset({"tenant_id", "warehouse_id"})


def program_data_dir() -> Path:
    base = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    return Path(base) / "Sasist" / "PrinterAgent"


def default_config_dict() -> dict[str, Any]:
    return {
        "server_url": "",
        "api_key": "",
        "token": "",
        "machine_id": "",
        "agent_id": 0,
        "computer_name": platform.node() or "",
        "version": DEFAULT_VERSION,
        "heartbeat_interval_sec": DEFAULT_HEARTBEAT_SEC,
        "poll_interval_sec": DEFAULT_POLL_SEC,
    }


@dataclass
class AgentConfig:
    server_url: str = ""
    api_key: str = ""
    token: str = ""
    machine_id: str = ""
    agent_id: int = 0
    computer_name: str = field(default_factory=lambda: platform.node() or "")
    version: str = DEFAULT_VERSION
    heartbeat_interval_sec: int = DEFAULT_HEARTBEAT_SEC
    poll_interval_sec: int = DEFAULT_POLL_SEC
    tenant_id: int | None = None
    warehouse_id: int | None = None

    @property
    def data_dir(self) -> Path:
        return program_data_dir()

    @property
    def config_path(self) -> Path:
        return self.data_dir / "config.json"

    @property
    def log_path(self) -> Path:
        return self.data_dir / "logs" / "agent.log"

    @property
    def has_token(self) -> bool:
        return bool(self.token.strip())

    @property
    def has_api_key(self) -> bool:
        return bool(self.api_key.strip())

    def uses_legacy_auth(self) -> bool:
        return not self.has_api_key and self.tenant_id is not None

    def needs_first_run_setup(self) -> bool:
        if self.has_token:
            return False
        if self.uses_legacy_auth() and self.server_url.strip():
            return False
        return not self.server_url.strip() or not self.has_api_key

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def to_dict(self) -> dict[str, Any]:
        data = {
            "server_url": self.server_url,
            "api_key": self.api_key,
            "token": self.token,
            "machine_id": self.machine_id,
            "agent_id": self.agent_id,
            "computer_name": self.computer_name,
            "version": self.version,
            "heartbeat_interval_sec": self.heartbeat_interval_sec,
            "poll_interval_sec": self.poll_interval_sec,
        }
        if self.uses_legacy_auth():
            data["tenant_id"] = int(self.tenant_id or 1)
            data["warehouse_id"] = int(self.warehouse_id or 1)
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AgentConfig:
        base = default_config_dict()
        merged = {**base, **{k: v for k, v in data.items() if k in base or k in _LEGACY_CONFIG_KEYS}}
        tenant_raw = merged.get("tenant_id")
        warehouse_raw = merged.get("warehouse_id")
        return cls(
            server_url=str(merged.get("server_url") or "").strip(),
            api_key=str(merged.get("api_key") or "").strip(),
            token=str(merged.get("token") or "").strip(),
            machine_id=str(merged.get("machine_id") or "").strip(),
            agent_id=int(merged.get("agent_id") or 0),
            computer_name=str(merged.get("computer_name") or platform.node() or "").strip(),
            version=str(merged.get("version") or DEFAULT_VERSION).strip(),
            heartbeat_interval_sec=int(merged.get("heartbeat_interval_sec") or DEFAULT_HEARTBEAT_SEC),
            poll_interval_sec=int(merged.get("poll_interval_sec") or DEFAULT_POLL_SEC),
            tenant_id=int(tenant_raw) if tenant_raw is not None else None,
            warehouse_id=int(warehouse_raw) if warehouse_raw is not None else None,
        )


def load_config(path: Path | None = None) -> AgentConfig:
    cfg = AgentConfig()
    cfg.ensure_directories()
    target = path or cfg.config_path
    if not target.exists():
        save_config(cfg, path=target)
        return cfg
    with target.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    loaded = AgentConfig.from_dict(data if isinstance(data, dict) else {})
    loaded.ensure_directories()
    return loaded


def save_config(config: AgentConfig, path: Path | None = None) -> None:
    config.ensure_directories()
    target = path or config.config_path
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as fh:
        json.dump(config.to_dict(), fh, indent=2, ensure_ascii=False)


def merge_and_save(config: AgentConfig, updates: dict[str, Any]) -> AgentConfig:
    data = deepcopy(config.to_dict())
    if config.tenant_id is not None:
        data["tenant_id"] = config.tenant_id
    if config.warehouse_id is not None:
        data["warehouse_id"] = config.warehouse_id
    data.update(updates)
    merged = AgentConfig.from_dict(data)
    save_config(merged)
    return merged
