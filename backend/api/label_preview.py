"""
Label preview API: render template + record to SVG using the same engine as PDF.
"""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.label_engine import build_label_svg_engine

router = APIRouter(prefix="/label", tags=["Label Preview"])


class LabelPreviewRequest(BaseModel):
    template: dict[str, Any]
    record: dict[str, Any] = {}


@router.post("/preview")
def label_preview(body: LabelPreviewRequest):
    """
    Render one label as SVG using the same engine as PDF generation.
    Returns JSON { "svg": "<svg>...</svg>" } for use in designer preview.
    """
    try:
        template = body.template
        if not template:
            raise HTTPException(status_code=400, detail="template is required")
        width_mm = float(template.get("widthMm", 100))
        height_mm = float(template.get("heightMm", 60))
        rec = body.record or {}
        svg = build_label_svg_engine(template, width_mm, height_mm, rec)
        return {"svg": svg}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
