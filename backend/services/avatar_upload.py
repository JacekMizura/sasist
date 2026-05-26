"""Resize and persist user avatar images under uploads/avatars/."""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from fastapi import HTTPException
from PIL import Image

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
AVATAR_MAX_BYTES = 4 * 1024 * 1024
AVATAR_MAX_EDGE = 512


def _validate_image_bytes(data: bytes, content_type: str | None) -> None:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(
            status_code=400,
            detail="Dozwolone formaty: JPEG, PNG, WebP, GIF.",
        )
    if len(data) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Plik za duży (max 4 MB).")


def save_user_avatar_file(content: bytes, content_type: str | None, user_id: int) -> str:
    """Write avatar to disk and return public URL path ``/uploads/avatars/...``."""
    _validate_image_bytes(content, content_type)
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    dest_dir = UPLOAD_ROOT / "avatars" / str(int(user_id))
    dest_dir.mkdir(parents=True, exist_ok=True)

    try:
        im = Image.open(io.BytesIO(content))
        if im.mode in ("RGBA", "P"):
            rgba = im.convert("RGBA")
            bg = Image.new("RGB", rgba.size, (255, 255, 255))
            bg.paste(rgba, mask=rgba.split()[3])
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        if max(im.size) > AVATAR_MAX_EDGE:
            im.thumbnail((AVATAR_MAX_EDGE, AVATAR_MAX_EDGE), Image.Resampling.LANCZOS)
        out_buf = io.BytesIO()
        im.save(out_buf, format="JPEG", quality=88, optimize=True)
        out_bytes = out_buf.getvalue()
    except Exception as e:  # noqa: BLE001 — surface as 400
        raise HTTPException(status_code=400, detail="Nie udało się przetworzyć obrazu.") from e

    filename = f"{uuid.uuid4().hex}.jpg"
    path = dest_dir / filename
    path.write_bytes(out_bytes)
    return f"/uploads/avatars/{int(user_id)}/{filename}"


def try_delete_stored_avatar(avatar_url: str | None) -> None:
    """Remove a file previously stored under our uploads/avatars tree."""
    if not avatar_url or not avatar_url.startswith("/uploads/avatars/"):
        return
    suffix = avatar_url.removeprefix("/uploads/avatars/")
    path = UPLOAD_ROOT / "avatars" / suffix
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass
