"""
Pre-deploy audit for Etap 2 stock disposition.

Run: python -m backend.scripts.audit_stock_disposition_stage2

Exit 0 = safe to deploy (no blockers). Exit 1 = review required.
"""

from __future__ import annotations

import sys

from sqlalchemy import func

from backend.database import SessionLocal, engine
from backend.db.stock_disposition_stage2_schema import ensure_stock_disposition_stage2_columns
from backend.models.order import Order
from backend.models.pick_task import PickTask
from backend.models.stock_reservation import StockReservation
from backend.models.wave import Wave
from backend.services.stock_disposition import DEFAULT_STOCK_DISPOSITION, normalize_stock_disposition


def main() -> int:
    ensure_stock_disposition_stage2_columns(engine)
    db = SessionLocal()
    blockers: list[str] = []
    warnings: list[str] = []
    try:
        active_waves = (
            db.query(func.count(Wave.id))
            .filter(Wave.status.in_(("created", "in_progress", "picking")))
            .scalar()
        )
        if int(active_waves or 0) > 0:
            blockers.append(f"active_waves={active_waves} (status created/in_progress/picking)")

        open_picks = (
            db.query(func.count(PickTask.id))
            .filter(PickTask.status.in_(("waiting", "picking")))
            .scalar()
        )
        if int(open_picks or 0) > 0:
            blockers.append(f"open_pick_tasks={open_picks} (waiting/picking)")

        open_picking_orders = (
            db.query(func.count(Order.id))
            .filter(Order.picking_finished_at.is_(None), Order.wave_id.isnot(None))
            .scalar()
        )
        if int(open_picking_orders or 0) > 0:
            warnings.append(f"orders_in_wave_not_picking_finished={open_picking_orders}")

        res_null_disp = (
            db.query(func.count(StockReservation.id))
            .filter(
                StockReservation.status == "reserved",
                (StockReservation.stock_disposition.is_(None))
                | (StockReservation.stock_disposition == ""),
            )
            .scalar()
        )
        if int(res_null_disp or 0) > 0:
            blockers.append(f"active_reservations_missing_disposition={res_null_disp}")

        legacy_reserved = (
            db.query(func.count(StockReservation.id))
            .filter(
                StockReservation.status == "reserved",
                StockReservation.stock_disposition != DEFAULT_STOCK_DISPOSITION,
            )
            .scalar()
        )
        if int(legacy_reserved or 0) > 0:
            warnings.append(
                f"non_saleable_active_reservations={legacy_reserved} "
                f"(dispositions other than {DEFAULT_STOCK_DISPOSITION})"
            )

        rows = (
            db.query(
                StockReservation.stock_disposition,
                func.count(StockReservation.id),
                func.coalesce(func.sum(StockReservation.quantity), 0.0),
            )
            .filter(StockReservation.status == "reserved")
            .group_by(StockReservation.stock_disposition)
            .all()
        )
        print("[audit.stock_disposition.stage2] active reservations by disposition:")
        for disp, cnt, qty in rows:
            print(f"  {normalize_stock_disposition(disp)!r}: count={cnt} qty={float(qty or 0):.4f}")

        if warnings:
            print("[audit.stock_disposition.stage2] warnings:")
            for w in warnings:
                print(f"  - {w}")

        if blockers:
            print("[audit.stock_disposition.stage2] BLOCKERS — do not deploy until resolved:")
            for b in blockers:
                print(f"  - {b}")
            return 1

        print("[audit.stock_disposition.stage2] OK — no deploy blockers")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
