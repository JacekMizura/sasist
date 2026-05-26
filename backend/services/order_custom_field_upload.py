"""Upload plików dla pola FILES na zamówieniu."""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any, Dict, Tuple

_BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOADS_ROOT = _BACKEND_DIR / "uploads"


def save_order_custom_field_upload(
    *,
    order_id: int,
    field_id: int,
    original_filename: str,
    data: bytes,
    settings: Dict[str, Any],
) -> Tuple[Dict[str, Any], None] | Tuple[None, str]:
    name = (original_filename or "file").strip()
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()
    mode = ((settings.get("files") or {}).get("mode") or "documents").lower()
    images = {".png", ".svg", ".gif", ".jpg", ".jpeg", ".webp"}
    docs = {".doc", ".docx", ".pdf", ".xlsx", ".txt"}
    allowed = images | docs if mode == "both" else images if mode == "images" else docs
    if ext and ext not in allowed:
        return None, f"Niedozwolone rozszerzenie {ext} dla trybu {mode}."
    safe_base = re.sub(r"[^a-zA-Z0-9._-]+", "_", name)[:180] or "file"
    uid = uuid.uuid4().hex[:12]
    rel_dir = Path("order_custom_fields") / str(int(order_id)) / str(int(field_id))
    dest_dir = UPLOADS_ROOT / rel_dir
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uid}_{safe_base}"
    dest_path = dest_dir / stored_name
    dest_path.write_bytes(data)
    url = f"/uploads/{rel_dir.as_posix()}/{stored_name}"
    meta: Dict[str, Any] = {
        "original_filename": name,
        "stored_filename": stored_name,
        "file_url": url,
        "size": len(data),
    }
    return meta, None
