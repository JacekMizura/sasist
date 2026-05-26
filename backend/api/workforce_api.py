"""Workforce operations API — permissions, activity, costs, panel status matrix (WMS, not HR)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.config import APP_ENV
from ..auth.deps import get_current_user, require_any_permission, require_permission
from ..database import get_db
from ..models.app_user import AppUser, UserWmsProfile
from ..models.employee_cost_profile import EmployeeCostProfile
from ..models.order_ui_status import OrderUiStatus
from ..models.workforce_status_access import WorkforceStatusAccess
from ..schemas.workforce import (
    EmployeeCostOverviewRead,
    EmployeeCostOverviewRow,
    EmployeeCostProfileRead,
    EmployeeCostProfileUpsert,
    UserActivityLogCreate,
    WorkforceStatusAccessRow,
    WorkforceStatusAccessUpsert,
    WorkforceUserStatusEffectiveRow,
    WorkforceUserStatusSaveBody,
)
from ..services.employer_cost_calculator import DISCLAIMER_PL, compute_operational_costs
from ..services.user_activity_service import log_user_activity
from ..services.workforce_analytics_service import dashboard_summary, list_recent_logs, operational_cost_estimates
from ..services.workforce_user_status_effective_service import (
    list_effective_status_access_for_user,
    save_user_status_overrides,
)
from ..wms_operational_modes import WMS_OPERATIONAL_MODES

router = APIRouter(prefix="/workforce", tags=["Workforce"])
logger = logging.getLogger(__name__)


def _range_or_default(
    date_from: datetime | None,
    date_to: datetime | None,
) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    end = date_to or now
    start = date_from or (end - timedelta(days=7))
    if start > end:
        raise HTTPException(status_code=400, detail="date_from must be <= date_to")
    return start, end


@router.post("/activity")
def post_activity(
    body: UserActivityLogCreate,
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_permission("workforce.activity.write")),
):
    """Client-side operational signal (barcode, UI step, etc.). User is always the caller."""
    log_user_activity(
        db,
        user_id=user.id,
        action_type=body.action_type,
        module=body.module,
        tenant_id=body.tenant_id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        metadata=body.metadata,
        commit=True,
    )
    return {"ok": True}


@router.get("/activity-logs")
def get_activity_logs(
    tenant_id: int | None = Query(None),
    user_id: int | None = Query(None),
    module: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_permission("workforce.activity.read")),
):
    return list_recent_logs(db, tenant_id=tenant_id, limit=limit, user_id=user_id, module=module)


@router.get("/dashboard")
def get_dashboard(
    tenant_id: int | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    actor: AppUser = Depends(require_any_permission("workforce.dashboard", "settings.users")),
):
    if APP_ENV != "production":
        logger.info(
            "auth_debug workforce_dashboard requester_id=%s tenant_id=%s login=%s",
            actor.id,
            tenant_id,
            actor.login,
        )
    start, end = _range_or_default(date_from, date_to)
    dash = dashboard_summary(db, tenant_id=tenant_id, user_ids=None, date_from=start, date_to=end)
    costs = operational_cost_estimates(db, tenant_id=tenant_id, dashboard=dash)
    return {"dashboard": dash, "costs": costs}


def _cost_profile_read_from_row(row: EmployeeCostProfile) -> EmployeeCostProfileRead:
    manual = row.employer_total_monthly_pln
    bd = compute_operational_costs(
        contract_type=row.contract_type,
        gross_monthly_pln=row.gross_monthly_pln,
        net_monthly_pln=row.net_monthly_pln,
        default_hours_per_month=row.default_hours_per_month,
        ppk_enabled=bool(row.ppk_enabled),
        employer_side_rate_override=row.employer_side_rate_override,
        employer_total_manual_pln=None,
    )
    emp_out = bd.employer_total_monthly
    assumptions = bd.assumptions
    if manual and float(manual) > 0 and abs(float(manual) - float(bd.employer_total_monthly)) > 1.0:
        bd_m = compute_operational_costs(
            contract_type=row.contract_type,
            gross_monthly_pln=row.gross_monthly_pln,
            net_monthly_pln=row.net_monthly_pln,
            default_hours_per_month=row.default_hours_per_month,
            ppk_enabled=bool(row.ppk_enabled),
            employer_side_rate_override=row.employer_side_rate_override,
            employer_total_manual_pln=float(manual),
        )
        emp_out = float(manual)
        assumptions = bd_m.assumptions

    return EmployeeCostProfileRead(
        user_id=row.user_id,
        tenant_id=row.tenant_id,
        contract_type=row.contract_type,
        gross_monthly_pln=row.gross_monthly_pln if row.gross_monthly_pln is not None else (bd.gross_monthly or None),
        employer_total_monthly_pln=emp_out,
        net_monthly_pln=row.net_monthly_pln if row.net_monthly_pln is not None else bd.net_monthly,
        default_hours_per_month=row.default_hours_per_month,
        hourly_pln=row.hourly_pln or bd.hourly_pln,
        employer_hourly_pln=row.employer_hourly_pln or bd.employer_hourly_pln,
        ppk_enabled=bool(row.ppk_enabled),
        employer_side_rate_override=row.employer_side_rate_override,
        notes=row.notes,
        is_active=bool(row.is_active),
        assumptions=assumptions,
    )


@router.get("/cost-profile/{target_user_id}", response_model=EmployeeCostProfileRead)
def get_cost_profile(
    target_user_id: int,
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_any_permission("workforce.costs.read", "settings.users")),
):
    row = db.query(EmployeeCostProfile).filter(EmployeeCostProfile.user_id == target_user_id).first()
    if row is None:
        return EmployeeCostProfileRead(
            user_id=target_user_id,
            tenant_id=None,
            contract_type="uop",
            gross_monthly_pln=None,
            employer_total_monthly_pln=None,
            net_monthly_pln=None,
            default_hours_per_month=168.0,
            hourly_pln=None,
            employer_hourly_pln=None,
            ppk_enabled=False,
            employer_side_rate_override=None,
            notes=None,
            is_active=True,
            assumptions={"source": "no_profile", "disclaimer_pl": DISCLAIMER_PL},
        )
    return _cost_profile_read_from_row(row)


@router.put("/cost-profile/{target_user_id}", response_model=EmployeeCostProfileRead)
def upsert_cost_profile(
    target_user_id: int,
    body: EmployeeCostProfileUpsert,
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_any_permission("workforce.costs.write", "settings.users")),
):
    u = db.query(AppUser).filter(AppUser.id == target_user_id).first()
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")

    manual = body.employer_total_monthly_pln if body.employer_total_monthly_pln and float(body.employer_total_monthly_pln) > 0 else None
    bd = compute_operational_costs(
        contract_type=body.contract_type,
        gross_monthly_pln=body.gross_monthly_pln,
        net_monthly_pln=body.net_monthly_pln,
        default_hours_per_month=body.default_hours_per_month,
        ppk_enabled=body.ppk_enabled,
        employer_side_rate_override=body.employer_side_rate_override,
        employer_total_manual_pln=manual,
    )

    row = db.query(EmployeeCostProfile).filter(EmployeeCostProfile.user_id == target_user_id).first()
    if row is None:
        row = EmployeeCostProfile(user_id=target_user_id)
        db.add(row)

    row.tenant_id = body.tenant_id
    row.contract_type = body.contract_type
    row.gross_monthly_pln = body.gross_monthly_pln if body.gross_monthly_pln is not None else (bd.gross_monthly or None)
    row.net_monthly_pln = body.net_monthly_pln if body.net_monthly_pln is not None else bd.net_monthly
    row.employer_total_monthly_pln = manual
    row.default_hours_per_month = body.default_hours_per_month
    row.hourly_pln = bd.hourly_pln
    row.employer_hourly_pln = bd.employer_hourly_pln
    row.ppk_enabled = body.ppk_enabled
    row.employer_side_rate_override = body.employer_side_rate_override
    row.notes = body.notes
    row.is_active = body.is_active
    db.commit()
    db.refresh(row)

    return _cost_profile_read_from_row(row)


@router.get("/cost-profiles-overview", response_model=EmployeeCostOverviewRead)
def cost_profiles_overview(
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_any_permission("workforce.costs.read", "settings.users")),
):
    """Company-wide operational cost snapshot (not payroll)."""
    users = db.query(AppUser).filter(AppUser.is_system_seed.is_(False)).order_by(AppUser.login.asc()).all()
    rows_out: list[EmployeeCostOverviewRow] = []
    sum_net = 0.0
    sum_gross = 0.0
    sum_emp = 0.0

    for u in users:
        wms = db.query(UserWmsProfile).filter(UserWmsProfile.user_id == u.id).first()
        station = (wms.workforce_default_workstation or "").strip() if wms else ""
        emp_label = (wms.workforce_employment_type or "").strip() if wms else ""

        prof = db.query(EmployeeCostProfile).filter(EmployeeCostProfile.user_id == u.id).first()
        if prof is None:
            rows_out.append(
                EmployeeCostOverviewRow(
                    user_id=u.id,
                    login=u.login,
                    full_name=" ".join([p for p in [u.first_name, u.last_name] if p]).strip() or None,
                    workstation=station or None,
                    employment_label=emp_label or None,
                    contract_type="uop",
                    net_monthly_pln=None,
                    gross_monthly_pln=None,
                    employer_total_monthly_pln=None,
                    hourly_pln=None,
                    employer_hourly_pln=None,
                    is_active_account=bool(u.is_active),
                    has_cost_profile=False,
                )
            )
            continue

        bd0 = compute_operational_costs(
            contract_type=prof.contract_type,
            gross_monthly_pln=prof.gross_monthly_pln,
            net_monthly_pln=prof.net_monthly_pln,
            default_hours_per_month=prof.default_hours_per_month,
            ppk_enabled=bool(prof.ppk_enabled),
            employer_side_rate_override=prof.employer_side_rate_override,
            employer_total_manual_pln=None,
        )
        net_v = bd0.net_monthly or 0.0
        gross_v = bd0.gross_monthly or 0.0
        stored_emp = float(prof.employer_total_monthly_pln) if prof.employer_total_monthly_pln else 0.0
        if stored_emp > 0 and abs(stored_emp - float(bd0.employer_total_monthly)) > 1.0:
            bd = compute_operational_costs(
                contract_type=prof.contract_type,
                gross_monthly_pln=prof.gross_monthly_pln,
                net_monthly_pln=prof.net_monthly_pln,
                default_hours_per_month=prof.default_hours_per_month,
                ppk_enabled=bool(prof.ppk_enabled),
                employer_side_rate_override=prof.employer_side_rate_override,
                employer_total_manual_pln=stored_emp,
            )
        else:
            bd = bd0
        emp_v = bd.employer_total_monthly
        if gross_v > 0 or net_v > 0:
            sum_net += net_v
            sum_gross += gross_v
            sum_emp += emp_v

        rows_out.append(
            EmployeeCostOverviewRow(
                user_id=u.id,
                login=u.login,
                full_name=" ".join([p for p in [u.first_name, u.last_name] if p]).strip() or None,
                workstation=station or None,
                employment_label=emp_label or None,
                contract_type=prof.contract_type,
                net_monthly_pln=bd.net_monthly,
                gross_monthly_pln=bd.gross_monthly or None,
                employer_total_monthly_pln=round(emp_v, 2) if emp_v > 0 else None,
                hourly_pln=bd.hourly_pln,
                employer_hourly_pln=bd.employer_hourly_pln,
                is_active_account=bool(u.is_active),
                has_cost_profile=True,
            )
        )

    n_emp = sum(1 for r in rows_out if (r.employer_total_monthly_pln or 0) > 0)
    avg = (sum_emp / n_emp) if n_emp > 0 else None

    return EmployeeCostOverviewRead(
        disclaimer_pl=DISCLAIMER_PL,
        rows=rows_out,
        total_employees=len(users),
        employees_with_cost_numbers=n_emp,
        sum_net_monthly_pln=round(sum_net, 2),
        sum_gross_monthly_pln=round(sum_gross, 2),
        sum_employer_total_monthly_pln=round(sum_emp, 2),
        avg_employer_total_monthly_pln=round(avg, 2) if avg is not None else None,
    )


@router.get("/status-access", response_model=list[WorkforceStatusAccessRow])
def list_status_access(
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_permission("workforce.status_matrix.read")),
):
    rows = (
        db.query(WorkforceStatusAccess, OrderUiStatus)
        .join(OrderUiStatus, OrderUiStatus.id == WorkforceStatusAccess.order_ui_status_id)
        .filter(
            WorkforceStatusAccess.tenant_id == tenant_id,
            WorkforceStatusAccess.warehouse_id == warehouse_id,
        )
        .all()
    )
    out: list[WorkforceStatusAccessRow] = []
    for acc, st in rows:
        out.append(
            WorkforceStatusAccessRow(
                id=acc.id,
                tenant_id=acc.tenant_id,
                warehouse_id=acc.warehouse_id,
                role=acc.role,
                order_ui_status_id=acc.order_ui_status_id,
                status_name=st.name,
                main_group=st.main_group,
                can_visible=bool(acc.can_visible),
                can_edit=bool(acc.can_edit),
                can_transition=bool(acc.can_transition),
                can_process=bool(acc.can_process),
                can_print=bool(acc.can_print),
                can_complete=bool(acc.can_complete),
            )
        )
    return out


@router.put("/status-access", response_model=dict)
def upsert_status_access(
    items: list[WorkforceStatusAccessUpsert],
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_permission("workforce.status_matrix.write")),
):
    for it in items:
        st = (
            db.query(OrderUiStatus)
            .filter(
                OrderUiStatus.id == it.order_ui_status_id,
                OrderUiStatus.tenant_id == it.tenant_id,
                OrderUiStatus.warehouse_id == it.warehouse_id,
            )
            .first()
        )
        if st is None:
            raise HTTPException(status_code=400, detail=f"Invalid order_ui_status_id {it.order_ui_status_id}")

        row = (
            db.query(WorkforceStatusAccess)
            .filter(
                WorkforceStatusAccess.tenant_id == it.tenant_id,
                WorkforceStatusAccess.warehouse_id == it.warehouse_id,
                WorkforceStatusAccess.role == it.role.strip(),
                WorkforceStatusAccess.order_ui_status_id == it.order_ui_status_id,
            )
            .first()
        )
        if row is None:
            row = WorkforceStatusAccess(
                tenant_id=it.tenant_id,
                warehouse_id=it.warehouse_id,
                role=it.role.strip(),
                order_ui_status_id=it.order_ui_status_id,
            )
            db.add(row)
        row.can_visible = it.can_visible
        row.can_edit = it.can_edit
        row.can_transition = it.can_transition
        row.can_process = it.can_process
        row.can_print = it.can_print
        row.can_complete = it.can_complete
    db.commit()
    return {"updated": len(items)}


@router.get("/wms-operational-modes")
def get_wms_operational_modes_catalog(_: AppUser = Depends(get_current_user)):
    return [{"key": k, "label_pl": lab} for k, lab in WMS_OPERATIONAL_MODES]


@router.get("/status-access/user-effective", response_model=list[WorkforceUserStatusEffectiveRow])
def list_user_effective_status_access(
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    user_id: int = Query(...),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_any_permission("workforce.status_matrix.read", "settings.users")),
):
    raw = list_effective_status_access_for_user(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, user_id=user_id
    )
    return [WorkforceUserStatusEffectiveRow(**r) for r in raw]


@router.put("/status-access/user", response_model=dict)
def upsert_user_status_access(
    body: WorkforceUserStatusSaveBody,
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_any_permission("workforce.status_matrix.write", "settings.users")),
):
    n = save_user_status_overrides(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
        user_id=body.user_id,
        items=[it.model_dump() for it in body.items],
    )
    db.commit()
    return {"updated": n}
