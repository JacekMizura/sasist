"""
Persist complaint customer photos on disk under uploads/complaints/{id}/.

URLs stored in complaints.photo_urls_json as e.g. /uploads/complaints/123/{uuid}.jpg
(served by FastAPI StaticFiles on /uploads).
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Same root as main.UPLOADS_DIR → backend/uploads
UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"

COMPLAINT_PHOTO_MAX_BYTES = 5 * 1024 * 1024
COMPLAINT_ALLOWED_IMAGE_TYPES: frozenset[str] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
    }
)

_CT_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _normalize_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";")[0].strip().lower()


def validate_complaint_image_part(content: bytes, content_type: str | None) -> str:
    """
    Validate size and MIME. Returns normalized content-type.
    Raises HTTPException 400 on rejection.
    """
    ct = _normalize_content_type(content_type)
    if ct not in COMPLAINT_ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Niedozwolony typ obrazu: {ct or '(brak)'}. "
                "Dozwolone: image/jpeg, image/png, image/webp."
            ),
        )
    if len(content) > COMPLAINT_PHOTO_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Plik za duży (max {COMPLAINT_PHOTO_MAX_BYTES // (1024 * 1024)} MB).",
        )
    return ct


def save_complaint_line_image(
    content: bytes, complaint_id: int, order_item_id: int, content_type: str | None
) -> str:
    """
    Per-line customer photos: uploads/complaints/{id}/line-{order_item_id}/{uuid}.ext
    """
    ct = validate_complaint_image_part(content, content_type)
    ext = _CT_TO_EXT[ct]
    dest_dir = UPLOAD_ROOT / "complaints" / str(int(complaint_id)) / f"line-{int(order_item_id)}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    path = dest_dir / filename
    path.write_bytes(content)
    rel = f"/uploads/complaints/{int(complaint_id)}/line-{int(order_item_id)}/{filename}"
    logger.info(
        "complaint line image saved: complaint_id=%s order_item_id=%s path=%s bytes=%s content_type=%s",
        complaint_id,
        order_item_id,
        rel,
        len(content),
        ct,
    )
    return rel


def save_complaint_image(content: bytes, complaint_id: int, content_type: str | None) -> str:
    """
    Write image after validation. Returns public path /uploads/complaints/{id}/{uuid}.ext

    Raises HTTPException on invalid input. Raises OSError on disk failure (caller may catch).
    """
    ct = validate_complaint_image_part(content, content_type)
    ext = _CT_TO_EXT[ct]
    dest_dir = UPLOAD_ROOT / "complaints" / str(int(complaint_id))
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    path = dest_dir / filename
    path.write_bytes(content)
    rel = f"/uploads/complaints/{int(complaint_id)}/{filename}"
    logger.info(
        "complaint image saved: complaint_id=%s path=%s bytes=%s content_type=%s",
        complaint_id,
        rel,
        len(content),
        ct,
    )
    return rel
