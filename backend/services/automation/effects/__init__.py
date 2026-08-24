"""Effect adapter protocol and registry."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional, Protocol

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ..constants import (
    EFFECT_CHANGE_STATUS,
    EFFECT_GENERATE_CORRECTION,
    EFFECT_GENERATE_DOCUMENT,
    EFFECT_GENERATE_SALE_CORRECTION,
    EFFECT_SEND_EMAIL,
    EFFECT_SEND_MESSAGE,
    EFFECT_WAREHOUSE_COMMIT,
    SUPPORTED_EFFECT_TYPES,
)


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
        execution_id: Optional[int] = None,
        effect_id: Optional[int] = None,
    ) -> EffectResult: ...


def normalize_effect_type(effect_type: str) -> str:
    """Map legacy FE send_message (email channel) → send_email; legacy correction slug → sale correction."""
    et = str(effect_type or "").strip()
    if et == EFFECT_SEND_MESSAGE:
        return EFFECT_SEND_EMAIL
    if et == EFFECT_GENERATE_CORRECTION:
        return EFFECT_GENERATE_SALE_CORRECTION
    return et


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
        execution_id: Optional[int] = None,
        effect_id: Optional[int] = None,
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
        execution_id: Optional[int] = None,
        effect_id: Optional[int] = None,
    ) -> EffectResult:
        from .change_status import execute_change_status

        return execute_change_status(
            db,
            config=config,
            event=event,
            actor_user_id=actor_user_id,
        )


class SendEmailEffectAdapter:
    effect_type = EFFECT_SEND_EMAIL

    def execute(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        event: StatusTransitionEvent,
        actor_user_id: Optional[int],
        execution_id: Optional[int] = None,
        effect_id: Optional[int] = None,
    ) -> EffectResult:
        from .send_email import execute_send_email

        return execute_send_email(
            db,
            config=config,
            event=event,
            actor_user_id=actor_user_id,
            execution_id=execution_id,
            effect_id=effect_id,
        )


class WarehouseCommitEffectAdapter:
    effect_type = EFFECT_WAREHOUSE_COMMIT

    def execute(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        event: StatusTransitionEvent,
        actor_user_id: Optional[int],
        execution_id: Optional[int] = None,
        effect_id: Optional[int] = None,
    ) -> EffectResult:
        del execution_id, effect_id
        from .warehouse_commit import execute_warehouse_commit

        return execute_warehouse_commit(
            db,
            config=config,
            event=event,
            actor_user_id=actor_user_id,
        )


class GenerateSaleCorrectionEffectAdapter:
    effect_type = EFFECT_GENERATE_SALE_CORRECTION

    def execute(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        event: StatusTransitionEvent,
        actor_user_id: Optional[int],
        execution_id: Optional[int] = None,
        effect_id: Optional[int] = None,
    ) -> EffectResult:
        del execution_id, effect_id
        from .generate_sale_correction import execute_generate_sale_correction

        return execute_generate_sale_correction(
            db,
            config=config,
            event=event,
            actor_user_id=actor_user_id,
        )


class GenerateDocumentEffectAdapter:
    effect_type = EFFECT_GENERATE_DOCUMENT

    def execute(
        self,
        db: Session,
        *,
        config: dict[str, Any],
        event: StatusTransitionEvent,
        actor_user_id: Optional[int],
        execution_id: Optional[int] = None,
        effect_id: Optional[int] = None,
    ) -> EffectResult:
        from .generate_document import execute_generate_document

        return execute_generate_document(
            db,
            config=config,
            event=event,
            actor_user_id=actor_user_id,
            execution_id=execution_id,
            effect_id=effect_id,
        )


def get_adapter(effect_type: str) -> EffectAdapter:
    et = normalize_effect_type(effect_type)
    if et == EFFECT_CHANGE_STATUS:
        return ChangeStatusEffectAdapter()
    if et == EFFECT_SEND_EMAIL:
        return SendEmailEffectAdapter()
    if et == EFFECT_WAREHOUSE_COMMIT:
        return WarehouseCommitEffectAdapter()
    if et == EFFECT_GENERATE_SALE_CORRECTION:
        return GenerateSaleCorrectionEffectAdapter()
    if et == EFFECT_GENERATE_DOCUMENT:
        return GenerateDocumentEffectAdapter()
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
    return normalize_effect_type(effect_type) in SUPPORTED_EFFECT_TYPES
