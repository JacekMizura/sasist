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
from ...i18n import pl as PL
from ...runtime import AgentRuntime
from .. import theme as T
from ..clipboard import copy_button_feedback
from ..connection_test import probe_agent_connection
from ..ct_widgets import badge, card, info_row, primary_button, secondary_button

logger = logging.getLogger(__name__)

MASK_CHAR = "\u2022"


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
        self._copy_key_btn: ctk.CTkButton | None = None
        self._toggle_key_btn: ctk.CTkButton | None = None
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)
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
        tone = (
            "success"
            if status == PL.STATUS_CONNECTED
            else "danger"
            if status == PL.STATUS_INVALID_KEY
            else "warning"
        )

        for child in self._status_badge_row.winfo_children():
            child.destroy()
        badge(self._status_badge_row, status, tone=tone).pack(side="left")

        last_test = self._last_test_at.strftime("%Y-%m-%d %H:%M:%S") if self._last_test_at else "—"
        machine_id = cfg.machine_id if cfg and cfg.machine_id else "—"
        agent_id = str(cfg.agent_id) if cfg and cfg.agent_id else "—"
        warehouse_id = str(cfg.warehouse_id) if cfg and cfg.warehouse_id else "—"
        reported = self._last_reported_version or (cfg.version if cfg and cfg.has_token else "—")

        rows = [
            (PL.DIAG_LAST_TEST, last_test),
            (PL.DIAG_MACHINE_ID, machine_id),
            (PL.DIAG_AGENT_ID, agent_id),
            (PL.DIAG_WAREHOUSE, warehouse_id),
            (PL.DIAG_AGENT_VERSION, __version__),
            (PL.DIAG_REPORTED_VERSION, reported),
        ]
        for child in self._diagnostics_body.winfo_children():
            child.destroy()
        for label, value in rows:
            info_row(self._diagnostics_body, label, value)

    def _build(self) -> None:
        scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        scroll.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)

        connection = card(scroll, PL.SETTINGS_CONNECTION)
        self._server_var = ctk.StringVar(value=self._config.server_url)
        self._api_key_var = ctk.StringVar(value=self._config.api_key)

        ctk.CTkLabel(connection, text=PL.SETTINGS_SERVER_URL, font=T.FONT_BOLD, text_color=T.TEXT, anchor="w").pack(
            fill="x", pady=(0, 4)
        )
        self._server_entry = ctk.CTkEntry(
            connection,
            textvariable=self._server_var,
            fg_color=T.PREVIEW_BG,
            border_color=T.BORDER,
            text_color=T.TEXT,
            corner_radius=T.CORNER_RADIUS_SM,
            height=36,
        )
        self._server_entry.pack(fill="x", pady=(0, 14))

        self._build_api_key_field(connection)

        self._test_success_row = ctk.CTkFrame(connection, fg_color="transparent")
        self._test_success_row.pack(fill="x", pady=(0, 8))

        ctk.CTkLabel(connection, text=PL.SETTINGS_CONNECTION_STATUS, font=T.FONT, text_color=T.MUTED, anchor="w").pack(
            fill="x", pady=(4, 6)
        )
        self._status_badge_row = ctk.CTkFrame(connection, fg_color="transparent")
        self._status_badge_row.pack(fill="x", pady=(0, 4))

        diagnostics = card(scroll, PL.SETTINGS_DIAGNOSTICS)
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
            text=PL.SETTINGS_UNSAVED_CHANGES,
            font=T.FONT_BOLD,
            text_color=T.TEXT,
            anchor="w",
        ).pack(fill="x", padx=T.PAD, pady=(T.PAD, 8))
        dialog_actions = ctk.CTkFrame(self._unsaved_dialog, fg_color="transparent")
        dialog_actions.pack(fill="x", padx=T.PAD, pady=(0, T.PAD))
        primary_button(dialog_actions, PL.SAVE, self._on_unsaved_save).pack(side="left", padx=(0, 8))
        secondary_button(dialog_actions, PL.DISCARD, self._on_unsaved_discard).pack(side="left", padx=(0, 8))
        secondary_button(dialog_actions, PL.CANCEL, self._hide_unsaved_dialog).pack(side="left")

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
        footer.grid(row=1, column=0, sticky="ew", pady=(T.PAD, 0))
        footer.grid_columnconfigure(0, weight=1)

        primary_button(footer, PL.SETTINGS_TEST_CONNECTION, self._on_test_connection).grid(
            row=0, column=0, sticky="ew", pady=(0, 8)
        )
        primary_button(footer, PL.SAVE, self._on_save).grid(row=1, column=0, sticky="ew", pady=(0, 8))
        secondary_button(footer, PL.SETTINGS_SYNC_PRINTERS, self._on_sync_printers).grid(row=2, column=0, sticky="ew")

        self.refresh()

    def _refresh_test_success_badge(self) -> None:
        for child in self._test_success_row.winfo_children():
            child.destroy()
        if self._test_passed:
            badge(self._test_success_row, PL.SETTINGS_TEST_SUCCESS, tone="success").pack(anchor="w")

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
        ctk.CTkLabel(parent, text=PL.SETTINGS_API_KEY, font=T.FONT_BOLD, text_color=T.TEXT, anchor="w").pack(
            fill="x", pady=(0, 4)
        )
        self._api_key_entry = ctk.CTkEntry(
            parent,
            textvariable=self._api_key_var,
            show=MASK_CHAR,
            fg_color=T.PREVIEW_BG,
            border_color=T.BORDER,
            text_color=T.TEXT,
            corner_radius=T.CORNER_RADIUS_SM,
            height=36,
        )
        self._api_key_entry.pack(fill="x", pady=(0, 8))

        actions = ctk.CTkFrame(parent, fg_color="transparent")
        actions.pack(fill="x", pady=(0, 8))
        secondary_button(actions, PL.PASTE, self._paste_api_key).pack(side="left", padx=(0, 8))
        self._copy_key_btn = secondary_button(actions, PL.COPY, self._copy_api_key)
        self._copy_key_btn.pack(side="left", padx=(0, 8))
        self._toggle_key_btn = secondary_button(actions, PL.SHOW, self._toggle_api_key_visibility)
        self._toggle_key_btn.pack(side="left")

        ctk.CTkLabel(
            parent,
            text=PL.SETTINGS_API_KEY_HINT,
            font=T.FONT_SMALL,
            text_color=T.MUTED,
            anchor="w",
            wraplength=640,
            justify="left",
        ).pack(fill="x", pady=(0, 8))

    def _toggle_api_key_visibility(self) -> None:
        self._api_key_visible = not self._api_key_visible
        self._api_key_entry.configure(show="" if self._api_key_visible else MASK_CHAR)
        if self._toggle_key_btn:
            self._toggle_key_btn.configure(text=PL.HIDE if self._api_key_visible else PL.SHOW)

    def _paste_api_key(self) -> None:
        try:
            value = self.clipboard_get().strip()
        except Exception:
            self._set_message(PL.CLIPBOARD_UNAVAILABLE, error=True)
            return
        if not value:
            self._set_message(PL.CLIPBOARD_EMPTY, error=True)
            return
        self._api_key_var.set(value)
        self._set_message(PL.SETTINGS_PASTED_KEY)

    def _copy_api_key(self) -> None:
        value = self._api_key_var.get().strip()
        if not value or not self._copy_key_btn:
            return
        copy_button_feedback(self._copy_key_btn, value, original_text=PL.COPY)

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
            return PL.STATUS_CONNECTED
        if not (cfg and cfg.server_url and cfg.api_key):
            return PL.STATUS_NOT_CONFIGURED
        return PL.STATUS_NO_CONNECTION

    @staticmethod
    def _status_from_error(exc: Exception) -> str:
        if isinstance(exc, ApiError):
            if exc.status_code in (401, 403):
                return PL.STATUS_INVALID_KEY
            if exc.status_code is None:
                return PL.STATUS_NO_CONNECTION
        message = str(exc).lower()
        if any(token in message for token in ("401", "403", "unauthorized", "forbidden", "invalid api key", "api key")):
            return PL.STATUS_INVALID_KEY
        if any(token in message for token in ("connection", "timeout", "failed after", "network", "refused")):
            return PL.STATUS_NO_CONNECTION
        if isinstance(exc, (requests.ConnectionError, requests.Timeout)):
            return PL.STATUS_NO_CONNECTION
        if isinstance(exc, ApiError) and exc.status_code and exc.status_code >= 400:
            return PL.STATUS_INVALID_KEY
        return PL.STATUS_NO_CONNECTION

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
            self._set_message(PL.SETTINGS_NEED_URL, error=True)
            return
        if not draft.api_key:
            self._set_message(PL.SETTINGS_NEED_KEY, error=True)
            return
        save_config(draft)
        self._config = draft
        self._saved_server_url = draft.server_url
        self._saved_api_key = draft.api_key
        self._test_passed = False
        self._refresh_test_success_badge()
        if self._runtime:
            self._runtime.config = draft
        self._set_message(PL.SETTINGS_SAVED, success=True)
        if self._on_saved:
            self._on_saved(draft)
        self.refresh()

    def _on_test_connection(self) -> None:
        draft = self._draft()
        if not draft.server_url:
            self._set_message(PL.SETTINGS_NEED_URL, error=True)
            return
        if not draft.api_key:
            self._set_message(PL.SETTINGS_NEED_KEY, error=True)
            return

        self._set_message(PL.SETTINGS_TEST_RUNNING)
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

        self._last_test_status = PL.STATUS_CONNECTED
        self._last_test_at = datetime.now()
        self._last_reported_version = __version__
        self._test_passed = True
        self._refresh_test_success_badge()
        self._set_message(PL.SETTINGS_TEST_OK_HINT, success=True)
        self.refresh()

    def _on_sync_printers(self) -> None:
        if not self._on_sync:
            self._set_message(PL.SETTINGS_SYNC_UNAVAILABLE, error=True)
            return
        if self._runtime and not self._runtime.client:
            self._set_message(PL.SETTINGS_NOT_CONNECTED, error=True)
            return
        try:
            self._on_sync()
        except Exception as exc:
            logger.exception("Sync printers failed")
            self._set_message(str(exc), error=True)
            return
        self._last_reported_version = __version__
        self._set_message(PL.SETTINGS_SYNC_OK, success=True)
        self.refresh()
