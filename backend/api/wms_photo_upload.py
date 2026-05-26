"""
WMS phone photo upload sessions (QR flow).

Simple in-memory session store:
- POST /session -> create session_id
- GET /session/{session_id} -> list uploaded photo URLs
- POST / -> upload file and attach to session
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Dict, List, TypedDict

from fastapi import APIRouter, File, Form, HTTPException, UploadFile


router = APIRouter(prefix="/wms/photo-upload", tags=["WMS Photo Upload"])


class _SessionData(TypedDict):
    created_at: str
    photos: List[str]


_SESSIONS: Dict[str, _SessionData] = {}
_SESSIONS_LOCK = Lock()

_UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif", ".avif"}


def _safe_ext(filename: str | None, content_type: str | None) -> str:
    if filename:
        ext = Path(filename).suffix.lower()
        if ext in _ALLOWED_EXT:
            return ext
    if content_type:
        ct = content_type.lower().strip()
        mapping = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
            "image/bmp": ".bmp",
            "image/heic": ".heic",
            "image/heif": ".heif",
            "image/avif": ".avif",
        }
        if ct in mapping:
            return mapping[ct]
    return ".jpg"


@router.post("/session")
def create_photo_upload_session():
    session_id = str(uuid.uuid4())
    with _SESSIONS_LOCK:
        _SESSIONS[session_id] = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "photos": [],
        }
    return {"session_id": session_id, "photos": []}


@router.get("/session/{session_id}")
def get_photo_upload_session(session_id: str):
    with _SESSIONS_LOCK:
        row = _SESSIONS.get(session_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Photo upload session not found")
        return {"session_id": session_id, "photos": list(row["photos"])}


@router.post("/")
async def upload_photo_to_session(
    session_id: str = Form(...),
    file: UploadFile = File(...),
):
    with _SESSIONS_LOCK:
        row = _SESSIONS.get(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Photo upload session not found")

    ext = _safe_ext(file.filename, file.content_type)
    out_name = f"{uuid.uuid4().hex}{ext}"
    out_path = _UPLOADS_DIR / out_name

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    out_path.write_bytes(data)
    url = f"/uploads/{out_name}"

    with _SESSIONS_LOCK:
        current = _SESSIONS.get(session_id)
        if current is None:
            raise HTTPException(status_code=404, detail="Photo upload session not found")
        current["photos"].append(url)
        photos = list(current["photos"])

    return {"session_id": session_id, "url": url, "photos": photos}

