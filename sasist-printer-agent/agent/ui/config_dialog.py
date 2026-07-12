"""Configuration GUI for Sasist Printer Agent."""

from __future__ import annotations

import logging
import tkinter as tk
from tkinter import messagebox
from typing import Callable

from ..auth import sync_agent_registration
from ..config import AgentConfig, save_config
from . import theme as T
from .widgets import (
    apply_window_icon,
    configure_styles,
    header_bar,
    labeled_entry,
    primary_button,
    secondary_button,
)

logger = logging.getLogger(__name__)

print("[UI] New ConfigDialog loaded")


class ConfigDialog:
    def __init__(self, config: AgentConfig, *, on_saved: Callable[[AgentConfig], None] | None = None) -> None:
        self._config = config
        self._on_saved = on_saved

    def show(self) -> None:
        print("[UI] New ConfigDialog loaded")
        root = tk.Tk()
        root.title("Sasist Printer Agent — Ustawienia")
        root.geometry("560x520")
        root.resizable(False, False)
        root.configure(bg=T.BG)
        apply_window_icon(root)
        configure_styles()

        header_bar(root, "Ustawienia")

        body_shell = tk.Frame(root, bg=T.BG, padx=T.PADDING, pady=T.PADDING)
        body_shell.pack(fill="both", expand=True)
        card_shell = tk.Frame(body_shell, bg=T.BORDER, padx=1, pady=1)
        card_shell.pack(fill="both", expand=True)
        frame = tk.Frame(card_shell, bg=T.CARD, padx=T.CARD_PADX, pady=T.CARD_PADY)
        frame.pack(fill="both", expand=True)

        tk.Label(
            frame,
            text="Połączenie z serwerem Sasist",
            font=T.FONT_SECTION,
            fg=T.NEUTRAL_TEXT,
            bg=T.CARD,
            anchor="w",
        ).pack(fill="x", pady=(0, 4))
        tk.Label(
            frame,
            text="Zmiany zapisywane są do config.json w ProgramData.",
            font=T.FONT_SMALL,
            fg=T.MUTED_TEXT,
            bg=T.CARD,
            anchor="w",
        ).pack(fill="x", pady=(0, 16))

        server_var = tk.StringVar(value=self._config.server_url)
        api_key_var = tk.StringVar(value=self._config.api_key)
        heartbeat_var = tk.StringVar(value=str(self._config.heartbeat_interval_sec))
        poll_var = tk.StringVar(value=str(self._config.poll_interval_sec))
        status_var = tk.StringVar(value="")

        labeled_entry(frame, "URL serwera", server_var)
        labeled_entry(frame, "Klucz API", api_key_var, secret=True)
        labeled_entry(frame, "Heartbeat (s)", heartbeat_var)
        labeled_entry(frame, "Polling (s)", poll_var)

        status_label = tk.Label(frame, textvariable=status_var, font=T.FONT_FAMILY, fg=T.WARNING, bg=T.CARD, anchor="w")
        status_label.pack(fill="x")

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
            root.update_idletasks()
            try:
                sync_agent_registration(draft)
            except Exception as exc:
                logger.exception("Connection test failed")
                status_var.set(str(exc))
                return
            self._config = draft
            status_var.set("Połączenie OK.")
            messagebox.showinfo("Sasist Printer Agent", "Połączenie z serwerem działa.", parent=root)
            if self._on_saved:
                self._on_saved(draft)

        footer = tk.Frame(root, bg=T.CARD, padx=T.PADDING, pady=T.PADDING)
        footer.pack(fill="x", side="bottom")

        secondary_button(footer, "Zamknij", root.destroy).pack(side="right")
        primary_button(footer, "Zapisz", on_save).pack(side="right", padx=(0, 8))
        primary_button(footer, "Test połączenia", on_test_connection).pack(side="left")

        root.mainloop()
