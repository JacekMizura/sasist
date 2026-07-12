"""Single main window — sidebar navigation + content panels."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Literal

import customtkinter as ctk

from ..config import AgentConfig
from ..runtime import AgentRuntime
from . import theme as T
from .ct_widgets import apply_window_icon, build_sidebar_header, sidebar_button
from .panels import LogsPanel, SettingsPanel, StatusPanel

TabKey = Literal["status", "logs", "settings"]

SIDEBAR_ITEMS: tuple[tuple[TabKey, str], ...] = (
    ("status", "Status"),
    ("logs", "Logi"),
    ("settings", "Ustawienia"),
)


class MainWindow:
    _instance: MainWindow | None = None

    def __init__(
        self,
        app: ctk.CTk,
        runtime: AgentRuntime,
        *,
        on_saved: Callable[[AgentConfig], None] | None = None,
    ) -> None:
        if MainWindow._instance is not None:
            raise RuntimeError("MainWindow already exists — use UiHost.show_main_window()")
        self._app = app
        self._runtime = runtime
        self._on_saved = on_saved
        self._active_tab: TabKey = "status"
        self._nav_buttons: dict[TabKey, ctk.CTkButton] = {}
        self._panels: dict[TabKey, ctk.CTkFrame] = {}
        self._built = False
        MainWindow._instance = self

    @classmethod
    def instance(cls) -> MainWindow | None:
        return cls._instance

    @classmethod
    def reset_for_tests(cls) -> None:
        cls._instance = None

    def show(self, tab: TabKey = "status") -> None:
        self._ensure_built()
        self.select_tab(tab)
        self._app.deiconify()
        self._app.lift()
        self._app.focus_force()

    def hide(self) -> None:
        logs = self._panels.get("logs")
        if isinstance(logs, LogsPanel):
            logs.stop_refresh()
        self._app.withdraw()

    def select_tab(self, tab: TabKey) -> None:
        self._ensure_built()
        self._active_tab = tab
        for key, panel in self._panels.items():
            if key == tab:
                panel.pack(fill="both", expand=True)
                if key == "status" and isinstance(panel, StatusPanel):
                    panel.refresh()
                elif key == "logs" and isinstance(panel, LogsPanel):
                    cfg = self._runtime.config
                    if cfg:
                        panel.set_log_dir(cfg.log_path.parent)
                    panel.start_refresh()
            else:
                panel.pack_forget()
                if key == "logs" and isinstance(panel, LogsPanel):
                    panel.stop_refresh()
        self._update_nav()

    def update_config(self, config: AgentConfig) -> None:
        settings = self._panels.get("settings")
        if isinstance(settings, SettingsPanel):
            settings.update_config(config)

    def _ensure_built(self) -> None:
        if self._built:
            return
        self._build()
        self._built = True

    def _build(self) -> None:
        self._app.title("Sasist Printer Agent")
        self._app.geometry("960x640")
        self._app.minsize(880, 580)
        self._app.configure(fg_color=T.BG)
        apply_window_icon(self._app)
        self._app.protocol("WM_DELETE_WINDOW", self.hide)

        root = ctk.CTkFrame(self._app, fg_color=T.BG, corner_radius=0)
        root.pack(fill="both", expand=True)

        sidebar = ctk.CTkFrame(root, fg_color=T.SIDEBAR, width=220, corner_radius=0)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)
        build_sidebar_header(sidebar)

        nav = ctk.CTkFrame(sidebar, fg_color="transparent")
        nav.pack(fill="x", padx=T.PAD, pady=(0, T.PAD))
        for key, label in SIDEBAR_ITEMS:
            btn = sidebar_button(nav, label, lambda tab=key: self.select_tab(tab))
            btn.pack(fill="x", pady=4)
            self._nav_buttons[key] = btn

        self._content = ctk.CTkFrame(root, fg_color=T.BG, corner_radius=0)
        self._content.pack(side="left", fill="both", expand=True, padx=T.PAD, pady=T.PAD)

        self._panels["status"] = StatusPanel(self._content, self._runtime)
        log_dir = Path(".")
        cfg = self._runtime.config
        if cfg:
            log_dir = cfg.log_path.parent
        self._panels["logs"] = LogsPanel(self._content, log_dir)
        self._panels["settings"] = SettingsPanel(
            self._content,
            cfg if cfg else AgentConfig(server_url="", api_key=""),
            on_saved=self._on_saved,
        )

        self._update_nav()

    def _update_nav(self) -> None:
        for key, btn in self._nav_buttons.items():
            active = key == self._active_tab
            btn.configure(
                fg_color=T.PRIMARY if active else "transparent",
                hover_color=T.PRIMARY_HOVER if active else T.BORDER,
                text_color="#FFFFFF" if active else T.TEXT,
            )
