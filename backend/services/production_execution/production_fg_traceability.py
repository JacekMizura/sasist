"""Lock and consume finished-goods traceability identity snapshots."""

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
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .production_traceability_policy import (
    ProductionTraceabilityPolicy,
    resolve_effective_production_traceability_for_product,
)

SNAPSHOT_VERSION = 1


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


def _assert_serials_unused(
    db: Session, *, tenant_id: int, product_id: int, serials: list[str], entity: Any
) -> None:
    if not serials:
        return
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
    existing = read_fg_traceability_snapshot(entity)
    requested_batch = normalize_batch_number(batch_number)
    requested_expiry = _parse_expiry(expiry_date)
    if existing is not None:
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
    snapshot = {
        "version": SNAPSHOT_VERSION,
        "locked_at": datetime.utcnow().isoformat() + "Z",
        "batch_number": requested_batch or "",
        "expiry_date": requested_expiry.isoformat() if requested_expiry else None,
        "serial_numbers": [],
        "policy_snapshot": policy.to_dict(),
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
    already = set(str(x) for x in snapshot.get("serial_numbers") or [])
    if already.intersection(supplied):
        raise ValueError("Numer seryjny został już użyty w tym zleceniu.")
    _assert_serials_unused(
        db,
        tenant_id=int(tenant_id),
        product_id=int(product_id),
        serials=supplied,
        entity=entity,
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
