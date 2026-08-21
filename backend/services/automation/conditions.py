"""Condition evaluation for Automation Engine (backend SSOT)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from sqlalchemy.orm import Session

from .constants import ENTITY_COMPLAINT, ENTITY_ORDER, ENTITY_RETURN

ConditionKind = Literal["SUPPORTED", "UNSUPPORTED", "INVALID"]

# Fields the runner can evaluate against live entity data.
SUPPORTED_CONDITION_FIELDS = frozenset(
    {
        "order_status",
        "return_status",
        "complaint_status",
        "warehouse_id",
        "order_number",
    }
)

#: Known FE catalog keys that are intentionally not evaluable yet.
KNOWN_UNSUPPORTED_CONDITION_FIELDS = frozenset(
    {
        "order_source",
        "order_tags",
        "order_categories",
        "customer_email",
        "customer_group",
        "shipment_courier",
        "shipment_status",
        "payment_method",
        "payment_status",
        "order_total",
        "product_sku",
        "document_type",
        "wms_stock_state",
        "allegro_account",
        "integration_channel",
        "custom_field",
    }
)

VALID_OPERATORS = frozenset({"in", "not_in", "eq", "neq", "contains"})

# Backward-compatible alias
EVALUABLE_FIELDS = SUPPORTED_CONDITION_FIELDS


@dataclass
class ConditionEvalResult:
    matched: bool
    details: list[dict[str, Any]] = field(default_factory=list)
    blocked: bool = False
    blocked_code: Optional[str] = None
    unsupported_keys: list[str] = field(default_factory=list)
    invalid_keys: list[str] = field(default_factory=list)


def loads_conditions(raw: object) -> list[dict[str, Any]]:
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


def classify_condition(cond: dict[str, Any], *, index: int = 0) -> tuple[ConditionKind, str, str]:
    """Returns (kind, field_key, detail_message)."""
    field_key = str(cond.get("fieldKey") or cond.get("field_key") or "").strip()
    if not field_key:
        return "INVALID", f"idx:{index}", "Condition missing fieldKey"
    op = str(cond.get("operator") or "eq").strip().lower()
    if op not in VALID_OPERATORS:
        return "INVALID", field_key, f"Invalid operator '{op}'"
    if field_key in SUPPORTED_CONDITION_FIELDS:
        return "SUPPORTED", field_key, ""
    if field_key in KNOWN_UNSUPPORTED_CONDITION_FIELDS:
        return "UNSUPPORTED", field_key, f"Condition '{field_key}' is not supported by the backend evaluator"
    # Unknown key → UNSUPPORTED (safer than inventing INVALID that blocks import differently)
    return "UNSUPPORTED", field_key, f"Condition '{field_key}' is not supported by the backend evaluator"


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
    ignore_unevaluable: bool = False,
) -> ConditionEvalResult:
    """
    Evaluate editor-shaped conditions.

    Safety: any UNSUPPORTED or INVALID condition blocks the rule (matched=False, blocked=True).
    ``ignore_unevaluable`` is retained for signature compatibility but **ignored** — skipping
    unsupported conditions is forbidden for runtime SSOT.
    """
    del ignore_unevaluable  # never skip unsupported
    rows = loads_conditions(conditions)
    if not rows:
        return ConditionEvalResult(matched=True)

    details: list[dict[str, Any]] = []
    unsupported: list[str] = []
    invalid: list[str] = []

    for i, cond in enumerate(rows):
        kind, field_key, detail_msg = classify_condition(cond, index=i)
        if kind == "UNSUPPORTED":
            unsupported.append(field_key)
            details.append(
                {
                    "fieldKey": field_key,
                    "classification": "UNSUPPORTED",
                    "matched": False,
                    "error": "unsupported_condition",
                    "message": detail_msg,
                }
            )
            continue
        if kind == "INVALID":
            invalid.append(field_key)
            details.append(
                {
                    "fieldKey": field_key,
                    "classification": "INVALID",
                    "matched": False,
                    "error": "invalid_condition",
                    "message": detail_msg,
                }
            )
            continue

        op = str(cond.get("operator") or "eq")
        expected = _as_str_list(cond.get("value") or [])
        found, actual = _entity_field_value(
            db,
            entity_type=entity_type,
            entity_id=entity_id,
            tenant_id=tenant_id,
            field_key=field_key,
        )
        if not found:
            details.append(
                {
                    "fieldKey": field_key,
                    "classification": "SUPPORTED",
                    "matched": False,
                    "error": "entity_not_found",
                }
            )
            # continue collecting; final match uses and/or below with False piece
            piece = False
        else:
            piece = _op_match(op, actual, expected)
            details.append(
                {
                    "fieldKey": field_key,
                    "classification": "SUPPORTED",
                    "matched": piece,
                    "actual": actual,
                    "operator": op,
                    "expected": expected,
                }
            )

    if unsupported:
        return ConditionEvalResult(
            matched=False,
            details=details,
            blocked=True,
            blocked_code="unsupported_condition",
            unsupported_keys=unsupported,
            invalid_keys=invalid,
        )
    if invalid:
        return ConditionEvalResult(
            matched=False,
            details=details,
            blocked=True,
            blocked_code="invalid_condition",
            unsupported_keys=unsupported,
            invalid_keys=invalid,
        )

    # All SUPPORTED — evaluate and/or chain from details that have matched bool for supported pieces
    current: Optional[bool] = None
    pending_join = "and"
    for i, cond in enumerate(rows):
        join = str(cond.get("joinToNext") or cond.get("join_to_next") or "and").lower()
        if join not in ("and", "or"):
            join = "and"
        # Find corresponding detail (same index order among all rows)
        piece = bool(details[i].get("matched")) if i < len(details) else False
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
        blocked=False,
    )
