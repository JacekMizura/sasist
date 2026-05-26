"""Supplier purchase orders — PDF export (deliveries / supplier-orders alias)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.supplier_order_pdf_service import generate_supplier_order_pdf_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/supplier-orders", tags=["Supplier orders"])


@router.get("/{order_id}/pdf")
def download_supplier_order_pdf(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    PDF dokumentu zamówienia do dostawcy (HTML → Puppeteer).
    """
    try:
        pdf = generate_supplier_order_pdf_bytes(db, tenant_id, order_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except FileNotFoundError as e:
        logger.error("supplier order PDF: %s", e)
        raise HTTPException(
            status_code=503,
            detail="PDF engine not configured (install Node deps in backend/scripts/structure_report_pdf).",
        ) from e
    except RuntimeError as e:
        logger.error("supplier order PDF render failed: %s", e)
        raise HTTPException(status_code=500, detail="PDF generation failed.") from e

    filename = f"supplier_order_{order_id}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
