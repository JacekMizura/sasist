"""System tray UI for Sasist Printer Agent."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw

from .build_info import format_about_text
from .config import save_config
from .runtime import AgentRuntime
from .ui.config_dialog import ConfigDialog
from .ui.status_window import StatusWindow

logger = logging.getLogger(__name__)

PRIMARY_RGBA = (249, 115, 22, 255)


@dataclass
class TrayContext:
    runtime: AgentRuntime
    on_restart: Callable[[], None]
    on_exit: Callable[[], None]


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _draw_fallback_icon(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=(15, 23, 42, 255))
    margin = size // 6
    cx, cy = size // 2, size // 2
    s = size // 4
    top = [(cx, cy - s), (cx + s, cy - s // 2), (cx, cy), (cx - s, cy - s // 2)]
    draw.polygon(top, outline=PRIMARY_RGBA)
    draw.ellipse((margin, size - margin - 4, margin + 4, size - margin), fill=PRIMARY_RGBA)
    return image


def load_tray_icon() -> Image.Image:
    icon_path = _project_root() / "assets" / "icon.ico"
    if icon_path.exists():
        return Image.open(icon_path).convert("RGBA")
    return _draw_fallback_icon(64)


class TrayApp:
    def __init__(self, ctx: TrayContext) -> None:
        self._ctx = ctx
        self._icon = None
        self._ui_lock = threading.Lock()

    def _run_ui(self, builder: Callable[[], None]) -> None:
        if not self._ui_lock.acquire(blocking=False):
            return
        try:
            builder()
        finally:
            self._ui_lock.release()

    def _show_about(self, _icon, _item) -> None:
        import tkinter as tk
        from tkinter import messagebox

        cfg = self._ctx.runtime.config
        config_version = cfg.version if cfg else None
        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo("O programie", format_about_text(config_version=config_version))
        root.destroy()

    def _show_status(self, _icon, _item) -> None:
        def _open() -> None:
            StatusWindow(
                self._ctx.runtime,
                on_open_config=lambda: self._open_config(None, None),
                on_open_logs=lambda: self._open_logs(None, None),
                on_sync=lambda: self._sync_printers(None, None),
                on_test_page=lambda: self._test_page(None, None),
            ).show()

        threading.Thread(target=lambda: self._run_ui(_open), daemon=True).start()

    def _open_config(self, _icon, _item) -> None:
        cfg = self._ctx.runtime.config
        if not cfg:
            return

        def _open() -> None:
            cfg.config_path.parent.mkdir(parents=True, exist_ok=True)
            if not cfg.config_path.exists():
                save_config(cfg)

            def _on_saved(updated) -> None:
                self._ctx.runtime.config = updated

            ConfigDialog(cfg, on_saved=_on_saved).show()

        threading.Thread(target=lambda: self._run_ui(_open), daemon=True).start()

    def _open_logs(self, _icon, _item) -> None:
        cfg = self._ctx.runtime.config
        if not cfg:
            return
        log_dir = cfg.log_path.parent
        log_dir.mkdir(parents=True, exist_ok=True)
        os.startfile(str(log_dir))

    def _sync_printers(self, _icon, _item) -> None:
        try:
            self._ctx.runtime.sync_printers()
        except Exception as exc:
            logger.exception("Sync printers failed: %s", exc)

    def _test_page(self, _icon, _item) -> None:
        try:
            self._ctx.runtime.request_test_page()
        except Exception as exc:
            logger.exception("Test page failed: %s", exc)

    def _restart_service(self, _icon, _item) -> None:
        try:
            self._ctx.runtime.restart_service()
        except Exception as exc:
            logger.exception("Service restart failed: %s", exc)

    def _restart(self, _icon, _item) -> None:
        self._ctx.on_restart()

    def _exit(self, _icon, _item) -> None:
        self._ctx.on_exit()
        if self._icon:
            self._icon.stop()

    def run(self) -> None:
        import pystray

        menu = pystray.Menu(
            pystray.MenuItem("Status", self._show_status, default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Otwórz konfigurację", self._open_config),
            pystray.MenuItem("Otwórz logi", self._open_logs),
            pystray.MenuItem("Synchronizuj drukarki", self._sync_printers),
            pystray.MenuItem("Wydrukuj stronę testową", self._test_page),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Restart usługi", self._restart_service),
            pystray.MenuItem("Restart aplikacji", self._restart),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Ustawienia", self._open_config),
            pystray.MenuItem("O programie", self._show_about),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Zamknij", self._exit),
        )
        self._icon = pystray.Icon(
            "sasist_printer_agent",
            load_tray_icon(),
            "Sasist Printer Agent",
            menu,
        )
        logger.info("Starting tray icon")
        self._icon.run()

    def stop(self) -> None:
        if self._icon:
            self._icon.stop()


def restart_process() -> None:
    executable = sys.executable
    args = sys.argv[:]
    if getattr(sys, "frozen", False):
        subprocess.Popen([executable, *args[1:]], close_fds=True)
    else:
        subprocess.Popen([executable, "-m", "agent", *args[1:]], close_fds=True)
    logger.info("Restarting agent process")
