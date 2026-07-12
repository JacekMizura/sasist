"""Status panel — agent overview."""

from __future__ import annotations

import customtkinter as ctk

from ...runtime import AgentRuntime
from .. import theme as T
from ..ct_widgets import badge, card, info_row


class StatusPanel(ctk.CTkFrame):
    def __init__(self, parent: ctk.CTkBaseClass, runtime: AgentRuntime) -> None:
        super().__init__(parent, fg_color="transparent")
        self._runtime = runtime
        self._hero_row: ctk.CTkFrame | None = None
        self._scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self._scroll.pack(fill="both", expand=True)
        self._build()

    def _build(self) -> None:
        hero = ctk.CTkFrame(self._scroll, fg_color=T.CARD, corner_radius=T.CORNER_RADIUS, border_width=1, border_color=T.BORDER)
        hero.pack(fill="x", pady=(0, T.PAD))
        self._hero_row = ctk.CTkFrame(hero, fg_color="transparent")
        self._hero_row.pack(fill="x", padx=T.PAD, pady=T.PAD)

        self._agent_body = card(self._scroll, "Agent")
        self._warehouse_body = card(self._scroll, "Magazyn")
        self._printers_body = card(self._scroll, "Drukarki")
        self._sync_body = card(self._scroll, "Synchronizacja")

    def refresh(self) -> None:
        cfg = self._runtime.config
        hb = self._runtime.state.heartbeat
        jobs = self._runtime.state.jobs
        online = hb.online

        if self._hero_row is not None:
            for child in self._hero_row.winfo_children():
                child.destroy()
            badge(self._hero_row, "ONLINE" if online else "OFFLINE", tone="success" if online else "danger").pack(side="left")
            if jobs.processing:
                badge(self._hero_row, "DRUKUJE", tone="warning").pack(side="left", padx=(8, 0))

        for body, rows in (
            (
                self._agent_body,
                [
                    ("Agent ID:", str(cfg.agent_id) if cfg and cfg.agent_id else "—"),
                    ("Komputer:", cfg.computer_name if cfg else "—"),
                    ("Machine ID:", cfg.machine_id if cfg else "—"),
                ],
            ),
            (self._warehouse_body, [("Magazyn:", str(cfg.warehouse_id) if cfg and cfg.warehouse_id else "—")]),
            (self._printers_body, [("Liczba drukarek:", str(self._runtime.state.printer_count))]),
        ):
            for child in body.winfo_children():
                child.destroy()
            for label, value in rows:
                info_row(body, label, value)

        for child in self._sync_body.winfo_children():
            child.destroy()
        last_hb = hb.last_success_at.strftime("%Y-%m-%d %H:%M:%S") if hb.last_success_at else "—"
        last_poll = jobs.last_poll_at.strftime("%Y-%m-%d %H:%M:%S") if jobs.last_poll_at else "—"
        info_row(self._sync_body, "Ostatni heartbeat:", last_hb)
        info_row(self._sync_body, "Ostatni polling:", last_poll)
        info_row(self._sync_body, "Oczekujące zadania:", str(jobs.pending_count))
        err = hb.last_error or jobs.last_poll_error or jobs.last_processing_error
        if err:
            info_row(self._sync_body, "Ostatni błąd:", err)
