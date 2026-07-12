"""Application entrypoint — tray mode."""

from __future__ import annotations

import logging
import sys

from .runtime import AgentRuntime
from .tray import TrayApp, TrayContext, restart_process

logger = logging.getLogger(__name__)


class AgentApplication:
    def __init__(self) -> None:
        self.runtime = AgentRuntime()
        self.tray_app: TrayApp | None = None

    def run(self) -> int:
        try:
            self.runtime.start()
            assert self.runtime.config is not None
            tray_ctx = TrayContext(
                runtime=self.runtime,
                on_restart=self._restart,
                on_exit=self._exit,
            )
            self.tray_app = TrayApp(tray_ctx)
            self.tray_app.run()
            return 0
        except Exception:
            logger.exception("Fatal agent error")
            return 1
        finally:
            self.runtime.stop()

    def _restart(self) -> None:
        self.runtime.stop()
        restart_process()
        if self.tray_app:
            self.tray_app.stop()
        sys.exit(0)

    def _exit(self) -> None:
        self.runtime.signal_stop()
        if self.tray_app:
            self.tray_app.stop()


def main() -> int:
    app = AgentApplication()
    return app.run()


if __name__ == "__main__":
    raise SystemExit(main())
