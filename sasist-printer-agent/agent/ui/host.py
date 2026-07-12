"""Dedicated CustomTkinter UI thread — single main window."""

from __future__ import annotations

import logging
import queue
import threading
from typing import Callable

import customtkinter as ctk

from .main_window import MainWindow, TabKey

logger = logging.getLogger(__name__)


class UiHost:
    _instance: UiHost | None = None

    def __init__(self) -> None:
        self._queue: queue.Queue[Callable[[], None]] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._app: ctk.CTk | None = None
        self._main_window: MainWindow | None = None
        self._main_window_factory: Callable[[ctk.CTk], MainWindow] | None = None
        self._ready = threading.Event()

    @classmethod
    def instance(cls) -> UiHost:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_for_tests(cls) -> None:
        if cls._instance is not None and cls._instance._main_window is not None:
            try:
                cls._instance._main_window.hide()
            except Exception:
                pass
        cls._instance = None
        MainWindow.reset_for_tests()

    def ensure_started(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._ready.clear()
        self._thread = threading.Thread(target=self._thread_main, name="sasist-ui", daemon=False)
        self._thread.start()
        if not self._ready.wait(timeout=10):
            raise RuntimeError("Sasist UI thread failed to start")

    def set_main_window_factory(self, factory: Callable[[ctk.CTk], MainWindow]) -> None:
        self._main_window_factory = factory

    def call(self, fn: Callable[[], None]) -> None:
        self.ensure_started()
        self._queue.put(fn)

    def call_and_wait(self, fn: Callable[[], None], *, timeout: float = 15.0) -> None:
        done = threading.Event()

        def wrapped() -> None:
            try:
                fn()
            finally:
                done.set()

        self.call(wrapped)
        if not done.wait(timeout=timeout):
            raise TimeoutError("UI task timed out")

    @property
    def app(self) -> ctk.CTk:
        self.ensure_started()
        assert self._app is not None
        return self._app

    @property
    def main_window(self) -> MainWindow | None:
        return self._main_window

    @property
    def ui_thread(self) -> threading.Thread | None:
        return self._thread

    def is_main_window_visible(self) -> bool:
        app = self.app
        try:
            return str(app.state()) != "withdrawn"
        except Exception:
            return False

    def show_main_window(self, tab: TabKey = "status") -> None:
        def _do() -> None:
            if self._main_window is None:
                if self._main_window_factory is None:
                    raise RuntimeError("Main window factory not registered")
                self._main_window = self._main_window_factory(self._app)
            self._main_window.show(tab)

        self.call(_do)

    def _thread_main(self) -> None:
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")
        app = ctk.CTk()
        app.withdraw()
        self._app = app
        self._ready.set()
        self._pump()
        app.mainloop()

    def _pump(self) -> None:
        while True:
            try:
                fn = self._queue.get_nowait()
            except queue.Empty:
                break
            try:
                fn()
            except Exception:
                logger.exception("UI task failed")
        if self._app is not None:
            self._app.after(50, self._pump)


def get_ui_host() -> UiHost:
    return UiHost.instance()


# Backward-compatible alias for tests importing TkUiHost
TkUiHost = UiHost
