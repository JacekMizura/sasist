"""API: Label sizes (dimensions for labels)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.label_size import LabelSize
from ..schemas.label_system import LabelSizeResponse

router = APIRouter(prefix="/label-sizes", tags=["Label Sizes"])


@router.get("", response_model=list[LabelSizeResponse])
def list_label_sizes(db: Session = Depends(get_db)):
    """List all label sizes (e.g. 50x30, 100x50, A6)."""
    rows = db.query(LabelSize).order_by(LabelSize.width_mm, LabelSize.height_mm).all()
    return [LabelSizeResponse.model_validate(r) for r in rows]
