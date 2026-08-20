"""Shared logging filters (fail-open)."""

from __future__ import annotations

import logging
from typing import Iterable
from urllib.parse import urlsplit

# Successful 2xx access lines for these paths are suppressed (noise from print agent polls).
QUIET_AGENT_ACCESS_PATHS: frozenset[str] = frozenset(
    {
        "/api/printing/jobs/pending",
        "/api/printing/agents/heartbeat",
        "/api/agent/devices/sync",
    }
)

_FILTER_NAME = "QuietPrintingAgentAccessFilter"


def _path_without_query(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    path = urlsplit(raw).path
    if not path:
        return None
    # Normalize trailing slash (except root)
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    return path


def parse_uvicorn_access_record(record: logging.LogRecord) -> tuple[str, int] | None:
    """
    Extract (path, status_code) from a uvicorn.access LogRecord.

    uvicorn 0.x logs:
      '%s - "%s %s HTTP/%s" %d' % (client, method, path_with_query, http_version, status)

    Fail-open: return None when the shape is unexpected.
    """
    args = record.args
    if not isinstance(args, tuple) or len(args) < 5:
        return None
    # (client_addr, method, full_path, http_version, status_code)
    path = _path_without_query(args[2])
    status_raw = args[4]
    try:
        status = int(status_raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if path is None:
        return None
    return path, status


class QuietPrintingAgentAccessFilter(logging.Filter):
    """Suppress uvicorn.access INFO for successful 2xx on known agent poll paths."""

    def __init__(self, name: str = "", quiet_paths: Iterable[str] | None = None) -> None:
        super().__init__(name)
        self._quiet = frozenset(quiet_paths) if quiet_paths is not None else QUIET_AGENT_ACCESS_PATHS

    def filter(self, record: logging.LogRecord) -> bool:
        parsed = parse_uvicorn_access_record(record)
        if parsed is None:
            return True  # fail-open: never suppress unknown formats
        path, status = parsed
        if path not in self._quiet:
            return True
        if 200 <= status < 300:
            return False  # suppress
        return True  # keep 3xx/4xx/5xx


def install_quiet_printing_agent_access_filter() -> None:
    """Attach filter once to uvicorn.access (idempotent)."""
    access = logging.getLogger("uvicorn.access")
    for existing in access.filters:
        if getattr(existing, "name", None) == _FILTER_NAME or isinstance(
            existing, QuietPrintingAgentAccessFilter
        ):
            return
    filt = QuietPrintingAgentAccessFilter(name=_FILTER_NAME)
    access.addFilter(filt)
