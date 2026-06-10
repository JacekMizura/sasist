"""Customer CRM profile endpoints — type, status, flags."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.customer import CustomerCrmActionBody, CustomerCrmPatchBody, CustomerDetailOut
from ..services.customers.customer_profile_service import (
    CustomerProfileError,
    apply_customer_crm_action,
    get_customer_row,
    patch_customer_crm_profile,
)
from ..services.customers.customer_projection import customer_to_detail_out
from ..services.customers.errors import CustomerNotFoundError

router = APIRouter(tags=["Customers — CRM profile"])


def _operator_id(user: AppUser | None) -> int | None:
    return int(user.id) if user is not None else None


@router.patch("/{customer_id}/crm", response_model=CustomerDetailOut)
def patch_customer_crm(
    customer_id: int,
    body: CustomerCrmPatchBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        get_customer_row(db, customer_id=customer_id, tenant_id=tenant_id)
        flags_payload = body.flags.model_dump() if body.flags is not None else None
        patch_customer_crm_profile(
            db,
            customer_id=customer_id,
            tenant_id=tenant_id,
            performed_by_user_id=_operator_id(user),
            customer_type=body.customer_type,
            customer_status=body.customer_status,
            sales_channel=body.sales_channel,
            flags=flags_payload,
            credit_limit_gross=body.credit_limit_gross,
            payment_terms_days=body.payment_terms_days,
            account_manager_user_id=body.account_manager_user_id,
        )
        db.commit()
        row = get_customer_row(db, customer_id=customer_id, tenant_id=tenant_id)
        return customer_to_detail_out(db, row, include_summary=True)
    except CustomerNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail="Customer not found") from exc
    except CustomerProfileError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=exc.message) from exc


@router.post("/{customer_id}/crm/actions", response_model=CustomerDetailOut)
def post_customer_crm_action(
    customer_id: int,
    body: CustomerCrmActionBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        get_customer_row(db, customer_id=customer_id, tenant_id=tenant_id)
        apply_customer_crm_action(
            db,
            customer_id=customer_id,
            tenant_id=tenant_id,
            action=body.action,
            performed_by_user_id=_operator_id(user),
        )
        db.commit()
        row = get_customer_row(db, customer_id=customer_id, tenant_id=tenant_id)
        return customer_to_detail_out(db, row, include_summary=True)
    except CustomerNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail="Customer not found") from exc
    except CustomerProfileError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=exc.message) from exc
