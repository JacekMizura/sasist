"""
Upload damage-entry images; cart preview images; returns URLs under /uploads/...
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from ..services.cart_image_upload import save_cart_image_bytes
from ..services.damage_image_upload import save_damage_image_bytes

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/uploads",
    summary="Upload image (damage evidence)",
    response_description="Relative URL to GET the file under /uploads/",
)
async def upload_damage_image(
    request: Request,
    file: UploadFile = File(..., description="Image file"),
):
    """
    multipart/form-data, field name: `file`.

    Response: `{"url": "/uploads/{filename}"}` — open as `GET {origin}{url}`.
    """
    logger.info(
        "[returns.damage.upload] content_type=%s filename=%s",
        request.headers.get("content-type"),
        file.filename,
    )
    raw = await file.read()
    try:
        url = save_damage_image_bytes(raw, file.content_type or "image/jpeg")
    except HTTPException:
        raise
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"url": url}


@router.post(
    "/uploads/image",
    summary="Upload cart preview image",
    response_description="Relative URL under /uploads/carts/",
)
async def upload_cart_image(file: UploadFile = File(..., description="Image file (JPEG, PNG, WebP)")):
    """
    multipart/form-data, field name: `file`.

    Response: `{"url": "/uploads/carts/{filename}"}` — max 5 MB; MIME: jpeg, png, webp.
    """
    raw = await file.read()
    try:
        url = save_cart_image_bytes(raw, file.content_type or "image/jpeg")
    except HTTPException:
        raise
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"url": url}
