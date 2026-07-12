"""Runtime and service module smoke tests."""

from __future__ import annotations

from unittest.mock import patch

from agent.runtime import AgentRuntime


def test_runtime_start_stop():
    runtime = AgentRuntime()
    with patch.object(runtime, "start") as start_mock:
        runtime.start()
        start_mock.assert_called_once()
    runtime.stop()


def test_updater_script_exists():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    assert (root / "updater" / "update.py").is_file()


def test_service_class_import():
    from agent.service_main import SERVICE_DESCRIPTION, SERVICE_NAME

    assert SERVICE_NAME == "SasistPrinterService"
    assert "Sasist" in SERVICE_DESCRIPTION
