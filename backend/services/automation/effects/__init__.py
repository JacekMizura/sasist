"""Effect adapter protocol and registry."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional, Protocol

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ..constants import EFFECT_CHANGE_STATUS, SUPPORTED_EFFECT_TYPES


@dataclass(frozen=True)
class EffectResult:
    ok: bool
    message: str
    data: Optional[dict[str, Any]] = None


class EffectAdapter(Protocol):
    effect_type: str

    def execute(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        event: StatusTransitionEvent,
        actor_user_id: Optional[int],
    ) -> EffectResult: ...


class UnsupportedEffectAdapter:
    def __init__(self, effect_type: str):
        self.effect_type = effect_type

    def execute(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        event: StatusTransitionEvent,
        actor_user_id: Optional[int],
    ) -> EffectResult:
        return EffectResult(
            ok=False,
            message=f"Effect type '{self.effect_type}' is not supported in Automation Engine v1",
            data={"unsupported": True},
        )


class ChangeStatusEffectAdapter:
    effect_type = EFFECT_CHANGE_STATUS

    def execute(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        event: StatusTransitionEvent,
        actor_user_id: Optional[int],
    ) -> EffectResult:
        from .change_status import execute_change_status

        return execute_change_status(
            db,
            config=config,
            event=event,
            actor_user_id=actor_user_id,
        )


def get_adapter(effect_type: str) -> EffectAdapter:
    et = str(effect_type or "").strip()
    if et == EFFECT_CHANGE_STATUS:
        return ChangeStatusEffectAdapter()
    return UnsupportedEffectAdapter(et)


def parse_config(raw: object) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if raw is None or raw == "":
        return {}
    try:
        data = json.loads(str(raw))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def is_supported_effect(effect_type: str) -> bool:
    return str(effect_type or "").strip() in SUPPORTED_EFFECT_TYPES
