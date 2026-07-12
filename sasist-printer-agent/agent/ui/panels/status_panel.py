"""Status panel — agent overview and updates."""

from __future__ import annotations

import logging
import threading

import customtkinter as ctk

from ... import __version__
from ...runtime import AgentRuntime
from ...update_checker import is_newer_version
from .. import theme as T
from ..ct_widgets import badge, card, info_row, primary_button

logger = logging.getLogger(__name__)


class StatusPanel(ctk.CTkFrame):
    def __init__(self, parent: ctk.CTkBaseClass, runtime: AgentRuntime) -> None:
        super().__init__(parent, fg_color="transparent")
        self._runtime = runtime
        self._hero_row: ctk.CTkFrame | None = None
        self._remote_version: str | None = None
        self._update_message = ctk.StringVar(value="")
        self._scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self._scroll.pack(fill="both", expand=True)
        self._build()

    def _build(self) -> None:
        hero = ctk.CTkFrame(self._scroll, fg_color=T.CARD, corner_radius=T.CORNER_RADIUS, border_width=1, border_color=T.BORDER)
        hero.pack(fill="x", pady=(0, T.PAD))
        self._hero_row = ctk.CTkFrame(hero, fg_color="transparent")
        self._hero_row.pack(fill="x", padx=T.PAD, pady=T.PAD)

        update_card = card(self._scroll, "Aktualizacja")
        primary_button(update_card, "Sprawdź aktualizacje", self._on_check_updates).pack(anchor="w", pady=(0, 8))
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
        ).pack(fill="x", pady=(8, 0))

        self._agent_body = card(self._scroll, "Agent")
        self._warehouse_body = card(self._scroll, "Magazyn")
        self._printers_body = card(self._scroll, "Drukarki")
        self._sync_body = card(self._scroll, "Synchronizacja")

    def _fill_rows(self, body: ctk.CTkFrame, rows: list[tuple[str, str]]) -> None:
        for child in body.winfo_children():
            child.destroy()
        for label, value in rows:
            info_row(body, label, value)

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

        self._fill_rows(
            self._update_rows,
            [
                ("Aktualna wersja:", __version__),
                ("Najnowsza wersja:", self._remote_version or "—"),
                ("Status aktualizacji:", self._update_status_label()),
            ],
        )
        self._fill_rows(
            self._agent_body,
            [
                ("Agent ID:", str(cfg.agent_id) if cfg and cfg.agent_id else "—"),
                ("Komputer:", cfg.computer_name if cfg else "—"),
                ("Machine ID:", cfg.machine_id if cfg else "—"),
                ("Wersja w config:", cfg.version if cfg else "—"),
            ],
        )
        self._fill_rows(
            self._warehouse_body,
            [("Magazyn:", str(cfg.warehouse_id) if cfg and cfg.warehouse_id else "—")],
        )
        self._fill_rows(
            self._printers_body,
            [("Liczba drukarek:", str(self._runtime.state.printer_count))],
        )

        sync_rows = [
            ("Ostatni heartbeat:", hb.last_success_at.strftime("%Y-%m-%d %H:%M:%S") if hb.last_success_at else "—"),
            ("Ostatni polling:", jobs.last_poll_at.strftime("%Y-%m-%d %H:%M:%S") if jobs.last_poll_at else "—"),
            ("Oczekujące zadania:", str(jobs.pending_count)),
        ]
        err = hb.last_error or jobs.last_poll_error or jobs.last_processing_error
        if err:
            sync_rows.append(("Ostatni błąd:", err))
        self._fill_rows(self._sync_body, sync_rows)

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
