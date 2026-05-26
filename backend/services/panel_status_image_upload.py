"""Resize + store panel status icons (orders / returns UI statuses)."""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from fastapi import HTTPException

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[misc, assignment]

UPLOAD_SUBDIR = "panel-status"
MAX_INPUT_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_DIM = 256


def _upload_root() -> Path:
    return Path(__file__).resolve().parent.parent / "uploads"


def save_panel_status_image_bytes(raw: bytes, content_type: str) -> str:
    """
    Zapisuje PNG (max ok. MAX_OUTPUT_DIM) pod ``/uploads/panel-status/``.
    Zwraca ścieżkę względną do użycia w ``image_url``.
    """
    if Image is None:
        raise HTTPException(status_code=500, detail="Pillow nie jest zainstalowany")
    if len(raw) > MAX_INPUT_BYTES:
        raise HTTPException(status_code=400, detail="Plik za duży (max 2 MB)")
    if len(raw) < 16:
        raise HTTPException(status_code=400, detail="Nieprawidłowy plik")

    ct = (content_type or "image/png").split(";")[0].strip().lower()
    if ct not in ("image/png", "image/jpeg", "image/webp", "image/gif"):
        raise HTTPException(status_code=400, detail="Dozwolone: PNG, JPEG, WebP, GIF")

    try:
        im = Image.open(io.BytesIO(raw))
        im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
        im.thumbnail((MAX_OUTPUT_DIM, MAX_OUTPUT_DIM), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        out = buf.getvalue()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Nie udało się przetworzyć obrazu: {e}") from e

    root = _upload_root() / UPLOAD_SUBDIR
    root.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.png"
    path = root / name
    path.write_bytes(out)
    return f"/uploads/{UPLOAD_SUBDIR}/{name}"
