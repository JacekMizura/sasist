"""
Run the API from the repository root (parent of ``backend/``):

    python -m backend

Uses ``PORT`` from the environment (Railway sets this, typically 8000).
Local dev with reload: ``UVICORN_RELOAD=1 python -m backend``

Do not run ``python backend/main.py`` from inside ``backend/``.
"""

from __future__ import annotations

import os

import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("UVICORN_RELOAD", "").strip().lower() in ("1", "true", "yes")
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
    )
