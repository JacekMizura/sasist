"""Track open Toplevel windows — one instance per logical window key."""

from __future__ import annotations

import tkinter as tk


class WindowRegistry:
    _windows: dict[str, tk.Toplevel] = {}

    @classmethod
    def focus_if_open(cls, key: str) -> bool:
        win = cls._windows.get(key)
        if win is None:
            return False
        try:
            if win.winfo_exists():
                win.lift()
                win.focus_force()
                return True
        except tk.TclError:
            pass
        cls._windows.pop(key, None)
        return False

    @classmethod
    def register(cls, key: str, win: tk.Toplevel) -> None:
        cls._windows[key] = win

        def _on_destroy(_event: tk.Event | None = None) -> None:
            if cls._windows.get(key) is win:
                cls._windows.pop(key, None)

        win.bind("<Destroy>", _on_destroy, add="+")

    @classmethod
    def count(cls) -> int:
        alive = 0
        for key, win in list(cls._windows.items()):
            try:
                if win.winfo_exists():
                    alive += 1
                else:
                    cls._windows.pop(key, None)
            except tk.TclError:
                cls._windows.pop(key, None)
        return alive

    @classmethod
    def close_all(cls) -> None:
        for key in list(cls._windows.keys()):
            win = cls._windows.pop(key, None)
            if win is None:
                continue
            try:
                if win.winfo_exists():
                    win.destroy()
            except tk.TclError:
                pass

    @classmethod
    def reset(cls) -> None:
        cls._windows.clear()
