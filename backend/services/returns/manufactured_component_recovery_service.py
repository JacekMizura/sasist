"""Manufactured FG return → component recovery (RMZ / Z-PZ).

Bundle component returns take precedence over manufacturing recovery when both
could apply (``is_bundle_line=True`` → not eligible). Commercial REJECTED does
not clear or block physical disassembly.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Iterable, Mapping, Optional, Sequence

from sqlalchemy.orm import Session

from ...models.product_composition import ProductComposition, ProductCompositionLine
from ...models.rmz_line_component_recovery import RmzLineComponentRecovery
from ...models.stock_document import StockDocumentItem
from ...models.wms_rmz_line import RMZLine
from ...models.wms_settings import WmsSettings
from ..audit_service import log_audit_entry
from ..production_manufacturing_composition import get_active_manufacturing_composition
from ..returns.errors import RmzFinalizeError

logger = logging.getLogger(__name__)

RECOVERY_MODE_OFF = "OFF"
RECOVERY_MODE_OPTIONAL = "OPTIONAL"
RECOVERY_MODE_REQUIRED = "REQUIRED"
RECOVERY_MODES = frozenset({RECOVERY_MODE_OFF, RECOVERY_MODE_OPTIONAL, RECOVERY_MODE_REQUIRED})

RECEIPT_MODE_STANDARD = "STANDARD_PUTAWAY"
RECEIPT_MODE_DEFAULT_LOCATION = "DEFAULT_LOCATION"
RECEIPT_DEFAULT_LOCATION = RECEIPT_MODE_DEFAULT_LOCATION  # alias for API
RECEIPT_MODES = frozenset({RECEIPT_MODE_STANDARD, RECEIPT_MODE_DEFAULT_LOCATION})

INTAKE_FG = "FG"
INTAKE_DISASSEMBLE = "DISASSEMBLE"
INTAKE_MIXED = "MIXED"
INTAKE_MODES = frozenset({INTAKE_FG, INTAKE_DISASSEMBLE, INTAKE_MIXED})

LOCKED_FG_POSTED = "Produkt został już przyjęty na magazyn jako wyrób gotowy."


def normalize_recovery_mode(raw: object) -> str:
    s = str(raw or RECOVERY_MODE_OFF).strip().upper()
    return s if s in RECOVERY_MODES else RECOVERY_MODE_OFF


def normalize_receipt_mode(raw: object) -> str:
    s = str(raw or RECEIPT_MODE_STANDARD).strip().upper()
    return s if s in RECEIPT_MODES else RECEIPT_MODE_STANDARD


def recovery_mode_from_settings(settings: Optional[WmsSettings]) -> str:
    return normalize_recovery_mode(getattr(settings, "manufactured_component_recovery_mode", None) if settings else None)


def receipt_mode_from_settings(settings: Optional[WmsSettings]) -> str:
    return normalize_receipt_mode(getattr(settings, "manufactured_recovery_receipt_mode", None) if settings else None)


def assert_recovery_location_in_warehouse(
    db: Session,
    *,
    warehouse_id: int,
    location_id: int,
    tenant_id: Optional[int] = None,
    require_active: bool = True,
) -> None:
    from ...models.location import Location
    from ...models.warehouse import Warehouse

    loc = (
        db.query(Location)
        .filter(Location.id == int(location_id), Location.warehouse_id == int(warehouse_id))
        .first()
    )
    if loc is None:
        raise ValueError("Lokalizacja odzysków musi należeć do wybranego magazynu")
    if require_active and not bool(getattr(loc, "is_active", True)):
        raise ValueError("Lokalizacja odzysków jest nieaktywna")
    if tenant_id is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
        wh_tid = getattr(wh, "tenant_id", None) if wh is not None else None
        if wh_tid is not None and int(wh_tid) != int(tenant_id):
            raise ValueError("Lokalizacja odzysków musi należeć do wybranego magazynu")


def assert_snapshot_recovery_location_for_commit(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
) -> None:
    """Hard gate before DEFAULT_LOCATION inventory — no fallback."""
    try:
        assert_recovery_location_in_warehouse(
            db,
            warehouse_id=int(warehouse_id),
            location_id=int(location_id),
            tenant_id=int(tenant_id),
            require_active=True,
        )
    except ValueError as exc:
        raise RmzFinalizeError(str(exc)) from exc
    from ...models.location import Location

    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    # Reject DOCK / special roles that are not storage putaway destinations.
    role = str(getattr(loc, "location_type", None) or getattr(loc, "type", "") or "").strip().upper()
    if role in ("DOCK", "PICK_START", "PACKING"):
        raise RmzFinalizeError(
            f"Lokalizacja odzysków (id={location_id}) nie może być typu {role} — wybierz lokalizację magazynową."
        )


def saleable_fg_qty_for_receipt(rmz_line: RMZLine) -> int:
    """
    Compatibility: total remaining FG across dispositions (projection).

    Prefer intake_disposition_json SALEABLE+OUTLET_B+SERVICE_C fg sums when present;
    else projected fg_intake_qty; else legacy accepted_qty only when no intake.
    """
    from .intake_disposition import read_line_allocation, total_fg_qty

    alloc = read_line_allocation(rmz_line)
    if alloc is not None:
        return total_fg_qty(alloc)
    mode = (str(getattr(rmz_line, "stock_intake_mode", None) or "").strip().upper() or None)
    fg_raw = getattr(rmz_line, "fg_intake_qty", None)
    dq = int(getattr(rmz_line, "disassembly_qty", None) or 0)
    if mode in INTAKE_MODES or fg_raw is not None or dq > 0:
        return max(0, int(fg_raw if fg_raw is not None else 0))
    return max(0, int(getattr(rmz_line, "accepted_qty", None) or 0))


def line_has_pending_component_receipt(rmz_line: RMZLine) -> bool:
    recoveries = list(getattr(rmz_line, "component_recoveries", None) or [])
    for r in recoveries:
        if getattr(r, "posted_at", None) is not None:
            continue
        if float(getattr(r, "accepted_qty", 0) or 0) > 1e-9:
            return True
    return False


def _clear_unposted_recoveries(db: Session, rmz_line: RMZLine) -> None:
    existing = (
        db.query(RmzLineComponentRecovery)
        .filter(RmzLineComponentRecovery.rmz_line_id == int(rmz_line.id))
        .all()
    )
    if any(getattr(r, "posted_at", None) for r in existing):
        raise RmzFinalizeError("Component recoveries already posted — cannot change")
    for r in existing:
        db.delete(r)
    db.flush()


def _persist_component_matrix(
    db: Session,
    *,
    tenant_id: int,
    rmz_line: RMZLine,
    disassembly_qty: int,
    component_recoveries: Optional[Sequence[Mapping[str, Any]]],
    actor_user_id: Optional[int],
    reuse_existing_if_complete: bool = True,
) -> None:
    """Materialize recovery rows from live BOM only when writing/changing matrix."""
    existing = (
        db.query(RmzLineComponentRecovery)
        .filter(RmzLineComponentRecovery.rmz_line_id == int(rmz_line.id))
        .all()
    )
    if any(getattr(r, "posted_at", None) for r in existing):
        raise RmzFinalizeError("Component recoveries already posted — cannot change")

    dq = max(0, int(disassembly_qty or 0))
    if dq <= 0:
        for r in existing:
            db.delete(r)
        db.flush()
        return

    payload = list(component_recoveries or [])
    # Freeze: if existing unposted rows already complete for this dq and no new payload, keep them.
    if reuse_existing_if_complete and not payload and existing:
        # Verify expected sums still match requested dq using stored coefficient × dq.
        # Rows store absolute expected_qty — if count matches and matrix balanced, keep.
        try:
            validate_recovery_matrix(
                [
                    {
                        "expected_qty": float(r.expected_qty or 0),
                        "accepted_qty": float(r.accepted_qty or 0),
                        "scrap_qty": float(r.scrap_qty or 0),
                    }
                    for r in existing
                ]
            )
            return
        except RmzFinalizeError:
            pass

    if not payload and dq > 0:
        raise RmzFinalizeError("Podaj rozliczenie komponentów (accepted/scrap) dla rozmontowania")

    composition = get_active_manufacturing_composition(
        db, tenant_id=int(tenant_id), product_id=int(rmz_line.product_id)
    )
    if composition is None:
        # Prefer reusing composition_id from existing rows when live BOM gone but rows present
        if existing and payload:
            composition_id = int(existing[0].composition_id)
        else:
            raise RmzFinalizeError("Brak aktywnej receptury produkcyjnej dla produktu")
        expected_by_line = {
            int(r.composition_line_id): {
                "composition_id": int(r.composition_id),
                "composition_line_id": int(r.composition_line_id),
                "component_product_id": int(r.component_product_id),
                "expected_qty": float(r.expected_qty or 0),
            }
            for r in existing
        }
        # Scale expected if dq changed vs stored
        if existing:
            # Derive per-unit from first row if possible
            pass
        merged = []
        for p in payload:
            cl_id = int(p.get("composition_line_id") or 0)
            if cl_id not in expected_by_line:
                raise RmzFinalizeError(f"Nieznany composition_line_id={cl_id} dla zamrożonego BOM")
            base = dict(expected_by_line[cl_id])
            # Keep frozen expected from existing row (do not rebuild from live recipe)
            base["accepted_qty"] = float(p.get("accepted_qty") or 0)
            base["scrap_qty"] = float(p.get("scrap_qty") or 0)
            merged.append(base)
        if len(merged) != len(expected_by_line):
            raise RmzFinalizeError("Macierz odzysku musi zawierać wszystkie komponenty zamrożonego BOM")
        validate_recovery_matrix(merged)
        # Rebuild composition stub for upsert
        class _Comp:
            id = composition_id

        upsert_component_recoveries(db, rmz_line, _Comp(), merged, tenant_id=int(tenant_id))  # type: ignore[arg-type]
    else:
        expected_rows = build_bom_expected_rows(composition, dq)
        # If existing rows for same composition_line_ids exist and payload omits expected,
        # still use BOM×dq for new write (first materialization). Once written, reopen uses
        # existing rows via reuse_existing_if_complete unless payload provided.
        by_line = {int(r["composition_line_id"]): r for r in expected_rows}
        merged = []
        for p in payload:
            cl_id = int(p.get("composition_line_id") or 0)
            if cl_id not in by_line:
                raise RmzFinalizeError(f"Nieznany composition_line_id={cl_id} dla aktywnego BOM")
            base = dict(by_line[cl_id])
            base["accepted_qty"] = float(p.get("accepted_qty") or 0)
            base["scrap_qty"] = float(p.get("scrap_qty") or 0)
            merged.append(base)
        if len(merged) != len(expected_rows):
            raise RmzFinalizeError("Macierz odzysku musi zawierać wszystkie komponenty BOM")
        validate_recovery_matrix(merged)
        upsert_component_recoveries(db, rmz_line, composition, merged, tenant_id=int(tenant_id))

    recoveries = (
        db.query(RmzLineComponentRecovery)
        .filter(RmzLineComponentRecovery.rmz_line_id == int(rmz_line.id))
        .all()
    )
    audit_component_scrap(db, rmz_line=rmz_line, recoveries=recoveries, actor_user_id=actor_user_id)


def apply_manufacturing_recovery_to_line(
    db: Session,
    *,
    tenant_id: int,
    rmz_line: RMZLine,
    settings: WmsSettings,
    is_bundle_line: bool,
    stock_intake_mode: Optional[str] = None,
    fg_intake_qty: Optional[int] = None,
    disassembly_qty: Optional[int] = None,
    component_recoveries: Optional[Sequence[Mapping[str, Any]]] = None,
    intake_disposition: Optional[Sequence[Mapping[str, Any]]] = None,
    recovery_mode: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    require_decision: bool = False,
) -> None:
    """
    Persist recovery allocation on an RMZ line (split-process / finalize).

    SSOT = ``intake_disposition_json``. Aggregate fg/dq/mode are projections.
    ``recovery_mode`` should come from RMZ workflow snapshot (not live settings).
    """
    from .intake_disposition import (
        all_fg_allocation_from_commercial,
        apply_projection_to_line,
        commercial_buckets,
        parse_intake_disposition_json,
        physical_receivable_qty,
        required_allocation_from_commercial,
        total_disassembly_qty,
        validate_allocation_against_commercial,
    )

    mode = normalize_recovery_mode(recovery_mode) if recovery_mode is not None else recovery_mode_from_settings(settings)
    eligible = product_qualifies_for_manufacturing_recovery(
        db, int(tenant_id), int(rmz_line.product_id), is_bundle_line=bool(is_bundle_line)
    )

    buckets = commercial_buckets(rmz_line)
    receivable = physical_receivable_qty(
        accepted_qty=buckets["SALEABLE"],
        damaged_b_qty=buckets["OUTLET_B"],
        damaged_c_qty=buckets["SERVICE_C"],
    )

    if mode == RECOVERY_MODE_OFF or not eligible:
        if is_bundle_line:
            return
        if getattr(rmz_line, "disassembly_qty", None) or getattr(rmz_line, "stock_intake_mode", None) or getattr(
            rmz_line, "intake_disposition_json", None
        ):
            existing = (
                db.query(RmzLineComponentRecovery)
                .filter(RmzLineComponentRecovery.rmz_line_id == int(rmz_line.id))
                .all()
            )
            if any(getattr(r, "posted_at", None) for r in existing):
                return
            for r in existing:
                db.delete(r)
            rmz_line.stock_intake_mode = None
            rmz_line.fg_intake_qty = None
            rmz_line.disassembly_qty = None
            rmz_line.intake_disposition_json = None
        return

    has_payload = (
        intake_disposition is not None
        or component_recoveries is not None
        or stock_intake_mode is not None
        or fg_intake_qty is not None
        or disassembly_qty is not None
    )
    if not require_decision and not has_payload:
        return

    if receivable <= 0:
        # All rejected / nothing receivable — clear unposted recovery, zero allocation
        try:
            _clear_unposted_recoveries(db, rmz_line)
        except RmzFinalizeError:
            return
        apply_projection_to_line(
            rmz_line,
            all_fg_allocation_from_commercial(accepted_qty=0, damaged_b_qty=0, damaged_c_qty=0),
        )
        return

    if intake_disposition is not None:
        rows = parse_intake_disposition_json(list(intake_disposition))
        assert rows is not None
    elif mode == RECOVERY_MODE_REQUIRED and (require_decision or has_payload):
        # Explicit FG intent is not allowed under REQUIRED.
        intake_u = (str(stock_intake_mode).strip().upper() if stock_intake_mode else None) or None
        fg_i = int(fg_intake_qty) if fg_intake_qty is not None else 0
        dq_i = int(disassembly_qty) if disassembly_qty is not None else 0
        if intake_u == INTAKE_FG or (fg_i > 0 and dq_i == 0 and (fg_intake_qty is not None or intake_u)):
            raise RmzFinalizeError(
                "Wymagany odzysk komponentów: wybierz rozmontowanie (DISASSEMBLE) dla produktu produkowanego"
            )
        rows = required_allocation_from_commercial(
            accepted_qty=buckets["SALEABLE"],
            damaged_b_qty=buckets["OUTLET_B"],
            damaged_c_qty=buckets["SERVICE_C"],
        )
    elif require_decision and not has_payload:
        # OPTIONAL default: all FG
        rows = all_fg_allocation_from_commercial(
            accepted_qty=buckets["SALEABLE"],
            damaged_b_qty=buckets["OUTLET_B"],
            damaged_c_qty=buckets["SERVICE_C"],
        )
    elif fg_intake_qty is not None or disassembly_qty is not None or stock_intake_mode is not None:
        # Compatibility bridge: only when mathematically unique (single commercial bucket).
        from .intake_disposition import try_deterministic_legacy_conversion

        prev_fg = getattr(rmz_line, "fg_intake_qty", None)
        prev_dq = getattr(rmz_line, "disassembly_qty", None)
        prev_mode = getattr(rmz_line, "stock_intake_mode", None)
        if fg_intake_qty is not None:
            rmz_line.fg_intake_qty = int(fg_intake_qty)
        if disassembly_qty is not None:
            rmz_line.disassembly_qty = int(disassembly_qty)
        if stock_intake_mode is not None:
            rmz_line.stock_intake_mode = str(stock_intake_mode).strip().upper()
        rows = try_deterministic_legacy_conversion(rmz_line, recovery_mode=mode)
        rmz_line.fg_intake_qty = prev_fg
        rmz_line.disassembly_qty = prev_dq
        rmz_line.stock_intake_mode = prev_mode
        if rows is None:
            raise RmzFinalizeError(
                "Podaj intake_disposition_json (alokacja FG/DISASSEMBLE per SALEABLE/OUTLET_B/SERVICE_C) "
                "— legacy fg/disassembly jest niejednoznaczne przy wielu klasach jakości."
            )
    else:
        raise RmzFinalizeError(
            "Podaj intake_disposition_json (alokacja FG/DISASSEMBLE per SALEABLE/OUTLET_B/SERVICE_C)"
        )

    validate_allocation_against_commercial(
        rows,
        accepted_qty=buckets["SALEABLE"],
        damaged_b_qty=buckets["OUTLET_B"],
        damaged_c_qty=buckets["SERVICE_C"],
    )

    if mode == RECOVERY_MODE_REQUIRED:
        for r in rows:
            if int(r.get("fg_qty") or 0) != 0:
                raise RmzFinalizeError(
                    "Wymagany odzysk komponentów: fg_qty musi być 0 dla każdej disposition (pełne rozmontowanie)"
                )
        if total_disassembly_qty(rows) != receivable:
            raise RmzFinalizeError(
                "Wymagany odzysk komponentów: disassembly_qty musi równać się physical_receivable_qty"
            )

    dq = total_disassembly_qty(rows)
    if dq > 0 and not line_allows_disassemble_change(db, rmz_line):
        raise RmzFinalizeError(LOCKED_FG_POSTED)

    apply_projection_to_line(rmz_line, rows)

    if dq > 0:
        _persist_component_matrix(
            db,
            tenant_id=int(tenant_id),
            rmz_line=rmz_line,
            disassembly_qty=dq,
            component_recoveries=component_recoveries,
            actor_user_id=actor_user_id,
        )
    else:
        try:
            _clear_unposted_recoveries(db, rmz_line)
        except RmzFinalizeError:
            raise

    db.flush()


def resolve_line_allocation_for_commit(
    rmz_line: RMZLine,
    *,
    recovery_mode: str,
) -> list[dict[str, int | str]]:
    """Resolve allocation for warehouse commit — no heuristics across multiple buckets."""
    from .intake_disposition import try_deterministic_legacy_conversion, validate_allocation_against_commercial

    rows = try_deterministic_legacy_conversion(rmz_line, recovery_mode=recovery_mode)
    if rows is None:
        raise RmzFinalizeError(
            "Brak jednoznacznej alokacji intake (intake_disposition_json). "
            "Uzupełnij FG/DISASSEMBLE dla SALEABLE / OUTLET_B / SERVICE_C przed zatwierdzeniem magazynowym."
        )
    buckets = {
        "SALEABLE": max(0, int(getattr(rmz_line, "accepted_qty", None) or 0)),
        "OUTLET_B": max(0, int(getattr(rmz_line, "damaged_b_qty", None) or 0)),
        "SERVICE_C": max(0, int(getattr(rmz_line, "damaged_c_qty", None) or 0)),
    }
    validate_allocation_against_commercial(
        rows,
        accepted_qty=buckets["SALEABLE"],
        damaged_b_qty=buckets["OUTLET_B"],
        damaged_c_qty=buckets["SERVICE_C"],
    )
    return rows


def assert_manufacturing_recovery_ready_for_warehouse_commit(
    db: Session,
    *,
    tenant_id: int,
    rmz_line: RMZLine,
    recovery_mode: str,
    is_bundle_line: bool,
) -> None:
    """Hard gate before Z-PZ — REQUIRED / OPTIONAL allocation + recovery matrix."""
    from .intake_disposition import physical_receivable_qty, total_disassembly_qty

    mode = normalize_recovery_mode(recovery_mode)
    if mode == RECOVERY_MODE_OFF:
        return
    if is_bundle_line:
        return
    if not product_qualifies_for_manufacturing_recovery(
        db, int(tenant_id), int(rmz_line.product_id), is_bundle_line=False
    ):
        return

    receivable = physical_receivable_qty(
        accepted_qty=int(getattr(rmz_line, "accepted_qty", None) or 0),
        damaged_b_qty=int(getattr(rmz_line, "damaged_b_qty", None) or 0),
        damaged_c_qty=int(getattr(rmz_line, "damaged_c_qty", None) or 0),
    )
    if receivable <= 0:
        return

    rows = resolve_line_allocation_for_commit(rmz_line, recovery_mode=mode)
    if mode == RECOVERY_MODE_REQUIRED:
        if any(int(r.get("fg_qty") or 0) != 0 for r in rows):
            raise RmzFinalizeError(
                "REQUIRED: cała physical_receivable_qty musi być rozmontowana (fg_qty=0)"
            )
        if total_disassembly_qty(rows) != receivable:
            raise RmzFinalizeError("REQUIRED: disassembly_qty musi równać się physical_receivable_qty")

    dq = total_disassembly_qty(rows)
    if dq > 0:
        recoveries = (
            db.query(RmzLineComponentRecovery)
            .filter(RmzLineComponentRecovery.rmz_line_id == int(rmz_line.id))
            .all()
        )
        if not recoveries:
            raise RmzFinalizeError("Brak rozliczenia komponentów BOM przed zatwierdzeniem magazynowym")
        validate_recovery_matrix(
            [
                {
                    "expected_qty": float(r.expected_qty or 0),
                    "accepted_qty": float(r.accepted_qty or 0),
                    "scrap_qty": float(r.scrap_qty or 0),
                }
                for r in recoveries
            ]
        )


def product_qualifies_for_manufacturing_recovery(
    db: Session,
    tenant_id: int,
    product_id: int,
    *,
    is_bundle_line: bool,
) -> bool:
    """
    True when manufacturing recovery may apply.

    Bundle flow takes precedence: if the RMZ line is a bundle parent / uses
    bundle component returns, manufacturing recovery is not eligible.
    """
    if is_bundle_line:
        return False
    return (
        get_active_manufacturing_composition(db, tenant_id=int(tenant_id), product_id=int(product_id)) is not None
    )


def build_bom_expected_rows(
    composition: ProductComposition,
    disassembly_qty: int,
) -> list[dict[str, Any]]:
    """expected_qty = composition_line.quantity × disassembly_qty (no waste/yield)."""
    dq = max(0, int(disassembly_qty or 0))
    rows: list[dict[str, Any]] = []
    lines = list(getattr(composition, "lines", None) or [])
    lines_sorted = sorted(lines, key=lambda ln: (int(getattr(ln, "sort_order", 0) or 0), int(ln.id or 0)))
    for cl in lines_sorted:
        per_unit = float(getattr(cl, "quantity", 0) or 0)
        expected = per_unit * float(dq)
        rows.append(
            {
                "composition_id": int(composition.id),
                "composition_line_id": int(cl.id),
                "component_product_id": int(cl.component_product_id),
                "expected_qty": expected,
                "quantity_per_unit": per_unit,
            }
        )
    return rows


def validate_recovery_matrix(rows: Sequence[Mapping[str, Any]]) -> None:
    for i, row in enumerate(rows):
        expected = float(row.get("expected_qty") or 0)
        accepted = float(row.get("accepted_qty") or 0)
        scrap = float(row.get("scrap_qty") or 0)
        if accepted < 0 or scrap < 0:
            raise RmzFinalizeError(f"Component recovery row {i}: accepted/scrap cannot be negative")
        if abs((accepted + scrap) - expected) > 1e-6:
            raise RmzFinalizeError(
                f"Component recovery row {i}: accepted_qty + scrap_qty must equal expected_qty "
                f"({accepted}+{scrap}!={expected})"
            )


def validate_intake_split(
    physical_qty: int,
    fg_qty: int,
    disassembly_qty: int,
    mode: Optional[str],
) -> None:
    phys = max(0, int(physical_qty or 0))
    fg = max(0, int(fg_qty or 0))
    dq = max(0, int(disassembly_qty or 0))
    if fg + dq > phys:
        raise RmzFinalizeError(
            f"fg_intake_qty + disassembly_qty ({fg}+{dq}) cannot exceed physical qty ({phys})"
        )
    mode_u = (str(mode).strip().upper() if mode else None) or None
    if mode_u and mode_u not in INTAKE_MODES:
        raise RmzFinalizeError(f"Invalid stock_intake_mode: {mode}")
    if mode_u == INTAKE_FG and dq > 0:
        raise RmzFinalizeError("stock_intake_mode=FG does not allow disassembly_qty > 0")
    if mode_u == INTAKE_DISASSEMBLE and fg > 0:
        # Allow MIXED via explicit mode; DISASSEMBLE-only should have fg=0
        raise RmzFinalizeError("stock_intake_mode=DISASSEMBLE requires fg_intake_qty=0")
    if mode_u == INTAKE_DISASSEMBLE and dq < 1:
        raise RmzFinalizeError("stock_intake_mode=DISASSEMBLE requires disassembly_qty > 0")
    if mode_u == INTAKE_MIXED and (fg < 1 or dq < 1):
        raise RmzFinalizeError("stock_intake_mode=MIXED requires both fg_intake_qty and disassembly_qty > 0")


def line_allows_disassemble_change(db: Session, rmz_line: RMZLine) -> bool:
    """False when FG for this RMZ line was already posted on a Z-PZ document."""
    rid = int(getattr(rmz_line, "rmz_id", 0) or 0)
    pid = int(getattr(rmz_line, "product_id", 0) or 0)
    if rid <= 0 or pid <= 0:
        return True
    hit = (
        db.query(StockDocumentItem.id)
        .filter(
            StockDocumentItem.source_rmz_id == rid,
            StockDocumentItem.product_id == pid,
            StockDocumentItem.return_decision == "ACCEPTED",
        )
        .first()
    )
    return hit is None


def manufactured_recovery_locked_reason(db: Session, rmz_line: RMZLine) -> Optional[str]:
    if line_allows_disassemble_change(db, rmz_line):
        return None
    return LOCKED_FG_POSTED


def upsert_component_recoveries(
    db: Session,
    rmz_line: RMZLine,
    composition: ProductComposition,
    rows: Sequence[Mapping[str, Any]],
    *,
    tenant_id: int,
) -> list[RmzLineComponentRecovery]:
    """Replace unposted recovery rows for the line; block mutation once posted."""
    existing = (
        db.query(RmzLineComponentRecovery)
        .filter(RmzLineComponentRecovery.rmz_line_id == int(rmz_line.id))
        .all()
    )
    if any(getattr(r, "posted_at", None) is not None for r in existing):
        raise RmzFinalizeError("Component recoveries already posted — cannot change")

    for r in existing:
        db.delete(r)
    db.flush()

    now = datetime.utcnow()
    created: list[RmzLineComponentRecovery] = []
    for row in rows:
        rec = RmzLineComponentRecovery(
            tenant_id=int(tenant_id),
            rmz_line_id=int(rmz_line.id),
            composition_id=int(row.get("composition_id") or composition.id),
            composition_line_id=int(row["composition_line_id"]),
            component_product_id=int(row["component_product_id"]),
            expected_qty=float(row.get("expected_qty") or 0),
            accepted_qty=float(row.get("accepted_qty") or 0),
            scrap_qty=float(row.get("scrap_qty") or 0),
            created_at=now,
            updated_at=now,
            posted_at=None,
            stock_document_item_id=None,
        )
        db.add(rec)
        created.append(rec)
    db.flush()
    return created


def audit_component_scrap(
    db: Session,
    *,
    rmz_line: RMZLine,
    recoveries: Iterable[RmzLineComponentRecovery],
    actor_user_id: Optional[int] = None,
) -> None:
    scrap_rows = []
    for r in recoveries:
        sq = float(getattr(r, "scrap_qty", 0) or 0)
        if sq <= 1e-9:
            continue
        scrap_rows.append(
            {
                "recovery_id": int(r.id),
                "component_product_id": int(r.component_product_id),
                "scrap_qty": sq,
                "expected_qty": float(r.expected_qty or 0),
                "accepted_qty": float(r.accepted_qty or 0),
            }
        )
    if not scrap_rows:
        return
    logger.info(
        "[returns.mfg_recovery.scrap] rmz_line_id=%s product_id=%s scraps=%s",
        getattr(rmz_line, "id", None),
        getattr(rmz_line, "product_id", None),
        scrap_rows,
    )
    log_audit_entry(
        db,
        user_id=actor_user_id,
        action="wms.return.component_recovery_scrap",
        entity_type="rmz_line",
        entity_id=int(rmz_line.id) if rmz_line.id else None,
        detail={
            "rmz_id": int(rmz_line.rmz_id) if rmz_line.rmz_id else None,
            "product_id": int(rmz_line.product_id) if rmz_line.product_id else None,
            "scraps": scrap_rows,
            "note": "Scrap: no inventory / no Z-PZ line (audit only)",
        },
    )


def bom_preview_for_product(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    disassembly_qty: int = 1,
) -> Optional[dict[str, Any]]:
    from sqlalchemy.orm import joinedload

    composition = (
        db.query(ProductComposition)
        .options(
            joinedload(ProductComposition.lines).joinedload(ProductCompositionLine.component_product)
        )
        .filter(
            ProductComposition.tenant_id == int(tenant_id),
            ProductComposition.product_id == int(product_id),
            ProductComposition.composition_mode == "manufacturing",
            ProductComposition.is_active.is_(True),
        )
        .order_by(ProductComposition.updated_at.desc(), ProductComposition.id.desc())
        .first()
    )
    if composition is None:
        return None
    components = []
    for row in build_bom_expected_rows(composition, int(disassembly_qty)):
        # enrich names from eager-loaded component_product when present
        name = None
        sku = None
        for cl in composition.lines or []:
            if int(cl.id) == int(row["composition_line_id"]):
                prod = getattr(cl, "component_product", None)
                if prod is not None:
                    name = str(getattr(prod, "name", None) or "") or None
                    sku = (str(getattr(prod, "sku", None) or getattr(prod, "symbol", None) or "").strip() or None)
                break
        components.append({**row, "component_name": name, "component_sku": sku})
    return {
        "composition_id": int(composition.id),
        "composition_name": str(composition.name or ""),
        "disassembly_qty": int(disassembly_qty),
        "components": components,
    }
