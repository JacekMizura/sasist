"""Config load/save tests."""

from __future__ import annotations

import json
from pathlib import Path

from agent.config import AgentConfig, load_config, save_config


def test_default_config_roundtrip(tmp_path: Path, monkeypatch) -> None:
    cfg_dir = tmp_path / "Sasist" / "PrinterAgent"
    monkeypatch.setattr("agent.config.program_data_dir", lambda: cfg_dir)

    config = load_config()
    assert config.tenant_id == 1
    assert config.heartbeat_interval_sec == 30
    assert config.config_path.exists()

    config.server_url = "https://example.com"
    config.token = "spt_test"
    save_config(config)

    reloaded = load_config()
    assert reloaded.server_url == "https://example.com"
    assert reloaded.token == "spt_test"


def test_from_dict_merges_unknown_keys(tmp_path: Path) -> None:
    data = {
        "server_url": "https://x.test",
        "tenant_id": 2,
        "extra_ignored": True,
    }
    cfg = AgentConfig.from_dict(data)
    assert cfg.server_url == "https://x.test"
    assert cfg.tenant_id == 2
