"""Issue allocation planning — STRICT_LOCATION | AUTO_SPLIT | SINGLE_LOCATION_ONLY."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from .errors import DirectSaleError
from ..direct_sales_settings_service import resolve_direct_sales_settings
from ..location_stock_service import build_location_stock, suggest_issue_locations_for_sales

logger = logging.getLogger(__name__)

_FALLBACK_CODES = frozenset(
    {"missing_source_location", "insufficient_stock", "single_location_unavailable"}
)


@dataclass(frozen=True)
class IssueAllocation:
    session_line_id: int
    product_id: int
    location_id: int
    quantity: float


def _available_at_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
) -> float:
    snap = build_location_stock(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        available_only=True,
    )
    for row in snap.get("locations") or []:
        if int(row.get("location_id") or 0) == int(location_id):
            return float(row.get("available") or 0)
    return 0.0


def _warehouse_product_available(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> float:
    snap = build_location_stock(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        available_only=True,
    )
    return float((snap.get("summary") or {}).get("available") or 0)


def _allocations_from_splits(
    line: DirectSaleSessionLine,
    splits: list[dict],
    *,
    need: float,
) -> list[IssueAllocation]:
    pid = int(line.product_id)
    out: list[IssueAllocation] = []
    for sp in splits:
        qty = float(sp.get("suggested_qty") or 0)
        if qty <= 0:
            continue
        out.append(IssueAllocation(int(line.id), pid, int(sp["location_id"]), qty))
    got = sum(a.quantity for a in out)
    if got + 1e-9 < need:
        raise DirectSaleError(
            f"Niewystarczający stan (dostępne {got}, wymagane {need}) dla produktu #{pid}.",
            code="insufficient_stock",
        )
    return out


def _oversell_allocation(
    line: DirectSaleSessionLine,
    *,
    location_id: int | None,
) -> list[IssueAllocation]:
    pid = int(line.product_id)
    need = float(line.quantity or 0)
    if need <= 0:
        return []
    lid = int(location_id) if location_id else 0
    if lid <= 0:
        raise DirectSaleError(
            f"Brak lokalizacji źródłowej dla produktu #{pid}.",
            code="missing_source_location",
        )
    return [IssueAllocation(int(line.id), pid, lid, need)]


def _fallback_line_allocations(
    db: Session,
    sess: DirectSaleSession,
    line: DirectSaleSessionLine,
    *,
    reason_code: str,
    allow_oversell: bool = False,
    prefer_store_locations: bool = True,
) -> list[IssueAllocation]:
    tid = int(sess.tenant_id)
    wid = int(sess.warehouse_id)
    pid = int(line.product_id)
    need = float(line.quantity or 0)
    if need <= 0:
        return []

    if allow_oversell:
        return _oversell_allocation(
            line,
            location_id=int(line.source_location_id) if line.source_location_id else None,
        )

    warehouse_avail = _warehouse_product_available(db, tenant_id=tid, warehouse_id=wid, product_id=pid)
    if warehouse_avail + 1e-9 < need:
        raise DirectSaleError(
            f"Brak dostępnego stanu w magazynie dla produktu #{pid}.",
            code="insufficient_stock",
        )

    splits = suggest_issue_locations_for_sales(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=pid,
        quantity=need,
        prefer_store_locations=prefer_store_locations,
    )
    if not splits:
        raise DirectSaleError(
            f"Brak dostępnego stanu dla produktu #{pid}.",
            code="insufficient_stock",
        )

    logger.info(
        "[direct-sales.fallback-allocation] session_id=%s line_id=%s product_id=%s "
        "reason=%s strategy=FALLBACK_UNASSIGNED warehouse_available=%s splits=%s",
        int(sess.id),
        int(line.id),
        pid,
        reason_code,
        warehouse_avail,
        len(splits),
    )
    return _allocations_from_splits(line, splits, need=need)


def _plan_single_line(
    db: Session,
    sess: DirectSaleSession,
    line: DirectSaleSessionLine,
    *,
    allow_oversell: bool = False,
    prefer_store_locations: bool = True,
) -> list[IssueAllocation]:
    strategy = (getattr(sess, "issue_strategy", None) or "STRICT_LOCATION").strip().upper()
    tid = int(sess.tenant_id)
    wid = int(sess.warehouse_id)
    pid = int(line.product_id)
    need = float(line.quantity or 0)
    if need <= 0:
        return []

    lid = int(line.source_location_id) if line.source_location_id else None

    try:
        if allow_oversell:
            pick_lid = lid
            if pick_lid is None:
                splits = suggest_issue_locations_for_sales(
                    db,
                    tenant_id=tid,
                    warehouse_id=wid,
                    product_id=pid,
                    quantity=need,
                    prefer_store_locations=prefer_store_locations,
                )
                if splits:
                    pick_lid = int(splits[0]["location_id"])
                elif line.suggested_location_id:
                    pick_lid = int(line.suggested_location_id)
            return _oversell_allocation(line, location_id=pick_lid)
        if strategy == "STRICT_LOCATION":
            if lid is None:
                raise DirectSaleError(
                    f"Brak lokalizacji źródłowej dla produktu #{pid}.",
                    code="missing_source_location",
                )
            avail = _available_at_location(
                db, tenant_id=tid, warehouse_id=wid, product_id=pid, location_id=lid
            )
            if avail + 1e-9 < need:
                raise DirectSaleError(
                    f"Niewystarczający stan w lokalizacji #{lid} (dostępne {avail}, wymagane {need}).",
                    code="insufficient_stock",
                )
            return [IssueAllocation(int(line.id), pid, lid, need)]

        if strategy == "SINGLE_LOCATION_ONLY":
            snap = build_location_stock(
                db, tenant_id=tid, warehouse_id=wid, product_id=pid, available_only=True
            )
            candidates = [
                r
                for r in (snap.get("locations") or [])
                if float(r.get("available") or 0) + 1e-9 >= need
            ]
            if not candidates:
                raise DirectSaleError(
                    f"Brak pojedynczej lokalizacji z pełną ilością dla produktu #{pid}.",
                    code="single_location_unavailable",
                )
            sorted_c = suggest_issue_locations_for_sales(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                product_id=pid,
                quantity=need,
                prefer_store_locations=prefer_store_locations,
            )
            pick = sorted_c[0] if sorted_c else candidates[0]
            return [IssueAllocation(int(line.id), pid, int(pick["location_id"]), need)]

        splits = suggest_issue_locations_for_sales(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            product_id=pid,
            quantity=need,
            prefer_store_locations=prefer_store_locations,
        )
        if not splits:
            raise DirectSaleError(
                f"Brak dostępnego stanu dla produktu #{pid}.",
                code="insufficient_stock",
            )
        return _allocations_from_splits(line, splits, need=need)
    except DirectSaleError as exc:
        if allow_oversell and exc.code in _FALLBACK_CODES:
            return _oversell_allocation(line, location_id=lid)
        if exc.code in _FALLBACK_CODES:
            return _fallback_line_allocations(
                db,
                sess,
                line,
                reason_code=exc.code,
                allow_oversell=allow_oversell,
                prefer_store_locations=prefer_store_locations,
            )
        raise


def _resolve_session_settings(db: Session, sess: DirectSaleSession):
    try:
        return resolve_direct_sales_settings(
            db, tenant_id=int(sess.tenant_id), warehouse_id=int(sess.warehouse_id)
        ).resolved
    except Exception:
        logger.debug(
            "[direct-sales.issue-plan] settings fallback session_id=%s",
            int(getattr(sess, "id", 0) or 0),
        )
        return None


def _resolve_allow_oversell(db: Session, sess: DirectSaleSession) -> bool:
    cfg = _resolve_session_settings(db, sess)
    return bool(cfg.allow_oversell) if cfg is not None else False


def _resolve_prefer_store_locations(db: Session, sess: DirectSaleSession) -> bool:
    cfg = _resolve_session_settings(db, sess)
    return bool(cfg.prefer_store_locations) if cfg is not None else True


def plan_issue_allocations(
    db: Session,
    sess: DirectSaleSession,
    lines: list[DirectSaleSessionLine],
) -> list[IssueAllocation]:
    allow_oversell = _resolve_allow_oversell(db, sess)
    prefer_store_locations = _resolve_prefer_store_locations(db, sess)
    out: list[IssueAllocation] = []
    for line in lines:
        out.extend(
            _plan_single_line(
                db,
                sess,
                line,
                allow_oversell=allow_oversell,
                prefer_store_locations=prefer_store_locations,
            )
        )
    if not out:
        raise DirectSaleError("Sesja nie ma pozycji do wydania.", code="empty_session")
    return out
