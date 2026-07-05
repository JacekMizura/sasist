"""Stabilization tests — validation/preview aligned with providers."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.db.document_template_schema import ensure_document_template_schema
from backend.document_templates.render.output_formats import DocumentOutputFormat
from backend.document_templates.services.context_schema_registry import fields_for_schema_key
from backend.document_templates.services.document_render_service import preview_document
from backend.document_templates.services.live_validation_service import validate_twig_live
from backend.models.tenant import Tenant

STARTERS_DIR = Path(__file__).resolve().parents[2] / "document_templates" / "starters"


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
    if db.query(Tenant).filter(Tenant.id == 1).first() is None:
        db.add(Tenant(id=1, name="Demo", company_name="Demo Sp. z o.o."))
        db.commit()
        ensure_document_template_schema(engine)
    try:
        yield db
    finally:
        db.close()


@pytest.mark.parametrize(
    ("kind_code", "schema_key", "starter_file"),
    [
        ("wz", "wz", "wz.twig"),
        ("production_report", "production_report", "production_report.twig"),
        ("production_card", "production_card", "production_card.twig"),
    ],
)
def test_starter_live_validation_matches_schema(doc_db, kind_code, schema_key, starter_file):
    twig = (STARTERS_DIR / starter_file).read_text(encoding="utf-8")
    fields = fields_for_schema_key(schema_key)
    issues = validate_twig_live(twig, known_fields=fields)
    assert issues == [], [f"{i.code}: {i.message}" for i in issues]


def test_wz_preview_html_and_pdf(doc_db):
    twig = (STARTERS_DIR / "wz.twig").read_text(encoding="utf-8")
    html = preview_document(doc_db, tenant_id=1, kind_code="wz", template=twig, context_mode="sample")
    assert "WZ" in str(html)
    pdf = preview_document(
        doc_db,
        tenant_id=1,
        kind_code="wz",
        template=twig,
        context_mode="sample",
        output_format=DocumentOutputFormat.PDF,
    )
    assert len(bytes(pdf)) > 1000


def test_report_starter_uses_provider_variables(doc_db):
    twig = (STARTERS_DIR / "production_report.twig").read_text(encoding="utf-8")
    html = preview_document(
        doc_db,
        tenant_id=1,
        kind_code="production_report",
        template=twig,
        context_mode="sample",
    )
    assert "Raport" in str(html)
