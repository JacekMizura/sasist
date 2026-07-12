"""Poll pending print jobs and execute print workflow."""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from .api import ApiError, SasistApiClient
from .config import AgentConfig
from .printing import cleanup_pdf, download_pdf, print_pdf

logger = logging.getLogger(__name__)


@dataclass
class JobsState:
    pending_count: int = 0
    last_poll_at: datetime | None = None
    last_poll_error: str | None = None
    last_processing_error: str | None = None
    last_processed_job_id: int | None = None
    processing: bool = False


class JobsWorker:
    def __init__(
        self,
        client: SasistApiClient,
        config: AgentConfig,
        *,
        interval_sec: int = 5,
        on_state_change: Callable[[JobsState], None] | None = None,
    ) -> None:
        self._client = client
        self._config = config
        self._interval_sec = max(2, interval_sec)
        self._on_state_change = on_state_change
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.state = JobsState()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="jobs-poll", daemon=True)
        self._thread.start()
        logger.info("Jobs worker started (interval=%ss)", self._interval_sec)

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self._interval_sec + 30)
        logger.info("Jobs worker stopped")

    def _notify(self) -> None:
        if self._on_state_change:
            self._on_state_change(self.state)

    def poll_once(self) -> None:
        self.state.last_poll_at = datetime.now()
        try:
            jobs = self._client.get_pending_jobs()
            self.state.pending_count = len(jobs)
            self.state.last_poll_error = None
            self._notify()
        except ApiError as exc:
            self.state.last_poll_error = str(exc)
            logger.warning("Pending jobs poll failed: %s", exc)
            self._notify()
            return

        for job in jobs:
            if self._stop.is_set():
                break
            self._process_job(job)

    def _process_job(self, job: dict) -> None:
        job_id = job.get("id")
        if job_id is None:
            return

        self.state.processing = True
        self._notify()
        pdf_path = None

        try:
            logger.info("Processing job %s", job_id)
            self._client.mark_processing(int(job_id))

            printer_name = str(job.get("system_name") or "").strip()
            if not printer_name:
                raise ApiError(f"Job {job_id} missing system_name")

            payload = job.get("payload") or {}
            copies = int(payload.get("copies") or 1)

            pdf_path = download_pdf(self._client, job, server_url=self._config.server_url)
            print_pdf(pdf_path, printer_name, copies=copies)
            self._client.mark_complete(int(job_id))

            self.state.last_processed_job_id = int(job_id)
            self.state.last_processing_error = None
            logger.info("Job %s completed", job_id)
        except ApiError as exc:
            logger.error("Job %s failed: %s", job_id, exc)
            self.state.last_processing_error = str(exc)
            try:
                self._client.mark_failed(int(job_id), str(exc))
            except ApiError as mark_exc:
                logger.error("Could not mark job %s failed: %s", job_id, mark_exc)
        except Exception as exc:
            logger.exception("Unexpected error processing job %s", job_id)
            self.state.last_processing_error = str(exc)
            try:
                self._client.mark_failed(int(job_id), str(exc))
            except ApiError as mark_exc:
                logger.error("Could not mark job %s failed: %s", job_id, mark_exc)
        finally:
            if pdf_path is not None:
                cleanup_pdf(pdf_path)
            self.state.processing = False
            self._notify()

    def _run(self) -> None:
        while not self._stop.is_set():
            self.poll_once()
            self._stop.wait(self._interval_sec)
