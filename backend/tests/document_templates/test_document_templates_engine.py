"""Tests for Document Templates engine — Twig templates, layered architecture."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.db.document_template_schema import ensure_document_template_schema
from backend.document_templates.constants import DOCUMENT_KINDS
from backend.document_templates.models import DocumentTemplateKind
from backend.document_templates.render.helper_registry import TwigHelperRegistry
from backend.document_templates.render.template_renderer import render
from backend.document_templates.services.variable_tree_service import build_variable_tree_for_kind


@pytest.fixture()
def doc_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    ensure_document_template_schema(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def test_catalog_seeded(doc_db):
    kinds = doc_db.query(DocumentTemplateKind).all()
    assert len(kinds) == len(DOCUMENT_KINDS)
    codes = {k.code for k in kinds}
    assert "production_card" in codes


def test_production_card_starter_exists(doc_db):
    from backend.document_templates.models import DocumentTemplateStarter

    kind = doc_db.query(DocumentTemplateKind).filter(DocumentTemplateKind.code == "production_card").first()
    assert kind is not None
    starter = (
        doc_db.query(DocumentTemplateStarter)
        .filter(DocumentTemplateStarter.kind_id == int(kind.id), DocumentTemplateStarter.code == "default")
        .first()
    )
    assert starter is not None
    assert "Karta produkcyjna" in starter.twig_content
    assert "{%" in starter.twig_content
    assert "{{" in starter.twig_content


def test_render_template_interface():
    html = render(
        "<div>{{ company.name }} · {{ money(12.5) }} · {{ barcode('123') }}</div>",
        {"company": {"name": "Test Sp. z o.o."}},
    )
    assert "Test Sp. z o.o." in html
    assert "12,50 PLN" in html


def test_helper_registry_registers_custom_function():
    reg = TwigHelperRegistry()
    reg.register_function("wrap", lambda value: f"[{value}]")
    assert reg.functions()["wrap"]("A") == "[A]"


def test_variable_tree_has_production_nodes():
    tree = build_variable_tree_for_kind("production_card")
    assert any(node.get("label") == "Produkcja" for node in tree)
    production = next(n for n in tree if n.get("label") == "Produkcja")
    inserts = [c.get("insert") for c in production.get("children", []) if c.get("insert")]
    assert any("job_number" in (ins or "") for ins in inserts)


def test_resolve_starter_template_content(doc_db):
    from backend.document_templates.services.template_service import resolve_bound_template_content

    content, template_id = resolve_bound_template_content(doc_db, tenant_id=1, kind_code="production_card")
    assert template_id is not None
    assert "components" in content or "Karta" in content or "<" in content
