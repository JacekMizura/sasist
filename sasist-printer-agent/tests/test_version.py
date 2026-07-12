"""Tests for VERSION file loader."""

from __future__ import annotations

from pathlib import Path

from agent.version import read_version


def test_read_version_from_version_file():
    version = read_version()
    version_path = Path(__file__).resolve().parents[1] / "VERSION"
    expected = version_path.read_text(encoding="utf-8").strip()
    assert version == expected
    assert version.count(".") == 2
