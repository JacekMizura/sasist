"""Configuration GUI for Sasist Printer Agent."""

from __future__ import annotations

import logging
import tkinter as tk
from typing import Callable

from ..auth import sync_agent_registration
from ..config import AgentConfig, save_config
from . import theme as T
from .dialogs import show_success
from .host import get_ui_host
from .window_registry import WindowRegistry

WINDOW_KEY = "config"
from .widgets import (
    app_header,
    apply_window_icon,
    card,
    labeled_entry,
    primary_button,
    secondary_button,
    window_shell,
)

logger = logging.getLogger(__name__)


class ConfigDialog:
    def __init__(self, config: AgentConfig, *, on_saved: Callable[[AgentConfig], None] | None = None) -> None:
        self._config = config
        self._on_saved = on_saved

    def update_config(self, config: AgentConfig) -> None:
        self._config = config

    def show(self) -> None:
        get_ui_host().call(self._open)

    def _open(self) -> None:
        if WindowRegistry.focus_if_open(WINDOW_KEY):
            return

        root = get_ui_host().root
        win = tk.Toplevel(root)
        win.title("Sasist Printer Agent — Ustawienia")
        win.geometry("580x560")
        win.minsize(520, 520)
        win.resizable(True, False)
        apply_window_icon(win)
        WindowRegistry.register(WINDOW_KEY, win)
        shell = window_shell(win)
        app_header(shell, "Ustawienia")

        body = tk.Frame(shell, bg=T.BG, padx=T.PADDING, pady=T.PADDING)
        body.pack(fill="both", expand=True)

        connection = card(body, "Połączenie")
        server_var = tk.StringVar(value=self._config.server_url)
        api_key_var = tk.StringVar(value=self._config.api_key)
        labeled_entry(connection, "URL", server_var)
        labeled_entry(connection, "Klucz API", api_key_var, secret=True)

        sync = card(body, "Synchronizacja")
        heartbeat_var = tk.StringVar(value=str(self._config.heartbeat_interval_sec))
        poll_var = tk.StringVar(value=str(self._config.poll_interval_sec))
        labeled_entry(sync, "Heartbeat (s)", heartbeat_var)
        labeled_entry(sync, "Polling (s)", poll_var)

        status_var = tk.StringVar(value="")
        tk.Label(
            body,
            textvariable=status_var,
            font=T.FONT_FAMILY,
            fg=T.WARNING,
            bg=T.BG,
            anchor="w",
        ).pack(fill="x", pady=(4, 0))

        def _draft() -> AgentConfig:
            return AgentConfig.from_dict(
                {
                    **self._config.to_dict(),
                    "server_url": server_var.get().strip().rstrip("/"),
                    "api_key": api_key_var.get().strip(),
                    "heartbeat_interval_sec": int(heartbeat_var.get().strip() or self._config.heartbeat_interval_sec),
                    "poll_interval_sec": int(poll_var.get().strip() or self._config.poll_interval_sec),
                }
            )

        def on_save() -> None:
            try:
                draft = _draft()
            except ValueError:
                status_var.set("Heartbeat i polling muszą być liczbami całkowitymi.")
                return
            save_config(draft)
            self._config = draft
            status_var.set("Zapisano ustawienia.")
            if self._on_saved:
                self._on_saved(draft)

        def on_test_connection() -> None:
            try:
                draft = _draft()
            except ValueError:
                status_var.set("Heartbeat i polling muszą być liczbami całkowitymi.")
                return
            if not draft.server_url:
                status_var.set("Podaj URL serwera.")
                return
            if not draft.api_key:
                status_var.set("Podaj klucz API.")
                return
            save_config(draft)
            status_var.set("Test połączenia…")
            win.update_idletasks()
            try:
                sync_agent_registration(draft)
            except Exception as exc:
                logger.exception("Connection test failed")
                status_var.set(str(exc))
                return
            self._config = draft
            status_var.set("Połączenie OK.")
            show_success(win, "Połączenie", "Połączenie z serwerem działa.")
            if self._on_saved:
                self._on_saved(draft)

        footer = tk.Frame(shell, bg=T.CARD, padx=T.PADDING, pady=T.PADDING)
        footer.pack(fill="x", side="bottom")

        secondary_button(footer, "Zamknij", win.destroy).pack(side="right")
        primary_button(footer, "Zapisz", on_save).pack(side="right", padx=(0, 8))
        primary_button(footer, "Test połączenia", on_test_connection).pack(side="left")

        win.protocol("WM_DELETE_WINDOW", win.destroy)
