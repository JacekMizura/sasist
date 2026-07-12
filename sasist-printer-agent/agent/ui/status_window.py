"""Custom status window for Sasist Printer Agent."""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable

from ..runtime import AgentRuntime
from . import theme as T


def _badge(parent: tk.Widget, text: str, color: str) -> tk.Label:
    return tk.Label(
        parent,
        text=text,
        font=T.FONT_FAMILY_BOLD,
        fg="white",
        bg=color,
        padx=10,
        pady=4,
    )


def _section(parent: tk.Widget, title: str) -> ttk.LabelFrame:
    frame = ttk.LabelFrame(parent, text=f"  {title}  ", padding=(12, 8))
    return frame


def _row(parent: tk.Widget, label: str, value: str) -> None:
    row = tk.Frame(parent, bg="white")
    row.pack(fill="x", pady=2)
    tk.Label(row, text=label, font=T.FONT_FAMILY_BOLD, fg=T.MUTED_TEXT, bg="white", width=18, anchor="w").pack(
        side="left"
    )
    tk.Label(row, text=value, font=T.FONT_FAMILY, fg=T.NEUTRAL_TEXT, bg="white", anchor="w", wraplength=360).pack(
        side="left", fill="x", expand=True
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
        root.title("Sasist Printer Agent — Status")
        root.geometry("520x640")
        root.minsize(480, 560)
        root.configure(bg="white")
        self._root = root

        header = tk.Frame(root, bg="white", padx=16, pady=14)
        header.pack(fill="x")
        tk.Label(header, text="Sasist Printer Agent", font=T.FONT_TITLE, fg=T.NEUTRAL_TEXT, bg="white").pack(
            anchor="w"
        )
        badge_row = tk.Frame(header, bg="white")
        badge_row.pack(anchor="w", pady=(8, 0))
        _badge(badge_row, "ONLINE" if online else "OFFLINE", T.SUCCESS if online else T.DANGER).pack(side="left")
        if jobs.processing:
            _badge(badge_row, "DRUKUJE", T.WARNING).pack(side="left", padx=(8, 0))

        body = tk.Frame(root, bg="white", padx=16)
        body.pack(fill="both", expand=True)

        status_frame = _section(body, "Status")
        status_frame.pack(fill="x", pady=(0, 10))
        inner = tk.Frame(status_frame, bg="white")
        inner.pack(fill="x")
        last_hb = hb.last_success_at.strftime("%Y-%m-%d %H:%M:%S") if hb.last_success_at else "—"
        last_poll = jobs.last_poll_at.strftime("%Y-%m-%d %H:%M:%S") if jobs.last_poll_at else "—"
        _row(inner, "Heartbeat", last_hb)
        _row(inner, "Polling", last_poll)
        _row(inner, "Oczekujące", str(jobs.pending_count))
        err = hb.last_error or jobs.last_poll_error or jobs.last_processing_error
        if err:
            _row(inner, "Ostatni błąd", err)

        agent_frame = _section(body, "Agent")
        agent_frame.pack(fill="x", pady=(0, 10))
        agent_inner = tk.Frame(agent_frame, bg="white")
        agent_inner.pack(fill="x")
        _row(agent_inner, "Wersja", cfg.version if cfg else "—")
        _row(agent_inner, "Agent ID", str(cfg.agent_id if cfg and cfg.agent_id else "—"))

        computer_frame = _section(body, "Komputer")
        computer_frame.pack(fill="x", pady=(0, 10))
        computer_inner = tk.Frame(computer_frame, bg="white")
        computer_inner.pack(fill="x")
        _row(computer_inner, "Nazwa", cfg.computer_name if cfg else "—")
        _row(computer_inner, "Machine ID", cfg.machine_id if cfg else "—")

        warehouse_frame = _section(body, "Magazyn")
        warehouse_frame.pack(fill="x", pady=(0, 10))
        warehouse_inner = tk.Frame(warehouse_frame, bg="white")
        warehouse_inner.pack(fill="x")
        _row(warehouse_inner, "Magazyn ID", str(cfg.warehouse_id if cfg and cfg.warehouse_id else "—"))

        printers_frame = _section(body, "Drukarki")
        printers_frame.pack(fill="x", pady=(0, 10))
        printers_inner = tk.Frame(printers_frame, bg="white")
        printers_inner.pack(fill="x")
        _row(printers_inner, "Liczba", str(self._runtime.state.printer_count))

        sync_frame = _section(body, "Synchronizacja")
        sync_frame.pack(fill="x", pady=(0, 10))
        sync_inner = tk.Frame(sync_frame, bg="white")
        sync_inner.pack(fill="x")
        _row(sync_inner, "Ostatni poll", last_poll)

        footer = tk.Frame(root, bg=T.NEUTRAL_BG, padx=16, pady=12)
        footer.pack(fill="x", side="bottom")

        def _btn(text: str, cmd: Callable[[], None], primary: bool = False) -> tk.Button:
            return tk.Button(
                footer,
                text=text,
                command=cmd,
                font=T.FONT_FAMILY,
                bg=T.PRIMARY if primary else "white",
                fg="white" if primary else T.NEUTRAL_TEXT,
                activebackground=T.PRIMARY_HOVER if primary else T.PRIMARY_LIGHT,
                activeforeground="white" if primary else T.NEUTRAL_TEXT,
                relief="flat",
                padx=12,
                pady=8,
                cursor="hand2",
            )

        row1 = tk.Frame(footer, bg=T.NEUTRAL_BG)
        row1.pack(fill="x", pady=(0, 6))
        _btn("Otwórz konfigurację", self._on_open_config).pack(side="left", padx=(0, 6))
        _btn("Otwórz logi", self._on_open_logs).pack(side="left", padx=(0, 6))
        _btn("Synchronizuj", self._on_sync, primary=True).pack(side="right")

        row2 = tk.Frame(footer, bg=T.NEUTRAL_BG)
        row2.pack(fill="x")
        _btn("Wydruk testowy", self._on_test_page, primary=True).pack(side="left")
        _btn("Zamknij", root.destroy).pack(side="right")

        root.protocol("WM_DELETE_WINDOW", root.destroy)
        root.mainloop()
        self._root = None
