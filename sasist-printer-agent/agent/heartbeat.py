"""Periodic heartbeat to Sasist backend."""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, TYPE_CHECKING

from .api import ApiError, SasistApiClient

if TYPE_CHECKING:
    from .jobs import JobsState

logger = logging.getLogger(__name__)


@dataclass
class HeartbeatState:
    online: bool = False
    last_success_at: datetime | None = None
    last_error: str | None = None


class HeartbeatWorker:
    def __init__(
        self,
        client: SasistApiClient,
        *,
        interval_sec: int = 30,
        on_state_change: Callable[[HeartbeatState], None] | None = None,
        jobs_state: JobsState | None = None,
    ) -> None:
        self._client = client
        self._interval_sec = max(5, interval_sec)
        self._on_state_change = on_state_change
        self._jobs_state = jobs_state
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.state = HeartbeatState()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="heartbeat", daemon=True)
        self._thread.start()
        logger.info("Heartbeat worker started (interval=%ss)", self._interval_sec)

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self._interval_sec + 5)
        logger.info("Heartbeat worker stopped")

    def tick_once(self) -> HeartbeatState:
        last_poll_at: str | None = None
        last_error: str | None = None
        if self._jobs_state is not None:
            if self._jobs_state.last_poll_at is not None:
                last_poll_at = self._jobs_state.last_poll_at.isoformat()
            poll_err = self._jobs_state.last_poll_error
            proc_err = self._jobs_state.last_processing_error
            last_error = poll_err or proc_err

        try:
            result = self._client.heartbeat(last_poll_at=last_poll_at, last_error=last_error)
            self.state.online = bool(result.get("is_online", True))
            self.state.last_success_at = datetime.now()
            self.state.last_error = None
            logger.debug("Heartbeat OK")
        except ApiError as exc:
            self.state.online = False
            self.state.last_error = str(exc)
            logger.warning("Heartbeat failed: %s", exc)
        if self._on_state_change:
            self._on_state_change(self.state)
        return self.state

    def _run(self) -> None:
        while not self._stop.is_set():
            self.tick_once()
            self._stop.wait(self._interval_sec)
