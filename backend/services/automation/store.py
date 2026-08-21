"""CRUD helpers for automation rules."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.automation import AutomationEffect, AutomationExecution, AutomationRule
from .constants import (
    ENTITY_TYPES,
    KNOWN_EFFECT_TYPES,
    SOURCE_USER,
    TRIGGER_ENTITY_STATUS_ENTERED,
)


def _dumps(obj: object) -> str:
    return json.dumps(obj if obj is not None else {}, ensure_ascii=False)


def _dumps_list(obj: object) -> str:
    return json.dumps(obj if obj is not None else [], ensure_ascii=False)


def _loads(raw: object) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(str(raw or "{}"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _loads_list(raw: object) -> list[Any]:
    if isinstance(raw, list):
        return raw
    try:
        data = json.loads(str(raw or "[]"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def list_rules(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    enabled: Optional[bool] = None,
    source: Optional[str] = None,
) -> list[AutomationRule]:
    q = db.query(AutomationRule).options(joinedload(AutomationRule.effects)).filter(
        AutomationRule.tenant_id == int(tenant_id)
    )
    if warehouse_id is not None:
        q = q.filter(
            (AutomationRule.warehouse_id.is_(None)) | (AutomationRule.warehouse_id == int(warehouse_id))
        )
    if entity_type:
        q = q.filter(AutomationRule.entity_type == str(entity_type).upper())
    if enabled is not None:
        q = q.filter(AutomationRule.enabled.is_(bool(enabled)))
    if source is not None:
        q = q.filter(AutomationRule.source == str(source))
    return q.order_by(AutomationRule.id.asc()).all()


def get_rule(db: Session, *, tenant_id: int, rule_id: int) -> Optional[AutomationRule]:
    return (
        db.query(AutomationRule)
        .options(joinedload(AutomationRule.effects))
        .filter(AutomationRule.id == int(rule_id), AutomationRule.tenant_id == int(tenant_id))
        .first()
    )


def find_rule_by_legacy_fe_id(
    db: Session, *, tenant_id: int, warehouse_id: Optional[int], legacy_fe_id: str
) -> Optional[AutomationRule]:
    needle = str(legacy_fe_id or "").strip()
    if not needle:
        return None
    q = db.query(AutomationRule).options(joinedload(AutomationRule.effects)).filter(
        AutomationRule.tenant_id == int(tenant_id)
    )
    if warehouse_id is not None:
        q = q.filter(AutomationRule.warehouse_id == int(warehouse_id))
    for rule in q.all():
        meta = _loads(getattr(rule, "metadata_json", None) or "{}")
        if str(meta.get("legacy_fe_id") or "") == needle:
            return rule
    return None


def create_rule(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    entity_type: str,
    name: str,
    enabled: bool = True,
    trigger_type: str = TRIGGER_ENTITY_STATUS_ENTERED,
    trigger_config: Optional[dict[str, Any]] = None,
    source: str = SOURCE_USER,
    effects: Optional[list[dict[str, Any]]] = None,
    group: Optional[str] = None,
    conditions: Optional[list[Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> AutomationRule:
    et = str(entity_type).strip().upper()
    if et not in ENTITY_TYPES:
        raise ValueError(f"Invalid entity_type: {entity_type}")
    now = datetime.utcnow()
    rule = AutomationRule(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
        entity_type=et,
        name=(name or "").strip() or "Bez nazwy",
        group=(group or "Ogólne").strip() or "Ogólne",
        enabled=bool(enabled),
        trigger_type=str(trigger_type or TRIGGER_ENTITY_STATUS_ENTERED),
        trigger_config_json=_dumps(trigger_config or {}),
        conditions_json=_dumps_list(conditions or []),
        metadata_json=_dumps(metadata or {}),
        source=str(source or SOURCE_USER),
        created_at=now,
        updated_at=now,
    )
    db.add(rule)
    db.flush()
    _replace_effects(db, rule, effects or [])
    db.flush()
    db.refresh(rule)
    return rule


def update_rule(
    db: Session,
    rule: AutomationRule,
    *,
    name: Optional[str] = None,
    enabled: Optional[bool] = None,
    warehouse_id: Optional[int] = None,
    clear_warehouse: bool = False,
    trigger_type: Optional[str] = None,
    trigger_config: Optional[dict[str, Any]] = None,
    effects: Optional[list[dict[str, Any]]] = None,
    group: Optional[str] = None,
    conditions: Optional[list[Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
    merge_metadata: bool = True,
) -> AutomationRule:
    if name is not None:
        rule.name = name.strip() or rule.name
    if enabled is not None:
        rule.enabled = bool(enabled)
    if group is not None:
        rule.group = group.strip() or "Ogólne"
    if clear_warehouse:
        rule.warehouse_id = None
    elif warehouse_id is not None:
        rule.warehouse_id = int(warehouse_id)
    if trigger_type is not None:
        rule.trigger_type = str(trigger_type)
    if trigger_config is not None:
        rule.trigger_config_json = _dumps(trigger_config)
    if conditions is not None:
        rule.conditions_json = _dumps_list(conditions)
    if metadata is not None:
        if merge_metadata:
            prev = _loads(getattr(rule, "metadata_json", None) or "{}")
            prev.update(metadata)
            rule.metadata_json = _dumps(prev)
        else:
            rule.metadata_json = _dumps(metadata)
    if effects is not None:
        _replace_effects(db, rule, effects)
    rule.updated_at = datetime.utcnow()
    db.add(rule)
    db.flush()
    return rule


def duplicate_rule(db: Session, rule: AutomationRule) -> AutomationRule:
    meta = _loads(getattr(rule, "metadata_json", None) or "{}")
    meta.pop("legacy_fe_id", None)
    meta["stats"] = {"lastRunAt": None, "runCount": 0}
    effects = [
        {
            "position": int(e.position),
            "effect_type": e.effect_type,
            "config": _loads(e.config_json),
            "enabled": bool(e.enabled),
        }
        for e in sorted(rule.effects or [], key=lambda x: (int(x.position), int(x.id or 0)))
    ]
    return create_rule(
        db,
        tenant_id=int(rule.tenant_id),
        warehouse_id=int(rule.warehouse_id) if rule.warehouse_id is not None else None,
        entity_type=str(rule.entity_type),
        name=f"{rule.name} (kopia)",
        enabled=False,
        trigger_type=str(rule.trigger_type),
        trigger_config=_loads(rule.trigger_config_json),
        source=str(rule.source or SOURCE_USER),
        effects=effects,
        group=getattr(rule, "group", None) or "Ogólne",
        conditions=_loads_list(getattr(rule, "conditions_json", None) or "[]"),
        metadata=meta,
    )


def delete_rule(db: Session, rule: AutomationRule) -> None:
    db.delete(rule)
    db.flush()


def set_rule_enabled(db: Session, rule: AutomationRule, enabled: bool) -> AutomationRule:
    rule.enabled = bool(enabled)
    rule.updated_at = datetime.utcnow()
    db.add(rule)
    db.flush()
    return rule


def _replace_effects(db: Session, rule: AutomationRule, effects: list[dict[str, Any]]) -> None:
    for old in list(rule.effects or []):
        db.delete(old)
    # Clear identity-map collection so subsequent updates don't resurrect deleted rows.
    try:
        rule.effects = []
    except Exception:
        pass
    db.flush()
    for i, eff in enumerate(effects):
        et = str(eff.get("effect_type") or "").strip()
        if not et:
            raise ValueError("effect_type is required")
        if et not in KNOWN_EFFECT_TYPES:
            raise ValueError(f"Unknown effect_type: {et}")
        pos = int(eff.get("position", i))
        row = AutomationEffect(
            rule_id=int(rule.id),
            position=pos,
            effect_type=et,
            config_json=_dumps(eff.get("config") or {}),
            enabled=bool(eff.get("enabled", True)),
        )
        db.add(row)


def list_executions(
    db: Session,
    *,
    tenant_id: int,
    rule_id: int,
    limit: int = 50,
) -> list[AutomationExecution]:
    rule = get_rule(db, tenant_id=tenant_id, rule_id=rule_id)
    if rule is None:
        return []
    return (
        db.query(AutomationExecution)
        .filter(AutomationExecution.rule_id == int(rule_id))
        .order_by(AutomationExecution.id.desc())
        .limit(max(1, min(int(limit), 200)))
        .all()
    )


def rule_to_dict(rule: AutomationRule) -> dict[str, Any]:
    effects = sorted(rule.effects or [], key=lambda e: (int(e.position), int(e.id or 0)))
    from .preflight import rule_runtime_projection

    runtime = rule_runtime_projection(rule)
    return {
        "id": int(rule.id),
        "tenant_id": int(rule.tenant_id),
        "warehouse_id": int(rule.warehouse_id) if rule.warehouse_id is not None else None,
        "entity_type": rule.entity_type,
        "name": rule.name,
        "group": getattr(rule, "group", None) or "Ogólne",
        "enabled": bool(rule.enabled),
        "trigger_type": rule.trigger_type,
        "trigger_config": _loads(rule.trigger_config_json),
        "conditions": _loads_list(getattr(rule, "conditions_json", None) or "[]"),
        "metadata": _loads(getattr(rule, "metadata_json", None) or "{}"),
        "source": rule.source,
        "runtime_ready": runtime["runtime_ready"],
        "validation_issues": runtime["validation_issues"],
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
        "effects": [
            {
                "id": int(e.id),
                "position": int(e.position),
                "effect_type": e.effect_type,
                "config": _loads(e.config_json),
                "enabled": bool(e.enabled),
            }
            for e in effects
        ],
    }


def execution_to_dict(ex: AutomationExecution) -> dict[str, Any]:
    effects = sorted(ex.effect_executions or [], key=lambda e: (int(e.position), int(e.id or 0)))
    return {
        "id": int(ex.id),
        "rule_id": int(ex.rule_id),
        "entity_type": ex.entity_type,
        "entity_id": int(ex.entity_id),
        "trigger_event_id": ex.trigger_event_id,
        "run_kind": getattr(ex, "run_kind", None) or "AUTO",
        "idempotency_key": ex.idempotency_key,
        "status": ex.status,
        "started_at": ex.started_at.isoformat() if ex.started_at else None,
        "completed_at": ex.completed_at.isoformat() if ex.completed_at else None,
        "error": ex.error,
        "effect_executions": [
            {
                "id": int(ee.id),
                "effect_id": int(ee.effect_id) if ee.effect_id is not None else None,
                "position": int(ee.position),
                "effect_type": ee.effect_type,
                "status": ee.status,
                "started_at": ee.started_at.isoformat() if ee.started_at else None,
                "completed_at": ee.completed_at.isoformat() if ee.completed_at else None,
                "error": ee.error,
                "result": _loads(ee.result_json) if ee.result_json else None,
            }
            for ee in effects
        ],
    }
