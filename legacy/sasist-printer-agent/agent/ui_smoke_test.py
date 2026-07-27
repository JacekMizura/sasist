"""Headless UI smoke test for build/release verification."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import customtkinter as ctk

from .config import AgentConfig, load_config, save_config
from .runtime.core import AgentRuntime, RuntimeState
from .ui.host import get_ui_host
from .ui.main_window import MainWindow


def _mock_runtime(program_data: Path) -> AgentRuntime:
    os.environ["PROGRAMDATA"] = str(program_data)
    cfg = AgentConfig(
        server_url="https://smoke.test",
        api_key="smoke-key",
        token="smoke-token",
        machine_id="smoke-machine",
        agent_id=42,
        computer_name="SMOKE-PC",
    )
    save_config(cfg)
    cfg = load_config()
    cfg.log_path.parent.mkdir(parents=True, exist_ok=True)
    cfg.log_path.write_text("INFO smoke test log line\n", encoding="utf-8")

    runtime = AgentRuntime.__new__(AgentRuntime)
    runtime.config = cfg
    runtime.state = RuntimeState()
    runtime.state.printer_count = 2
    return runtime


def run_ui_smoke_test() -> int:
    """Open main window tabs twice, verify singleton window, hide cleanly."""
    errors: list[str] = []

    with tempfile.TemporaryDirectory(prefix="sasist-ui-smoke-") as tmp:
        runtime = _mock_runtime(Path(tmp))
        host = get_ui_host()

        if host.ui_thread and host.ui_thread.daemon:
            errors.append("UI thread must not be daemon")

        def smoke() -> None:
            try:
                app = host.app
                if not isinstance(app, ctk.CTk):
                    errors.append("UI host root is not customtkinter.CTk")
                    return

                window = MainWindow(app, runtime)
                window.show("status")
                window.show("status")
                if not host.is_main_window_visible():
                    errors.append("Main window should be visible after show()")

                window.select_tab("settings")
                window.select_tab("settings")
                window.select_tab("logs")
                window.select_tab("logs")

                if MainWindow.instance() is not window:
                    errors.append("MainWindow singleton mismatch")

                window.hide()
                if host.is_main_window_visible():
                    errors.append("Main window should be hidden after hide()")

                window.show("settings")
                window.hide()
            except Exception as exc:
                errors.append(str(exc))

        try:
            host.call_and_wait(smoke, timeout=20.0)
        except TimeoutError:
            errors.append("UI smoke test timed out")

    if errors:
        for line in errors:
            print(f"[ui-smoke] FAIL: {line}", file=sys.stderr)
        return 1

    print("[ui-smoke] PASS: MainWindow tabs opened; singleton enforced; clean hide")
    sys.stdout.flush()
    return 0


def main() -> int:
    return run_ui_smoke_test()


if __name__ == "__main__":
    code = main()
    import os

    os._exit(code)
