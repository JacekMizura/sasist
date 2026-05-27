"""Single production/dev uvicorn entrypoint (used by ``python -m backend`` and ``run_server.py``)."""

from __future__ import annotations

import os

import uvicorn


def resolve_port() -> int:
    raw = os.getenv("PORT", "8000")
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"Invalid PORT environment value: {raw!r}") from exc


def main() -> None:
    port = resolve_port()
    reload = os.getenv("UVICORN_RELOAD", "").strip().lower() in ("1", "true", "yes")

    print(
        f"[startup] binding uvicorn to 0.0.0.0:{port} "
        f"(PORT env={os.getenv('PORT')!r}, reload={reload})",
        flush=True,
    )

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
    )
