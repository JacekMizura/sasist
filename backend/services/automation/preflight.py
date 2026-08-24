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
from .effects import normalize_effect_type, parse_config


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
        "unsupported_entity_for_effect",
        "invalid_effect_order",
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
        etype_raw = str(e.effect_type or "").strip()
        etype = normalize_effect_type(etype_raw)
        if etype not in SUPPORTED_EFFECT_TYPES:
            issues.append(
                ValidationIssue(
                    code="unsupported_effect",
                    effect_type=etype_raw or "unknown",
                    message=f"Effect '{etype_raw}' is not supported by the Automation Engine runtime",
                )
            )
            continue
        cfg = parse_config(getattr(e, "config_json", None))
        if etype == "change_status":
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
        elif etype == "send_email":
            raw_tid = cfg.get("template_id", cfg.get("templateId"))
            try:
                tid = int(raw_tid) if raw_tid is not None else 0
            except (TypeError, ValueError):
                tid = 0
            if tid <= 0:
                issues.append(
                    ValidationIssue(
                        code="invalid_effect",
                        effect_type=etype,
                        message="send_email requires template_id",
                    )
                )
            rtype = str(cfg.get("recipient_type") or cfg.get("recipient") or "CUSTOMER").strip().upper()
            if rtype and rtype not in ("CUSTOMER", "INTERNAL"):
                issues.append(
                    ValidationIssue(
                        code="invalid_effect",
                        effect_type=etype,
                        message="send_email supports recipient_type=CUSTOMER|INTERNAL only",
                    )
                )
            if rtype == "INTERNAL":
                raw_uid = cfg.get("user_id", cfg.get("userId"))
                try:
                    uid = int(raw_uid) if raw_uid is not None else 0
                except (TypeError, ValueError):
                    uid = 0
                if uid <= 0:
                    issues.append(
                        ValidationIssue(
                            code="invalid_effect",
                            effect_type=etype,
                            message="send_email INTERNAL requires user_id",
                        )
                    )
            # entity compatibility: rule.entity_type must be known
            rule_et = str(entity_type or rule.entity_type or "").strip().upper()
            if rule_et and rule_et not in ENTITY_TYPES:
                issues.append(
                    ValidationIssue(
                        code="invalid_effect",
                        effect_type=etype,
                        message=f"send_email not compatible with entity_type={rule_et}",
                    )
                )
        elif etype == "warehouse_commit":
            rule_et = str(entity_type or rule.entity_type or "").strip().upper()
            if rule_et and rule_et != "RETURN":
                issues.append(
                    ValidationIssue(
                        code="unsupported_entity_for_effect",
                        effect_type=etype,
                        message="warehouse_commit only compatible with entity_type=RETURN",
                    )
                )
        elif etype == "generate_sale_correction":
            rule_et = str(entity_type or rule.entity_type or "").strip().upper()
            if rule_et and rule_et != "RETURN":
                issues.append(
                    ValidationIssue(
                        code="unsupported_entity_for_effect",
                        effect_type=etype,
                        message="generate_sale_correction only compatible with entity_type=RETURN",
                    )
                )
        elif etype == "generate_document":
            series_id = str(
                cfg.get("series_id")
                or cfg.get("document_series_id")
                or cfg.get("doc_series_id")
                or ""
            ).strip()
            if not series_id:
                issues.append(
                    ValidationIssue(
                        code="invalid_effect",
                        effect_type=etype,
                        message="generate_document requires series_id",
                    )
                )
            rule_et = str(entity_type or rule.entity_type or "").strip().upper()
            if rule_et and rule_et != "ORDER":
                issues.append(
                    ValidationIssue(
                        code="unsupported_entity_for_effect",
                        effect_type=etype,
                        message="generate_document only compatible with entity_type=ORDER",
                    )
                )
            try:
                from ..documents.generate_document_support import parse_document_creation_overrides

                parse_document_creation_overrides(cfg if isinstance(cfg, dict) else {})
            except ValueError as exc:
                issues.append(
                    ValidationIssue(
                        code="invalid_effect",
                        effect_type=etype,
                        message=f"generate_document invalid config: {exc}",
                    )
                )

    # RETURN: when both warehouse_commit and generate_sale_correction are enabled,
    # warehouse must run first (no silent reorder).
    enabled_effects = sorted(
        [e for e in (rule.effects or []) if bool(getattr(e, "enabled", True))],
        key=lambda e: (int(e.position), int(e.id or 0)),
    )
    wh_pos: Optional[int] = None
    corr_pos: Optional[int] = None
    for e in enabled_effects:
        et = normalize_effect_type(str(e.effect_type or "").strip())
        if et == "warehouse_commit":
            wh_pos = int(e.position)
        elif et == "generate_sale_correction":
            corr_pos = int(e.position)
    if wh_pos is not None and corr_pos is not None and wh_pos >= corr_pos:
        issues.append(
            ValidationIssue(
                code="invalid_effect_order",
                effect_type="generate_sale_correction",
                message=(
                    "generate_sale_correction must run after warehouse_commit "
                    "(warehouse_commit.position < generate_sale_correction.position)"
                ),
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
            "unsupported_entity_for_effect",
            "invalid_condition",
            "invalid_effect",
            "invalid_effect_order",
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
