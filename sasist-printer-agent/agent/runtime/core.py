"""Shared agent runtime — heartbeat, jobs, update checker (no UI)."""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field

from .. import __version__
from ..api import SasistApiClient
from ..auth import register_if_needed, sync_agent_registration
from ..config import AgentConfig, load_config
from ..heartbeat import HeartbeatState, HeartbeatWorker
from ..jobs import JobsState, JobsWorker
from ..logging_setup import setup_logging
from ..printers import list_windows_printers
from ..update_checker import UpdateChecker

logger = logging.getLogger(__name__)


@dataclass
class RuntimeState:
    heartbeat: HeartbeatState = field(default_factory=HeartbeatState)
    jobs: JobsState = field(default_factory=JobsState)
    printer_count: int = 0


class AgentRuntime:
    """Core worker loop shared by tray app and Windows service."""

    def __init__(self) -> None:
        self.config: AgentConfig | None = None
        self.client: SasistApiClient | None = None
        self.heartbeat_worker: HeartbeatWorker | None = None
        self.jobs_worker: JobsWorker | None = None
        self.update_checker: UpdateChecker | None = None
        self.state = RuntimeState()
        self._shutdown = threading.Event()
        self._started = False

    def start(self) -> None:
        if self._started:
            return

        self.config = load_config()
        persisted_version = self.config.version
        self.config.version = __version__
        self.config.ensure_directories()
        setup_logging(self.config.log_path)

        logger.info("Sasist Printer Runtime v%s starting", __version__)
        logger.info("Config path: %s", self.config.config_path)

        self.config, self.client = register_if_needed(self.config)
        assert self.client is not None

        if self.config.has_token and persisted_version.strip() and persisted_version.strip() != __version__:
            logger.info(
                "Agent version changed (%s -> %s); re-registering to sync backend",
                persisted_version,
                __version__,
            )
            self.config, self.client = sync_agent_registration(self.config, self.client)
        self.state.printer_count = len(list_windows_printers())

        self.heartbeat_worker = HeartbeatWorker(
            self.client,
            interval_sec=self.config.heartbeat_interval_sec,
            on_state_change=self._on_heartbeat_change,
            jobs_state=self.state.jobs,
            config=self.config,
            get_printer_count=lambda: self.state.printer_count,
        )
        self.jobs_worker = JobsWorker(
            self.client,
            self.config,
            interval_sec=self.config.poll_interval_sec,
            on_state_change=self._on_jobs_change,
        )
        self.update_checker = UpdateChecker(
            self.client,
            current_version=__version__,
            on_update_ready=self._on_update_ready,
        )

        self.heartbeat_worker.start()
        self.jobs_worker.start()
        self.update_checker.start()
        self._started = True

    def stop(self) -> None:
        if self.update_checker:
            self.update_checker.stop()
        if self.heartbeat_worker:
            self.heartbeat_worker.stop()
        if self.jobs_worker:
            self.jobs_worker.stop()
        self._shutdown.set()
        self._started = False
        logger.info("Runtime stopped")

    def wait_until_stopped(self, timeout: float | None = None) -> bool:
        return self._shutdown.wait(timeout)

    def signal_stop(self) -> None:
        self._shutdown.set()
        self.stop()

    def sync_printers(self) -> None:
        if not self.config or not self.client:
            return
        logger.info("Manual printer sync requested")
        self.config, self.client = sync_agent_registration(self.config, self.client)
        self.state.printer_count = len(list_windows_printers())
        if self.heartbeat_worker:
            self.heartbeat_worker.tick_once()

    def request_test_page(self) -> None:
        if not self.client:
            raise RuntimeError("Agent is not registered")
        self.client.request_test_page()

    def restart_service(self) -> None:
        import subprocess

        subprocess.run(["sc", "stop", "SasistPrinterService"], capture_output=True)
        subprocess.run(["sc", "start", "SasistPrinterService"], capture_output=True)

    def _on_heartbeat_change(self, state: HeartbeatState) -> None:
        self.state.heartbeat = state

    def _on_jobs_change(self, state: JobsState) -> None:
        self.state.jobs = state

    def _on_update_ready(self, package_path: str) -> None:
        logger.info("Update package ready: %s", package_path)
        from ..updater_launcher import launch_updater

        launch_updater(package_path)
