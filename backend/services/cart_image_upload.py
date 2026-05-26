"""
Store cart preview images under ``uploads/carts/`` (relative URLs in ``Cart.image_url``).
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
CART_SUBDIR = "carts"
MAX_CART_IMAGE_BYTES = 5 * 1024 * 1024

_CT_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

_ALLOWED_CT = frozenset(_CT_TO_EXT.keys())


def _normalize_ct(content_type: str) -> str:
    return (content_type or "image/jpeg").split(";")[0].strip().lower()


def ext_from_content_type(content_type: str) -> str:
    ct = _normalize_ct(content_type)
    return _CT_TO_EXT.get(ct, "")


def save_cart_image_bytes(raw: bytes, content_type: str) -> str:
    """
    Write file under ``UPLOAD_ROOT / carts /``. Returns ``/uploads/carts/{filename}``.
    """
    if len(raw) > MAX_CART_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Plik za duży (max 5 MB)")
    if len(raw) < 32:
        raise HTTPException(status_code=400, detail="Nieprawidłowy plik")

    ct = _normalize_ct(content_type)
    if ct not in _ALLOWED_CT:
        raise HTTPException(
            status_code=400,
            detail="Dozwolone formaty: JPEG, PNG, WebP",
        )

    ext = ext_from_content_type(content_type)
    if not ext:
        raise HTTPException(status_code=400, detail="Nieobsługiwany typ MIME")

    dest_dir = UPLOAD_ROOT / CART_SUBDIR
    dest_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    path = dest_dir / filename
    path.write_bytes(raw)
    return f"/uploads/{CART_SUBDIR}/{filename}"
