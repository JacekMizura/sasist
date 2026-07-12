"""Modern status window — Sasist Printer Agent."""

from __future__ import annotations

import tkinter as tk
from typing import Callable

from ..runtime import AgentRuntime
from . import theme as T
from .widgets import (
    ScrollableBody,
    apply_window_icon,
    badge,
    card,
    configure_styles,
    divider,
    header_bar,
    info_row,
    primary_button,
    secondary_button,
)


class StatusWindow:
    def __init__(
        self,
        runtime: AgentRuntime,
        *,
        on_open_config: Callable[[], None],
        on_open_logs: Callable[[], None],
        on_sync: Callable[[], None],
        on_test_page: Callable[[], None],
    ) -> None:
        self._runtime = runtime
        self._on_open_config = on_open_config
        self._on_open_logs = on_open_logs
        self._on_sync = on_sync
        self._on_test_page = on_test_page
        self._root: tk.Tk | None = None

    def show(self) -> None:
        if self._root is not None:
            try:
                self._root.lift()
                self._root.focus_force()
                return
            except tk.TclError:
                self._root = None

        cfg = self._runtime.config
        hb = self._runtime.state.heartbeat
        jobs = self._runtime.state.jobs
        online = hb.online

        root = tk.Tk()
        root.title("Sasist Printer Agent")
        root.geometry("520x680")
        root.minsize(480, 620)
        root.configure(bg=T.BG)
        apply_window_icon(root)
        configure_styles()
        self._root = root

        header_bar(root, "Sasist Printer Agent")

        hero = tk.Frame(root, bg=T.CARD, padx=T.PADDING, pady=(0, T.PADDING))
        hero.pack(fill="x")
        hero_row = tk.Frame(hero, bg=T.CARD)
        hero_row.pack(fill="x")
        badge(hero_row, "ONLINE" if online else "OFFLINE", tone="success" if online else "danger").pack(
            side="left"
        )
        if jobs.processing:
            badge(hero_row, "DRUKUJE", tone="warning").pack(side="left", padx=(8, 0))
        tk.Label(
            hero_row,
            text=f"Agent ID: {cfg.agent_id if cfg and cfg.agent_id else '—'}",
            font=T.FONT_FAMILY,
            fg=T.MUTED_TEXT,
            bg=T.CARD,
        ).pack(side="left", padx=(14, 0))

        scroll_host = tk.Frame(root, bg=T.BG, padx=T.PADDING, pady=(T.PADDING, 0))
        scroll_host.pack(fill="both", expand=True)
        scroll = ScrollableBody(scroll_host)
        scroll.pack(fill="both", expand=True)
        body = scroll.inner

        divider(body)

        computer = card(body, "Komputer")
        info_row(computer, "Nazwa:", cfg.computer_name if cfg else "—")
        info_row(computer, "Machine ID:", cfg.machine_id if cfg else "—")

        warehouse = card(body, "Magazyn")
        warehouse_label = str(cfg.warehouse_id) if cfg and cfg.warehouse_id else "—"
        info_row(warehouse, "Magazyn:", warehouse_label)

        printers = card(body, "Drukarki")
        info_row(printers, "Liczba drukarek:", str(self._runtime.state.printer_count))

        sync = card(body, "Synchronizacja")
        last_hb = hb.last_success_at.strftime("%Y-%m-%d %H:%M:%S") if hb.last_success_at else "—"
        last_poll = jobs.last_poll_at.strftime("%Y-%m-%d %H:%M:%S") if jobs.last_poll_at else "—"
        info_row(sync, "Heartbeat:", last_hb)
        info_row(sync, "Polling:", last_poll)
        info_row(sync, "Oczekujące zadania:", str(jobs.pending_count))
        err = hb.last_error or jobs.last_poll_error or jobs.last_processing_error
        if err:
            info_row(sync, "Ostatni błąd:", err)

        footer = tk.Frame(root, bg=T.CARD, padx=T.PADDING, pady=T.PADDING)
        footer.pack(fill="x", side="bottom")

        row1 = tk.Frame(footer, bg=T.CARD)
        row1.pack(fill="x", pady=(0, 8))
        primary_button(row1, "Synchronizuj", self._on_sync).pack(side="left", padx=(0, 8))
        primary_button(row1, "Wydruk testowy", self._on_test_page).pack(side="left")

        row2 = tk.Frame(footer, bg=T.CARD)
        row2.pack(fill="x")
        secondary_button(row2, "Otwórz logi", self._on_open_logs).pack(side="left", padx=(0, 8))
        secondary_button(row2, "Ustawienia", self._on_open_config).pack(side="left", padx=(0, 8))
        secondary_button(row2, "Zamknij", root.destroy).pack(side="right")

        root.protocol("WM_DELETE_WINDOW", root.destroy)
        root.mainloop()
        self._root = None
