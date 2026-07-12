"""Sasist Printer Service — runs agent runtime without user session."""

from __future__ import annotations

import logging

import win32event
import win32service
import win32serviceutil
import servicemanager

from .runtime import AgentRuntime
from .service_main import SERVICE_DESCRIPTION, SERVICE_DISPLAY_NAME, SERVICE_NAME

logger = logging.getLogger(__name__)


class SasistPrinterService(win32serviceutil.ServiceFramework):
    _svc_name_ = SERVICE_NAME
    _svc_display_name_ = SERVICE_DISPLAY_NAME
    _svc_description_ = SERVICE_DESCRIPTION

    def __init__(self, args) -> None:
        win32serviceutil.ServiceFramework.__init__(self, args)
        self._stop_event = win32event.CreateEvent(None, 0, 0, None)
        self._runtime: AgentRuntime | None = None

    def SvcStop(self) -> None:
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        if self._runtime:
            self._runtime.signal_stop()
        win32event.SetEvent(self._stop_event)

    def SvcDoRun(self) -> None:
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        try:
            self._runtime = AgentRuntime()
            self._runtime.start()
            win32event.WaitForSingleObject(self._stop_event, win32event.INFINITE)
        except Exception:
            logger.exception("Service runtime failed")
            raise
        finally:
            if self._runtime:
                self._runtime.stop()
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STOPPED,
                (self._svc_name_, ""),
            )
