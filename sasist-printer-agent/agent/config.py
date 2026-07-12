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


def program_data_dir() -> Path:
    base = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    return Path(base) / "Sasist" / "PrinterAgent"


def default_config_dict() -> dict[str, Any]:
    return {
        "server_url": "",
        "tenant_id": 1,
        "warehouse_id": 1,
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
    tenant_id: int = 1
    warehouse_id: int = 1
    token: str = ""
    machine_id: str = ""
    agent_id: int = 0
    computer_name: str = field(default_factory=lambda: platform.node() or "")
    version: str = DEFAULT_VERSION
    heartbeat_interval_sec: int = DEFAULT_HEARTBEAT_SEC
    poll_interval_sec: int = DEFAULT_POLL_SEC

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

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AgentConfig:
        base = default_config_dict()
        merged = {**base, **{k: v for k, v in data.items() if k in base}}
        return cls(
            server_url=str(merged.get("server_url") or "").strip(),
            tenant_id=int(merged.get("tenant_id") or 1),
            warehouse_id=int(merged.get("warehouse_id") or 1),
            token=str(merged.get("token") or "").strip(),
            machine_id=str(merged.get("machine_id") or "").strip(),
            agent_id=int(merged.get("agent_id") or 0),
            computer_name=str(merged.get("computer_name") or platform.node() or "").strip(),
            version=str(merged.get("version") or DEFAULT_VERSION).strip(),
            heartbeat_interval_sec=int(merged.get("heartbeat_interval_sec") or DEFAULT_HEARTBEAT_SEC),
            poll_interval_sec=int(merged.get("poll_interval_sec") or DEFAULT_POLL_SEC),
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
    data.update(updates)
    merged = AgentConfig.from_dict(data)
    save_config(merged)
    return merged
