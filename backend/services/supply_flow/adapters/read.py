"""READ adapters — thin queries against existing SSOT modules. No local copies."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from ....models.inbound_delivery import DeliveryItem, InboundDelivery

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DeliveryReadDTO:
    id: int
    tenant_id: int
    warehouse_id: int | None
    purchase_status: str
    operational_phase: str
    expected_date: Any
    item_count: int
    operational_phase_changed_at: Any = None
    created_at: Any = None
    #: Product id references only (SSOT DeliveryItem) — for Recovery/Slotting overlap.
    product_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class PzDocumentReadDTO:
    id: int
    delivery_id: int | None
    document_type: str
    receiving_status: str | None
    putaway_status: str | None


class InboundDeliveryReadAdapter:
    def list_for_warehouse(
        self, db: Session, *, tenant_id: int, warehouse_id: int
    ) -> list[DeliveryReadDTO]:
        rows = (
            db.query(InboundDelivery)
            .filter(
                InboundDelivery.tenant_id == int(tenant_id),
                InboundDelivery.warehouse_id == int(warehouse_id),
            )
            .order_by(InboundDelivery.id.asc())
            .all()
        )
        out: list[DeliveryReadDTO] = []
        for d in rows:
            product_ids: tuple[int, ...] = ()
            n = 0
            try:
                items = (
                    db.query(DeliveryItem.product_id)
                    .filter(DeliveryItem.delivery_id == int(d.id))
                    .all()
                )
                n = len(items)
                product_ids = tuple(
                    sorted({int(pid) for (pid,) in items if pid is not None})
                )
            except Exception:
                n = 0
                product_ids = ()
            out.append(
                DeliveryReadDTO(
                    id=int(d.id),
                    tenant_id=int(d.tenant_id),
                    warehouse_id=int(d.warehouse_id) if d.warehouse_id is not None else None,
                    purchase_status=str(d.status or ""),
                    operational_phase=str(d.operational_phase or "AWIZOWANA"),
                    expected_date=d.expected_date,
                    item_count=int(n),
                    operational_phase_changed_at=getattr(d, "operational_phase_changed_at", None),
                    created_at=getattr(d, "created_at", None),
                    product_ids=product_ids,
                )
            )
        return out


class PzReceivingReadAdapter:
    """PZ / receiving document progress for a delivery — StockDocument SSOT."""

    def list_pz_for_delivery(self, db: Session, *, delivery_id: int) -> list[PzDocumentReadDTO]:
        try:
            rows = db.execute(
                text(
                    """
                    SELECT id, delivery_id, document_type, receiving_status, putaway_status
                    FROM stock_documents
                    WHERE delivery_id = :delivery_id
                    ORDER BY id ASC
                    """
                ),
                {"delivery_id": int(delivery_id)},
            ).mappings()
        except Exception:
            logger.debug("pz list unavailable", exc_info=True)
            return []
        return [
            PzDocumentReadDTO(
                id=int(r["id"]),
                delivery_id=int(r["delivery_id"]) if r["delivery_id"] is not None else None,
                document_type=str(r["document_type"] or ""),
                receiving_status=r["receiving_status"],
                putaway_status=r["putaway_status"],
            )
            for r in rows
        ]


class PutawayReadAdapter:
    """Putaway progress aggregates from StockDocument SSOT (ids + status counts only)."""

    def warehouse_summary(
        self, db: Session, *, tenant_id: int, warehouse_id: int
    ) -> dict[str, Any]:
        try:
            rows = list(
                db.execute(
                    text(
                        """
                        SELECT id, delivery_id, putaway_status, receiving_status
                        FROM stock_documents
                        WHERE tenant_id = :tenant_id
                          AND warehouse_id = :warehouse_id
                          AND document_type IN ('PZ', 'Z_PZ', 'PZ_RT', 'RETURN_RECEIPT')
                        """
                    ),
                    {"tenant_id": int(tenant_id), "warehouse_id": int(warehouse_id)},
                ).mappings()
            )
        except Exception:
            logger.debug("putaway summary unavailable", exc_info=True)
            return {
                "status": "unavailable",
                "pz_count": 0,
                "by_putaway_status": {},
                "by_receiving_status": {},
                "open_putaway_delivery_ids": [],
                "open_pz": [],
            }

        by_putaway: dict[str, int] = {}
        by_receiving: dict[str, int] = {}
        open_putaway_delivery_ids: list[int] = []
        open_pz: list[dict[str, Any]] = []
        for r in rows:
            ps = str(r["putaway_status"] or "NOT_STARTED").strip().upper()
            rs = str(r["receiving_status"] or "NEW").strip().upper()
            by_putaway[ps] = by_putaway.get(ps, 0) + 1
            by_receiving[rs] = by_receiving.get(rs, 0) + 1
            if ps != "DONE" and rs == "DONE":
                if r["delivery_id"] is not None:
                    open_putaway_delivery_ids.append(int(r["delivery_id"]))
                open_pz.append(
                    {
                        "id": int(r["id"]),
                        "delivery_id": int(r["delivery_id"]) if r["delivery_id"] is not None else None,
                        "receiving_status": rs,
                        "putaway_status": ps,
                    }
                )
        return {
            "status": "ok",
            "pz_count": len(rows),
            "by_putaway_status": by_putaway,
            "by_receiving_status": by_receiving,
            "open_putaway_delivery_ids": sorted(set(open_putaway_delivery_ids)),
            "open_pz": open_pz,
        }

    def stub_summary(self, db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, Any]:
        return self.warehouse_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


class InventoryReadAdapter:
    def warehouse_summary(
        self, db: Session, *, tenant_id: int, warehouse_id: int
    ) -> dict[str, Any]:
        try:
            row = db.execute(
                text(
                    """
                    SELECT COUNT(*) AS row_count,
                           COALESCE(SUM(quantity), 0) AS total_qty
                    FROM inventory
                    WHERE tenant_id = :tenant_id
                      AND warehouse_id = :warehouse_id
                    """
                ),
                {"tenant_id": int(tenant_id), "warehouse_id": int(warehouse_id)},
            ).mappings().first()
        except Exception:
            logger.debug("inventory summary unavailable", exc_info=True)
            return {"status": "unavailable", "row_count": 0, "total_qty": 0.0}
        return {
            "status": "ok",
            "row_count": int(row["row_count"] or 0) if row else 0,
            "total_qty": float(row["total_qty"] or 0) if row else 0.0,
        }

    def stub_summary(self, db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, Any]:
        return self.warehouse_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


class RecoveryReadAdapter:
    """Open braki / issue tasks — counts and id/product refs only (not full recovery state)."""

    def warehouse_summary(
        self, db: Session, *, tenant_id: int, warehouse_id: int
    ) -> dict[str, Any]:
        import json

        open_issue = 0
        open_ops = 0
        sample_order_ids: list[int] = []
        # order_id → product_ids from missing_items (references for unlock overlap).
        shortage_by_order: dict[int, set[int]] = {}
        try:
            open_issue = int(
                db.execute(
                    text(
                        """
                        SELECT COUNT(*) AS c
                        FROM order_issue_tasks
                        WHERE tenant_id = :tenant_id
                          AND warehouse_id = :warehouse_id
                          AND UPPER(COALESCE(status, '')) IN
                              ('OPEN', 'IN_PROGRESS', 'WAITING_RECOVERY')
                        """
                    ),
                    {"tenant_id": int(tenant_id), "warehouse_id": int(warehouse_id)},
                ).scalar()
                or 0
            )
            rows = db.execute(
                text(
                    """
                    SELECT order_id, missing_items
                    FROM order_issue_tasks
                    WHERE tenant_id = :tenant_id
                      AND warehouse_id = :warehouse_id
                      AND UPPER(COALESCE(status, '')) IN
                          ('OPEN', 'IN_PROGRESS', 'WAITING_RECOVERY')
                    ORDER BY id ASC
                    LIMIT 100
                    """
                ),
                {"tenant_id": int(tenant_id), "warehouse_id": int(warehouse_id)},
            ).mappings()
            for r in rows:
                if r["order_id"] is None:
                    continue
                oid = int(r["order_id"])
                sample_order_ids.append(oid)
                pids = shortage_by_order.setdefault(oid, set())
                try:
                    missing = json.loads(r["missing_items"] or "[]")
                    if isinstance(missing, list):
                        for m in missing:
                            if isinstance(m, dict) and m.get("product_id") is not None:
                                pids.add(int(m["product_id"]))
                except Exception:
                    pass
            sample_order_ids = list(dict.fromkeys(sample_order_ids))
        except Exception:
            logger.debug("order_issue_tasks summary unavailable", exc_info=True)

        try:
            open_ops = int(
                db.execute(
                    text(
                        """
                        SELECT COUNT(*) AS c
                        FROM wms_operational_tasks
                        WHERE tenant_id = :tenant_id
                          AND warehouse_id = :warehouse_id
                          AND UPPER(COALESCE(task_type, '')) IN
                              ('SHORTAGE_DECISION', 'SHORTAGE_RECOLLECT', 'WAITING_SUPPLY', 'RELOCATION')
                          AND UPPER(COALESCE(status, '')) IN
                              ('OPEN', 'IN_PROGRESS', 'PENDING', 'ASSIGNED')
                        """
                    ),
                    {"tenant_id": int(tenant_id), "warehouse_id": int(warehouse_id)},
                ).scalar()
                or 0
            )
        except Exception:
            logger.debug("wms_operational_tasks summary unavailable", exc_info=True)

        shortage_links = [
            {"order_id": oid, "product_ids": sorted(pids)}
            for oid, pids in sorted(shortage_by_order.items())
        ]
        return {
            "status": "ok",
            "open_issue_task_count": open_issue,
            "open_operational_task_count": open_ops,
            "sample_order_ids": sample_order_ids,
            "shortage_links": shortage_links,
        }

    def stub_summary(self, db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, Any]:
        return self.warehouse_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


class SlottingReadAdapter:
    def warehouse_summary(
        self, db: Session, *, tenant_id: int, warehouse_id: int
    ) -> dict[str, Any]:
        try:
            n = int(
                db.execute(
                    text(
                        """
                        SELECT COUNT(DISTINCT product_id) AS c
                        FROM product_warehouse_slotting
                        WHERE tenant_id = :tenant_id
                          AND warehouse_id = :warehouse_id
                        """
                    ),
                    {"tenant_id": int(tenant_id), "warehouse_id": int(warehouse_id)},
                ).scalar()
                or 0
            )
            id_rows = db.execute(
                text(
                    """
                    SELECT DISTINCT product_id
                    FROM product_warehouse_slotting
                    WHERE tenant_id = :tenant_id
                      AND warehouse_id = :warehouse_id
                    ORDER BY product_id ASC
                    LIMIT 2000
                    """
                ),
                {"tenant_id": int(tenant_id), "warehouse_id": int(warehouse_id)},
            ).mappings()
            slotted_ids = [int(r["product_id"]) for r in id_rows if r["product_id"] is not None]
        except Exception:
            logger.debug("slotting summary unavailable", exc_info=True)
            return {
                "status": "unavailable",
                "slotted_product_count": 0,
                "slotted_product_ids": [],
            }
        return {
            "status": "ok",
            "slotted_product_count": n,
            "slotted_product_ids": slotted_ids,
        }

    def stub_summary(self, db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, Any]:
        return self.warehouse_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


class FitCapacityReadAdapter:
    """Location occupancy aggregates + DOCK (cross-dock) hints — cached columns only."""

    def warehouse_summary(
        self, db: Session, *, tenant_id: int, warehouse_id: int
    ) -> dict[str, Any]:
        try:
            row = db.execute(
                text(
                    """
                    SELECT
                      COUNT(*) AS location_count,
                      SUM(CASE WHEN UPPER(COALESCE(location_type, '')) = 'DOCK' THEN 1 ELSE 0 END)
                        AS dock_location_count,
                      COALESCE(SUM(occupied_volume_dm3), 0) AS occupied_volume_dm3,
                      COALESCE(AVG(capacity_utilization_percent), 0) AS avg_utilization_percent
                    FROM locations
                    WHERE warehouse_id = :warehouse_id
                      AND COALESCE(is_active, 1) = 1
                    """
                ),
                {"warehouse_id": int(warehouse_id)},
            ).mappings().first()
            dock_util = db.execute(
                text(
                    """
                    SELECT COALESCE(AVG(capacity_utilization_percent), 0) AS avg_dock_util
                    FROM locations
                    WHERE warehouse_id = :warehouse_id
                      AND COALESCE(is_active, 1) = 1
                      AND UPPER(COALESCE(location_type, '')) = 'DOCK'
                    """
                ),
                {"warehouse_id": int(warehouse_id)},
            ).scalar()
        except Exception:
            logger.debug("capacity summary unavailable", exc_info=True)
            return {
                "status": "unavailable",
                "location_count": 0,
                "dock_location_count": 0,
                "dock_has_capacity_hint": False,
                "occupied_volume_dm3": 0.0,
                "avg_utilization_percent": 0.0,
            }

        dock_n = int((row or {}).get("dock_location_count") or 0)
        avg_dock = float(dock_util or 0)
        return {
            "status": "ok",
            "location_count": int((row or {}).get("location_count") or 0),
            "dock_location_count": dock_n,
            # Hint only: DOCK exists and average util under 90% → room may be available.
            "dock_has_capacity_hint": bool(dock_n > 0 and avg_dock < 90.0),
            "occupied_volume_dm3": float((row or {}).get("occupied_volume_dm3") or 0),
            "avg_utilization_percent": float((row or {}).get("avg_utilization_percent") or 0),
            "avg_dock_utilization_percent": avg_dock,
        }

    def stub_summary(self, db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, Any]:
        return self.warehouse_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


class WarehouseGraphReadAdapter:
    def warehouse_summary(
        self, db: Session, *, tenant_id: int, warehouse_id: int
    ) -> dict[str, Any]:
        # Informational only — graph engine stays SSOT elsewhere.
        _ = (db, tenant_id, warehouse_id)
        return {"status": "ok", "detail": "warehouse graph SSOT — used later for travel costs"}

    def stub_summary(self, db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, Any]:
        return self.warehouse_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


class WmsTerminalReadAdapter:
    def warehouse_summary(
        self, db: Session, *, tenant_id: int, warehouse_id: int
    ) -> dict[str, Any]:
        try:
            n = int(
                db.execute(
                    text(
                        """
                        SELECT COUNT(*) AS c
                        FROM wms_operation_sessions
                        WHERE tenant_id = :tenant_id
                          AND warehouse_id = :warehouse_id
                          AND UPPER(COALESCE(status, '')) IN ('ACTIVE', 'OPEN', 'IN_PROGRESS')
                        """
                    ),
                    {"tenant_id": int(tenant_id), "warehouse_id": int(warehouse_id)},
                ).scalar()
                or 0
            )
            return {"status": "ok", "active_session_count": n}
        except Exception:
            return {"status": "unavailable", "active_session_count": 0}

    def stub_summary(self, db: Session, *, tenant_id: int, warehouse_id: int) -> dict[str, Any]:
        return self.warehouse_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@dataclass
class SupplyFlowReadBundle:
    """Facade used by the engine — all reads go through SSOT adapters."""

    deliveries: InboundDeliveryReadAdapter
    pz_receiving: PzReceivingReadAdapter
    putaway: PutawayReadAdapter
    inventory: InventoryReadAdapter
    recovery: RecoveryReadAdapter
    slotting: SlottingReadAdapter
    fit_capacity: FitCapacityReadAdapter
    warehouse_graph: WarehouseGraphReadAdapter
    wms_terminal: WmsTerminalReadAdapter


def build_default_read_bundle() -> SupplyFlowReadBundle:
    return SupplyFlowReadBundle(
        deliveries=InboundDeliveryReadAdapter(),
        pz_receiving=PzReceivingReadAdapter(),
        putaway=PutawayReadAdapter(),
        inventory=InventoryReadAdapter(),
        recovery=RecoveryReadAdapter(),
        slotting=SlottingReadAdapter(),
        fit_capacity=FitCapacityReadAdapter(),
        warehouse_graph=WarehouseGraphReadAdapter(),
        wms_terminal=WmsTerminalReadAdapter(),
    )
