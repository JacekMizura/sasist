"""Upload ikony definicji pola (PNG/SVG/WEBP) — zapis w ``uploads/`` + URL w ``settings_json.ui``."""

from __future__ import annotations

import re
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

_BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOADS_ROOT = _BACKEND_DIR / "uploads"

_ALLOWED_EXT = frozenset({".svg", ".png", ".webp", ".jpg", ".jpeg"})
_MAX_BYTES = 2 * 1024 * 1024
_MAX_SIDE = 320


def _safe_delete_disk_url(url: str) -> None:
    if not url or "/uploads/" not in url:
        return
    try:
        rel = url.split("/uploads/", 1)[1].lstrip("/")
        path = (UPLOADS_ROOT / rel).resolve()
        root = UPLOADS_ROOT.resolve()
        if path.is_file() and root in path.parents:
            path.unlink(missing_ok=True)
    except OSError:
        pass


def save_definition_icon_bytes(
    *,
    tenant_id: int,
    warehouse_id: int,
    field_id: int,
    original_filename: str,
    data: bytes,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    name = (original_filename or "icon").strip()
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()
    if ext not in _ALLOWED_EXT:
        return None, f"Dozwolone: {', '.join(sorted(_ALLOWED_EXT))}."
    if len(data) == 0:
        return None, "Pusty plik."
    if len(data) > _MAX_BYTES:
        return None, "Plik za duży (max 2 MB)."
    processed = data
    storage_ext = ext
    if ext in (".png", ".webp", ".jpg", ".jpeg"):
        try:
            from PIL import Image

            im = Image.open(BytesIO(data)).convert("RGBA")
            w, h = im.size
            if max(w, h) > _MAX_SIDE:
                im.thumbnail((_MAX_SIDE, _MAX_SIDE), Image.Resampling.LANCZOS)
            buf = BytesIO()
            if ext == ".webp":
                im.save(buf, format="WEBP", quality=88)
                storage_ext = ".webp"
            else:
                im.save(buf, format="PNG", optimize=True)
                storage_ext = ".png"
            processed = buf.getvalue()
        except Exception:
            processed = data
            storage_ext = ext

    safe_base = re.sub(r"[^a-zA-Z0-9._-]+", "_", name.rsplit(".", 1)[0])[:80] or "icon"
    uid = uuid.uuid4().hex[:12]
    rel_dir = Path("order_custom_field_icons") / str(int(tenant_id)) / str(int(warehouse_id)) / str(int(field_id))
    dest_dir = UPLOADS_ROOT / rel_dir
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uid}_{safe_base}{storage_ext}"
    dest_path = dest_dir / stored_name
    dest_path.write_bytes(processed)
    url = f"/uploads/{rel_dir.as_posix()}/{stored_name}"
    return {"custom_icon_url": url, "original_filename": name}, None


def delete_definition_icon_file(url: Optional[str]) -> None:
    if url:
        _safe_delete_disk_url(url)
