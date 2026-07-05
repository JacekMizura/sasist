"""Regression: ERP collection/update must map ReservationError to ProductionBatchError (not HTTP 500)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backend.schemas.production_batch import BatchCollectionStateRead, BatchCollectionUpdateBody
from backend.services.production_batch_service import ProductionBatchError, update_collection_task
from backend.services.reservations.reservation_service import ReservationError


def test_update_collection_task_maps_reservation_error(monkeypatch):
    batch = SimpleNamespace(
        status="collecting",
        collection_state_json=(
            '{"tasks":[{"task_key":"10","component_product_id":10,"collected_qty":0,"required_qty":5}]}'
        ),
        materials_reserved=True,
        execution_interface="ERP",
        updated_at=None,
    )
    db = MagicMock()

    monkeypatch.setattr(
        "backend.services.production_batch_service._load_batch_entity",
        lambda _db, **kwargs: batch,
    )
    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.sync_production_reservation_from_collection_task",
        lambda *_a, **_k: (_ for _ in ()).throw(
            ReservationError("Wymagany podział rezerwacji.", code="split_required")
        ),
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service.get_collection_state",
        lambda _db, **kwargs: BatchCollectionStateRead(
            batch_id=kwargs["batch_id"],
            tasks=[],
            collected_count=0,
            total_count=0,
            progress_percent=0.0,
        ),
    )

    body = BatchCollectionUpdateBody(task_key="10", collected_qty=5, location_id=1)

    with pytest.raises(ProductionBatchError) as exc:
        update_collection_task(db, tenant_id=1, batch_id=99, body=body)

    assert exc.value.code == "split_required"
    assert "podział" in str(exc.value).lower()
