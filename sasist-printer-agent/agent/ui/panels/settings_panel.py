"""Settings panel — connection, diagnostics, and configuration."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Callable

import customtkinter as ctk
import requests

from ... import __version__
from ...api import ApiError
from ...config import AgentConfig, save_config
from ...runtime import AgentRuntime
from .. import theme as T
from ..connection_test import probe_agent_connection
from ..ct_widgets import badge, card, info_row, primary_button, secondary_button

logger = logging.getLogger(__name__)

API_KEY_HINT = "Klucz API wygenerujesz w:\nSasist → Ustawienia → Integracje → Klucze API"
MASK_CHAR = "\u2022"
STATUS_CONNECTED = "\U0001f7e2 Poł\u0142\u0105czono"
STATUS_NO_CONNECTION = "\U0001f7e0 Brak po\u0142\u0105czenia"
STATUS_INVALID_KEY = "\U0001f534 Nieprawid\u0142owy klucz API"


class SettingsPanel(ctk.CTkFrame):
    def __init__(
        self,
        parent: ctk.CTkBaseClass,
        config: AgentConfig,
        *,
        runtime: AgentRuntime | None = None,
        on_saved: Callable[[AgentConfig], None] | None = None,
        on_sync: Callable[[], None] | None = None,
    ) -> None:
        super().__init__(parent, fg_color="transparent")
        self._config = config
        self._runtime = runtime
        self._on_saved = on_saved
        self._on_sync = on_sync
        self._api_key_visible = False
        self._last_test_status: str | None = None
        self._last_test_at: datetime | None = None
        self._last_reported_version: str | None = None
        self._test_passed = False
        self._saved_server_url = config.server_url
        self._saved_api_key = config.api_key
        self._pending_navigation: Callable[[], None] | None = None
        self._build()

    def update_config(self, config: AgentConfig) -> None:
        self._config = config
        self._server_var.set(config.server_url)
        self._api_key_var.set(config.api_key)
        self._saved_server_url = config.server_url
        self._saved_api_key = config.api_key
        self._test_passed = False
        self._set_message("")
        self._hide_unsaved_dialog()
        self._refresh_test_success_badge()
        self.refresh()

    def is_dirty(self) -> bool:
        server = self._server_var.get().strip().rstrip("/")
        api_key = self._api_key_var.get().strip()
        saved_server = (self._saved_server_url or "").strip().rstrip("/")
        saved_key = (self._saved_api_key or "").strip()
        return server != saved_server or api_key != saved_key

    def confirm_navigation(self, on_proceed: Callable[[], None]) -> bool:
        if not self.is_dirty():
            on_proceed()
            return True
        self._pending_navigation = on_proceed
        self._show_unsaved_dialog()
        return False

    def _show_unsaved_dialog(self) -> None:
        self._unsaved_dialog.pack(fill="x", pady=(T.PAD, 0), before=self._message_label)

    def _hide_unsaved_dialog(self) -> None:
        self._unsaved_dialog.pack_forget()
        self._pending_navigation = None

    def refresh(self) -> None:
        cfg = self._runtime.config if self._runtime and self._runtime.config else self._config
        if cfg:
            self._config = cfg

        status = self._resolve_connection_status(cfg)
        tone = "success" if "Połączono" in status else "danger" if "Nieprawid" in status else "warning"

        for child in self._status_badge_row.winfo_children():
            child.destroy()
        badge(self._status_badge_row, status, tone=tone).pack(side="left")

        last_test = self._last_test_at.strftime("%Y-%m-%d %H:%M:%S") if self._last_test_at else "—"
        machine_id = cfg.machine_id if cfg and cfg.machine_id else "—"
        agent_id = str(cfg.agent_id) if cfg and cfg.agent_id else "—"
        warehouse_id = str(cfg.warehouse_id) if cfg and cfg.warehouse_id else "—"
        reported = self._last_reported_version or (cfg.version if cfg and cfg.has_token else "—")

        rows = [
            ("Ostatni test połączenia:", last_test),
            ("Machine ID:", machine_id),
            ("Agent ID:", agent_id),
            ("Magazyn (warehouse_id):", warehouse_id),
            ("Wersja agenta:", __version__),
            ("Wersja zgłoszona do backendu:", reported),
        ]
        for child in self._diagnostics_body.winfo_children():
            child.destroy()
        for label, value in rows:
            info_row(self._diagnostics_body, label, value)

    def _build(self) -> None:
        scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        scroll.pack(fill="both", expand=True)

        connection = card(scroll, "Połączenie")
        self._server_var = ctk.StringVar(value=self._config.server_url)
        self._api_key_var = ctk.StringVar(value=self._config.api_key)
        self._labeled_entry(connection, "URL serwera", self._server_var)
        self._build_api_key_field(connection)

        self._test_success_row = ctk.CTkFrame(connection, fg_color="transparent")
        self._test_success_row.pack(fill="x", pady=(0, 8))

        diagnostics = card(scroll, "Diagnostyka")
        ctk.CTkLabel(
            diagnostics,
            text="Status połączenia:",
            font=T.FONT,
            text_color=T.MUTED,
            anchor="w",
        ).pack(fill="x", pady=(0, 6))
        self._status_badge_row = ctk.CTkFrame(diagnostics, fg_color="transparent")
        self._status_badge_row.pack(fill="x", pady=(0, 10))
        self._diagnostics_body = ctk.CTkFrame(diagnostics, fg_color="transparent")
        self._diagnostics_body.pack(fill="x")

        self._unsaved_dialog = ctk.CTkFrame(
            scroll,
            fg_color=T.PREVIEW_BG,
            corner_radius=T.CORNER_RADIUS_SM,
            border_width=1,
            border_color=T.BORDER,
        )
        ctk.CTkLabel(
            self._unsaved_dialog,
            text="Masz niezapisane zmiany",
            font=T.FONT_BOLD,
            text_color=T.TEXT,
            anchor="w",
        ).pack(fill="x", padx=T.PAD, pady=(T.PAD, 8))
        dialog_actions = ctk.CTkFrame(self._unsaved_dialog, fg_color="transparent")
        dialog_actions.pack(fill="x", padx=T.PAD, pady=(0, T.PAD))
        primary_button(dialog_actions, "Zapisz", self._on_unsaved_save).pack(side="left", padx=(0, 8))
        secondary_button(dialog_actions, "Odrzuć", self._on_unsaved_discard).pack(side="left", padx=(0, 8))
        secondary_button(dialog_actions, "Anuluj", self._hide_unsaved_dialog).pack(side="left")

        self._message_var = ctk.StringVar(value="")
        self._message_label = ctk.CTkLabel(
            scroll,
            textvariable=self._message_var,
            font=T.FONT,
            text_color=T.MUTED,
            anchor="w",
            wraplength=640,
            justify="left",
        )
        self._message_label.pack(fill="x", pady=(T.PAD, 0))

        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.pack(fill="x", pady=(T.PAD, 0))
        left = ctk.CTkFrame(footer, fg_color="transparent")
        left.pack(side="left")
        primary_button(left, "Test połączenia", self._on_test_connection).pack(side="left", padx=(0, 8))
        secondary_button(left, "Synchronizuj drukarki", self._on_sync_printers).pack(side="left")
        primary_button(footer, "Zapisz", self._on_save).pack(side="right")

        self.refresh()

    def _refresh_test_success_badge(self) -> None:
        for child in self._test_success_row.winfo_children():
            child.destroy()
        if self._test_passed:
            badge(
                self._test_success_row,
                "Połączenie poprawne — możesz zapisać konfigurację",
                tone="success",
            ).pack(anchor="w")

    def _on_unsaved_save(self) -> None:
        self._on_save()
        if not self.is_dirty():
            proceed = self._pending_navigation
            self._hide_unsaved_dialog()
            if proceed:
                proceed()

    def _on_unsaved_discard(self) -> None:
        self._server_var.set(self._saved_server_url)
        self._api_key_var.set(self._saved_api_key)
        self._test_passed = False
        self._refresh_test_success_badge()
        self._set_message("")
        proceed = self._pending_navigation
        self._hide_unsaved_dialog()
        if proceed:
            proceed()

    def _build_api_key_field(self, parent: ctk.CTkBaseClass) -> None:
        ctk.CTkLabel(parent, text="Klucz API", font=T.FONT_BOLD, text_color=T.TEXT, anchor="w").pack(
            fill="x", pady=(0, 4)
        )
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=(0, 6))
        self._api_key_entry = ctk.CTkEntry(
            row,
            textvariable=self._api_key_var,
            show=MASK_CHAR,
            fg_color=T.PREVIEW_BG,
            border_color=T.BORDER,
            text_color=T.TEXT,
            corner_radius=T.CORNER_RADIUS_SM,
        )
        self._api_key_entry.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self._toggle_key_btn = secondary_button(row, "\U0001f441 Pokaż", self._toggle_api_key_visibility)
        self._toggle_key_btn.pack(side="left", padx=(0, 8))
        secondary_button(row, "Wklej ze schowka", self._paste_api_key).pack(side="left")
        ctk.CTkLabel(
            parent,
            text=API_KEY_HINT,
            font=T.FONT_SMALL,
            text_color=T.MUTED,
            anchor="w",
            wraplength=640,
            justify="left",
        ).pack(fill="x", pady=(0, 14))

    def _labeled_entry(self, parent: ctk.CTkBaseClass, label: str, variable: ctk.StringVar) -> None:
        ctk.CTkLabel(parent, text=label, font=T.FONT_BOLD, text_color=T.TEXT, anchor="w").pack(fill="x", pady=(0, 4))
        ctk.CTkEntry(
            parent,
            textvariable=variable,
            fg_color=T.PREVIEW_BG,
            border_color=T.BORDER,
            text_color=T.TEXT,
            corner_radius=T.CORNER_RADIUS_SM,
        ).pack(fill="x", pady=(0, 14))

    def _toggle_api_key_visibility(self) -> None:
        self._api_key_visible = not self._api_key_visible
        self._api_key_entry.configure(show="" if self._api_key_visible else MASK_CHAR)
        self._toggle_key_btn.configure(text="\U0001f441 Ukryj" if self._api_key_visible else "\U0001f441 Pokaż")

    def _paste_api_key(self) -> None:
        try:
            value = self.clipboard_get().strip()
        except Exception:
            self._set_message("Schowek jest pusty lub niedostępny.", error=True)
            return
        if not value:
            self._set_message("Schowek jest pusty.", error=True)
            return
        self._api_key_var.set(value)
        self._set_message("Wklejono klucz API ze schowka.")

    def _draft(self) -> AgentConfig:
        draft = AgentConfig.from_dict(
            {
                **self._config.to_dict(),
                "server_url": self._server_var.get().strip().rstrip("/"),
                "api_key": self._api_key_var.get().strip(),
            }
        )
        draft.version = __version__
        return draft

    def _resolve_connection_status(self, cfg: AgentConfig | None) -> str:
        if self._last_test_status:
            return self._last_test_status
        if cfg and cfg.has_token:
            if self._runtime and self._runtime.state.heartbeat.online:
                return STATUS_CONNECTED
            return STATUS_CONNECTED
        return STATUS_NO_CONNECTION

    @staticmethod
    def _status_from_error(exc: Exception) -> str:
        if isinstance(exc, ApiError):
            if exc.status_code in (401, 403):
                return STATUS_INVALID_KEY
            if exc.status_code is None:
                return STATUS_NO_CONNECTION
        message = str(exc).lower()
        if any(token in message for token in ("401", "403", "unauthorized", "forbidden", "invalid api key", "api key")):
            return STATUS_INVALID_KEY
        if any(token in message for token in ("connection", "timeout", "failed after", "network", "refused")):
            return STATUS_NO_CONNECTION
        if isinstance(exc, (requests.ConnectionError, requests.Timeout)):
            return STATUS_NO_CONNECTION
        if isinstance(exc, ApiError) and exc.status_code and exc.status_code >= 400:
            return STATUS_INVALID_KEY
        return STATUS_NO_CONNECTION

    def _set_message(self, text: str, *, error: bool = False, success: bool = False) -> None:
        self._message_var.set(text)
        if success:
            color = T.SUCCESS
        elif error:
            color = T.DANGER
        else:
            color = T.MUTED
        self._message_label.configure(text_color=color)

    def _on_save(self) -> None:
        draft = self._draft()
        if not draft.server_url:
            self._set_message("Podaj URL serwera.", error=True)
            return
        if not draft.api_key:
            self._set_message("Podaj klucz API.", error=True)
            return
        save_config(draft)
        self._config = draft
        self._saved_server_url = draft.server_url
        self._saved_api_key = draft.api_key
        self._test_passed = False
        self._refresh_test_success_badge()
        if self._runtime:
            self._runtime.config = draft
        self._set_message("Zapisano ustawienia.", success=True)
        if self._on_saved:
            self._on_saved(draft)
        self.refresh()

    def _on_test_connection(self) -> None:
        draft = self._draft()
        if not draft.server_url:
            self._set_message("Podaj URL serwera.", error=True)
            return
        if not draft.api_key:
            self._set_message("Podaj klucz API.", error=True)
            return

        self._set_message("Test połączenia…")
        self.update_idletasks()
        try:
            probe_agent_connection(draft)
        except Exception as exc:
            logger.exception("Connection test failed")
            self._last_test_status = self._status_from_error(exc)
            self._last_test_at = datetime.now()
            self._test_passed = False
            self._refresh_test_success_badge()
            self._set_message(str(exc), error=True)
            self.refresh()
            return

        self._last_test_status = STATUS_CONNECTED
        self._last_test_at = datetime.now()
        self._last_reported_version = __version__
        self._test_passed = True
        self._refresh_test_success_badge()
        self._set_message(
            "Połączenie działa poprawnie. Kliknij Zapisz, aby zachować ustawienia w config.json.",
            success=True,
        )
        self.refresh()

    def _on_sync_printers(self) -> None:
        if not self._on_sync:
            self._set_message("Synchronizacja drukarek jest niedostępna.", error=True)
            return
        if self._runtime and not self._runtime.client:
            self._set_message("Agent nie jest połączony. Zapisz ustawienia i uruchom ponownie agenta.", error=True)
            return
        try:
            self._on_sync()
        except Exception as exc:
            logger.exception("Sync printers failed")
            self._set_message(str(exc), error=True)
            return
        self._last_reported_version = __version__
        self._set_message("Zsynchronizowano drukarki.", success=True)
        self.refresh()
