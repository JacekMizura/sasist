"""Domain validator for product logistic / packaging physical settings — BE SSOT."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class LogisticValidationIssue:
    code: str
    field: str
    message: str


@dataclass
class LogisticValidationResult:
    ok: bool
    errors: list[LogisticValidationIssue] = field(default_factory=list)
    warnings: list[LogisticValidationIssue] = field(default_factory=list)

    def raise_or_ok(self) -> None:
        if not self.ok:
            raise ValueError("; ".join(f"{e.code}:{e.field}" for e in self.errors))


def _f(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _i(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def validate_product_logistics(
    *,
    length: Any = None,
    width: Any = None,
    height: Any = None,
    weight: Any = None,
    orientation_type: Any = None,
    stack_behavior: Any = None,
    max_stack_count: Any = None,
    stack_compressible: Any = None,
    compressed_height_cm: Any = None,
    max_stack_weight: Any = None,
    fragile: Any = None,
) -> LogisticValidationResult:
    errors: list[LogisticValidationIssue] = []
    warnings: list[LogisticValidationIssue] = []

    for name, raw in (("length", length), ("width", width), ("height", height)):
        v = _f(raw)
        if v is not None and v <= 0:
            errors.append(LogisticValidationIssue("DIMENSION_MUST_BE_POSITIVE", name, f"{name} must be > 0"))

    w = _f(weight)
    if w is not None and w < 0:
        errors.append(LogisticValidationIssue("WEIGHT_NEGATIVE", "weight", "weight must be >= 0"))

    orient = str(orientation_type or "").strip().lower() if orientation_type is not None else ""
    if orient and orient not in ("any", "upright", "upright_only", "no_rotation", "no_stack", "fixed", "vertical"):
        errors.append(LogisticValidationIssue("ORIENTATION_INVALID", "orientation_type", "unsupported orientation"))

    stack = str(stack_behavior or "").strip().lower().replace("-", "_") if stack_behavior is not None else ""
    if stack and stack not in ("stackable", "no_stack", "none", "not_stackable", "unit_on_unit", ""):
        # allow empty
        if stack not in ("pallet", "pallet_only", "carton", "carton_on_carton"):
            errors.append(LogisticValidationIssue("STACK_BEHAVIOR_INVALID", "stack_behavior", "unsupported stack_behavior"))

    msc = _i(max_stack_count)
    if msc is not None and msc <= 0:
        errors.append(LogisticValidationIssue("MAX_STACK_COUNT_INVALID", "max_stack_count", "max_stack_count must be >= 1 or null"))

    no_stack = stack in ("no_stack", "none", "not_stackable")
    if no_stack and msc is not None and msc > 1:
        warnings.append(
            LogisticValidationIssue(
                "MAX_STACK_COUNT_IGNORED_FOR_NO_STACK",
                "max_stack_count",
                "NO_STACK: max_stack_count > 1 is ignored by solver (effective 1 per stack).",
            )
        )

    compressible = bool(stack_compressible) if stack_compressible is not None else False
    ch = _f(compressed_height_cm)
    h = _f(height)
    if not compressible and ch is not None:
        warnings.append(
            LogisticValidationIssue(
                "COMPRESSED_HEIGHT_IGNORED",
                "compressed_height_cm",
                "compressed_height ignored when stack_compressible is false",
            )
        )
    if compressible:
        if ch is None or ch <= 0:
            errors.append(
                LogisticValidationIssue(
                    "COMPRESSED_HEIGHT_REQUIRED",
                    "compressed_height_cm",
                    "compressed_height_cm required and > 0 when compressible",
                )
            )
        elif h is not None and h > 0 and ch > h + 1e-9:
            errors.append(
                LogisticValidationIssue(
                    "COMPRESSED_HEIGHT_EXCEEDS_HEIGHT",
                    "compressed_height_cm",
                    "compressed_height_cm must be <= product height",
                )
            )

    msw = _f(max_stack_weight)
    if msw is not None and msw <= 0:
        errors.append(LogisticValidationIssue("MAX_STACK_WEIGHT_INVALID", "max_stack_weight", "must be > 0 or null"))

    _ = fragile  # bool optional — no extra rules beyond presence

    return LogisticValidationResult(ok=len(errors) == 0, errors=errors, warnings=warnings)
