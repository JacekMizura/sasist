"""
Store damage-entry evidence images on disk (separate from product catalog images).
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
MAX_IMAGE_BYTES = 6 * 1024 * 1024

_CT_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def ensure_upload_dir() -> None:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)


def ext_from_content_type(content_type: str) -> str:
    ct = (content_type or "image/jpeg").split(";")[0].strip().lower()
    return _CT_TO_EXT.get(ct, ".jpg")


def save_damage_image_bytes(raw: bytes, content_type: str) -> str:
    """
    Write file under UPLOAD_ROOT. Returns public path `/uploads/{filename}` for URLs stored
    on DamageEntry.photo_urls.
    """
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Plik za duży (max 6 MB)")
    if len(raw) < 32:
        raise HTTPException(status_code=400, detail="Nieprawidłowy plik")

    ensure_upload_dir()
    ext = ext_from_content_type(content_type)
    filename = f"{uuid.uuid4().hex}{ext}"
    path = UPLOAD_ROOT / filename
    path.write_bytes(raw)
    return f"/uploads/{filename}"
