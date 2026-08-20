"""Per-product Smart Matching v2: enable flag, manual rules, lock."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, noload

from ....models.carton import Carton
from ....models.wms_smart_matching import (
    WmsSmartMatchingObservationV2,
    WmsSmartMatchingProductSettings,
    WmsSmartMatchingRuleV2,
)
from .constants import SOURCE_AUTO, SOURCE_MANUAL, STATUS_ACTIVE, STATUS_AMBIGUOUS


def get_or_create_product_settings(
    db: Session, *, tenant_id: int, warehouse_id: int, product_id: int
) -> WmsSmartMatchingProductSettings:
    row = (
        db.query(WmsSmartMatchingProductSettings)
        .filter(
            WmsSmartMatchingProductSettings.tenant_id == int(tenant_id),
            WmsSmartMatchingProductSettings.warehouse_id == int(warehouse_id),
            WmsSmartMatchingProductSettings.product_id == int(product_id),
        )
        .first()
    )
    if row is not None:
        return row
    now = datetime.utcnow()
    row = WmsSmartMatchingProductSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        smart_matching_enabled=True,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def is_product_smart_matching_enabled(
    db: Session, *, tenant_id: int, warehouse_id: int, product_id: int
) -> bool:
    """Default inherit/enabled when no row exists."""
    row = (
        db.query(WmsSmartMatchingProductSettings)
        .filter(
            WmsSmartMatchingProductSettings.tenant_id == int(tenant_id),
            WmsSmartMatchingProductSettings.warehouse_id == int(warehouse_id),
            WmsSmartMatchingProductSettings.product_id == int(product_id),
        )
        .first()
    )
    if row is None:
        return True
    return bool(row.smart_matching_enabled)


def set_product_smart_matching_enabled(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    enabled: bool,
) -> WmsSmartMatchingProductSettings:
    row = get_or_create_product_settings(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id
    )
    row.smart_matching_enabled = bool(enabled)
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def _carton_name(db: Session, carton_id: str, tenant_id: int, warehouse_id: int) -> Optional[str]:
    c = (
        db.query(Carton)
        .options(noload("*"))
        .filter(
            Carton.id == str(carton_id),
            Carton.tenant_id == int(tenant_id),
            Carton.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    return str(c.name) if c is not None else None


def rule_to_dict(db: Session, r: WmsSmartMatchingRuleV2) -> dict[str, Any]:
    return {
        "id": int(r.id),
        "product_id": int(r.product_id),
        "min_qty": int(r.min_qty),
        "carton_id": str(r.carton_id),
        "carton_name": _carton_name(db, str(r.carton_id), int(r.tenant_id), int(r.warehouse_id)),
        "source": str(r.source),
        "status": str(r.status),
        "is_locked": bool(r.is_locked),
        "hit_count": int(r.hit_count or 0),
        "override_streak": int(r.override_streak or 0),
        "created_threshold": int(r.created_threshold) if r.created_threshold is not None else None,
    }


def list_product_rules_v2(
    db: Session, *, tenant_id: int, warehouse_id: int, product_id: int
) -> list[dict[str, Any]]:
    rows = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
            WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRuleV2.product_id == int(product_id),
        )
        .order_by(WmsSmartMatchingRuleV2.min_qty.asc(), WmsSmartMatchingRuleV2.id.asc())
        .all()
    )
    return [rule_to_dict(db, r) for r in rows]


def list_product_observations(
    db: Session, *, tenant_id: int, warehouse_id: int, product_id: int, limit: int = 20
) -> list[dict[str, Any]]:
    rows = (
        db.query(WmsSmartMatchingObservationV2)
        .filter(
            WmsSmartMatchingObservationV2.tenant_id == int(tenant_id),
            WmsSmartMatchingObservationV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingObservationV2.product_id == int(product_id),
        )
        .order_by(WmsSmartMatchingObservationV2.created_at.desc(), WmsSmartMatchingObservationV2.id.desc())
        .limit(max(1, min(int(limit), 100)))
        .all()
    )
    out = []
    for o in rows:
        out.append(
            {
                "id": int(o.id),
                "order_id": int(o.order_id),
                "quantity": int(o.quantity),
                "carton_id": str(o.carton_id) if o.carton_id else None,
                "carton_name": _carton_name(db, str(o.carton_id), int(o.tenant_id), int(o.warehouse_id))
                if o.carton_id
                else None,
                "suggested_carton_id": str(o.suggested_carton_id) if o.suggested_carton_id else None,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
        )
    return out


def get_product_smart_matching_panel(
    db: Session, *, tenant_id: int, warehouse_id: int, product_id: int
) -> dict[str, Any]:
    enabled = is_product_smart_matching_enabled(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id
    )
    rules = list_product_rules_v2(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id
    )
    conflicts = [r for r in rules if str(r.get("status")) == STATUS_AMBIGUOUS]
    return {
        "product_id": int(product_id),
        "smart_matching_enabled": enabled,
        "rules": rules,
        "conflicts": conflicts,
        "recent_observations": list_product_observations(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id, limit=15
        ),
    }


def upsert_manual_rule(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    min_qty: int,
    carton_id: str,
    is_locked: bool = False,
    rule_id: Optional[int] = None,
) -> WmsSmartMatchingRuleV2:
    mq = max(1, int(min_qty))
    cid = str(carton_id).strip()
    if not cid:
        raise ValueError("carton_id required")
    carton = (
        db.query(Carton)
        .options(noload("*"))
        .filter(
            Carton.id == cid,
            Carton.tenant_id == int(tenant_id),
            Carton.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if carton is None:
        raise ValueError("carton not found")

    now = datetime.utcnow()
    if rule_id is not None:
        row = (
            db.query(WmsSmartMatchingRuleV2)
            .filter(
                WmsSmartMatchingRuleV2.id == int(rule_id),
                WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
                WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
                WmsSmartMatchingRuleV2.product_id == int(product_id),
                WmsSmartMatchingRuleV2.source == SOURCE_MANUAL,
            )
            .first()
        )
        if row is None:
            raise ValueError("manual rule not found")
        if bool(row.is_locked) and not is_locked:
            # Unlocking is allowed via explicit is_locked=False
            pass
        row.min_qty = mq
        row.carton_id = cid
        row.is_locked = bool(is_locked)
        row.status = STATUS_ACTIVE
        row.updated_at = now
        db.add(row)
        db.flush()
        return row

    row = WmsSmartMatchingRuleV2(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        min_qty=mq,
        carton_id=cid,
        source=SOURCE_MANUAL,
        status=STATUS_ACTIVE,
        is_locked=bool(is_locked),
        hit_count=0,
        override_streak=0,
        created_threshold=None,
        engine_version=2,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def set_rule_locked(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    rule_id: int,
    is_locked: bool,
) -> WmsSmartMatchingRuleV2:
    row = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.id == int(rule_id),
            WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
            WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRuleV2.source == SOURCE_MANUAL,
        )
        .first()
    )
    if row is None:
        raise ValueError("manual rule not found")
    row.is_locked = bool(is_locked)
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def delete_manual_rule(
    db: Session, *, tenant_id: int, warehouse_id: int, rule_id: int
) -> bool:
    row = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.id == int(rule_id),
            WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
            WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRuleV2.source == SOURCE_MANUAL,
        )
        .first()
    )
    if row is None:
        return False
    if bool(row.is_locked):
        raise ValueError("locked rule cannot be deleted")
    db.delete(row)
    db.flush()
    return True
