"""Status panel — dense agent overview."""

from __future__ import annotations

import logging
import threading

import customtkinter as ctk

from ... import __version__
from ...runtime import AgentRuntime
from ...update_checker import is_newer_version
from .. import theme as T
from ..ct_widgets import badge, card, dense_info_row, primary_button

logger = logging.getLogger(__name__)


class StatusPanel(ctk.CTkFrame):
    def __init__(self, parent: ctk.CTkBaseClass, runtime: AgentRuntime) -> None:
        super().__init__(parent, fg_color="transparent")
        self._runtime = runtime
        self._remote_version: str | None = None
        self._update_message = ctk.StringVar(value="")
        self._overview_body: ctk.CTkFrame | None = None
        self._hero_row: ctk.CTkFrame | None = None
        self._scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self._scroll.pack(fill="both", expand=True)
        self._build()

    def _build(self) -> None:
        hero = ctk.CTkFrame(
            self._scroll,
            fg_color=T.CARD,
            corner_radius=T.CORNER_RADIUS,
            border_width=1,
            border_color=T.BORDER,
        )
        hero.pack(fill="x", pady=(0, 10))
        hero_inner = ctk.CTkFrame(hero, fg_color="transparent")
        hero_inner.pack(fill="x", padx=T.PAD, pady=T.PAD)
        ctk.CTkLabel(
            hero_inner,
            text="Stan agenta",
            font=T.FONT_SECTION,
            text_color=T.TEXT,
            anchor="w",
        ).pack(side="left")
        self._hero_row = ctk.CTkFrame(hero_inner, fg_color="transparent")
        self._hero_row.pack(side="right")

        overview = card(self._scroll, "Przegląd")
        self._overview_body = ctk.CTkFrame(overview, fg_color="transparent")
        self._overview_body.pack(fill="x")
        self._overview_body.grid_columnconfigure(0, weight=1)
        self._overview_body.grid_columnconfigure(1, weight=1)

        update_card = card(self._scroll, "Aktualizacja")
        update_toolbar = ctk.CTkFrame(update_card, fg_color="transparent")
        update_toolbar.pack(fill="x", pady=(0, 6))
        primary_button(update_toolbar, "Sprawdź aktualizacje", self._on_check_updates).pack(side="left")
        self._update_rows = ctk.CTkFrame(update_card, fg_color="transparent")
        self._update_rows.pack(fill="x")
        ctk.CTkLabel(
            update_card,
            textvariable=self._update_message,
            font=T.FONT_SMALL,
            text_color=T.MUTED,
            anchor="w",
            wraplength=620,
            justify="left",
        ).pack(fill="x", pady=(6, 0))

    def _fill_overview(self, rows: list[tuple[str, str, str]]) -> None:
        if self._overview_body is None:
            return
        for child in self._overview_body.winfo_children():
            child.destroy()
        for index, (icon, label, value) in enumerate(rows):
            col = index % 2
            row = index // 2
            cell = ctk.CTkFrame(self._overview_body, fg_color="transparent")
            cell.grid(row=row, column=col, sticky="nsew", padx=(0, 8 if col == 0 else 0), pady=2)
            dense_info_row(cell, icon, label, value)

    def _fill_rows(self, body: ctk.CTkFrame, rows: list[tuple[str, str, str]]) -> None:
        for child in body.winfo_children():
            child.destroy()
        for icon, label, value in rows:
            dense_info_row(body, icon, label, value)

    def refresh(self) -> None:
        cfg = self._runtime.config
        hb = self._runtime.state.heartbeat
        jobs = self._runtime.state.jobs
        online = hb.online

        if self._hero_row is not None:
            for child in self._hero_row.winfo_children():
                child.destroy()
            badge(
                self._hero_row,
                "\U0001f7e2 ONLINE" if online else "\U0001f534 OFFLINE",
                tone="success" if online else "danger",
            ).pack(side="left", padx=(0, 6))
            if jobs.processing:
                badge(self._hero_row, "\U0001f7e0 DRUKUJE", tone="warning").pack(side="left")

        update_label = self._update_status_label()
        self._fill_overview(
            [
                ("\U0001f310", "Status", "Połączono" if online else "Brak połączenia"),
                ("\U0001f194", "Agent ID", str(cfg.agent_id) if cfg and cfg.agent_id else "—"),
                ("\U0001f4bb", "Komputer", cfg.computer_name if cfg else "—"),
                ("\U0001f5a5", "Machine ID", cfg.machine_id if cfg else "—"),
                ("\U0001f3ed", "Magazyn", str(cfg.warehouse_id) if cfg and cfg.warehouse_id else "—"),
                ("\U0001f5a8", "Drukarki", str(self._runtime.state.printer_count)),
                (
                    "\U0001f493",
                    "Ostatni heartbeat",
                    hb.last_success_at.strftime("%Y-%m-%d %H:%M:%S") if hb.last_success_at else "—",
                ),
                (
                    "\U0001f501",
                    "Ostatni polling",
                    jobs.last_poll_at.strftime("%Y-%m-%d %H:%M:%S") if jobs.last_poll_at else "—",
                ),
                ("\U0001f4e6", "Wersja", __version__),
                ("\u2b06", "Aktualizacja", update_label),
            ]
        )

        err = hb.last_error or jobs.last_poll_error or jobs.last_processing_error
        if err and self._overview_body is not None:
            err_frame = ctk.CTkFrame(self._overview_body, fg_color=T.PREVIEW_BG, corner_radius=T.CORNER_RADIUS_SM)
            err_frame.grid(row=6, column=0, columnspan=2, sticky="ew", pady=(8, 0))
            ctk.CTkLabel(
                err_frame,
                text=f"\u26a0 Ostatni błąd: {err}",
                font=T.FONT_SMALL,
                text_color=T.DANGER,
                anchor="w",
                wraplength=760,
                justify="left",
            ).pack(fill="x", padx=10, pady=8)

        self._fill_rows(
            self._update_rows,
            [
                ("\U0001f4e6", "Aktualna wersja", __version__),
                ("\U0001f680", "Najnowsza wersja", self._remote_version or "—"),
                ("\U0001f4ca", "Status", update_label),
            ],
        )

    def _update_status_label(self) -> str:
        remote = self._remote_version
        if not remote:
            return "Nie sprawdzono"
        if is_newer_version(__version__, remote):
            return "\U0001f7e0 Dost\u0119pna aktualizacja"
        if remote == __version__:
            return "\U0001f7e2 Aktualny"
        return "\U0001f534 Nieznana wersja"

    def _on_check_updates(self) -> None:
        if not self._runtime.client:
            self._update_message.set("Agent nie jest połączony z serwerem.")
            return
        self._update_message.set("Sprawdzanie aktualizacji…")

        def worker() -> None:
            try:
                info = self._runtime.client.get_agent_version()  # type: ignore[union-attr]
                remote = str(info.get("version") or "").strip() or None
            except Exception as exc:
                logger.exception("Update check failed")
                self.after(0, lambda: self._update_message.set(str(exc)))
                return

            def apply() -> None:
                self._remote_version = remote
                if remote and is_newer_version(__version__, remote):
                    self._update_message.set(
                        f"Dost\u0119pna wersja {remote}. Pobieranie mo\u017ce rozpocz\u0105\u0107 si\u0119 automatycznie w tle."
                    )
                    if self._runtime.update_checker:
                        threading.Thread(target=self._runtime.update_checker.check_once, daemon=True).start()
                elif remote == __version__:
                    self._update_message.set("Agent jest aktualny.")
                else:
                    self._update_message.set("Sprawdzono wersj\u0119 na serwerze.")
                self.refresh()

            self.after(0, apply)

        threading.Thread(target=worker, name="ui-update-check", daemon=True).start()
