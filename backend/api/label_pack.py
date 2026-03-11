"""Label packs API: list packs, generate PDF from pack + cart_id."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.label_pack import LabelPack, LabelPackItem
from ..schemas.label_pack import LabelPackGenerateBody, LabelPackResponse, LabelPackItemResponse
from ..services.label_pack_service import generate_pack_pdf

router = APIRouter(prefix="/label-packs", tags=["Label Packs"])

TENANT_ID = 1


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("", response_model=list[LabelPackResponse])
def list_packs(
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """List all label packs for the tenant."""
    rows = (
        db.query(LabelPack)
        .options(joinedload(LabelPack.items))
        .filter(LabelPack.tenant_id == tenant_id)
        .order_by(LabelPack.name)
        .all()
    )
    return [
        LabelPackResponse(
            id=r.id,
            name=r.name,
            tenant_id=r.tenant_id,
            items=[
                LabelPackItemResponse(
                    id=it.id,
                    pack_id=it.pack_id,
                    template_id=it.template_id,
                    object_type=it.object_type,
                    quantity_type=it.quantity_type,
                )
                for it in (r.items or [])
            ],
        )
        for r in rows
    ]


@router.post("/{pack_id}/generate")
def generate_pack(
    pack_id: int,
    body: LabelPackGenerateBody,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """
    Generate a single PDF with one page per label according to the pack definition.
    Body: { "cart_id": 1 }. Produces e.g. 1 cart label + N basket labels, each on its own page.
    """
    try:
        pdf_bytes = generate_pack_pdf(db, pack_id, body.cart_id, tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _pdf_response(pdf_bytes, f"labels-cart-{body.cart_id}-pack-{pack_id}.pdf")