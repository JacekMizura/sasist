"""UI host and window registry tests."""

from __future__ import annotations

import os
import tempfile
import tkinter as tk
import unittest

from agent.config import AgentConfig, load_config, save_config
from agent.runtime.core import AgentRuntime, RuntimeState
from agent.ui.config_dialog import ConfigDialog
from agent.ui.host import TkUiHost, get_ui_host
from agent.ui.log_viewer_window import LogViewerWindow
from agent.ui.status_window import StatusWindow
from agent.ui.window_registry import WindowRegistry


class UiHostTests(unittest.TestCase):
    def setUp(self) -> None:
        TkUiHost.reset_for_tests()
        WindowRegistry.reset()

    def tearDown(self) -> None:
        host = get_ui_host()
        host.call_and_wait(WindowRegistry.close_all, timeout=5.0)
        WindowRegistry.reset()

    def test_single_hidden_root_and_non_daemon_thread(self) -> None:
        host = get_ui_host()
        host.ensure_started()
        self.assertIsNotNone(host.ui_thread)
        assert host.ui_thread is not None
        self.assertFalse(host.ui_thread.daemon)
        self.assertTrue(host.ui_thread.is_alive())

        def check() -> None:
            root = host.root
            self.assertIsInstance(root, tk.Tk)
            self.assertEqual(str(root.state()), "withdrawn")

        host.call_and_wait(check)

    def test_only_toplevel_children_for_windows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PROGRAMDATA"] = tmp
            cfg = AgentConfig(server_url="https://test", api_key="key")
            save_config(cfg)
            runtime = AgentRuntime.__new__(AgentRuntime)
            runtime.config = load_config()
            runtime.state = RuntimeState()

            host = get_ui_host()

            def open_windows() -> None:
                StatusWindow(
                    runtime,
                    on_open_config=lambda: None,
                    on_open_logs=lambda: None,
                    on_sync=lambda: None,
                    on_test_page=lambda: None,
                )._open()
                ConfigDialog(runtime.config)._open()
                LogViewerWindow(runtime.config.log_path.parent)._open()

            host.call_and_wait(open_windows)
            host.call_and_wait(lambda: self.assertEqual(host.count_toplevel_windows(), 3))
            host.call_and_wait(WindowRegistry.close_all)
            host.call_and_wait(lambda: self.assertEqual(host.count_toplevel_windows(), 0))


class WindowRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        TkUiHost.reset_for_tests()
        WindowRegistry.reset()

    def tearDown(self) -> None:
        get_ui_host().call_and_wait(WindowRegistry.close_all, timeout=5.0)
        WindowRegistry.reset()

    def test_singleton_per_window_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PROGRAMDATA"] = tmp
            cfg = AgentConfig(server_url="https://test", api_key="key")
            save_config(cfg)
            runtime = AgentRuntime.__new__(AgentRuntime)
            runtime.config = load_config()
            runtime.state = RuntimeState()
            host = get_ui_host()
            status = StatusWindow(
                runtime,
                on_open_config=lambda: None,
                on_open_logs=lambda: None,
                on_sync=lambda: None,
                on_test_page=lambda: None,
            )

            def open_twice() -> None:
                status._open()
                status._open()

            host.call_and_wait(open_twice)
            host.call_and_wait(lambda: self.assertEqual(WindowRegistry.count(), 1))
            host.call_and_wait(lambda: self.assertEqual(host.count_toplevel_windows(), 1))
            host.call_and_wait(WindowRegistry.close_all)


if __name__ == "__main__":
    unittest.main()
