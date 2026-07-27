"""Tests for build metadata loader."""

from __future__ import annotations

import json
from pathlib import Path

from agent.build_info import format_about_text, load_build_info


def test_format_about_text_without_file(tmp_path, monkeypatch):
    monkeypatch.setattr("agent.build_info._executable_dir", lambda: tmp_path)
    text = format_about_text(config_version="9.9.9")
    assert "Wersja: 9.9.9" in text
    assert "SHA256: —" in text


def test_load_build_info_from_json(tmp_path, monkeypatch):
    monkeypatch.setattr("agent.build_info._executable_dir", lambda: tmp_path)
    payload = {
        "version": "1.0.1",
        "git_commit": "abc123def456",
        "built_at": "2026-07-12T09:30:00Z",
        "agent_sha256": "deadbeef",
    }
    (tmp_path / "build_info.json").write_text(json.dumps(payload), encoding="utf-8")

    info = load_build_info()
    assert info is not None
    assert info.version == "1.0.1"
    assert info.agent_sha256 == "deadbeef"

    about = format_about_text()
    assert "1.0.1" in about
    assert "abc123def456"[:12] in about
    assert "deadbeef" in about
