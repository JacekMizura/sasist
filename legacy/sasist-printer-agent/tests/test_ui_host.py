"""UI host and main window tests."""

from __future__ import annotations

import os
import tempfile
import unittest

import customtkinter as ctk

from agent.config import AgentConfig, load_config, save_config
from agent.runtime.core import AgentRuntime, RuntimeState
from agent.ui.host import TkUiHost, get_ui_host
from agent.ui.main_window import MainWindow


class UiHostTests(unittest.TestCase):
    def setUp(self) -> None:
        TkUiHost.reset_for_tests()

    def tearDown(self) -> None:
        host = get_ui_host()

        def hide() -> None:
            window = MainWindow.instance()
            if window is not None:
                window.hide()

        try:
            host.call_and_wait(hide, timeout=5.0)
        except TimeoutError:
            pass
        TkUiHost.reset_for_tests()

    def test_single_ctk_root_and_non_daemon_thread(self) -> None:
        host = get_ui_host()
        host.ensure_started()
        self.assertIsNotNone(host.ui_thread)
        assert host.ui_thread is not None
        self.assertFalse(host.ui_thread.daemon)
        self.assertTrue(host.ui_thread.is_alive())

        def check() -> None:
            app = host.app
            self.assertIsInstance(app, ctk.CTk)
            self.assertEqual(str(app.state()), "withdrawn")

        host.call_and_wait(check)

    def test_main_window_show_hide_and_tabs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PROGRAMDATA"] = tmp
            cfg = AgentConfig(server_url="https://test", api_key="key")
            save_config(cfg)
            runtime = AgentRuntime.__new__(AgentRuntime)
            runtime.config = load_config()
            runtime.state = RuntimeState()
            runtime.config.log_path.parent.mkdir(parents=True, exist_ok=True)
            runtime.config.log_path.write_text("INFO test\n", encoding="utf-8")

            host = get_ui_host()

            def exercise() -> None:
                window = MainWindow(host.app, runtime)
                window.show("status")
                window.show("status")
                self.assertTrue(host.is_main_window_visible())
                window.select_tab("logs")
                window.select_tab("settings")
                window.hide()
                self.assertFalse(host.is_main_window_visible())
                window.show("settings")
                window.hide()

            host.call_and_wait(exercise, timeout=20.0)


if __name__ == "__main__":
    unittest.main()
