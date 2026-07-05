"""Tests for Document Templates v2 — deterministic render, dependency graph."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.db.document_template_schema import ensure_document_template_schema
from backend.document_templates.constants import (
    SOURCE_TENANT,
    TEMPLATE_ROLE_BASE,
    TEMPLATE_ROLE_DOCUMENT,
    TEMPLATE_ROLE_PARTIAL,
    VERSION_STATUS_DRAFT,
    VERSION_STATUS_PUBLISHED,
)
from backend.document_templates.models import DocumentTemplate, DocumentTemplateVersion
from backend.document_templates.render.template_renderer import render
from backend.document_templates.services.dependency_graph_service import DependencyGraphService
from backend.document_templates.services.template_resolution_service import resolve_version_to_document_template


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


def _create_base(db, tenant_id: int = 1) -> DocumentTemplateVersion:
    tpl = DocumentTemplate(
        tenant_id=tenant_id,
        kind_id=None,
        template_role=TEMPLATE_ROLE_BASE,
        template_code="base_document",
        source=SOURCE_TENANT,
        name="Base",
        is_system=False,
    )
    db.add(tpl)
    db.flush()
    v = DocumentTemplateVersion(
        template_id=int(tpl.id),
        version_number=1,
        status=VERSION_STATUS_PUBLISHED,
        twig_content='{% block content %}BASE-v1{% endblock %}',
    )
    db.add(v)
    db.flush()
    return v


def _create_partial(db, code: str, content: str, tenant_id: int = 1) -> DocumentTemplateVersion:
    tpl = DocumentTemplate(
        tenant_id=tenant_id,
        kind_id=None,
        template_role=TEMPLATE_ROLE_PARTIAL,
        template_code=code,
        source=SOURCE_TENANT,
        name=code,
        is_system=False,
    )
    db.add(tpl)
    db.flush()
    v = DocumentTemplateVersion(
        template_id=int(tpl.id),
        version_number=1,
        status=VERSION_STATUS_PUBLISHED,
        twig_content=content,
    )
    db.add(v)
    db.flush()
    return v


def test_resolved_document_template_extends_pinned_base(doc_db):
    base_v1 = _create_base(doc_db)
    base_v2 = DocumentTemplateVersion(
        template_id=int(base_v1.template_id),
        version_number=2,
        status=VERSION_STATUS_PUBLISHED,
        twig_content='{% block content %}BASE-v2{% endblock %}',
    )
    doc_db.add(base_v2)
    doc_db.flush()

    doc_tpl = DocumentTemplate(
        tenant_id=1,
        kind_id=None,
        template_role=TEMPLATE_ROLE_DOCUMENT,
        template_code="production_card",
        source=SOURCE_TENANT,
        name="Card",
        is_system=False,
    )
    doc_db.add(doc_tpl)
    doc_db.flush()
    doc_v = DocumentTemplateVersion(
        template_id=int(doc_tpl.id),
        version_number=1,
        status=VERSION_STATUS_PUBLISHED,
        twig_content='{% extends "base_document" %}{% block content %}CARD{% endblock %}',
        extends_version_id=int(base_v1.id),
    )
    doc_db.add(doc_v)
    doc_db.commit()

    resolved = resolve_version_to_document_template(doc_db, version_id=int(doc_v.id))
    html = render(
        resolved,
        {"company": {"name": "Test"}},
    )
    assert "CARD" in html
    assert any("BASE-v1" in content for _, content in resolved.base_chain)
    assert all("BASE-v2" not in content for _, content in resolved.base_chain)


def test_partial_pin_deterministic(doc_db):
    header_v1 = _create_partial(doc_db, "document_header", "<header>v1</header>")
    header_v2 = DocumentTemplateVersion(
        template_id=int(header_v1.template_id),
        version_number=2,
        status=VERSION_STATUS_PUBLISHED,
        twig_content="<header>v2</header>",
    )
    doc_db.add(header_v2)
    doc_db.flush()

    base_v = _create_base(doc_db)
    base_v.twig_content = '{% block content %}{% include_document "document_header" %}{% endblock %}'
    base_v.partial_pins_json = json.dumps({"document_header": int(header_v1.id)})
    doc_db.flush()

    resolved = resolve_version_to_document_template(doc_db, version_id=int(base_v.id))
    html = render(resolved, {})
    assert "v1" in html
    assert "v2" not in html


def test_dependency_graph_dependents_of_base(doc_db):
    base_v = _create_base(doc_db)
    doc_tpl = DocumentTemplate(
        tenant_id=1,
        kind_id=None,
        template_role=TEMPLATE_ROLE_DOCUMENT,
        template_code="doc_a",
        source=SOURCE_TENANT,
        name="Doc A",
        is_system=False,
    )
    doc_db.add(doc_tpl)
    doc_db.flush()
    doc_v = DocumentTemplateVersion(
        template_id=int(doc_tpl.id),
        version_number=1,
        status=VERSION_STATUS_PUBLISHED,
        twig_content='{% extends "base_document" %}',
        extends_version_id=int(base_v.id),
    )
    doc_db.add(doc_v)
    doc_db.commit()

    graph = DependencyGraphService(doc_db)
    deps = graph.dependents_of_base_version(int(base_v.id))
    assert len(deps) == 1
    assert deps[0]["template_code"] == "doc_a"


def test_dependency_cycle_detection(doc_db):
    base_a = _create_base(doc_db)
    base_b_tpl = DocumentTemplate(
        tenant_id=1,
        kind_id=None,
        template_role=TEMPLATE_ROLE_BASE,
        template_code="base_b",
        source=SOURCE_TENANT,
        name="Base B",
        is_system=False,
    )
    doc_db.add(base_b_tpl)
    doc_db.flush()
    base_b = DocumentTemplateVersion(
        template_id=int(base_b_tpl.id),
        version_number=1,
        status=VERSION_STATUS_DRAFT,
        twig_content='{% extends "base_document" %}',
        extends_version_id=int(base_a.id),
    )
    doc_db.add(base_b)
    doc_db.flush()
    base_a.extends_version_id = int(base_b.id)
    doc_db.commit()

    graph = DependencyGraphService(doc_db)
    cycle = graph.detect_cycles_for_version(int(base_a.id))
    assert cycle is not None
