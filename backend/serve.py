"""Single production/dev uvicorn entrypoint (used by ``python -m backend`` and ``run_server.py``)."""

from __future__ import annotations

import os

import uvicorn

# Railway health probes use IPv4 — bind all interfaces (not import-time DB work).
UVICORN_HOST = os.getenv("UVICORN_HOST", "0.0.0.0")


def resolve_port() -> int:
    raw = os.getenv("PORT", "8080")
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"Invalid PORT environment value: {raw!r}") from exc


def main() -> None:
    port = resolve_port()
    host = UVICORN_HOST
    reload = os.getenv("UVICORN_RELOAD", "").strip().lower() in ("1", "true", "yes")

    print(
        f"[startup] bind host={host} port={port} "
        f"(PORT env={os.getenv('PORT')!r}, reload={reload})",
        flush=True,
    )
    print(
        "[startup] uvicorn proxy_headers=True forwarded_allow_ips=*",
        flush=True,
    )

    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=reload,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
