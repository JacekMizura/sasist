"""Dedicated Tk UI thread — single hidden root, multiple Toplevel windows."""

from __future__ import annotations

import logging
import queue
import threading
import tkinter as tk
from typing import Callable

from .widgets import apply_window_icon, configure_styles

logger = logging.getLogger(__name__)


class TkUiHost:
    _instance: TkUiHost | None = None

    def __init__(self) -> None:
        self._queue: queue.Queue[Callable[[], None]] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._root: tk.Tk | None = None
        self._ready = threading.Event()

    @classmethod
    def instance(cls) -> TkUiHost:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_for_tests(cls) -> None:
        cls._instance = None

    def ensure_started(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._ready.clear()
        self._thread = threading.Thread(target=self._thread_main, name="sasist-ui", daemon=False)
        self._thread.start()
        if not self._ready.wait(timeout=10):
            raise RuntimeError("Sasist UI thread failed to start")

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
    def root(self) -> tk.Tk:
        self.ensure_started()
        assert self._root is not None
        return self._root

    @property
    def ui_thread(self) -> threading.Thread | None:
        return self._thread

    def count_toplevel_windows(self) -> int:
        root = self.root
        count = 0
        for child in root.winfo_children():
            if isinstance(child, tk.Toplevel):
                try:
                    if child.winfo_exists():
                        count += 1
                except tk.TclError:
                    continue
        return count

    def _thread_main(self) -> None:
        root = tk.Tk()
        root.withdraw()
        root.title("Sasist Printer Agent")
        apply_window_icon(root)
        configure_styles()
        self._root = root
        self._ready.set()
        self._pump()
        root.mainloop()

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
        if self._root is not None:
            self._root.after(50, self._pump)


def get_ui_host() -> TkUiHost:
    return TkUiHost.instance()
