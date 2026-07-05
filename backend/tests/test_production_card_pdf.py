"""Regression: production card PDF endpoint must render template and return application/pdf."""

from __future__ import annotations

from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.auth.deps import get_current_user
from backend.main import app
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.product_composition import (
    ProductComposition,
    ProductCompositionLine,
    ProductionBatch,
    ProductionBatchLine,
)
from backend.models.stock_reservation import StockReservation
from backend.models.warehouse import Warehouse
from backend.platform_state import mark_tier0_ready
from backend.schemas.production_batch import BatchAggregatedPickLineRead, ProductionBatchPickPlanRead
from backend.services.production_execution.production_card_pdf_service import (
    TEMPLATES_DIR,
    build_batch_production_card_html,
    generate_batch_production_card_pdf_bytes,
)
from backend.services.structure_report_pdf_service import BACKEND_ROOT
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


@pytest.fixture
def card_db(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))

    for model in (
        Warehouse,
        Location,
        Product,
        Inventory,
        StockReservation,
        ProductComposition,
        ProductCompositionLine,
        ProductionBatch,
        ProductionBatchLine,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    monkeypatch.setattr(
        "backend.services.commercial_availability_service._total_saleable_issued_by_product",
        lambda _db, **_kw: {},
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service.list_tenant_warehouse_ids",
        lambda *_a, **_k: {1},
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_card_pdf_service.build_batch_pick_plan",
        lambda _db, *, tenant_id, batch_id: ProductionBatchPickPlanRead(
            batch_id=int(batch_id),
            warehouse_id=1,
            aggregated_components=[
                BatchAggregatedPickLineRead(
                    component_product_id=10,
                    product_name="Składnik",
                    product_sku="CMP",
                    required=20.0,
                    available=100.0,
                    missing=0.0,
                )
            ],
        ),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_card_pdf_service.build_collection_location_options",
        lambda *_a, **_k: ([{"location_code": "A1-01", "available_qty": 100.0, "is_preferred": True, "lots": []}], 100.0),
    )

    wh = Warehouse(id=1, tenant_id=1, name="Magazyn testowy", requires_putaway=True)
    comp_product = Product(id=10, tenant_id=1, name="Składnik", sku="CMP", ean="5900000000001")
    fg = Product(id=20, tenant_id=1, name="Wyrob gotowy", sku="FG")
    loc = Location(
        id=1,
        warehouse_id=1,
        name="A1-01",
        type="pick",
        location_type="NORMAL",
        is_active=True,
    )
    recipe = ProductComposition(
        id=1,
        tenant_id=1,
        product_id=20,
        composition_mode="manufacturing",
        name="Receptura test",
        version="1",
        is_active=True,
    )
    recipe_line = ProductCompositionLine(
        id=1,
        composition_id=1,
        component_product_id=10,
        quantity=2.0,
        waste_percent=0.0,
        sort_order=0,
    )
    batch = ProductionBatch(
        id=5,
        tenant_id=1,
        warehouse_id=1,
        number="B-00005",
        status="planned",
        created_by_user_id=None,
    )
    batch_line = ProductionBatchLine(
        id=50,
        batch_id=5,
        product_id=20,
        composition_id=1,
        planned_quantity=10,
        completed_quantity=0,
        status="planned",
    )
    inv = Inventory(
        id=100,
        tenant_id=1,
        warehouse_id=1,
        location_id=1,
        product_id=10,
        quantity=100.0,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    db.add_all([wh, comp_product, fg, loc, recipe, recipe_line, batch, batch_line, inv])
    db.commit()
    yield db
    db.close()


def test_production_card_template_path():
    assert TEMPLATES_DIR == BACKEND_ROOT / "templates"
    assert (TEMPLATES_DIR / "production_card.html.j2").is_file()


def test_wrong_nested_backend_root_would_miss_template():
    wrong_dir = Path(__file__).resolve().parents[1] / "services" / "templates"
    assert wrong_dir != TEMPLATES_DIR
    assert not (wrong_dir / "production_card.html.j2").exists()


def test_build_batch_production_card_html_renders(card_db):
    html = build_batch_production_card_html(card_db, tenant_id=1, batch_id=5)
    assert "B-00005" in html
    assert "Składnik" in html or "CMP" in html


def test_generate_batch_production_card_pdf_bytes(card_db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.production_execution.production_card_pdf_service.html_document_to_pdf_bytes",
        lambda _html: b"%PDF-1.4 production-card-test",
    )
    pdf = generate_batch_production_card_pdf_bytes(card_db, tenant_id=1, batch_id=5)
    assert pdf.startswith(b"%PDF")


def test_api_batch_production_card_pdf_endpoint():
    mark_tier0_ready()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1,
        login="test",
        role="super_admin",
    )
    try:
        with (
            patch("backend.api.production._gate_production_batch"),
            patch(
                "backend.api.production.generate_batch_production_card_pdf_bytes",
                return_value=b"%PDF-1.4 api-production-card",
            ),
        ):
            client = TestClient(app, raise_server_exceptions=True)
            resp = client.get(
                "/api/production/batches/5/production-card.pdf",
                params={"tenant_id": 1, "warehouse_id": 1},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 200, resp.text[:500]
    assert resp.headers.get("content-type", "").startswith("application/pdf")
    assert resp.content.startswith(b"%PDF")
