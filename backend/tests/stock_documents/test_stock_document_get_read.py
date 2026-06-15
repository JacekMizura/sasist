"""Regression: GET /api/stock-documents/{id} read path (projection ↔ DTO contract)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.main import app
from backend.models.stock_document import StockDocument
from backend.schemas.stock_document import StockDocumentRead
from backend.services.stock_document_service import build_stock_document_read, get_stock_document_read


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def _load_doc(db: Session, doc_id: int) -> StockDocument:
    doc = db.query(StockDocument).filter(StockDocument.id == doc_id).first()
    assert doc is not None, f"fixture doc id={doc_id} missing in test.db"
    return doc


@pytest.mark.parametrize(
    ("doc_id", "expected_type"),
    [
        (3, "PZ"),
        (4, "WZ"),
        (2, "MM"),
    ],
)
def test_get_stock_document_read_service(db: Session, doc_id: int, expected_type: str) -> None:
    doc = _load_doc(db, doc_id)
    assert str(doc.document_type or "").upper() == expected_type

    read = get_stock_document_read(db, int(doc.tenant_id), int(doc.id))
    assert read is not None
    assert isinstance(read, StockDocumentRead)
    assert read.document_type == expected_type
    assert read.id == doc_id

    for item in read.items:
        assert item.line_remaining_qty >= 0.0
        assert item.line_commercial_available_qty >= 0.0


@pytest.mark.parametrize(
    ("doc_id", "expected_type"),
    [
        (3, "PZ"),
        (4, "WZ"),
        (2, "MM"),
    ],
)
def test_build_stock_document_read_pz_sales_block_kwargs(db: Session, doc_id: int, expected_type: str) -> None:
    """Direct builder — catches projection kwargs not accepted by _item_row_to_read."""
    doc = _load_doc(db, doc_id)
    read = build_stock_document_read(db, doc)
    assert read.document_type == expected_type


@pytest.mark.parametrize(
    ("doc_id", "expected_type"),
    [
        (3, "PZ"),
        (4, "WZ"),
        (2, "MM"),
    ],
)
def test_get_stock_document_api(client: TestClient, doc_id: int, expected_type: str) -> None:
    response = client.get(f"/api/stock-documents/{doc_id}", params={"tenant_id": 1})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["document_type"] == expected_type
    assert body["id"] == doc_id
    for item in body.get("items") or []:
        assert "line_remaining_qty" in item
        assert "line_commercial_available_qty" in item
