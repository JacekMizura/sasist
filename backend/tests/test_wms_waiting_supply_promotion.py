"""WAITING_SUPPLY promotion after inbound (Phase 4)."""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.wms_operational_task import (
    STATUS_OPEN,
    TASK_RELOCATION,
    TASK_WAITING_SUPPLY,
)
from backend.services.wms_waiting_supply_promotion import (
    INBOUND_CARRIER,
    INBOUND_STORAGE,
    InboundProductReceipt,
    _consume_waiting_cover,
    _event_processed,
    promote_waiting_supply_for_product,
    promote_waiting_supply_tasks,
)


def _waiting_task(refs, *, processed=None):
    payload = {"refs": refs, "processed_inbound_ids": processed or []}
    return SimpleNamespace(
        id=11,
        tenant_id=1,
        warehouse_id=1,
        product_id=55,
        task_type=TASK_WAITING_SUPPLY,
        status=STATUS_OPEN,
        quantity_required=sum(float(r["qty"]) for r in refs),
        quantity_done=0.0,
        payload_json=json.dumps(payload),
        updated_at=None,
        group_key="waiting:wh:1:prod:55",
    )


class IdempotencyTests(unittest.TestCase):
    def test_event_processed(self):
        p = {"processed_inbound_ids": ["evt-1"]}
        self.assertTrue(_event_processed(p, "evt-1"))
        self.assertFalse(_event_processed(p, "evt-2"))


class FullPromotionTests(unittest.TestCase):
    def test_full_cover_creates_recollect_path(self):
        refs = [{"order_id": 100, "order_item_id": 10, "qty": 5.0}]
        task = _waiting_task(refs)
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.side_effect = [
            task,
            None,
        ]

        order = SimpleNamespace(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            items=[
                SimpleNamespace(
                    id=10,
                    product_id=55,
                    parent_bundle_order_item_id=None,
                    metadata_json=json.dumps(
                        {"oms_waiting_for_stock": True, "oms_waiting_missing_qty": 5.0}
                    ),
                )
            ],
            picking_zones=[],
        )
        db.query.return_value.options.return_value.filter.return_value.first.return_value = order

        with (
            patch(
                "backend.services.wms_waiting_supply_promotion._consume_waiting_cover",
                return_value=5.0,
            ) as consume,
            patch(
                "backend.services.wms_waiting_supply_promotion.recalculate_order_shortage_state"
            ),
            patch(
                "backend.services.wms_waiting_supply_promotion.recompute_waiting_supply_for_product"
            ),
            patch(
                "backend.services.wms_waiting_supply_promotion.merge_relocation_task",
            ) as merge_reloc,
        ):
            res = promote_waiting_supply_for_product(
                db,
                tenant_id=1,
                warehouse_id=1,
                product_id=55,
                inbound_qty=5.0,
                source_event_id="pz_accept:9",
                inbound_mode=INBOUND_STORAGE,
            )
        self.assertEqual(res.promoted_qty, 5.0)
        consume.assert_called_once()
        merge_reloc.assert_not_called()

    def test_carrier_inbound_creates_relocation(self):
        refs = [{"order_id": 100, "order_item_id": 10, "qty": 3.0}]
        task = _waiting_task(refs)
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.side_effect = [
            task,
            None,
        ]
        order = SimpleNamespace(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="Z-100",
            items=[SimpleNamespace(id=10, product_id=55, parent_bundle_order_item_id=None, metadata_json=None)],
            picking_zones=[],
        )
        db.query.return_value.options.return_value.filter.return_value.first.return_value = order

        with (
            patch(
                "backend.services.wms_waiting_supply_promotion._consume_waiting_cover",
                return_value=3.0,
            ),
            patch(
                "backend.services.wms_waiting_supply_promotion.recalculate_order_shortage_state"
            ),
            patch(
                "backend.services.wms_waiting_supply_promotion.recompute_waiting_supply_for_product"
            ),
            patch(
                "backend.services.wms_waiting_supply_promotion.merge_relocation_task",
                return_value=SimpleNamespace(id=99, task_type=TASK_RELOCATION),
            ) as merge_reloc,
        ):
            res = promote_waiting_supply_for_product(
                db,
                tenant_id=1,
                warehouse_id=1,
                product_id=55,
                inbound_qty=3.0,
                source_event_id="recv:1",
                inbound_mode=INBOUND_CARRIER,
                carrier_id=12,
                carrier_label="TOTE-9",
            )
        self.assertEqual(res.relocation_qty, 3.0)
        merge_reloc.assert_called_once()

    def test_partial_promotion(self):
        refs = [{"order_id": 100, "order_item_id": 10, "qty": 50.0}]
        task = _waiting_task(refs)
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.side_effect = [
            task,
            task,
        ]
        order = SimpleNamespace(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            items=[SimpleNamespace(id=10, product_id=55, parent_bundle_order_item_id=None, metadata_json=None)],
            picking_zones=[],
        )
        db.query.return_value.options.return_value.filter.return_value.first.return_value = order

        with (
            patch(
                "backend.services.wms_waiting_supply_promotion._consume_waiting_cover",
                return_value=20.0,
            ),
            patch(
                "backend.services.wms_waiting_supply_promotion.recalculate_order_shortage_state"
            ),
            patch(
                "backend.services.wms_waiting_supply_promotion.recompute_waiting_supply_for_product"
            ),
            patch("backend.services.wms_waiting_supply_promotion.merge_relocation_task"),
        ):
            res = promote_waiting_supply_for_product(
                db,
                tenant_id=1,
                warehouse_id=1,
                product_id=55,
                inbound_qty=20.0,
                source_event_id="partial:1",
                inbound_mode=INBOUND_STORAGE,
            )
        self.assertEqual(res.promoted_qty, 20.0)

    def test_idempotent_skip(self):
        refs = [{"order_id": 1, "order_item_id": 2, "qty": 1.0}]
        task = _waiting_task(refs, processed=["evt:1"])
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = task
        res = promote_waiting_supply_for_product(
            db,
            tenant_id=1,
            warehouse_id=1,
            product_id=55,
            inbound_qty=10.0,
            source_event_id="evt:1",
            inbound_mode=INBOUND_STORAGE,
        )
        self.assertTrue(res.skipped_idempotent)
        self.assertEqual(res.promoted_qty, 0.0)


class BatchPromotionTests(unittest.TestCase):
    def test_aggregate_by_product(self):
        db = MagicMock()
        with (
            patch(
                "backend.services.wms_operational_task_service.dual_write_enabled",
                return_value=True,
            ),
            patch(
                "backend.services.wms_waiting_supply_promotion.promote_waiting_supply_for_product",
                return_value=SimpleNamespace(product_id=55, promoted_qty=7.0),
            ) as single,
        ):
            promote_waiting_supply_tasks(
                db,
                tenant_id=1,
                warehouse_id=1,
                receipts=[
                    InboundProductReceipt(product_id=55, qty=3.0),
                    InboundProductReceipt(product_id=55, qty=4.0),
                ],
                source_event_id="batch:1",
            )
        single.assert_called_once()
        self.assertEqual(single.call_args.kwargs["inbound_qty"], 7.0)


if __name__ == "__main__":
    unittest.main()
