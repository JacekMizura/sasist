"""Agent release version and auto-print settings."""

from __future__ import annotations

import os

AGENT_RELEASE_VERSION = os.getenv("SASIST_AGENT_RELEASE_VERSION", "1.0.0")
# No hardcoded dead URL — empty means "use GitHub Releases only".
AGENT_DOWNLOAD_URL = os.getenv("SASIST_AGENT_DOWNLOAD_URL", "").strip()
AGENT_UPDATE_MANDATORY = os.getenv("SASIST_AGENT_UPDATE_MANDATORY", "false").lower() in {
    "1",
    "true",
    "yes",
}
