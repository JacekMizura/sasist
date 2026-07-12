"""Settings panel — agent configuration."""

from __future__ import annotations

import logging
from typing import Callable

import customtkinter as ctk

from ...auth import sync_agent_registration
from ...config import AgentConfig, save_config
from .. import theme as T
from ..ct_widgets import card, primary_button

logger = logging.getLogger(__name__)


class SettingsPanel(ctk.CTkFrame):
    def __init__(
        self,
        parent: ctk.CTkBaseClass,
        config: AgentConfig,
        *,
        on_saved: Callable[[AgentConfig], None] | None = None,
    ) -> None:
        super().__init__(parent, fg_color="transparent")
        self._config = config
        self._on_saved = on_saved
        self._build()

    def update_config(self, config: AgentConfig) -> None:
        self._config = config
        self._server_var.set(config.server_url)
        self._api_key_var.set(config.api_key)
        self._heartbeat_var.set(str(config.heartbeat_interval_sec))
        self._poll_var.set(str(config.poll_interval_sec))
        self._status_var.set("")

    def _build(self) -> None:
        scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        scroll.pack(fill="both", expand=True)

        connection = card(scroll, "Połączenie")
        self._server_var = ctk.StringVar(value=self._config.server_url)
        self._api_key_var = ctk.StringVar(value=self._config.api_key)
        self._labeled_entry(connection, "URL", self._server_var)
        self._labeled_entry(connection, "Klucz API", self._api_key_var, secret=True)

        sync = card(scroll, "Synchronizacja")
        self._heartbeat_var = ctk.StringVar(value=str(self._config.heartbeat_interval_sec))
        self._poll_var = ctk.StringVar(value=str(self._config.poll_interval_sec))
        self._labeled_entry(sync, "Heartbeat (s)", self._heartbeat_var)
        self._labeled_entry(sync, "Polling (s)", self._poll_var)

        self._status_var = ctk.StringVar(value="")
        ctk.CTkLabel(scroll, textvariable=self._status_var, font=T.FONT, text_color=T.WARNING, anchor="w").pack(
            fill="x", pady=(4, 0)
        )

        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.pack(fill="x", pady=(T.PAD, 0))
        primary_button(footer, "Test połączenia", self._on_test_connection).pack(side="left")
        primary_button(footer, "Zapisz", self._on_save).pack(side="right")

    def _labeled_entry(self, parent: ctk.CTkBaseClass, label: str, variable: ctk.StringVar, *, secret: bool = False) -> None:
        ctk.CTkLabel(parent, text=label, font=T.FONT_BOLD, text_color=T.TEXT, anchor="w").pack(fill="x", pady=(0, 4))
        ctk.CTkEntry(
            parent,
            textvariable=variable,
            show="*" if secret else "",
            fg_color=T.PREVIEW_BG,
            border_color=T.BORDER,
            text_color=T.TEXT,
            corner_radius=T.CORNER_RADIUS_SM,
        ).pack(fill="x", pady=(0, 14))

    def _draft(self) -> AgentConfig:
        return AgentConfig.from_dict(
            {
                **self._config.to_dict(),
                "server_url": self._server_var.get().strip().rstrip("/"),
                "api_key": self._api_key_var.get().strip(),
                "heartbeat_interval_sec": int(self._heartbeat_var.get().strip() or self._config.heartbeat_interval_sec),
                "poll_interval_sec": int(self._poll_var.get().strip() or self._config.poll_interval_sec),
            }
        )

    def _on_save(self) -> None:
        try:
            draft = self._draft()
        except ValueError:
            self._status_var.set("Heartbeat i polling muszą być liczbami całkowitymi.")
            return
        save_config(draft)
        self._config = draft
        self._status_var.set("Zapisano ustawienia.")
        if self._on_saved:
            self._on_saved(draft)

    def _on_test_connection(self) -> None:
        try:
            draft = self._draft()
        except ValueError:
            self._status_var.set("Heartbeat i polling muszą być liczbami całkowitymi.")
            return
        if not draft.server_url:
            self._status_var.set("Podaj URL serwera.")
            return
        if not draft.api_key:
            self._status_var.set("Podaj klucz API.")
            return
        save_config(draft)
        self._status_var.set("Test połączenia…")
        self.update_idletasks()
        try:
            sync_agent_registration(draft)
        except Exception as exc:
            logger.exception("Connection test failed")
            self._status_var.set(str(exc))
            return
        self._config = draft
        self._status_var.set("Połączenie OK.")
        if self._on_saved:
            self._on_saved(draft)
