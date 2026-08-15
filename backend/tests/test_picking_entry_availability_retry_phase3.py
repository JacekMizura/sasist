"""
Phase 3: FG availability → awaiting revalidation → return to picking.

  python -m pytest backend/tests/test_picking_entry_availability_retry_phase3.py -q
"""

from __future__ import annotations

import json
import os
import unittest
from datetime import date
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.models.production import (
    ProductionOrder,
    ProductionOrderLineSnapshot,
    ProductionOrderSourceItem,
)
from backend.models.stock_reservation import StockReservation
from backend.models.warehouse import Warehouse
from backend.services.picking_entry_availability_retry_service import (
    on_fg_availability_increased,
    revalidate_awaiting_order_after_fg_increase,
)
from backend.services.picking_entry_gate_service import (
    MODE_ACTIVE,
    META_RETURN_PICKING_STATUS_ID,
    run_picking_entry_gate,
)
from backend.services.picking_entry_readiness_service import (
    ORDER_BLOCKED_MIXED,
    ORDER_READY_FOR_PICKING,
)
from backend.services.reservations.constants import (
    RESERVATION_KIND_SALES_ORDER,
    RESERVATION_STATUS_RESERVED,
)
from backend.services.sales_order_fg_reservation_service import reserved_qty_for_order_product
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


def _engine():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))
    for m in (
        Warehouse,
        Location,
        OrderUiStatus,
        Product,
        Inventory,
        StockReservation,
        Order,
        OrderItem,
        PickingConfig,
        ProductComposition,
        ProductCompositionLine,
        ProductionOrder,
        ProductionOrderSourceItem,
        ProductionOrderLineSnapshot,
    ):
        m.__table__.create(eng, checkfirst=True)
    return eng


def _fake_apply(db, *, order, sub_status_id, operator_user_id=None, **_kw):
    order.order_ui_status_id = sub_status_id
    db.add(order)
    return {"status_updated": True}


class Phase3FgAvailabilityRetryTests(unittest.TestCase):
    def setUp(self):
        self.engine = _engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True))
        for sid, name in (
            (1, "Do zbierania"),
            (2, "Oczekuje na produkcję"),
            (3, "Produkcja"),
            (4, "Po produkcji"),
            (5, "Brak komponentów"),
        ):
            self.db.add(
                OrderUiStatus(
                    id=sid,
                    tenant_id=1,
                    warehouse_id=1,
                    name=name,
                    color="#000",
                    main_group="NEW",
                )
            )
        self.db.add(
            Location(
                id=1,
                warehouse_id=1,
                name="A1",
                type="pick",
                location_type="NORMAL",
                is_active=True,
            )
        )
        self.db.add(
            Location(
                id=2,
                warehouse_id=1,
                name="DOCK-IN",
                type="dock",
                location_type="DOCK",
                is_active=True,
            )
        )
        self.db.add(Product(id=100, tenant_id=1, name="A-mfg", sku="A"))
        self.db.add(Product(id=200, tenant_id=1, name="B-reg", sku="B"))
        self.db.add(Product(id=300, tenant_id=1, name="Comp", sku="C"))
        self.db.add(
            PickingConfig(
                id=1,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                target_status_id=1,
                strategy="locations",
                pick_unit="products",
                order_sort="date",
                single_mode="bulk",
                multi_mode="bulk",
                is_production_mode=False,
                is_active=True,
            )
        )
        self.db.add(
            PickingConfig(
                id=2,
                tenant_id=1,
                warehouse_id=1,
                name="Prod",
                source_status_id=3,
                target_status_id=4,
                strategy="locations",
                pick_unit="products",
                order_sort="date",
                single_mode="bulk",
                multi_mode="bulk",
                is_production_mode=True,
                is_active=True,
                status_after_production_id=4,
                status_on_component_shortage_id=5,
                status_awaiting_production_id=2,
                finished_goods_buffer_location_id=2,
                production_order_trigger_scope="SINGLE_ELEMENT",
                production_execution_method="WMS",
                after_production_action="STATUS_ONLY",
            )
        )
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _bom(self, fg_id: int = 100):
        c = ProductComposition(
            id=fg_id,
            tenant_id=1,
            product_id=fg_id,
            composition_mode="manufacturing",
            is_active=True,
            name="BOM",
        )
        self.db.add(c)
        self.db.flush()
        self.db.add(
            ProductCompositionLine(
                id=fg_id * 10,
                composition_id=int(c.id),
                component_product_id=300,
                quantity=1.0,
            )
        )

    def _inv(self, pid: int, qty: float, iid: int):
        existing = self.db.query(Inventory).filter(Inventory.id == iid).first()
        if existing is not None:
            existing.quantity = float(qty)
            self.db.add(existing)
            return
        self.db.add(
            Inventory(
                id=iid,
                tenant_id=1,
                warehouse_id=1,
                product_id=pid,
                location_id=1,
                quantity=float(qty),
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )

    def _order(self, oid: int, lines: list[tuple[int, float]], status_id: int = 1):
        o = Order(
            id=oid,
            tenant_id=1,
            warehouse_id=1,
            number=str(oid),
            status="NEW",
            order_ui_status_id=status_id,
            import_metadata_json=json.dumps({META_RETURN_PICKING_STATUS_ID: 1}),
        )
        self.db.add(o)
        self.db.flush()
        for i, (pid, qty) in enumerate(lines):
            self.db.add(
                OrderItem(id=oid * 100 + i, order_id=oid, product_id=pid, quantity=float(qty))
            )
        self.db.flush()
        return self.db.query(Order).filter(Order.id == oid).one()

    def _gate(self, order: Order):
        with patch.dict(os.environ, {"FEATURE_PICKING_ENTRY_READINESS_MODE": MODE_ACTIVE}):
            with patch(
                "backend.services.picking_entry_gate_service.record_domain_activity",
                return_value=None,
            ), patch(
                "backend.services.production_order_trigger.material_validation_service.apply_material_validation_to_orders_mo",
                return_value={},
            ), patch(
                "backend.services.production_order_trigger.trigger_service._snapshot_composition_lines",
                return_value=None,
            ), patch(
                "backend.services.production_order_trigger.trigger_service._next_order_number",
                return_value=f"MO/TEST/{order.id}",
            ), patch(
                "backend.services.production_order_trigger.material_validation_service.refresh_orders_mo_material_reservations",
                return_value={},
            ):
                return run_picking_entry_gate(
                    self.db,
                    order=order,
                    previous_status_id=None,
                    new_status_id=1,
                    force_mode=MODE_ACTIVE,
                )

    def _retry(self, product_ids: list[int], reason: str = "pz_receipt"):
        with patch.dict(os.environ, {"FEATURE_PICKING_ENTRY_READINESS_MODE": MODE_ACTIVE}):
            with patch(
                "backend.services.picking_entry_availability_retry_service.record_domain_activity",
                return_value=None,
            ), patch(
                "backend.services.order_panel_ui_status_service.apply_order_panel_ui_status",
                side_effect=_fake_apply,
            ), patch(
                "backend.services.production_order_service.cancel_production_order",
                return_value=None,
            ), patch(
                "backend.services.production_order_trigger.material_validation_service.refresh_orders_mo_material_reservations",
                return_value={},
            ):
                return on_fg_availability_increased(
                    self.db,
                    tenant_id=1,
                    warehouse_id=1,
                    product_ids=product_ids,
                    reason=reason,
                )

    def test_01_awaiting_a1_plus_pz_a1_returns_to_picking(self):
        self._bom(100)
        order = self._order(10, [(100, 1)])
        self.db.commit()
        self._gate(order)
        self.db.flush()
        order = self.db.query(Order).filter(Order.id == 10).one()
        self.assertEqual(int(order.order_ui_status_id), 2)
        self.assertEqual(self.db.query(ProductionOrderSourceItem).count(), 1)
        mo = self.db.query(ProductionOrder).one()
        self.assertAlmostEqual(float(mo.planned_quantity), 1.0, places=4)

        self._inv(100, 1, 1)
        self.db.flush()
        out = self._retry([100])
        self.db.flush()
        order = self.db.query(Order).filter(Order.id == 10).one()
        self.assertTrue(out.get("returned", 0) >= 1)
        self.assertEqual(int(order.order_ui_status_id), 1)
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=10, product_id=100),
            1.0,
            places=4,
        )
        active = (
            self.db.query(ProductionOrderSourceItem)
            .filter(ProductionOrderSourceItem.status != "cancelled")
            .count()
        )
        self.assertEqual(active, 0)

    def test_02_partial_pz_reduces_mo(self):
        self._bom(100)
        order = self._order(11, [(100, 5)])
        self.db.commit()
        self._gate(order)
        self.db.flush()
        mo = self.db.query(ProductionOrder).one()
        self.assertAlmostEqual(float(mo.planned_quantity), 5.0, places=4)

        self._inv(100, 3, 1)
        self.db.flush()
        out = self._retry([100])
        self.db.flush()
        order = self.db.query(Order).filter(Order.id == 11).one()
        self.assertEqual(int(order.order_ui_status_id), 2)  # still awaiting
        self.assertFalse(any(i.get("returned_to_picking") for i in out.get("items") or []))
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=11, product_id=100),
            3.0,
            places=4,
        )
        mo = self.db.query(ProductionOrder).one()
        self.assertAlmostEqual(float(mo.planned_quantity), 2.0, places=4)
        src = self.db.query(ProductionOrderSourceItem).filter(
            ProductionOrderSourceItem.order_id == 11
        ).one()
        self.assertAlmostEqual(float(src.requested_quantity), 2.0, places=4)

    def test_03_full_cover_cancels_source_and_returns(self):
        self._bom(100)
        order = self._order(12, [(100, 5)])
        self.db.commit()
        self._gate(order)
        self._inv(100, 5, 1)
        self.db.flush()
        self._retry([100])
        self.db.flush()
        order = self.db.query(Order).filter(Order.id == 12).one()
        self.assertEqual(int(order.order_ui_status_id), 1)
        self.assertEqual(
            self.db.query(ProductionOrderSourceItem)
            .filter(ProductionOrderSourceItem.status != "cancelled")
            .count(),
            0,
        )

    def test_04_collecting_mo_not_reduced(self):
        self._bom(100)
        order = self._order(13, [(100, 5)])
        self.db.commit()
        self._gate(order)
        mo = self.db.query(ProductionOrder).one()
        mo.status = "collecting"
        self.db.add(mo)
        self.db.flush()
        self._inv(100, 5, 1)
        self.db.flush()
        self._retry([100])
        self.db.flush()
        mo = self.db.query(ProductionOrder).one()
        self.assertAlmostEqual(float(mo.planned_quantity), 5.0, places=4)
        self.assertEqual(str(mo.status), "collecting")

    def test_05_in_progress_mo_not_reduced(self):
        self._bom(100)
        order = self._order(14, [(100, 5)])
        self.db.commit()
        self._gate(order)
        mo = self.db.query(ProductionOrder).one()
        mo.status = "in_progress"
        self.db.add(mo)
        self.db.flush()
        self._inv(100, 5, 1)
        self.db.flush()
        self._retry([100])
        self.db.flush()
        mo = self.db.query(ProductionOrder).one()
        self.assertAlmostEqual(float(mo.planned_quantity), 5.0, places=4)

    def test_06_blocked_mixed_no_return(self):
        self._bom(100)
        order = self._order(15, [(100, 2), (200, 4)])
        self.db.commit()
        res = self._gate(order)
        self.assertEqual(res.readiness.code, ORDER_BLOCKED_MIXED)
        self._inv(100, 2, 1)
        # B still missing
        self.db.flush()
        self._retry([100])
        self.db.flush()
        order = self.db.query(Order).filter(Order.id == 15).one()
        self.assertEqual(int(order.order_ui_status_id), 2)

    def test_07_mixed_then_b_appears_returns(self):
        self._bom(100)
        order = self._order(16, [(100, 2), (200, 4)])
        self.db.commit()
        self._gate(order)
        self._inv(100, 2, 1)
        self.db.flush()
        self._retry([100])
        self._inv(200, 4, 2)
        self.db.flush()
        out = self._retry([200])
        self.db.flush()
        order = self.db.query(Order).filter(Order.id == 16).one()
        self.assertTrue(out.get("returned", 0) >= 1)
        self.assertEqual(int(order.order_ui_status_id), 1)

    def test_08_two_orders_fg3_deterministic(self):
        self._bom(100)
        o1 = self._order(17, [(100, 2)])
        o2 = self._order(18, [(100, 2)])
        self.db.commit()
        self._gate(o1)
        self._gate(o2)
        self._inv(100, 3, 1)
        self.db.flush()
        self._retry([100])
        self.db.flush()
        r1 = reserved_qty_for_order_product(self.db, tenant_id=1, order_id=17, product_id=100)
        r2 = reserved_qty_for_order_product(self.db, tenant_id=1, order_id=18, product_id=100)
        self.assertAlmostEqual(r1 + r2, 3.0, places=4)
        self.assertAlmostEqual(r1, 2.0, places=4)
        self.assertAlmostEqual(r2, 1.0, places=4)
        # lower id first → order 17 returns; 18 still awaiting with remaining demand 1
        o1 = self.db.query(Order).filter(Order.id == 17).one()
        o2 = self.db.query(Order).filter(Order.id == 18).one()
        self.assertEqual(int(o1.order_ui_status_id), 1)
        self.assertEqual(int(o2.order_ui_status_id), 2)

    def test_09_repeated_notify_idempotent(self):
        self._bom(100)
        order = self._order(19, [(100, 1)])
        self.db.commit()
        self._gate(order)
        self._inv(100, 1, 1)
        self.db.flush()
        self._retry([100])
        self.db.flush()
        r1 = reserved_qty_for_order_product(self.db, tenant_id=1, order_id=19, product_id=100)
        out2 = self._retry([100])
        self.db.flush()
        r2 = reserved_qty_for_order_product(self.db, tenant_id=1, order_id=19, product_id=100)
        self.assertAlmostEqual(r1, r2, places=4)
        # second pass: order already left awaiting → skipped / no extra return
        self.assertEqual(out2.get("processed", 0), 0)

    def test_10_partial_then_full_from_existing_reservation(self):
        """A×7 with stock 5 → reserve 5 + MO 2; then +1 → reserve 6 + MO 1."""
        self._bom(100)
        order = self._order(20, [(100, 7)])
        self._inv(100, 5, 1)
        self.db.commit()
        self._gate(order)
        self.db.flush()
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=20, product_id=100),
            5.0,
            places=4,
        )
        mo = self.db.query(ProductionOrder).one()
        self.assertAlmostEqual(float(mo.planned_quantity), 2.0, places=4)

        inv = self.db.query(Inventory).filter(Inventory.id == 1).one()
        inv.quantity = 6.0
        self.db.add(inv)
        self.db.flush()
        self._retry([100])
        self.db.flush()
        self.assertAlmostEqual(
            reserved_qty_for_order_product(self.db, tenant_id=1, order_id=20, product_id=100),
            6.0,
            places=4,
        )
        mo = self.db.query(ProductionOrder).one()
        self.assertAlmostEqual(float(mo.planned_quantity), 1.0, places=4)


if __name__ == "__main__":
    unittest.main()
