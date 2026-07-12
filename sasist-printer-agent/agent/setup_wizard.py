"""First-run setup wizard — server URL and API key."""

from __future__ import annotations

import logging
import tkinter as tk
from tkinter import messagebox, ttk

from .auth import sync_agent_registration
from .config import AgentConfig, load_config, merge_and_save, save_config

logger = logging.getLogger(__name__)


def run_first_run_setup(config: AgentConfig) -> AgentConfig:
    connected = False

    root = tk.Tk()
    root.title("Sasist Printer Agent — konfiguracja")
    root.geometry("520x260")
    root.resizable(False, False)

    frame = ttk.Frame(root, padding=16)
    frame.pack(fill="both", expand=True)

    ttk.Label(frame, text="Połącz komputer z magazynem Sasist", font=("Segoe UI", 12, "bold")).pack(anchor="w")
    ttk.Label(
        frame,
        text="Podaj adres serwera i klucz API typu Printer Agent wygenerowany w panelu.",
        wraplength=480,
    ).pack(anchor="w", pady=(8, 16))

    ttk.Label(frame, text="URL serwera").pack(anchor="w")
    server_var = tk.StringVar(value=config.server_url or "https://sasist.pl")
    ttk.Entry(frame, textvariable=server_var, width=62).pack(fill="x", pady=(4, 12))

    ttk.Label(frame, text="Klucz API").pack(anchor="w")
    api_key_var = tk.StringVar(value=config.api_key)
    ttk.Entry(frame, textvariable=api_key_var, width=62, show="*").pack(fill="x", pady=(4, 16))

    status_var = tk.StringVar(value="")
    ttk.Label(frame, textvariable=status_var, foreground="#b45309").pack(anchor="w", pady=(0, 8))

    def _draft_config() -> AgentConfig:
        return AgentConfig.from_dict(
            {
                **config.to_dict(),
                "server_url": server_var.get().strip().rstrip("/"),
                "api_key": api_key_var.get().strip(),
            }
        )

    def on_connect() -> None:
        nonlocal connected
        draft = _draft_config()
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
            logger.exception("First-run setup failed")
            status_var.set(str(exc))
            return

        connected = True
        messagebox.showinfo(
            "Sasist Printer Agent",
            "Komputer został połączony z magazynem.",
            parent=root,
        )
        root.destroy()

    def on_cancel() -> None:
        save_config(_draft_config())
        root.destroy()

    buttons = ttk.Frame(frame)
    buttons.pack(fill="x")
    ttk.Button(buttons, text="Połącz", command=on_connect).pack(side="right")
    ttk.Button(buttons, text="Zapisz i zamknij", command=on_cancel).pack(side="right", padx=(0, 8))

    root.mainloop()
    loaded = load_config()
    if connected:
        logger.info("First-run setup completed")
    return loaded
