"""Admin schema diagnostics."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth.deps import require_permission
from ..database import engine
from ..models.app_user import AppUser
from ..services.supplier_product_links.schema_diagnostic_service import (
    inspect_supplier_product_links_schema,
)

router = APIRouter(prefix="/admin/schema", tags=["Admin schema"])


@router.get("/supplier-product-links")
def get_supplier_product_links_schema(
    _actor: AppUser = Depends(require_permission("settings.users")),
):
    """Compare ``supplier_products`` ORM vs physical DB (columns, indexes, FK)."""
    return inspect_supplier_product_links_schema(engine)
