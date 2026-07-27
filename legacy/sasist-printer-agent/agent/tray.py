"""System tray UI for Sasist Printer Agent."""

from __future__ import annotations

import logging
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw

from .config import save_config
from .i18n import pl as PL
from .runtime import AgentRuntime
from .ui.host import get_ui_host
from .ui.main_window import MainWindow

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
        self._host = get_ui_host()
        self._host.ensure_started()
        self._host.set_main_window_factory(self._create_main_window)

    def _create_main_window(self, app) -> MainWindow:
        def _on_saved(updated) -> None:
            self._ctx.runtime.config = updated

        return MainWindow(app, self._ctx.runtime, on_saved=_on_saved)

    def _open_main(self, _icon, _item) -> None:
        cfg = self._ctx.runtime.config
        if cfg:
            cfg.config_path.parent.mkdir(parents=True, exist_ok=True)
            if not cfg.config_path.exists():
                save_config(cfg)
            host = get_ui_host()
            window = host.main_window
            if window is not None:
                window.update_config(cfg)
        get_ui_host().show_main_window("status")

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

    def _restart(self, _icon, _item) -> None:
        self._ctx.on_restart()

    def _exit(self, _icon, _item) -> None:
        self._ctx.on_exit()
        if self._icon:
            self._icon.stop()

    def run(self) -> None:
        import pystray

        menu = pystray.Menu(
            pystray.MenuItem(PL.TRAY_OPEN, self._open_main, default=True),
            pystray.MenuItem(PL.TRAY_SYNC, self._sync_printers),
            pystray.MenuItem(PL.TRAY_TEST_PAGE, self._test_page),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(PL.TRAY_RESTART, self._restart),
            pystray.MenuItem(PL.TRAY_EXIT, self._exit),
        )
        self._icon = pystray.Icon(
            "sasist_printer_agent",
            load_tray_icon(),
            PL.APP_TITLE,
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
