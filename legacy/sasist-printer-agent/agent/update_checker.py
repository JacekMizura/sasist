"""Check for agent updates and download release packages."""

from __future__ import annotations

import logging
import shutil
import tempfile
import threading
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Callable

import requests

from .config import program_data_dir
from .i18n import pl as PL

logger = logging.getLogger(__name__)

DEFAULT_CHECK_INTERVAL_SEC = 6 * 60 * 60  # 6 hours


def _parse_version(value: str) -> tuple[int, ...]:
    parts: list[int] = []
    for chunk in (value or "0").split("."):
        try:
            parts.append(int(chunk))
        except ValueError:
            parts.append(0)
    return tuple(parts or (0,))


def is_newer_version(current: str, remote: str) -> bool:
    return _parse_version(remote) > _parse_version(current)


class UpdateChecker:
    def __init__(
        self,
        client,
        *,
        current_version: str,
        interval_sec: int = DEFAULT_CHECK_INTERVAL_SEC,
        on_update_ready: Callable[[str], None] | None = None,
    ) -> None:
        self._client = client
        self._current_version = current_version
        self._interval_sec = max(300, interval_sec)
        self._on_update_ready = on_update_ready
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="update-checker", daemon=True)
        self._thread.start()
        logger.info("Update checker started (interval=%ss)", self._interval_sec)

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self._interval_sec + 5)

    def check_once(self) -> str | None:
        try:
            info = self._client.get_agent_version()
        except Exception as exc:
            logger.warning("Version check failed: %s", exc)
            return None

        remote_version = str(info.get("version") or "").strip()
        download_url = str(info.get("download_url") or "").strip()
        if not remote_version or not download_url:
            return None
        if not is_newer_version(self._current_version, remote_version):
            logger.debug("Agent up to date (%s)", self._current_version)
            return None

        logger.info("New agent version available: %s (current %s)", remote_version, self._current_version)
        return self._download_package(download_url, remote_version)

    def _download_package(self, url: str, version: str) -> str | None:
        updates_dir = program_data_dir() / "updates"
        updates_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        zip_path = updates_dir / f"sasist-agent-{version}-{stamp}.zip"

        try:
            response = requests.get(url, timeout=120, stream=True)
            response.raise_for_status()
            with zip_path.open("wb") as fh:
                for chunk in response.iter_content(chunk_size=65536):
                    if chunk:
                        fh.write(chunk)
        except Exception as exc:
            logger.error(PL.LOG_UPDATE_DOWNLOAD_FAILED, exc)
            return None

        if not zipfile.is_zipfile(zip_path):
            logger.error(PL.LOG_UPDATE_INVALID_FILE, zip_path.name)
            try:
                zip_path.unlink(missing_ok=True)
            except OSError:
                pass
            return None

        extract_dir = updates_dir / f"extract-{version}-{stamp}"
        extract_dir.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extract_dir)
        except Exception as exc:
            logger.error(PL.LOG_UPDATE_INVALID_FILE, exc)
            shutil.rmtree(extract_dir, ignore_errors=True)
            return None

        logger.info("Update package extracted to %s", extract_dir)
        if self._on_update_ready:
            self._on_update_ready(str(extract_dir))
        return str(extract_dir)

    def _run(self) -> None:
        while not self._stop.is_set():
            self.check_once()
            self._stop.wait(self._interval_sec)
