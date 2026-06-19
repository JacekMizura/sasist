"""Resize + store logos for return order sources (panel configurator)."""

from __future__ import annotations

import io
import re
import uuid
from pathlib import Path

from fastapi import HTTPException

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[misc, assignment]

UPLOAD_SUBDIR = "return-order-sources"
MAX_INPUT_BYTES = 2 * 1024 * 1024
MAX_SVG_BYTES = 512 * 1024
LIST_OUTPUT_DIM = 64

_RASTER_CT = frozenset(
    {
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
    }
)


def _upload_root() -> Path:
    return Path(__file__).resolve().parent.parent / "uploads"


def _validate_svg(raw: bytes) -> None:
    if len(raw) > MAX_SVG_BYTES:
        raise HTTPException(status_code=400, detail="Plik SVG za duży (max 512 KB)")
    try:
        text = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail="Nieprawidłowy plik SVG") from e
    head = text.lstrip()[:4096].lower()
    if not (head.startswith("<?xml") or head.startswith("<svg") or "<svg" in head[:512]):
        raise HTTPException(status_code=400, detail="Nieprawidłowy plik SVG")
    if re.search(r"<\s*script", head, re.I):
        raise HTTPException(status_code=400, detail="SVG zawiera niedozwolony skrypt")


def save_return_order_source_logo_bytes(raw: bytes, content_type: str) -> str:
    """
    Zapisuje logo źródła zwrotu pod ``/uploads/return-order-sources/``.
    Rastry (PNG/JPEG/WebP) — miniatury max LIST_OUTPUT_DIM px; SVG — bez przeskalowania.
    """
    if len(raw) < 8:
        raise HTTPException(status_code=400, detail="Nieprawidłowy plik")
    if len(raw) > MAX_INPUT_BYTES:
        raise HTTPException(status_code=400, detail="Plik za duży (max 2 MB)")

    ct = (content_type or "").split(";")[0].strip().lower()
    root = _upload_root() / UPLOAD_SUBDIR
    root.mkdir(parents=True, exist_ok=True)

    if ct == "image/svg+xml" or (not ct and raw.lstrip()[:5].lower().startswith(b"<")):
        _validate_svg(raw)
        name = f"{uuid.uuid4().hex}.svg"
        path = root / name
        path.write_bytes(raw)
        return f"/uploads/{UPLOAD_SUBDIR}/{name}"

    if ct not in _RASTER_CT:
        raise HTTPException(status_code=400, detail="Dozwolone: PNG, JPEG, WebP, SVG")

    if Image is None:
        raise HTTPException(status_code=500, detail="Pillow nie jest zainstalowany")

    try:
        im = Image.open(io.BytesIO(raw))
        has_alpha = im.mode in ("RGBA", "LA", "P")
        im = im.convert("RGBA") if has_alpha else im.convert("RGB")
        im.thumbnail((LIST_OUTPUT_DIM, LIST_OUTPUT_DIM), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        if has_alpha or im.mode == "RGBA":
            im.save(buf, format="PNG", optimize=True)
            ext = "png"
        else:
            im.save(buf, format="PNG", optimize=True)
            ext = "png"
        out = buf.getvalue()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Nie udało się przetworzyć obrazu: {e}") from e

    name = f"{uuid.uuid4().hex}.{ext}"
    path = root / name
    path.write_bytes(out)
    return f"/uploads/{UPLOAD_SUBDIR}/{name}"
