"""Windows Service entrypoint for Sasist Printer Agent."""

from __future__ import annotations

import sys

SERVICE_NAME = "SasistPrinterService"
SERVICE_DISPLAY_NAME = "Sasist Printer Service"
SERVICE_DESCRIPTION = "Sasist local printing service."


def main() -> int:
    if len(sys.argv) == 1:
        # Started by Service Control Manager
        from .service import SasistPrinterService

        import servicemanager

        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(SasistPrinterService)
        servicemanager.StartServiceCtrlDispatcher()
        return 0

    from .service import SasistPrinterService

    import win32serviceutil

    win32serviceutil.HandleCommandLine(SasistPrinterService)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
