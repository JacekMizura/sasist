"""Headless UI smoke test for build/release verification."""

from __future__ import annotations

import os
import sys
import tempfile
import tkinter as tk
from pathlib import Path

from .config import AgentConfig, load_config, save_config
from .runtime.core import AgentRuntime, RuntimeState
from .ui.config_dialog import ConfigDialog
from .ui.host import get_ui_host
from .ui.log_viewer_window import LogViewerWindow
from .ui.status_window import StatusWindow
from .ui.window_registry import WindowRegistry


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
    """Open Status/Config/Logs twice, verify singleton windows, close cleanly."""
    errors: list[str] = []

    with tempfile.TemporaryDirectory(prefix="sasist-ui-smoke-") as tmp:
        runtime = _mock_runtime(Path(tmp))
        host = get_ui_host()

        if host.ui_thread and host.ui_thread.daemon:
            errors.append("UI thread must not be daemon")

        def smoke() -> None:
            try:
                root = host.root
                if not isinstance(root, tk.Tk):
                    errors.append("UI host root is not tk.Tk")
                    return

                status = StatusWindow(
                    runtime,
                    on_open_config=lambda: None,
                    on_open_logs=lambda: None,
                    on_sync=lambda: None,
                    on_test_page=lambda: None,
                )
                config = ConfigDialog(runtime.config)
                logs = LogViewerWindow(runtime.config.log_path.parent)

                status._open()
                status._open()
                if host.count_toplevel_windows() != 1:
                    errors.append(f"Status: expected 1 Toplevel, got {host.count_toplevel_windows()}")

                config._open()
                config._open()
                if host.count_toplevel_windows() != 2:
                    errors.append(f"Config: expected 2 Toplevels, got {host.count_toplevel_windows()}")

                logs._open()
                logs._open()
                if host.count_toplevel_windows() != 3:
                    errors.append(f"Logs: expected 3 Toplevels, got {host.count_toplevel_windows()}")

                if WindowRegistry.count() != 3:
                    errors.append(f"WindowRegistry count expected 3, got {WindowRegistry.count()}")

                WindowRegistry.close_all()
                root.update_idletasks()
                if host.count_toplevel_windows() != 0:
                    errors.append(f"After close: expected 0 Toplevels, got {host.count_toplevel_windows()}")
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

    print("[ui-smoke] PASS: Status, Config, Logs opened; singleton enforced; clean close")
    sys.stdout.flush()
    return 0


def main() -> int:
    return run_ui_smoke_test()


if __name__ == "__main__":
    code = main()
    import os

    os._exit(code)
