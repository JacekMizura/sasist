"""System tray UI for Sasist Printer Agent."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw

from .config import save_config
from .build_info import format_about_text
from .runtime import AgentRuntime

logger = logging.getLogger(__name__)


@dataclass
class TrayContext:
    runtime: AgentRuntime
    on_restart: Callable[[], None]
    on_exit: Callable[[], None]


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def load_tray_icon() -> Image.Image:
    icon_path = _project_root() / "assets" / "icon.ico"
    if icon_path.exists():
        return Image.open(icon_path).convert("RGBA")

    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((8, 8, 56, 56), fill=(37, 99, 235, 255))
    draw.rectangle((22, 18, 42, 34), fill=(255, 255, 255, 255))
    draw.polygon([(20, 40), (44, 40), (32, 52)], fill=(255, 255, 255, 255))
    return image


def _format_status(ctx: TrayContext) -> str:
    cfg = ctx.runtime.config
    hb = ctx.runtime.state.heartbeat
    jobs = ctx.runtime.state.jobs
    online = "online" if hb.online else "offline"
    last_hb = hb.last_success_at.strftime("%Y-%m-%d %H:%M:%S") if hb.last_success_at else "—"
    last_poll = jobs.last_poll_at.strftime("%Y-%m-%d %H:%M:%S") if jobs.last_poll_at else "—"
    lines = [
        f"Status: {online}",
        f"Wersja: {cfg.version if cfg else '—'}",
        f"Agent ID: {cfg.agent_id if cfg and cfg.agent_id else '—'}",
        f"Machine ID: {cfg.machine_id if cfg else '—'}",
        f"Komputer: {cfg.computer_name if cfg else '—'}",
        f"Magazyn: {cfg.warehouse_id if cfg and cfg.warehouse_id else '—'}",
        f"Drukarki: {ctx.runtime.state.printer_count}",
        f"Ostatni heartbeat: {last_hb}",
        f"Ostatni poll: {last_poll}",
        f"Oczekujące zadania: {jobs.pending_count}",
    ]
    err = hb.last_error or jobs.last_poll_error or jobs.last_processing_error
    if err:
        lines.append(f"Ostatni błąd: {err}")
    if jobs.processing:
        lines.append("Drukowanie w toku…")
    return "\n".join(lines)


class TrayApp:
    def __init__(self, ctx: TrayContext) -> None:
        self._ctx = ctx
        self._icon = None

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
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo("Sasist Printer Agent", _format_status(self._ctx))
        root.destroy()

    def _open_config(self, _icon, _item) -> None:
        cfg = self._ctx.runtime.config
        if not cfg:
            return
        path = cfg.config_path
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            save_config(cfg)
        os.startfile(str(path))

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
            pystray.MenuItem("Status", self._show_status),
            pystray.MenuItem(
                "Pomoc",
                pystray.Menu(
                    pystray.MenuItem("O programie", self._show_about),
                ),
            ),
            pystray.MenuItem("Otwórz konfigurację", self._open_config),
            pystray.MenuItem("Otwórz logi", self._open_logs),
            pystray.MenuItem("Synchronizuj drukarki", self._sync_printers),
            pystray.MenuItem("Wydrukuj stronę testową", self._test_page),
            pystray.MenuItem("Restart usługi", self._restart_service),
            pystray.MenuItem("Restart aplikacji", self._restart),
            pystray.MenuItem("Wyjście", self._exit),
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
