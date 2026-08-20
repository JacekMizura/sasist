"""SSOT: per-disposition FG vs disassembly allocation on RMZ lines.

``intake_disposition_json`` is the only source of truth for how physical receivable
qty splits into remaining FG vs disassembly. Aggregate columns
``fg_intake_qty`` / ``disassembly_qty`` / ``stock_intake_mode`` are projections only.
"""

from __future__ import annotations

import json
from typing import Any, Mapping, Optional, Sequence

from ...models.wms_rmz_line import RMZLine
from .errors import RmzFinalizeError

DISP_SALEABLE = "SALEABLE"
DISP_OUTLET_B = "OUTLET_B"
DISP_SERVICE_C = "SERVICE_C"
INTAKE_DISPOSITIONS = (DISP_SALEABLE, DISP_OUTLET_B, DISP_SERVICE_C)

INTAKE_FG = "FG"
INTAKE_DISASSEMBLE = "DISASSEMBLE"
INTAKE_MIXED = "MIXED"


def physical_receivable_qty(
    *,
    accepted_qty: int,
    damaged_b_qty: int,
    damaged_c_qty: int,
) -> int:
    return max(0, int(accepted_qty or 0)) + max(0, int(damaged_b_qty or 0)) + max(0, int(damaged_c_qty or 0))


def commercial_buckets(rmz_line: RMZLine) -> dict[str, int]:
    return {
        DISP_SALEABLE: max(0, int(getattr(rmz_line, "accepted_qty", None) or 0)),
        DISP_OUTLET_B: max(0, int(getattr(rmz_line, "damaged_b_qty", None) or 0)),
        DISP_SERVICE_C: max(0, int(getattr(rmz_line, "damaged_c_qty", None) or 0)),
    }


def empty_allocation() -> list[dict[str, int | str]]:
    return [
        {"disposition": DISP_SALEABLE, "fg_qty": 0, "disassembly_qty": 0},
        {"disposition": DISP_OUTLET_B, "fg_qty": 0, "disassembly_qty": 0},
        {"disposition": DISP_SERVICE_C, "fg_qty": 0, "disassembly_qty": 0},
    ]


def parse_intake_disposition_json(raw: object | None) -> Optional[list[dict[str, int | str]]]:
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)):
        data = list(raw)
    elif isinstance(raw, (str, bytes)):
        s = str(raw).strip()
        if not s:
            return None
        try:
            data = json.loads(s)
        except Exception as exc:
            raise RmzFinalizeError("intake_disposition_json is not valid JSON") from exc
    else:
        # Unset ORM sentinel / test MagicMock — treat as missing allocation.
        return None
    if not isinstance(data, list):
        raise RmzFinalizeError("intake_disposition_json must be a JSON array")
    by_disp: dict[str, dict[str, int | str]] = {d: {"disposition": d, "fg_qty": 0, "disassembly_qty": 0} for d in INTAKE_DISPOSITIONS}
    for i, row in enumerate(data):
        if not isinstance(row, Mapping):
            raise RmzFinalizeError(f"intake_disposition_json[{i}] must be an object")
        disp = str(row.get("disposition") or "").strip().upper()
        if disp == "REJECTED":
            raise RmzFinalizeError("REJECTED must not appear in intake_disposition_json")
        if disp not in by_disp:
            raise RmzFinalizeError(f"Invalid intake disposition: {disp}")
        try:
            fg = int(row.get("fg_qty") or 0)
            dq = int(row.get("disassembly_qty") or 0)
        except (TypeError, ValueError) as exc:
            raise RmzFinalizeError(f"intake_disposition_json[{disp}]: fg_qty/disassembly_qty must be integers") from exc
        if fg < 0 or dq < 0:
            raise RmzFinalizeError(f"intake_disposition_json[{disp}]: quantities cannot be negative")
        by_disp[disp] = {"disposition": disp, "fg_qty": fg, "disassembly_qty": dq}
    return [by_disp[d] for d in INTAKE_DISPOSITIONS]


def serialize_intake_disposition(rows: Sequence[Mapping[str, Any]]) -> str:
    out = []
    for d in INTAKE_DISPOSITIONS:
        match = next((r for r in rows if str(r.get("disposition") or "").upper() == d), None)
        out.append(
            {
                "disposition": d,
                "fg_qty": int(match.get("fg_qty") or 0) if match else 0,
                "disassembly_qty": int(match.get("disassembly_qty") or 0) if match else 0,
            }
        )
    return json.dumps(out, ensure_ascii=False)


def project_aggregates_from_allocation(
    rows: Sequence[Mapping[str, Any]],
) -> tuple[int, int, Optional[str]]:
    fg = sum(int(r.get("fg_qty") or 0) for r in rows)
    dq = sum(int(r.get("disassembly_qty") or 0) for r in rows)
    if fg > 0 and dq > 0:
        mode = INTAKE_MIXED
    elif dq > 0:
        mode = INTAKE_DISASSEMBLE
    elif fg > 0:
        mode = INTAKE_FG
    else:
        mode = None
    return fg, dq, mode


def validate_allocation_against_commercial(
    rows: Sequence[Mapping[str, Any]],
    *,
    accepted_qty: int,
    damaged_b_qty: int,
    damaged_c_qty: int,
) -> None:
    buckets = {
        DISP_SALEABLE: max(0, int(accepted_qty or 0)),
        DISP_OUTLET_B: max(0, int(damaged_b_qty or 0)),
        DISP_SERVICE_C: max(0, int(damaged_c_qty or 0)),
    }
    by_disp = {str(r.get("disposition") or "").upper(): r for r in rows}
    for disp, commercial in buckets.items():
        row = by_disp.get(disp) or {"fg_qty": 0, "disassembly_qty": 0}
        fg = int(row.get("fg_qty") or 0)
        dq = int(row.get("disassembly_qty") or 0)
        if fg < 0 or dq < 0:
            raise RmzFinalizeError(f"{disp}: fg/disassembly cannot be negative")
        if fg + dq != commercial:
            raise RmzFinalizeError(
                f"{disp}: fg_qty + disassembly_qty ({fg}+{dq}) must equal commercial qty ({commercial})"
            )
    total_alloc = sum(int(r.get("fg_qty") or 0) + int(r.get("disassembly_qty") or 0) for r in rows)
    receivable = physical_receivable_qty(
        accepted_qty=accepted_qty, damaged_b_qty=damaged_b_qty, damaged_c_qty=damaged_c_qty
    )
    if total_alloc != receivable:
        raise RmzFinalizeError(
            f"Allocation sum ({total_alloc}) must equal physical_receivable_qty ({receivable})"
        )


def required_allocation_from_commercial(
    *,
    accepted_qty: int,
    damaged_b_qty: int,
    damaged_c_qty: int,
) -> list[dict[str, int | str]]:
    """REQUIRED: every receivable unit is disassembled (fg=0)."""
    return [
        {"disposition": DISP_SALEABLE, "fg_qty": 0, "disassembly_qty": max(0, int(accepted_qty or 0))},
        {"disposition": DISP_OUTLET_B, "fg_qty": 0, "disassembly_qty": max(0, int(damaged_b_qty or 0))},
        {"disposition": DISP_SERVICE_C, "fg_qty": 0, "disassembly_qty": max(0, int(damaged_c_qty or 0))},
    ]


def all_fg_allocation_from_commercial(
    *,
    accepted_qty: int,
    damaged_b_qty: int,
    damaged_c_qty: int,
) -> list[dict[str, int | str]]:
    return [
        {"disposition": DISP_SALEABLE, "fg_qty": max(0, int(accepted_qty or 0)), "disassembly_qty": 0},
        {"disposition": DISP_OUTLET_B, "fg_qty": max(0, int(damaged_b_qty or 0)), "disassembly_qty": 0},
        {"disposition": DISP_SERVICE_C, "fg_qty": max(0, int(damaged_c_qty or 0)), "disassembly_qty": 0},
    ]


def try_deterministic_legacy_conversion(
    rmz_line: RMZLine,
    *,
    recovery_mode: str,
) -> Optional[list[dict[str, int | str]]]:
    """Convert legacy aggregate intake → disposition allocation only when unique.

    Returns None when conversion is ambiguous (caller must require explicit reallocation).
    """
    mode = str(recovery_mode or "OFF").strip().upper()
    buckets = commercial_buckets(rmz_line)
    receivable = sum(buckets.values())
    non_zero = [d for d, q in buckets.items() if q > 0]

    raw_json = getattr(rmz_line, "intake_disposition_json", None)
    if raw_json is not None and str(raw_json).strip():
        return parse_intake_disposition_json(raw_json)

    if mode == "OFF" or receivable <= 0:
        return all_fg_allocation_from_commercial(
            accepted_qty=buckets[DISP_SALEABLE],
            damaged_b_qty=buckets[DISP_OUTLET_B],
            damaged_c_qty=buckets[DISP_SERVICE_C],
        )

    fg_raw = getattr(rmz_line, "fg_intake_qty", None)
    dq_raw = getattr(rmz_line, "disassembly_qty", None)
    has_agg = fg_raw is not None or dq_raw is not None or getattr(rmz_line, "stock_intake_mode", None)

    if not has_agg:
        # OPTIONAL with no intake recorded → unambiguous all-FG; REQUIRED cannot default.
        if mode == "REQUIRED":
            return None
        return all_fg_allocation_from_commercial(
            accepted_qty=buckets[DISP_SALEABLE],
            damaged_b_qty=buckets[DISP_OUTLET_B],
            damaged_c_qty=buckets[DISP_SERVICE_C],
        )

    fg = max(0, int(fg_raw if fg_raw is not None else 0))
    dq = max(0, int(dq_raw if dq_raw is not None else 0))
    if fg + dq != receivable:
        return None
    if len(non_zero) > 1:
        # Multiple commercial buckets + only global aggregates → ambiguous.
        return None
    if len(non_zero) == 0:
        return empty_allocation()

    only = non_zero[0]
    out = empty_allocation()
    for row in out:
        if row["disposition"] == only:
            row["fg_qty"] = fg
            row["disassembly_qty"] = dq
    return out


def read_line_allocation(rmz_line: RMZLine) -> Optional[list[dict[str, int | str]]]:
    return parse_intake_disposition_json(getattr(rmz_line, "intake_disposition_json", None))


def apply_projection_to_line(rmz_line: RMZLine, rows: Sequence[Mapping[str, Any]]) -> None:
    fg, dq, mode = project_aggregates_from_allocation(rows)
    rmz_line.intake_disposition_json = serialize_intake_disposition(rows)
    rmz_line.fg_intake_qty = int(fg)
    rmz_line.disassembly_qty = int(dq)
    rmz_line.stock_intake_mode = mode


def total_disassembly_qty(rows: Sequence[Mapping[str, Any]]) -> int:
    return sum(int(r.get("disassembly_qty") or 0) for r in rows)


def total_fg_qty(rows: Sequence[Mapping[str, Any]]) -> int:
    return sum(int(r.get("fg_qty") or 0) for r in rows)


def fg_qty_for_disposition(rows: Sequence[Mapping[str, Any]], disposition: str) -> int:
    d = str(disposition).strip().upper()
    for r in rows:
        if str(r.get("disposition") or "").upper() == d:
            return max(0, int(r.get("fg_qty") or 0))
    return 0
