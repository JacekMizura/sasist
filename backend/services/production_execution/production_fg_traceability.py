"""Finished-goods identity for production output deltas.

``fg_traceability_json`` roles:
- v1 (legacy): single locked LOT/expiry + progressive serials for the whole MO/line.
- v2: genealogy of posted serials across deltas; LOT/expiry belong to each delta / PW,
  not a permanent lock on the entity.

Stock + document lines remain the SSOT for which LOT landed where.
"""

from __future__ import annotations

import json
import math
from datetime import date, datetime
from typing import Any, Iterable

from sqlalchemy.orm import Session

from ...models.inventory_serial import InventorySerial
from ...models.product import Product
from ...models.product_composition import ProductionBatch, ProductionBatchLine
from ...models.production import ProductionOrder
from ...models.production_fg_output import ProductionFgOutput
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .production_traceability_policy import (
    ProductionTraceabilityPolicy,
    resolve_effective_production_traceability_for_product,
)

SNAPSHOT_VERSION = 1
SNAPSHOT_VERSION_DELTA = 2


def read_fg_traceability_snapshot(entity: Any) -> dict[str, Any] | None:
    raw = getattr(entity, "fg_traceability_json", None)
    if not raw:
        return None
    try:
        parsed = json.loads(str(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _parse_expiry(value: date | str | None) -> date | None:
    if isinstance(value, date):
        return value
    if value is None or not str(value).strip():
        return None
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError as exc:
        raise ValueError("Nieprawidłowa data ważności wyrobu gotowego.") from exc


def _normalize_serials(values: Iterable[str] | None) -> list[str]:
    out = [str(v or "").strip() for v in (values or [])]
    if any(not v for v in out):
        raise ValueError("Numer seryjny wyrobu gotowego nie może być pusty.")
    if len(set(out)) != len(out):
        raise ValueError("Numery seryjne wyrobu gotowego muszą być unikalne.")
    return out


def posted_serials_from_snapshot(snapshot: dict[str, Any] | None) -> list[str]:
    if not snapshot:
        return []
    posted = snapshot.get("posted_serial_numbers")
    if isinstance(posted, list) and posted:
        return [str(x) for x in posted]
    # v1 legacy: all serials on the locked snapshot are considered posted genealogy.
    return [str(x) for x in (snapshot.get("serial_numbers") or [])]


def _assert_serials_unused(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    serials: list[str],
    entity: Any,
    extra_blocked: Iterable[str] | None = None,
) -> None:
    if not serials:
        return
    blocked = set(str(x) for x in (extra_blocked or []))
    overlap = blocked.intersection(serials)
    if overlap:
        raise ValueError(f"Numer seryjny „{next(iter(overlap))}” był już użyty w tym zleceniu.")
    existing = (
        db.query(InventorySerial.serial_number)
        .filter(
            InventorySerial.tenant_id == int(tenant_id),
            InventorySerial.product_id == int(product_id),
            InventorySerial.serial_number.in_(serials),
        )
        .first()
    )
    if existing is not None:
        raise ValueError(f"Numer seryjny „{existing[0]}” był już użyty.")
    # Also reject serial reserved by another not-yet-posted production snapshot.
    needle_filters = [f'%"{sn}"%' for sn in serials]
    for model in (ProductionOrder, ProductionBatchLine):
        q = db.query(model)
        if model is ProductionOrder:
            q = q.filter(model.tenant_id == int(tenant_id), model.product_id == int(product_id))
        else:
            q = q.join(ProductionBatch, ProductionBatch.id == model.batch_id).filter(
                ProductionBatch.tenant_id == int(tenant_id),
                model.product_id == int(product_id),
            )
        own_id = int(getattr(entity, "id", 0) or 0)
        if isinstance(entity, model) and own_id:
            q = q.filter(model.id != own_id)
        for needle in needle_filters:
            if q.filter(model.fg_traceability_json.like(needle)).first() is not None:
                raise ValueError("Numer seryjny był już przypisany do innej produkcji.")


def lock_fg_traceability_snapshot(
    db: Session,
    *,
    entity: ProductionOrder | ProductionBatchLine,
    tenant_id: int,
    warehouse_id: int,
    product: Product,
    batch_number: str | None = None,
    expiry_date: date | str | None = None,
) -> dict[str, Any]:
    """Legacy lock helper — still used by finish paths that expect a snapshot.

    When the entity already has posted FG outputs, LOT/expiry may change for a new delta
    (v2). Without outputs, keep v1 lock semantics for mid-flight legacy jobs.
    """
    existing = read_fg_traceability_snapshot(entity)
    requested_batch = normalize_batch_number(batch_number)
    requested_expiry = _parse_expiry(expiry_date)
    has_outputs = _entity_has_fg_outputs(db, entity)

    if existing is not None and not has_outputs and int(existing.get("version") or 1) < SNAPSHOT_VERSION_DELTA:
        if requested_batch and requested_batch != str(existing.get("batch_number") or ""):
            raise ValueError("Numer partii wyrobu gotowego jest już zablokowany.")
        current_expiry = str(existing.get("expiry_date") or "")
        if requested_expiry and requested_expiry.isoformat() != current_expiry:
            raise ValueError("Data ważności wyrobu gotowego jest już zablokowana.")
        return existing

    policy = resolve_effective_production_traceability_for_product(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product=product,
    )
    if policy.require_batch and not requested_batch:
        raise ValueError("Numer partii wyrobu gotowego jest wymagany.")
    if policy.require_expiry and requested_expiry is None:
        raise ValueError("Data ważności wyrobu gotowego jest wymagana.")
    if requested_expiry is not None and requested_expiry >= NO_EXPIRY_SENTINEL:
        raise ValueError("Nieprawidłowa data ważności wyrobu gotowego.")

    posted = posted_serials_from_snapshot(existing)
    snapshot = {
        "version": SNAPSHOT_VERSION_DELTA if has_outputs or existing is None else SNAPSHOT_VERSION,
        "locked_at": datetime.utcnow().isoformat() + "Z",
        "batch_number": requested_batch or "",
        "expiry_date": requested_expiry.isoformat() if requested_expiry else None,
        "serial_numbers": list(existing.get("serial_numbers") or []) if existing and not has_outputs else [],
        "posted_serial_numbers": posted,
        "policy_snapshot": policy.to_dict(),
    }
    if has_outputs:
        snapshot["version"] = SNAPSHOT_VERSION_DELTA
        snapshot["serial_numbers"] = []
    entity.fg_traceability_json = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
    db.add(entity)
    db.flush()
    return snapshot


def prepare_fg_output_delta_identity(
    db: Session,
    *,
    entity: ProductionOrder | ProductionBatchLine,
    tenant_id: int,
    warehouse_id: int,
    product: Product,
    delta_quantity: float,
    batch_number: str | None = None,
    expiry_date: date | str | None = None,
    serial_numbers: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Validate identity for ONE output delta. Does not permanently lock LOT across deltas."""
    policy = resolve_effective_production_traceability_for_product(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product=product,
    )
    requested_batch = normalize_batch_number(batch_number)
    requested_expiry = _parse_expiry(expiry_date)
    if policy.require_batch and not requested_batch:
        raise ValueError("Numer partii wyrobu gotowego jest wymagany.")
    if policy.require_expiry and requested_expiry is None:
        raise ValueError("Data ważności wyrobu gotowego jest wymagana.")
    if requested_expiry is not None and requested_expiry >= NO_EXPIRY_SENTINEL:
        raise ValueError("Nieprawidłowa data ważności wyrobu gotowego.")

    existing = read_fg_traceability_snapshot(entity)
    posted = posted_serials_from_snapshot(existing)
    # Legacy v1 mid-flight without outputs: keep LOT lock if already set.
    if (
        existing is not None
        and not _entity_has_fg_outputs(db, entity)
        and int(existing.get("version") or 1) < SNAPSHOT_VERSION_DELTA
        and str(existing.get("batch_number") or "").strip()
    ):
        if requested_batch and requested_batch != str(existing.get("batch_number") or ""):
            raise ValueError("Numer partii wyrobu gotowego jest już zablokowany.")
        current_expiry = str(existing.get("expiry_date") or "")
        if requested_expiry and requested_expiry.isoformat() != current_expiry:
            raise ValueError("Data ważności wyrobu gotowego jest już zablokowana.")
        if not requested_batch:
            requested_batch = str(existing.get("batch_number") or "")
        if requested_expiry is None and existing.get("expiry_date"):
            requested_expiry = _parse_expiry(existing.get("expiry_date"))

    supplied = _normalize_serials(serial_numbers)
    if not policy.require_serial:
        if supplied:
            raise ValueError("Numery seryjne nie są wymagane dla tego wyrobu.")
        delta_serials: list[str] = []
    else:
        qty = float(delta_quantity or 0)
        expected = math.floor(qty + 1e-9)
        if abs(qty - expected) > 1e-6:
            raise ValueError("Ilość wyrobu śledzonego seryjnie musi być całkowita.")
        if len(supplied) != expected:
            raise ValueError(f"Podaj dokładnie {expected} nowych numerów seryjnych.")
        _assert_serials_unused(
            db,
            tenant_id=int(tenant_id),
            product_id=int(product.id),
            serials=supplied,
            entity=entity,
            extra_blocked=posted,
        )
        delta_serials = supplied

    return {
        "version": SNAPSHOT_VERSION_DELTA,
        "batch_number": requested_batch or "",
        "expiry_date": requested_expiry.isoformat() if requested_expiry else None,
        "serial_numbers": delta_serials,
        "policy_snapshot": policy.to_dict(),
        "delta_quantity": float(delta_quantity),
    }


def commit_fg_output_delta_identity(
    db: Session,
    *,
    entity: ProductionOrder | ProductionBatchLine,
    delta_snapshot: dict[str, Any],
) -> dict[str, Any]:
    """Merge delta serials into genealogy; clear active LOT lock for the next delta."""
    existing = read_fg_traceability_snapshot(entity) or {}
    posted = posted_serials_from_snapshot(existing)
    delta_serials = [str(x) for x in (delta_snapshot.get("serial_numbers") or [])]
    for sn in delta_serials:
        if sn not in posted:
            posted.append(sn)
    snapshot = {
        "version": SNAPSHOT_VERSION_DELTA,
        "locked_at": datetime.utcnow().isoformat() + "Z",
        "batch_number": "",
        "expiry_date": None,
        "serial_numbers": [],
        "posted_serial_numbers": posted,
        "last_delta": {
            "batch_number": str(delta_snapshot.get("batch_number") or ""),
            "expiry_date": delta_snapshot.get("expiry_date"),
            "quantity": float(delta_snapshot.get("delta_quantity") or 0),
            "serial_numbers": delta_serials,
        },
        "policy_snapshot": dict(delta_snapshot.get("policy_snapshot") or existing.get("policy_snapshot") or {}),
    }
    entity.fg_traceability_json = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
    db.add(entity)
    db.flush()
    return snapshot


def append_fg_serials(
    db: Session,
    *,
    entity: ProductionOrder | ProductionBatchLine,
    tenant_id: int,
    product_id: int,
    delta_quantity: float,
    serial_numbers: Iterable[str] | None,
) -> dict[str, Any]:
    snapshot = read_fg_traceability_snapshot(entity)
    if snapshot is None:
        raise ValueError("Tożsamość wyrobu gotowego nie została zablokowana.")
    policy = ProductionTraceabilityPolicy(**dict(snapshot.get("policy_snapshot") or {}))
    supplied = _normalize_serials(serial_numbers)
    if not policy.require_serial:
        if supplied:
            raise ValueError("Numery seryjne nie są wymagane dla tego wyrobu.")
        return snapshot
    qty = float(delta_quantity or 0)
    expected = math.floor(qty + 1e-9)
    if abs(qty - expected) > 1e-6:
        raise ValueError("Ilość wyrobu śledzonego seryjnie musi być całkowita.")
    if len(supplied) != expected:
        raise ValueError(f"Podaj dokładnie {expected} nowych numerów seryjnych.")
    already = set(posted_serials_from_snapshot(snapshot)) | set(
        str(x) for x in snapshot.get("serial_numbers") or []
    )
    if already.intersection(supplied):
        raise ValueError("Numer seryjny został już użyty w tym zleceniu.")
    _assert_serials_unused(
        db,
        tenant_id=int(tenant_id),
        product_id=int(product_id),
        serials=supplied,
        entity=entity,
        extra_blocked=already,
    )
    snapshot["serial_numbers"] = list(snapshot.get("serial_numbers") or []) + supplied
    entity.fg_traceability_json = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
    db.add(entity)
    db.flush()
    return snapshot


def assert_fg_traceability_ready(
    entity: ProductionOrder | ProductionBatchLine, *, expected_quantity: float | None = None
) -> dict[str, Any]:
    snapshot = read_fg_traceability_snapshot(entity)
    if snapshot is None:
        raise ValueError("Tożsamość wyrobu gotowego nie została zablokowana.")
    policy = dict(snapshot.get("policy_snapshot") or {})
    version = int(snapshot.get("version") or 1)
    if version >= SNAPSHOT_VERSION_DELTA:
        # Per-delta model: identity lives on outputs / last_delta; genealogy serials must match qty.
        if policy.get("require_serial") and expected_quantity is not None:
            expected = math.floor(float(expected_quantity) + 1e-9)
            if abs(float(expected_quantity) - expected) > 1e-6:
                raise ValueError("Ilość wyrobu śledzonego seryjnie musi być całkowita.")
            if len(posted_serials_from_snapshot(snapshot)) != expected:
                raise ValueError("Liczba numerów seryjnych nie odpowiada ilości wyprodukowanej.")
        return snapshot
    if policy.get("require_batch") and not str(snapshot.get("batch_number") or "").strip():
        raise ValueError("Brak wymaganego numeru partii wyrobu gotowego.")
    if policy.get("require_expiry") and not snapshot.get("expiry_date"):
        raise ValueError("Brak wymaganej daty ważności wyrobu gotowego.")
    if policy.get("require_serial") and expected_quantity is not None:
        expected = math.floor(float(expected_quantity) + 1e-9)
        if abs(float(expected_quantity) - expected) > 1e-6:
            raise ValueError("Ilość wyrobu śledzonego seryjnie musi być całkowita.")
        if len(snapshot.get("serial_numbers") or []) != expected:
            raise ValueError("Liczba numerów seryjnych nie odpowiada ilości wyprodukowanej.")
    return snapshot


def snapshot_lot_values(snapshot: dict[str, Any]) -> tuple[str, date]:
    batch = normalize_batch_number(snapshot.get("batch_number"))
    expiry = _parse_expiry(snapshot.get("expiry_date")) or NO_EXPIRY_SENTINEL
    return batch, expiry


def _entity_has_fg_outputs(db: Session, entity: Any) -> bool:
    if not hasattr(db, "query"):
        return False
    q = db.query(ProductionFgOutput.id)
    if isinstance(entity, ProductionOrder):
        q = q.filter(ProductionFgOutput.production_order_id == int(entity.id or 0))
    elif isinstance(entity, ProductionBatchLine):
        q = q.filter(ProductionFgOutput.production_batch_line_id == int(entity.id or 0))
    else:
        return False
    if not getattr(entity, "id", None):
        return False
    return q.first() is not None
