"""STATUS_ACTION helpers — projection + one-rule upsert + disable on status delete."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.automation import AutomationExecution, AutomationRule
from .constants import (
    EFFECT_CHANGE_STATUS,
    EFFECT_SEND_EMAIL,
    EFFECT_SEND_MESSAGE,
    EFFECT_WAREHOUSE_COMMIT,
    SOURCE_STATUS_ACTION,
    TRIGGER_ENTITY_STATUS_ENTERED,
)
from .effects import parse_config
from .store import create_rule, rule_to_dict, update_rule


def list_status_action_rules(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    status_id: int,
    warehouse_id: Optional[int] = None,
) -> list[AutomationRule]:
    et = str(entity_type).strip().upper()
    sid = str(int(status_id))
    q = (
        db.query(AutomationRule)
        .options(joinedload(AutomationRule.effects))
        .filter(
            AutomationRule.tenant_id == int(tenant_id),
            AutomationRule.entity_type == et,
            AutomationRule.source == SOURCE_STATUS_ACTION,
            AutomationRule.trigger_type == TRIGGER_ENTITY_STATUS_ENTERED,
        )
    )
    if warehouse_id is not None:
        q = q.filter(
            (AutomationRule.warehouse_id.is_(None)) | (AutomationRule.warehouse_id == int(warehouse_id))
        )
    out: list[AutomationRule] = []
    for rule in q.order_by(AutomationRule.id.asc()).all():
        cfg = parse_config(rule.trigger_config_json)
        ids = cfg.get("status_ids")
        if ids is None and cfg.get("status_id") is not None:
            ids = [cfg.get("status_id")]
        if not ids:
            continue
        try:
            wanted = {str(int(x)) for x in ids if x is not None}
        except (TypeError, ValueError):
            wanted = {str(x) for x in ids}
        if sid in wanted:
            out.append(rule)
    return out


def latest_execution_for_rule(db: Session, rule_id: int) -> Optional[AutomationExecution]:
    return (
        db.query(AutomationExecution)
        .filter(AutomationExecution.rule_id == int(rule_id))
        .order_by(AutomationExecution.id.desc())
        .first()
    )


def status_action_projection(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    status_id: int,
    warehouse_id: Optional[int] = None,
) -> list[dict[str, Any]]:
    rows = list_status_action_rules(
        db,
        tenant_id=tenant_id,
        entity_type=entity_type,
        status_id=status_id,
        warehouse_id=warehouse_id,
    )
    result: list[dict[str, Any]] = []
    for rule in rows:
        d = rule_to_dict(rule)
        last = latest_execution_for_rule(db, int(rule.id))
        d["last_execution_status"] = last.status if last else None
        d["last_run_at"] = last.completed_at.isoformat() if last and last.completed_at else (
            last.started_at.isoformat() if last and last.started_at else None
        )
        result.append(d)
    return result


def disable_status_action_rules_for_status(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    status_id: int,
    warehouse_id: Optional[int] = None,
) -> int:
    """Disable STATUS_ACTION rules triggered by this status. Keeps audit/history."""
    rows = list_status_action_rules(
        db,
        tenant_id=tenant_id,
        entity_type=entity_type,
        status_id=status_id,
        warehouse_id=warehouse_id,
    )
    n = 0
    now = datetime.utcnow()
    for rule in rows:
        if rule.enabled:
            rule.enabled = False
            rule.updated_at = now
            db.add(rule)
            n += 1
    db.flush()
    return n


def logical_status_action_key(effect_type: str, config: Optional[dict[str, Any]] = None) -> str:
    et = str(effect_type or "").strip()
    cfg = config or {}
    if et == EFFECT_CHANGE_STATUS:
        return "change_status"
    if et == EFFECT_WAREHOUSE_COMMIT:
        return "warehouse_commit"
    if et in (EFFECT_SEND_EMAIL, EFFECT_SEND_MESSAGE):
        rtype = str(cfg.get("recipient_type") or cfg.get("recipient") or "CUSTOMER").strip().upper()
        return "send_email_internal" if rtype == "INTERNAL" else "send_email_customer"
    return f"other:{et}"


def upsert_status_action_bundle(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    status_id: int,
    warehouse_id: Optional[int],
    effects: list[dict[str, Any]],
    status_name: Optional[str] = None,
) -> AutomationRule:
    """
    Ensure exactly one STATUS_ACTION rule for (tenant, entity, warehouse, status).

    Deterministic merge: keep lowest rule id; disable extras (history preserved).
    Effects list is replaced on the primary rule. Rule.enabled = any effect enabled.
    """
    et = str(entity_type).strip().upper()
    sid = int(status_id)
    rows = list_status_action_rules(
        db,
        tenant_id=tenant_id,
        entity_type=et,
        status_id=sid,
        warehouse_id=warehouse_id,
    )
    label = (status_name or "").strip() or str(sid)
    rule_name = f"Po wejściu w status: {label}"

    # Normalize effects: unique logical keys, re-index positions.
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for i, eff in enumerate(effects):
        etype = str(eff.get("effect_type") or "").strip()
        if not etype:
            continue
        cfg = dict(eff.get("config") or {})
        key = logical_status_action_key(etype, cfg)
        if key.startswith("other:"):
            continue
        if key in seen:
            continue
        seen.add(key)
        if key == "send_email_customer":
            cfg["recipient_type"] = "CUSTOMER"
            etype = EFFECT_SEND_EMAIL
        elif key == "send_email_internal":
            cfg["recipient_type"] = "INTERNAL"
            etype = EFFECT_SEND_EMAIL
        normalized.append(
            {
                "position": len(normalized),
                "effect_type": etype,
                "config": cfg,
                "enabled": bool(eff.get("enabled", True)),
            }
        )

    any_on = any(bool(e.get("enabled")) for e in normalized)
    trigger_config = {"status_id": sid}

    if not rows:
        rule = create_rule(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            entity_type=et,
            name=rule_name,
            enabled=any_on,
            trigger_type=TRIGGER_ENTITY_STATUS_ENTERED,
            trigger_config=trigger_config,
            source=SOURCE_STATUS_ACTION,
            effects=normalized,
        )
        db.flush()
        return rule

    primary = rows[0]
    now = datetime.utcnow()
    for extra in rows[1:]:
        if extra.enabled:
            extra.enabled = False
            extra.updated_at = now
            db.add(extra)

    update_rule(
        db,
        primary,
        name=rule_name,
        enabled=any_on,
        trigger_type=TRIGGER_ENTITY_STATUS_ENTERED,
        trigger_config=trigger_config,
        effects=normalized,
    )
    db.flush()
    db.expire(primary)
    refreshed = (
        db.query(AutomationRule)
        .options(joinedload(AutomationRule.effects))
        .filter(AutomationRule.id == int(primary.id))
        .first()
    )
    return refreshed or primary
