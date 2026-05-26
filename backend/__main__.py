"""
Run the API from the repository root (parent of ``backend/``):

    python -m backend

Equivalent to ``uvicorn backend.main:app``. Do not run ``python backend/main.py``
from inside ``backend/`` — relative imports require the ``backend`` package.
"""

from __future__ import annotations

import uvicorn

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8010, reload=True)
