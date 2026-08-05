"""Save uploaded files for product custom fields."""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from .service import ProductCustomFieldError

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]+", re.I)


def _uploads_root() -> Path:
    # backend/services/product_custom_fields/upload.py → backend/uploads
    return Path(__file__).resolve().parents[2] / "uploads" / "product_custom_fields"


async def save_product_custom_field_upload(
    *,
    product_id: int,
    field_id: int,
    upload: UploadFile,
) -> dict[str, Any]:
    raw_name = (upload.filename or "file").strip() or "file"
    safe = _SAFE_NAME.sub("_", raw_name).strip() or "file"
    if len(safe) > 180:
        safe = safe[-180:]
    stored = f"{uuid.uuid4().hex[:12]}_{safe}"

    dest_dir = _uploads_root() / str(int(product_id)) / str(int(field_id))
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / stored

    content = await upload.read()
    if not content:
        raise ProductCustomFieldError("Pusty plik.", code="empty_file")
    if len(content) > 25 * 1024 * 1024:
        raise ProductCustomFieldError("Plik jest zbyt duży (max 25 MB).", code="file_too_large")

    dest.write_bytes(content)
    rel_url = f"/uploads/product_custom_fields/{int(product_id)}/{int(field_id)}/{stored}"
    return {
        "original_filename": raw_name,
        "stored_filename": stored,
        "file_url": rel_url,
        "size": len(content),
    }
