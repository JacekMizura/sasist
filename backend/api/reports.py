import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ..schemas.structure_report_pdf import ProductLocationReportPdfRequest, StructureReportPdfRequest
from ..services.structure_report_pdf_service import (
    generate_product_location_report_pdf_bytes,
    generate_structure_report_pdf_bytes,
)

router = APIRouter(prefix="/reports", tags=["Reports"])

logger = logging.getLogger(__name__)


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/warehouse-structure/pdf")
def warehouse_structure_report_pdf(
    body: StructureReportPdfRequest,
):
    """
    Raport struktury magazynu (frontend HTML route -> PDF through Puppeteer).
    Body: warehouse_id + layout_id (+ optional tenant_id).
    """
    try:
        pdf_bytes = generate_structure_report_pdf_bytes(
            warehouse_id=body.warehouse_id,
            layout_id=body.layout_id,
            tenant_id=body.tenant_id,
        )
        return _pdf_response(pdf_bytes, f"raport-struktury-magazynu-{body.warehouse_id}.pdf")
    except Exception as e:
        logger.exception("Structure report PDF generation failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/product-locations/pdf")
def product_location_report_pdf(
    body: ProductLocationReportPdfRequest,
):
    """
    Product location report (frontend HTML route -> PDF through Puppeteer).
    Body: warehouse_id + layout_id (+ optional tenant_id).
    """
    try:
        pdf_bytes = generate_product_location_report_pdf_bytes(
            warehouse_id=body.warehouse_id,
            layout_id=body.layout_id,
            tenant_id=body.tenant_id,
        )
        return _pdf_response(pdf_bytes, f"raport-lokalizacji-produktow-{body.warehouse_id}.pdf")
    except Exception as e:
        logger.exception("Product location report PDF generation failed")
        raise HTTPException(status_code=500, detail=str(e)) from e
