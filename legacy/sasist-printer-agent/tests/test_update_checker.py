"""Update checker version comparison tests."""

from __future__ import annotations

from agent.update_checker import is_newer_version


def test_is_newer_version():
    assert is_newer_version("1.0.0", "1.1.0") is True
    assert is_newer_version("1.0.0", "1.0.0") is False
    assert is_newer_version("2.0.0", "1.9.9") is False
    assert is_newer_version("1.0.2", "1.0.10") is True
