"""Automation runtime preflight — conditions + effects must be fully supported before side effects."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from ...models.automation import AutomationRule
from .conditions import classify_condition, loads_conditions
from .constants import (
    ENTITY_TYPES,
    SUPPORTED_EFFECT_TYPES,
    TRIGGER_ENTITY_STATUS_ENTERED,
)
from .effects import parse_config


@dataclass
class ValidationIssue:
    code: str
    message: str
    condition_type: Optional[str] = None
    effect_type: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.condition_type is not None:
            d["condition_type"] = self.condition_type
        if self.effect_type is not None:
            d["effect_type"] = self.effect_type
        return d


@dataclass
class PreflightResult:
    ok: bool
    runtime_ready: bool
    issues: list[ValidationIssue] = field(default_factory=list)
    blocked_code: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "runtime_ready": self.runtime_ready,
            "blocked_code": self.blocked_code,
            "validation_issues": [i.to_dict() for i in self.issues],
        }


_SAFETY_BLOCKING = frozenset(
    {
        "unsupported_condition",
        "invalid_condition",
        "unsupported_effect",
        "invalid_effect",
        "unsupported_trigger",
        "invalid_entity_type",
    }
)


def validate_automation_runtime(
    rule: AutomationRule,
    *,
    entity_type: Optional[str] = None,
) -> PreflightResult:
    """
    Static preflight (no DB entity needed).

    - ``ok`` / execution gate: PASS when no unsupported/invalid trigger/conditions/effects
      (empty effects → allow noop SUCCEEDED — no side effects).
    - ``runtime_ready``: also requires at least one enabled effect (UI badge).
    """
    issues: list[ValidationIssue] = []

    et = str(entity_type or rule.entity_type or "").strip().upper()
    if et and et not in ENTITY_TYPES:
        issues.append(
            ValidationIssue(code="invalid_entity_type", message=f"Unsupported entity_type={et}")
        )

    trigger = str(rule.trigger_type or "").strip()
    if trigger and trigger != TRIGGER_ENTITY_STATUS_ENTERED:
        issues.append(
            ValidationIssue(
                code="unsupported_trigger",
                message=f"Trigger '{trigger}' is not supported",
            )
        )

    conditions = loads_conditions(getattr(rule, "conditions_json", None) or "[]")
    for i, cond in enumerate(conditions):
        kind, field_key, detail = classify_condition(cond, index=i)
        if kind == "UNSUPPORTED":
            issues.append(
                ValidationIssue(
                    code="unsupported_condition",
                    condition_type=field_key or f"idx:{i}",
                    message=detail
                    or f"Condition '{field_key}' is not supported by the backend evaluator",
                )
            )
        elif kind == "INVALID":
            issues.append(
                ValidationIssue(
                    code="invalid_condition",
                    condition_type=field_key or f"idx:{i}",
                    message=detail or f"Condition '{field_key}' is invalid",
                )
            )

    effects = sorted(
        [e for e in (rule.effects or []) if bool(getattr(e, "enabled", True))],
        key=lambda e: (int(e.position), int(e.id or 0)),
    )
    if not effects:
        issues.append(ValidationIssue(code="no_effects", message="Rule has no enabled effects"))

    for e in effects:
        etype = str(e.effect_type or "").strip()
        if etype not in SUPPORTED_EFFECT_TYPES:
            issues.append(
                ValidationIssue(
                    code="unsupported_effect",
                    effect_type=etype or "unknown",
                    message=f"Effect '{etype}' is not supported by the Automation Engine runtime",
                )
            )
            continue
        if etype == "change_status":
            cfg = parse_config(getattr(e, "config_json", None))
            raw = cfg.get("status_id", cfg.get("order_ui_status_id"))
            try:
                sid = int(raw) if raw is not None else 0
            except (TypeError, ValueError):
                sid = 0
            if sid <= 0:
                issues.append(
                    ValidationIssue(
                        code="invalid_effect",
                        effect_type=etype,
                        message="change_status requires status_id",
                    )
                )

    seen: set[tuple] = set()
    uniq: list[ValidationIssue] = []
    for i in issues:
        key = (i.code, i.condition_type, i.effect_type, i.message)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(i)

    safety_issues = [i for i in uniq if i.code in _SAFETY_BLOCKING]
    execution_ok = len(safety_issues) == 0
    runtime_ready = execution_ok and not any(i.code == "no_effects" for i in uniq)

    blocked_code = None
    if not execution_ok:
        for code in (
            "unsupported_condition",
            "unsupported_effect",
            "invalid_condition",
            "invalid_effect",
            "unsupported_trigger",
            "invalid_entity_type",
        ):
            if any(i.code == code for i in safety_issues):
                blocked_code = code
                break
        if blocked_code is None:
            blocked_code = safety_issues[0].code if safety_issues else "blocked"

    return PreflightResult(
        ok=execution_ok,
        runtime_ready=runtime_ready,
        issues=uniq,
        blocked_code=blocked_code,
    )


def rule_runtime_projection(rule: AutomationRule) -> dict[str, Any]:
    pf = validate_automation_runtime(rule)
    return {
        "runtime_ready": pf.runtime_ready,
        "validation_issues": [i.to_dict() for i in pf.issues],
    }
