"""Embed local ``/uploads/...`` assets as data URIs for document HTML + PDF.

Puppeteer ``page.setContent`` cannot reliably load root-relative ``/uploads`` URLs
(no HTTP origin) nor ``file://`` images from an opaque document. Data URIs match
the already-working barcode/QR pattern.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import re
from pathlib import Path

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
UPLOADS_ROOT = BACKEND_ROOT / "uploads"


def resolve_upload_src_for_embed(src: str | None) -> str:
    """
    If ``src`` is a local ``/uploads/...`` path and the file exists, return a data URI.
    Otherwise return ``src`` unchanged (http(s), data:, missing file, non-upload paths).
    """
    text = (src or "").strip()
    if not text:
        return ""
    if text.startswith(("data:", "http://", "https://", "file://")):
        return text
    if not text.startswith("/uploads/"):
        return text

    uploads_root = UPLOADS_ROOT.resolve()
    disk = (uploads_root / text.removeprefix("/uploads/").lstrip("/")).resolve()
    try:
        disk.relative_to(uploads_root)
    except ValueError:
        logger.warning("[doc.logo] blocked path escape src=%r disk=%s", text, disk)
        return text
    if not disk.is_file():
        logger.warning("[doc.logo] upload file missing src=%r disk=%s exists=False", text, disk)
        return text

    raw = disk.read_bytes()
    mime, _ = mimetypes.guess_type(disk.name)
    suffix = disk.suffix.lower()
    if not mime:
        if suffix == ".svg":
            mime = "image/svg+xml"
        elif suffix in (".jpg", ".jpeg"):
            mime = "image/jpeg"
        elif suffix == ".webp":
            mime = "image/webp"
        elif suffix == ".gif":
            mime = "image/gif"
        else:
            mime = "image/png"
    b64 = base64.b64encode(raw).decode("ascii")
    uri = f"data:{mime};base64,{b64}"
    logger.info(
        "[doc.logo] embedded upload src=%r disk=%s bytes=%s mime=%s",
        text,
        disk,
        len(raw),
        mime,
    )
    return uri


_UPLOAD_SRC_RE = re.compile(r'src="(/uploads/[^"]+)"')


def embed_upload_srcs_in_html(html: str) -> str:
    """Rewrite remaining ``src="/uploads/..."`` attributes to data URIs (HTML + PDF)."""

    def _repl(match: re.Match[str]) -> str:
        rel = match.group(1)
        embedded = resolve_upload_src_for_embed(rel)
        if embedded.startswith("data:"):
            logger.info("[doc.logo] html-inline src=%r -> data URI (%s chars)", rel, len(embedded))
            return f'src="{embedded}"'
        logger.warning("[doc.logo] html-inline left unchanged src=%r", rel)
        return match.group(0)

    out = _UPLOAD_SRC_RE.sub(_repl, html or "")
    logger.info(
        "[doc.logo] html-inline summary uploads_left=%s data_images=%s",
        out.count('src="/uploads/'),
        out.count('src="data:image'),
    )
    return out
