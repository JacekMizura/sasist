"""Condition evaluation for Automation Engine (backend SSOT)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy.orm import Session

from .constants import ENTITY_COMPLAINT, ENTITY_ORDER, ENTITY_RETURN

# Fields the runner can evaluate against live entity data.
EVALUABLE_FIELDS = frozenset(
    {
        "order_status",
        "return_status",
        "complaint_status",
        "warehouse_id",
        "order_number",
    }
)


@dataclass
class ConditionEvalResult:
    matched: bool
    details: list[dict[str, Any]] = field(default_factory=list)
    skipped_unevaluable: list[str] = field(default_factory=list)


def _loads_list(raw: object) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, str):
        import json

        try:
            data = json.loads(raw or "[]")
        except Exception:
            return []
        return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []
    return []


def _as_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(x) for x in value]
    return [str(value)]


def _op_match(op: str, actual: Any, expected: list[str]) -> bool:
    op_n = (op or "eq").strip().lower()
    actuals = _as_str_list(actual)
    expected_n = [str(x) for x in expected]
    if op_n == "in":
        return any(a in expected_n for a in actuals)
    if op_n == "not_in":
        return all(a not in expected_n for a in actuals)
    if op_n == "contains":
        hay = " ".join(actuals).lower()
        return any(e.lower() in hay for e in expected_n if e)
    if op_n == "neq":
        return all(a != e for a in actuals for e in expected_n) if expected_n else True
    # eq
    if not expected_n:
        return True
    return any(a == e for a in actuals for e in expected_n)


def _entity_field_value(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    tenant_id: int,
    field_key: str,
) -> tuple[bool, Any]:
    """Returns (found, value). found=False → entity missing."""
    et = str(entity_type).upper()
    if et == ENTITY_ORDER:
        from ...models.order import Order

        row = (
            db.query(Order)
            .filter(Order.id == int(entity_id), Order.tenant_id == int(tenant_id))
            .first()
        )
        if row is None:
            return False, None
        if field_key == "order_status":
            return True, row.order_ui_status_id
        if field_key == "warehouse_id":
            return True, row.warehouse_id
        if field_key == "order_number":
            return True, row.number
        return True, None

    if et == ENTITY_RETURN:
        from ...models.wms_order_return import WmsOrderReturn

        row = (
            db.query(WmsOrderReturn)
            .filter(WmsOrderReturn.id == int(entity_id), WmsOrderReturn.tenant_id == int(tenant_id))
            .first()
        )
        if row is None:
            return False, None
        if field_key in ("return_status", "order_status"):
            return True, row.ui_status_id
        if field_key == "warehouse_id":
            return True, row.warehouse_id
        return True, None

    if et == ENTITY_COMPLAINT:
        from ...models.complaint import Complaint

        row = (
            db.query(Complaint)
            .filter(Complaint.id == int(entity_id), Complaint.tenant_id == int(tenant_id))
            .first()
        )
        if row is None:
            return False, None
        if field_key in ("complaint_status", "order_status"):
            return True, row.complaint_ui_status_id
        if field_key == "warehouse_id":
            return True, row.warehouse_id
        return True, None

    return False, None


def evaluate_conditions(
    db: Session,
    *,
    conditions: list[dict[str, Any]] | object,
    entity_type: str,
    entity_id: int,
    tenant_id: int,
    ignore_unevaluable: bool = True,
) -> ConditionEvalResult:
    """
    Evaluate editor-shaped conditions (fieldKey, operator, value[], joinToNext).

    Unevaluable fields (legacy catalog stubs):
    - ignore_unevaluable=True → skip (legacy FE never evaluated them)
    - False → treat as failed match
    """
    rows = _loads_list(conditions)
    if not rows:
        return ConditionEvalResult(matched=True)

    details: list[dict[str, Any]] = []
    skipped: list[str] = []
    # Evaluate left-to-right with and/or joins (same as editor semantics).
    current: Optional[bool] = None
    pending_join = "and"

    for i, cond in enumerate(rows):
        field_key = str(cond.get("fieldKey") or cond.get("field_key") or "").strip()
        op = str(cond.get("operator") or "eq")
        expected = _as_str_list(cond.get("value") or [])
        join = str(cond.get("joinToNext") or cond.get("join_to_next") or "and").lower()
        if join not in ("and", "or"):
            join = "and"

        if field_key not in EVALUABLE_FIELDS:
            skipped.append(field_key or f"idx:{i}")
            detail = {
                "fieldKey": field_key,
                "evaluable": False,
                "matched": ignore_unevaluable,
                "skipped": True,
            }
            details.append(detail)
            piece = bool(ignore_unevaluable)
        else:
            found, actual = _entity_field_value(
                db,
                entity_type=entity_type,
                entity_id=entity_id,
                tenant_id=tenant_id,
                field_key=field_key,
            )
            if not found:
                piece = False
                detail = {
                    "fieldKey": field_key,
                    "evaluable": True,
                    "matched": False,
                    "error": "entity_not_found",
                }
            else:
                piece = _op_match(op, actual, expected)
                detail = {
                    "fieldKey": field_key,
                    "evaluable": True,
                    "matched": piece,
                    "actual": actual,
                    "operator": op,
                    "expected": expected,
                }
            details.append(detail)

        if current is None:
            current = piece
        elif pending_join == "or":
            current = bool(current) or piece
        else:
            current = bool(current) and piece

        pending_join = join if i < len(rows) - 1 else "and"

    return ConditionEvalResult(
        matched=bool(current) if current is not None else True,
        details=details,
        skipped_unevaluable=skipped,
    )
