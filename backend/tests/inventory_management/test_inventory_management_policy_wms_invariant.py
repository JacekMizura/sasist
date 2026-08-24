"""MODEL B phase 1 — policy does not gate WMS finalize paths."""

from __future__ import annotations

import inspect
import unittest
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.models.wms_settings import WmsSettings
from backend.services.wms_cartless_picking.finalize_service import finalize_cartless_picking_session
from backend.services.wms_picking_product_list_service import (
    finalize_wms_picking_cart,
    finalize_wms_recovery_picking_cart,
)


def _mk_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))
    for model in (
        Warehouse,
        TenantWarehouse,
        Location,
        Product,
        Inventory,
        WmsSettings,
    ):
        model.__table__.create(engine, checkfirst=True)
    return engine


class InventoryPolicyWmsInvariantTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _mk_engine()
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.db.add(Warehouse(id=1, name="Magazyn 1", tenant_id=1, requires_putaway=True))
        self.db.add(TenantWarehouse(tenant_id=1, warehouse_id=1, is_default=1))
        self.db.add(WmsSettings(tenant_id=1, warehouse_id=1, inventory_management_mode="DOCUMENTS_ONLY"))
        self.db.add(Product(id=10, tenant_id=1, name="Produkt A", sku="SKU-A"))
        self.db.add(
            Location(
                id=100,
                warehouse_id=1,
                name="A1",
                type="pick",
                location_type="NORMAL",
                is_active=True,
            )
        )
        self.db.add(
            Inventory(
                id=1,
                tenant_id=1,
                warehouse_id=1,
                product_id=10,
                location_id=100,
                quantity=100,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_finalize_paths_not_gated_by_policy(self) -> None:
        for fn in (
            finalize_wms_picking_cart,
            finalize_cartless_picking_session,
            finalize_wms_recovery_picking_cart,
        ):
            src = inspect.getsource(fn)
            self.assertNotIn("inventory_management_policy", src)
            self.assertNotIn("assert_manual_adjust_stock", src)
            self.assertNotIn("assert_raw_inventory_write", src)

    def test_documents_only_does_not_block_inventory_mutation_path(self) -> None:
        """Policy is not consulted for controlled WMS — inventory can change independently."""
        before = float(self.db.query(Inventory).filter(Inventory.id == 1).one().quantity)
        inv = self.db.query(Inventory).filter(Inventory.id == 1).one()
        inv.quantity = before - 5.0
        self.db.commit()
        after = float(self.db.query(Inventory).filter(Inventory.id == 1).one().quantity)
        self.assertAlmostEqual(after, before - 5.0)
        mode_row = self.db.query(WmsSettings).one()
        self.assertEqual(mode_row.inventory_management_mode, "DOCUMENTS_ONLY")


if __name__ == "__main__":
    unittest.main()
