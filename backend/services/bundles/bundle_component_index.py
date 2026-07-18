"""Canonical bundle_component_index semantics (read-side normalization).

Domain rules
------------
- ``bundle_component_index`` is **not** a persisted ``order_items`` column.
  It is assigned in ``picking_lines()`` as 1..N in snapshot / component order.
- ``None`` means \"index unknown / not assigned\" (legacy incomplete UX meta,
  hand-built meta, or a gap before projection). It is **not** a valid display index.
- Valid indices are integers ``>= 1``. They should be unique among siblings
  (same ``parent_bundle_order_line_id``).
- Non-components (``is_bundle_component=False``, e.g. STOCK linked SKU) must not be
  materialised as picking/packing component-status rows.

Never map every NULL → 1 (collapses siblings). Prefer preserving a consistent
unique set; otherwise reassign 1..N in deterministic sibling order.
"""

from __future__ import annotations

from typing import Optional, Sequence


def is_valid_bundle_component_index(value: object) -> bool:
    try:
        return value is not None and int(value) >= 1
    except (TypeError, ValueError):
        return False


def bundle_component_index_sort_key(
    index: Optional[int],
    *,
    order_item_id: int = 0,
) -> tuple[int, int, int]:
    """
    Sort siblings safely when some indices are missing.

    Known indices (``>= 1``) first, ascending; then missing / invalid by
    ``order_item_id`` (stable, never compares ``None`` with ``int``).
    """
    oid = int(order_item_id)
    if is_valid_bundle_component_index(index):
        return (0, int(index), oid)
    return (1, oid, 0)


def normalize_sibling_bundle_component_indices(
    rows: Sequence[tuple[int, Optional[int]]],
) -> dict[int, int]:
    """
    Map ``order_item_id → display index (>= 1)`` for one sibling group.

    * If every row has a unique valid index — keep those values.
    * Otherwise reassign ``1..N`` in ``bundle_component_index_sort_key`` order
      (valid indices keep relative order; missing fill after them by id).
    """
    if not rows:
        return {}
    normalized_rows: list[tuple[int, Optional[int]]] = []
    for oid, raw in rows:
        idx: Optional[int]
        try:
            idx = int(raw) if raw is not None else None
        except (TypeError, ValueError):
            idx = None
        if idx is not None and idx < 1:
            idx = None
        normalized_rows.append((int(oid), idx))

    valid = [(oid, int(idx)) for oid, idx in normalized_rows if idx is not None]
    indices = [idx for _, idx in valid]
    if len(valid) == len(normalized_rows) and len(indices) == len(set(indices)):
        return {oid: idx for oid, idx in valid}

    ordered = sorted(
        normalized_rows,
        key=lambda r: bundle_component_index_sort_key(r[1], order_item_id=r[0]),
    )
    return {oid: i for i, (oid, _) in enumerate(ordered, start=1)}
