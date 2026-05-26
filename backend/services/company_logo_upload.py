"""Persist company logo files under uploads/company-logos/{tenant_id}/."""

from __future__ import annotations

import io
import re
import uuid
from pathlib import Path

from fastapi import HTTPException
from PIL import Image

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
LOGO_MAX_BYTES = 6 * 1024 * 1024
LOGO_MAX_EDGE = 1200


def _validate_raster(content: bytes, content_type: str | None) -> None:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(status_code=400, detail="Dozwolone formaty rastrowe: JPEG, PNG, WebP, GIF.")
    if len(content) > LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Plik za duży (max 6 MB).")


def _validate_svg(content: bytes, content_type: str | None) -> None:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct not in ("image/svg+xml", "text/plain", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="SVG: użyj typu image/svg+xml.")
    if len(content) > LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Plik za duży (max 6 MB).")
    try:
        text = content.decode("utf-8", errors="strict")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail="SVG musi być poprawnym UTF-8.") from e
    if "<svg" not in text.lower():
        raise HTTPException(status_code=400, detail="Plik nie wygląda na prawidłowy SVG.")
    if re.search(r"<script|onload=|onerror=|javascript:", text, re.I):
        raise HTTPException(status_code=400, detail="SVG zawiera niedozwolone elementy.")


def save_company_logo_file(content: bytes, content_type: str | None, tenant_id: int) -> str:
    """Write logo to disk; returns public path ``/uploads/company-logos/...``."""
    ct = (content_type or "").split(";")[0].strip().lower()
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    dest_dir = UPLOAD_ROOT / "company-logos" / str(int(tenant_id))
    dest_dir.mkdir(parents=True, exist_ok=True)

    if ct == "image/svg+xml" or (content[:1] == b"<" and b"<svg" in content[:2000].lower()):
        _validate_svg(content, content_type or "image/svg+xml")
        filename = f"{uuid.uuid4().hex}.svg"
        path = dest_dir / filename
        path.write_bytes(content)
        return f"/uploads/company-logos/{int(tenant_id)}/{filename}"

    _validate_raster(content, content_type)
    try:
        im = Image.open(io.BytesIO(content))
        if im.mode in ("RGBA", "P"):
            rgba = im.convert("RGBA")
            bg = Image.new("RGB", rgba.size, (255, 255, 255))
            bg.paste(rgba, mask=rgba.split()[3])
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        if max(im.size) > LOGO_MAX_EDGE:
            im.thumbnail((LOGO_MAX_EDGE, LOGO_MAX_EDGE), Image.Resampling.LANCZOS)
        out_buf = io.BytesIO()
        im.save(out_buf, format="PNG", optimize=True)
        out_bytes = out_buf.getvalue()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Nie udało się przetworzyć obrazu.") from e

    filename = f"{uuid.uuid4().hex}.png"
    path = dest_dir / filename
    path.write_bytes(out_bytes)
    return f"/uploads/company-logos/{int(tenant_id)}/{filename}"


def try_delete_stored_company_logo(logo_url: str | None) -> None:
    if not logo_url or not logo_url.startswith("/uploads/company-logos/"):
        return
    suffix = logo_url.removeprefix("/uploads/company-logos/")
    path = UPLOAD_ROOT / "company-logos" / suffix
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass
