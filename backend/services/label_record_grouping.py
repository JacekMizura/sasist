"""Merge flat location-style label records into one record per physical row (multi-slot fields)."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

MAX_GROUP_SLOTS = 3


def _record_has_repeater_locations(rec: dict[str, Any]) -> bool:
    loc = rec.get("locations")
    return isinstance(loc, list) and len(loc) > 0


def _barcode_for_slot(rec: dict[str, Any]) -> str:
    v = (
        rec.get("barcode_data")
        or rec.get("loc_barcode")
        or rec.get("location_barcode")
        or rec.get("barcode")
    )
    return str(v).strip() if v is not None else ""


def _loc_name_for_slot(rec: dict[str, Any]) -> str:
    v = rec.get("loc_name") or rec.get("location_name") or rec.get("location_code")
    return str(v).strip() if v is not None else ""


def normalize_floor_sets_param(raw: list[list[str]] | list[Any] | None) -> list[list[str]]:
    """Strip / uppercase floor tokens; drop empty groups."""
    if not raw:
        return []
    out: list[list[str]] = []
    for grp in raw:
        if not isinstance(grp, (list, tuple)):
            continue
        ng = [str(f).strip().upper() for f in grp if str(f).strip()]
        if ng:
            out.append(ng)
    return out


def _record_floor_key(rec: dict[str, Any]) -> str:
    return str(rec.get("floor") or "").strip().upper()


def _first_non_empty_str(*vals: Any) -> str:
    for v in vals:
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def merge_records_by_row_multi_slot(
    records: list[dict[str, Any]],
    *,
    by_rack: bool = False,
) -> list[dict[str, Any]]:
    """
    Group flat records by ``row`` and optionally ``rack_name``, take up to three per group,
    emit one dict per group with ``floor_1..3``, ``barcode_1..3``, ``loc_name_1..3``.
    Unused slots (fewer than 3 records in the group) use ``None`` (JSON null) — groups are never dropped.
    Leaves ``records`` unchanged if grouping should not run.
    """
    if not records:
        return records
    if any(not isinstance(r, dict) for r in records):
        return records
    if any(_record_has_repeater_locations(r) for r in records if isinstance(r, dict)):
        logger.warning(
            "merge_records_by_row_multi_slot: skipped — at least one record has a repeater `locations` list",
        )
        return records

    missing_row_counter = [0]

    def group_key(rec: dict[str, Any]) -> tuple[str, ...]:
        row = str(rec.get("row") or "").strip()
        if not row:
            missing_row_counter[0] += 1
            row = f"__row_missing_{missing_row_counter[0]}"
        if by_rack:
            rack = str(rec.get("rack_name") or "").strip()
            return (rack, row)
        return (row,)

    buckets: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for rec in records:
        if not isinstance(rec, dict):
            continue
        buckets[group_key(rec)].append(rec)

    merged: list[dict[str, Any]] = []
    for key in sorted(buckets.keys(), key=lambda k: tuple(str(x) for x in k)):
        members = buckets[key]
        members.sort(
            key=lambda r: (
                str(r.get("floor") or "").lower(),
                _loc_name_for_slot(r).lower(),
            )
        )
        slots = members[:MAX_GROUP_SLOTS]
        base = dict(slots[0])

        if by_rack and len(key) >= 2:
            base["rack_name"] = key[0]
            row_k = key[1]
            base["row"] = (
                str(slots[0].get("row") or "")
                if str(row_k).startswith("__row_missing_")
                else str(row_k)
            )
        elif len(key) >= 1:
            rk = key[0]
            if str(rk).startswith("__row_missing_"):
                base["row"] = str(slots[0].get("row") or "")
            else:
                base["row"] = str(rk)

        for i in range(MAX_GROUP_SLOTS):
            n = i + 1
            if i < len(slots):
                s = slots[i]
                base[f"floor_{n}"] = str(s.get("floor") or "")
                base[f"barcode_{n}"] = _barcode_for_slot(s)
                base[f"loc_name_{n}"] = _loc_name_for_slot(s)
            else:
                base[f"floor_{n}"] = None
                base[f"barcode_{n}"] = None
                base[f"loc_name_{n}"] = None

        base["floor"] = _first_non_empty_str(
            base.get("floor_1"),
            base.get("floor_2"),
            base.get("floor_3"),
            slots[0].get("floor") if slots else None,
        )
        base["barcode_data"] = _first_non_empty_str(
            base.get("barcode_1"),
            base.get("barcode_2"),
            base.get("barcode_3"),
            _barcode_for_slot(slots[0]) if slots else None,
            base.get("barcode_data"),
        )
        if slots:
            ln = _loc_name_for_slot(slots[0])
            if ln:
                base["loc_name"] = ln
        merged.append(base)

    logger.info(
        "merge_records_by_row_multi_slot: by_rack=%s in=%s out=%s",
        by_rack,
        len(records),
        len(merged),
    )
    return merged


def _phys_row_rack_key(rec: dict[str, Any], *, by_rack: bool, missing_row_counter: list[int]) -> tuple[str, ...]:
    row = str(rec.get("row") or "").strip()
    if not row:
        missing_row_counter[0] += 1
        row = f"__row_missing_{missing_row_counter[0]}"
    if by_rack:
        rack = str(rec.get("rack_name") or "").strip()
        return (rack, row)
    return (row,)


def _apply_row_rack_to_base(base: dict[str, Any], key: tuple[str, ...], slots: list[dict[str, Any]], *, by_rack: bool) -> None:
    if by_rack and len(key) >= 2:
        base["rack_name"] = key[0]
        row_k = key[1]
        base["row"] = (
            str(slots[0].get("row") or "")
            if str(row_k).startswith("__row_missing_")
            else str(row_k)
        )
    elif len(key) >= 1:
        rk = key[0]
        if str(rk).startswith("__row_missing_"):
            base["row"] = str(slots[0].get("row") or "")
        else:
            base["row"] = str(rk)


def _single_unmatched_merged(rec: dict[str, Any]) -> dict[str, Any]:
    """One PDF row for a record whose floor is not in any ``floor_set``."""
    base = dict(rec)
    bc = _barcode_for_slot(rec)
    ln = _loc_name_for_slot(rec)
    base["floor_set"] = []
    base["floor_set_id"] = None
    base["set"] = []
    base["items"] = [
        {
            "floor": str(rec.get("floor") or "") or None,
            "barcode_data": bc if bc else None,
            "loc_name": ln if ln else None,
        }
    ]
    base["floor_1"] = str(rec.get("floor") or "")
    base["barcode_1"] = bc
    base["loc_name_1"] = ln
    base["floor_2"] = None
    base["barcode_2"] = None
    base["loc_name_2"] = None
    base["floor_3"] = None
    base["barcode_3"] = None
    base["loc_name_3"] = None
    base["floor"] = _first_non_empty_str(base.get("floor_1"), rec.get("floor"))
    base["barcode_data"] = _first_non_empty_str(base.get("barcode_1"), rec.get("barcode_data"))
    if ln:
        base["loc_name"] = ln
    return base


def merge_records_by_floor_sets(
    records: list[dict[str, Any]],
    floor_sets: list[list[str]],
    *,
    by_rack: bool = False,
) -> list[dict[str, Any]]:
    """
    Group by ``(rack?, row, floor_set_id)`` using configured floor sets.
    Each merged record includes ``set`` (the floor list), ``items`` (ordered slot payloads, partial OK),
    ``floor_set_id``, ``floor_1..3`` aligned to the first floors in ``set`` (max 3), and ``floor_set`` copy.
    """
    norm_sets = normalize_floor_sets_param(floor_sets)
    if not records or not norm_sets:
        return records
    if any(not isinstance(r, dict) for r in records):
        return records
    if any(_record_has_repeater_locations(r) for r in records if isinstance(r, dict)):
        logger.warning(
            "merge_records_by_floor_sets: skipped — at least one record has a repeater `locations` list",
        )
        return records

    floor_to_sid: dict[str, int] = {}
    for sid, floors in enumerate(norm_sets):
        for fl in floors:
            floor_to_sid.setdefault(fl, sid)

    missing_row_counter = [0]
    buckets: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    unmatched: list[dict[str, Any]] = []

    for rec in records:
        if not isinstance(rec, dict):
            continue
        flk = _record_floor_key(rec)
        sid = floor_to_sid.get(flk)
        if sid is None:
            unmatched.append(rec)
            continue
        pk = _phys_row_rack_key(rec, by_rack=by_rack, missing_row_counter=missing_row_counter)
        buckets[(*pk, sid)].append(rec)

    merged: list[dict[str, Any]] = []

    def build_one(key: tuple[Any, ...], sid: int, members: list[dict[str, Any]]) -> dict[str, Any]:
        set_def = norm_sets[sid]
        by_fl = {_record_floor_key(r): r for r in members}
        first_rec = next((by_fl[fl] for fl in set_def if fl in by_fl), None) or (members[0] if members else None)
        if first_rec is None:
            raise RuntimeError("empty members")
        base = dict(first_rec)
        pk = key[:-1]
        _apply_row_rack_to_base(base, pk, members, by_rack=by_rack)

        group_items: list[dict[str, Any]] = []
        for fl in set_def:
            r = by_fl.get(fl)
            if r:
                bc = _barcode_for_slot(r)
                ln = _loc_name_for_slot(r)
                group_items.append(
                    {
                        "floor": str(r.get("floor") or "") or fl,
                        "barcode_data": bc if bc else None,
                        "loc_name": ln if ln else None,
                    }
                )
            else:
                group_items.append({"floor": fl, "barcode_data": None, "loc_name": None})

        base["floor_set"] = list(set_def)
        base["floor_set_id"] = sid
        base["set"] = list(set_def)
        base["items"] = group_items

        for i, fl in enumerate(set_def[:MAX_GROUP_SLOTS]):
            n = i + 1
            r = by_fl.get(fl)
            if r:
                base[f"floor_{n}"] = str(r.get("floor") or "")
                base[f"barcode_{n}"] = _barcode_for_slot(r)
                base[f"loc_name_{n}"] = _loc_name_for_slot(r)
            else:
                base[f"floor_{n}"] = None
                base[f"barcode_{n}"] = None
                base[f"loc_name_{n}"] = None

        present_slots = [by_fl[fl] for fl in set_def if fl in by_fl][:MAX_GROUP_SLOTS]
        base["floor"] = _first_non_empty_str(
            base.get("floor_1"),
            base.get("floor_2"),
            base.get("floor_3"),
            *(s.get("floor") for s in present_slots),
        )
        base["barcode_data"] = _first_non_empty_str(
            base.get("barcode_1"),
            base.get("barcode_2"),
            base.get("barcode_3"),
            *(_barcode_for_slot(s) for s in present_slots),
            base.get("barcode_data"),
        )
        ln0 = _loc_name_for_slot(present_slots[0]) if present_slots else ""
        if ln0:
            base["loc_name"] = ln0
        return base

    sorted_keys = sorted(buckets.keys(), key=lambda k: tuple(str(x) for x in k))
    for key in sorted_keys:
        members = buckets[key]
        sid = int(key[-1])
        merged.append(build_one(key, sid, members))

    for rec in unmatched:
        merged.append(_single_unmatched_merged(rec))

    logger.info(
        "merge_records_by_floor_sets: by_rack=%s sets=%s in=%s out=%s unmatched=%s",
        by_rack,
        len(norm_sets),
        len(records),
        len(merged),
        len(unmatched),
    )
    return merged
