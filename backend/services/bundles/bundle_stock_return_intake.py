"""STOCK bundle return intake: FG vs disassemble from OrderLineBundleComponent snapshot.

Does not touch shared Z-PZ emission (``append_accepted_component_lines``).
Reuses RMZLine ``stock_intake_mode`` / ``fg_intake_qty`` / ``disassembly_qty`` columns;
manufacturing recovery must not clear them on bundle lines.
"""

from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ...models.return_line_bundle_component import ReturnLineBundleComponent
from ...models.wms_rmz_line import RMZLine
from ...services.returns.errors import RmzFinalizeError
from ...services.returns.manufactured_component_recovery_service import (
    INTAKE_DISASSEMBLE,
    INTAKE_FG,
    INTAKE_MIXED,
    INTAKE_MODES,
    validate_intake_split,
)
from ..bundle_operational_mode import STOCK_PRODUCTION
from .bundle_line_context import BundleComponentSnapshotView, BundleLineContext
from .bundle_line_resolver import bundle_line_resolver
from .bundle_return_service import (
    BundleComponentReturnIn,
    BundleReturnComponentNode,
    apply_bundle_return_metadata,
)


def physical_bundle_qty_for_parent(db: Session, parent: OrderItem) -> int:
    """Returnable physical set qty for a bundle parent (legacy-safe).

    Prefer OrderItem.quantity / ctx.bundle_qty; if zero, infer from snapshot
    ``quantity_total / quantity_per_bundle`` or ON_DEMAND child lines.
    """
    oi_qty = max(0, int(float(getattr(parent, "quantity", 0) or 0)))
    if not bool(getattr(parent, "is_bundle_parent", False)):
        return oi_qty

    ctx = bundle_line_resolver.resolve_parent_line(db, int(parent.id))
    if ctx is None:
        return oi_qty

    if int(ctx.bundle_qty or 0) > 0:
        return int(ctx.bundle_qty)

    inferred = 0
    for comp in ctx.components:
        per = int(comp.required_qty_per_bundle or 0)
        total = int(comp.required_qty_total or 0)
        if per > 0 and total > 0:
            inferred = max(inferred, total // per)

    if inferred <= 0 and ctx.component_order_items:
        for child in ctx.component_order_items:
            cq = max(0, int(float(getattr(child, "quantity", 0) or 0)))
            matched = False
            for comp in ctx.components:
                if int(comp.component_product_id) == int(child.product_id):
                    per = int(comp.required_qty_per_bundle or 0)
                    if per > 0 and cq > 0:
                        inferred = max(inferred, cq // per)
                    matched = True
                    break
            if not matched and cq > 0:
                inferred = max(inferred, cq)

    return max(oi_qty, inferred)


def stock_snapshot_components(ctx: BundleLineContext) -> tuple[BundleComponentSnapshotView, ...]:
    """Recipe snapshot rows with a real product id (SSOT for STOCK disassemble)."""
    return tuple(c for c in ctx.components if int(c.component_product_id or 0) > 0)


def stock_can_disassemble(ctx: BundleLineContext) -> bool:
    return (
        str(ctx.fulfillment_mode) == STOCK_PRODUCTION
        and len(stock_snapshot_components(ctx)) > 0
    )


def expected_component_qty(*, per_bundle: int, disassembly_qty: int) -> int:
    return max(0, int(per_bundle or 0)) * max(0, int(disassembly_qty or 0))


def snapshot_nodes_for_tree(
    ctx: BundleLineContext,
    *,
    already_by_snap: dict[int, int] | None = None,
) -> tuple[BundleReturnComponentNode, ...]:
    """Tree nodes for STOCK disassemble UI (one row per snapshot component)."""
    already = already_by_snap or {}
    out: list[BundleReturnComponentNode] = []
    for comp in stock_snapshot_components(ctx):
        sold = int(comp.required_qty_total or 0)
        snap_id = int(comp.snapshot_id)
        already_n = int(already.get(snap_id, 0))
        unit_px = float(comp.unit_price_snapshot or 0.0)
        out.append(
            BundleReturnComponentNode(
                snapshot_id=snap_id,
                order_line_id=int(ctx.order_line_id),
                component_product_id=int(comp.component_product_id),
                component_name=str(comp.component_name or f"P{comp.component_product_id}"),
                sku=comp.sku,
                sold_qty=sold,
                unit_price_snapshot=unit_px,
                already_returned_qty=already_n,
                max_returnable_qty=max(0, sold - already_n),
                line_role="component",
                lots=(),
                quantity_per_bundle=int(comp.required_qty_per_bundle or 0),
            )
        )
    return tuple(out)


def _normalize_stock_intake(
    *,
    stock_intake_mode: Optional[str],
    fg_intake_qty: Optional[int],
    disassembly_qty: Optional[int],
    physical: int,
    has_snapshot: bool,
) -> tuple[str, int, int]:
    """Default STOCK behaviour = FG (finished SKU)."""
    fg = int(fg_intake_qty) if fg_intake_qty is not None else 0
    dq = int(disassembly_qty) if disassembly_qty is not None else 0
    intake = (str(stock_intake_mode).strip().upper() if stock_intake_mode else None) or None

    if not has_snapshot:
        return INTAKE_FG, (fg if fg > 0 else max(0, physical)), 0

    if intake is None:
        if dq > 0 and fg > 0:
            intake = INTAKE_MIXED
        elif dq > 0:
            intake = INTAKE_DISASSEMBLE
        else:
            intake = INTAKE_FG
            if fg <= 0:
                fg = max(0, physical)

    if intake == INTAKE_DISASSEMBLE and fg > 0 and dq > 0:
        intake = INTAKE_MIXED
    if fg > 0 and dq > 0:
        intake = INTAKE_MIXED
    if intake == INTAKE_FG:
        dq = 0
        if fg <= 0:
            fg = max(0, physical)
    if intake == INTAKE_DISASSEMBLE:
        fg = 0
        if dq < 1:
            raise RmzFinalizeError("stock_intake_mode=DISASSEMBLE requires disassembly_qty > 0")

    if intake not in INTAKE_MODES:
        raise RmzFinalizeError(f"Invalid stock_intake_mode: {intake}")

    validate_intake_split(physical, fg, dq, intake)
    return intake, fg, dq


def apply_stock_bundle_intake(
    db: Session,
    *,
    rmz_line: RMZLine,
    order_id: int,
    selections: Sequence[BundleComponentReturnIn],
    has_damage: bool = False,
    stock_intake_mode: Optional[str] = None,
    fg_intake_qty: Optional[int] = None,
    disassembly_qty: Optional[int] = None,
) -> None:
    """Persist STOCK FG / DISASSEMBLE / MIXED on a bundle-parent RMZ line."""
    ctx = bundle_line_resolver.resolve_parent_line(db, int(rmz_line.order_item_id))
    if ctx is None or str(ctx.fulfillment_mode) != STOCK_PRODUCTION:
        apply_bundle_return_metadata(
            db,
            rmz_line=rmz_line,
            order_id=order_id,
            selections=selections,
            has_damage=has_damage,
        )
        return

    parent = db.query(OrderItem).filter(OrderItem.id == int(rmz_line.order_item_id)).first()
    physical = int(float(getattr(rmz_line, "quantity", 0) or 0))
    if physical <= 0 and parent is not None:
        physical = physical_bundle_qty_for_parent(db, parent)

    has_snap = stock_can_disassemble(ctx)
    intake, fg, dq = _normalize_stock_intake(
        stock_intake_mode=stock_intake_mode,
        fg_intake_qty=fg_intake_qty,
        disassembly_qty=disassembly_qty,
        physical=physical,
        has_snapshot=has_snap,
    )

    snaps = {int(c.snapshot_id): c for c in stock_snapshot_components(ctx)}

    if intake == INTAKE_FG or dq < 1:
        db.query(ReturnLineBundleComponent).filter(
            ReturnLineBundleComponent.return_line_id == int(rmz_line.id)
        ).delete(synchronize_session=False)
        apply_bundle_return_metadata(
            db,
            rmz_line=rmz_line,
            order_id=order_id,
            selections=[],
            has_damage=has_damage,
        )
        rmz_line.stock_intake_mode = INTAKE_FG
        rmz_line.fg_intake_qty = fg
        rmz_line.disassembly_qty = 0
        if getattr(rmz_line, "accepted_qty", None) is None or int(rmz_line.accepted_qty or 0) < 1:
            rmz_line.accepted_qty = fg
        db.flush()
        return

    by_sel = {int(s.snapshot_id): s for s in selections if int(s.snapshot_id) > 0}
    built: list[BundleComponentReturnIn] = []
    for snap_id, view in snaps.items():
        expected = expected_component_qty(
            per_bundle=int(view.required_qty_per_bundle),
            disassembly_qty=dq,
        )
        if expected <= 0:
            continue
        sel = by_sel.get(snap_id)
        accepted = int(sel.accepted_qty) if sel is not None else expected
        accepted = max(0, min(accepted, expected))
        decision = None
        if sel is not None and sel.decision:
            decision = sel.decision
        elif accepted < expected:
            decision = "PARTIAL" if accepted > 0 else "REJECTED"
        else:
            decision = "OK"
        built.append(
            BundleComponentReturnIn(
                snapshot_id=snap_id,
                returned_qty=expected,
                accepted_qty=accepted,
                decision=decision,
                lot_trace_json=sel.lot_trace_json if sel is not None else None,
            )
        )

    if not built:
        raise RmzFinalizeError("Brak składników w snapshotcie zestawu do rozmontowania")

    expected_snap_ids = {
        sid
        for sid, v in snaps.items()
        if expected_component_qty(per_bundle=int(v.required_qty_per_bundle), disassembly_qty=dq) > 0
    }
    if {b.snapshot_id for b in built} != expected_snap_ids:
        raise RmzFinalizeError("Rozliczenie rozmontowania musi obejmować wszystkie składniki snapshotu")

    apply_bundle_return_metadata(
        db,
        rmz_line=rmz_line,
        order_id=order_id,
        selections=built,
        has_damage=has_damage,
    )
    rmz_line.stock_intake_mode = intake
    rmz_line.fg_intake_qty = fg
    rmz_line.disassembly_qty = dq
    if intake == INTAKE_MIXED and fg > 0:
        if getattr(rmz_line, "accepted_qty", None) is None:
            rmz_line.accepted_qty = fg
    db.flush()
