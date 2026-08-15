"""assigned_user_id accepted on ProductionBatchCreateBody."""

from __future__ import annotations

from backend.schemas.production_batch import ProductionBatchCreateBody, ProductionBatchLineWrite


def test_create_body_accepts_assigned_user_id():
    body = ProductionBatchCreateBody(
        warehouse_id=1,
        assigned_user_id=12,
        lines=[ProductionBatchLineWrite(product_id=1, composition_id=2, planned_quantity=1)],
    )
    assert body.assigned_user_id == 12


def test_create_body_allows_omitted_assigned_user():
    body = ProductionBatchCreateBody(
        warehouse_id=1,
        lines=[ProductionBatchLineWrite(product_id=1, composition_id=2, planned_quantity=1)],
    )
    assert body.assigned_user_id is None
