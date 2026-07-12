"""Configuration GUI for Sasist Printer Agent."""

from __future__ import annotations

import logging
import tkinter as tk
from tkinter import messagebox, ttk

from typing import Callable

from ..auth import sync_agent_registration
from ..config import AgentConfig, save_config
from . import theme as T

logger = logging.getLogger(__name__)


class ConfigDialog:
    def __init__(self, config: AgentConfig, *, on_saved: Callable[[AgentConfig], None] | None = None) -> None:
        self._config = config
        self._on_saved = on_saved

    def show(self) -> None:
        root = tk.Tk()
        root.title("Sasist Printer Agent — Ustawienia")
        root.geometry("540x420")
        root.resizable(False, False)
        root.configure(bg="white")

        tk.Label(root, text="Ustawienia agenta", font=T.FONT_TITLE, fg=T.NEUTRAL_TEXT, bg="white").pack(
            anchor="w", padx=16, pady=(16, 4)
        )
        tk.Label(
            root,
            text="Zmiany są zapisywane do config.json w ProgramData.",
            font=T.FONT_FAMILY,
            fg=T.MUTED_TEXT,
            bg="white",
        ).pack(anchor="w", padx=16, pady=(0, 12))

        frame = tk.Frame(root, bg="white", padx=16)
        frame.pack(fill="both", expand=True)

        server_var = tk.StringVar(value=self._config.server_url)
        api_key_var = tk.StringVar(value=self._config.api_key)
        heartbeat_var = tk.StringVar(value=str(self._config.heartbeat_interval_sec))
        poll_var = tk.StringVar(value=str(self._config.poll_interval_sec))
        status_var = tk.StringVar(value="")

        def field(label: str, var: tk.StringVar, *, secret: bool = False) -> None:
            tk.Label(frame, text=label, font=T.FONT_FAMILY_BOLD, fg=T.NEUTRAL_TEXT, bg="white").pack(anchor="w")
            entry = ttk.Entry(frame, textvariable=var, width=58, show="*" if secret else "")
            entry.pack(fill="x", pady=(4, 12))

        field("URL serwera", server_var)
        field("Klucz API", api_key_var, secret=True)
        field("Interwał heartbeat (s)", heartbeat_var)
        field("Interwał polling (s)", poll_var)

        tk.Label(frame, textvariable=status_var, font=T.FONT_FAMILY, fg=T.WARNING, bg="white").pack(anchor="w")

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
                status_var.set("Interwały muszą być liczbami całkowitymi.")
                return
            save_config(draft)
            self._config = draft
            status_var.set("Zapisano.")
            if self._on_saved:
                self._on_saved(draft)

        def on_connect() -> None:
            try:
                draft = _draft()
            except ValueError:
                status_var.set("Interwały muszą być liczbami całkowitymi.")
                return
            if not draft.server_url:
                status_var.set("Podaj URL serwera.")
                return
            if not draft.api_key:
                status_var.set("Podaj klucz API.")
                return
            save_config(draft)
            status_var.set("Łączenie…")
            root.update_idletasks()
            try:
                sync_agent_registration(draft)
            except Exception as exc:
                logger.exception("Config connect failed")
                status_var.set(str(exc))
                return
            self._config = draft
            messagebox.showinfo("Sasist Printer Agent", "Połączono z serwerem.", parent=root)
            if self._on_saved:
                self._on_saved(draft)

        footer = tk.Frame(root, bg=T.NEUTRAL_BG, padx=16, pady=12)
        footer.pack(fill="x", side="bottom")

        ttk.Button(footer, text="Zapisz", command=on_save).pack(side="right", padx=(6, 0))
        ttk.Button(footer, text="Połącz", command=on_connect).pack(side="right")
        ttk.Button(footer, text="Anuluj", command=root.destroy).pack(side="left")

        root.mainloop()
