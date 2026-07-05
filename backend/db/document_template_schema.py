"""Create Document Templates tables, migrate v2 columns, seed catalog."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from ..document_templates.constants import (
    DOCUMENT_FAMILIES,
    DOCUMENT_KINDS,
    SOURCE_SYSTEM,
    SYSTEM_BASE_TEMPLATE_CODE,
    SYSTEM_PARTIAL_CODES,
    TEMPLATE_ROLE_BASE,
    TEMPLATE_ROLE_PARTIAL,
    VERSION_STATUS_PUBLISHED,
)
from ..document_templates.models import (
    DocumentContextSchema,
    DocumentTemplate,
    DocumentTemplateFamily,
    DocumentTemplateKind,
    DocumentTemplateStarter,
    DocumentTemplateVersion,
)
from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

STARTERS_DIR = Path(__file__).resolve().parent.parent / "document_templates" / "starters"
PARTIALS_DIR = STARTERS_DIR / "partials"


def _add_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[document_templates] added %s.%s", table, column)


def ensure_document_template_schema(engine: Engine) -> None:
    from ..document_templates.models import (
        DocumentContextSchema,
        DocumentTemplate,
        DocumentTemplateBinding,
        DocumentTemplateFamily,
        DocumentTemplateKind,
        DocumentTemplateStarter,
        DocumentTemplateVersion,
        DocumentTemplateVersionPartialPin,
    )

    if not has_table(engine, "document_template_family"):
        from ..database import Base

        Base.metadata.create_all(
            bind=engine,
            tables=[
                DocumentTemplateFamily.__table__,
                DocumentTemplateKind.__table__,
                DocumentTemplate.__table__,
                DocumentTemplateVersion.__table__,
                DocumentTemplateVersionPartialPin.__table__,
                DocumentTemplateBinding.__table__,
                DocumentTemplateStarter.__table__,
                DocumentContextSchema.__table__,
            ],
        )
        logger.info("[document_templates] created tables")
    else:
        _migrate_v2_columns(engine)
        if not has_table(engine, "document_template_version_partial_pin"):
            from ..database import Base

            Base.metadata.create_all(
                bind=engine,
                tables=[DocumentTemplateVersionPartialPin.__table__],
            )
            logger.info("[document_templates] created partial_pin table")

    if not has_table(engine, "document_template_scope_assignment"):
        from ..document_templates.models import DocumentTemplateScopeAssignment
        from ..database import Base

        Base.metadata.create_all(bind=engine, tables=[DocumentTemplateScopeAssignment.__table__])
        logger.info("[document_templates] created scope_assignment table")

    _seed_catalog(engine)


def _migrate_v2_columns(engine: Engine) -> None:
    _add_column(
        engine,
        "document_template",
        "template_role",
        "ALTER TABLE document_template ADD COLUMN template_role VARCHAR(16) NOT NULL DEFAULT 'DOCUMENT'",
        "ALTER TABLE document_template ADD COLUMN template_role VARCHAR(16) NOT NULL DEFAULT 'DOCUMENT'",
    )
    _add_column(
        engine,
        "document_template",
        "template_code",
        "ALTER TABLE document_template ADD COLUMN template_code VARCHAR(128)",
        "ALTER TABLE document_template ADD COLUMN template_code VARCHAR(128)",
    )
    _add_column(
        engine,
        "document_template",
        "source",
        "ALTER TABLE document_template ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'TENANT'",
        "ALTER TABLE document_template ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'TENANT'",
    )
    _add_column(
        engine,
        "document_template",
        "extends_template_id",
        "ALTER TABLE document_template ADD COLUMN extends_template_id INTEGER REFERENCES document_template(id)",
        "ALTER TABLE document_template ADD COLUMN extends_template_id INTEGER REFERENCES document_template(id)",
    )
    _add_column(
        engine,
        "document_template_version",
        "extends_version_id",
        "ALTER TABLE document_template_version ADD COLUMN extends_version_id INTEGER REFERENCES document_template_version(id)",
        "ALTER TABLE document_template_version ADD COLUMN extends_version_id INTEGER REFERENCES document_template_version(id)",
    )
    _add_column(
        engine,
        "document_template_version",
        "partial_pins_json",
        "ALTER TABLE document_template_version ADD COLUMN partial_pins_json TEXT",
        "ALTER TABLE document_template_version ADD COLUMN partial_pins_json TEXT",
    )
    _add_column(
        engine,
        "document_template_binding",
        "variant_code",
        "ALTER TABLE document_template_binding ADD COLUMN variant_code VARCHAR(64) NOT NULL DEFAULT 'standard'",
        "ALTER TABLE document_template_binding ADD COLUMN variant_code VARCHAR(64) NOT NULL DEFAULT 'standard'",
    )


def _seed_catalog(engine: Engine) -> None:
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        if db.query(DocumentTemplateFamily).count() == 0:
            for row in DOCUMENT_FAMILIES:
                db.add(
                    DocumentTemplateFamily(
                        code=str(row["code"]),
                        name_pl=str(row["name_pl"]),
                        icon=str(row.get("icon") or ""),
                        sort_order=int(row.get("sort_order") or 0),
                    )
                )
            db.commit()
        families = {f.code: f for f in db.query(DocumentTemplateFamily).all()}
        if db.query(DocumentTemplateKind).count() == 0:
            for idx, row in enumerate(DOCUMENT_KINDS):
                fam = families.get(str(row["family_code"]))
                if fam is None:
                    continue
                db.add(
                    DocumentTemplateKind(
                        family_id=int(fam.id),
                        code=str(row["code"]),
                        name_pl=str(row["name_pl"]),
                        provider_key=str(row["provider_key"]),
                        schema_key=str(row["schema_key"]),
                        sort_order=idx,
                    )
                )
            db.commit()
        else:
            _ensure_missing_kinds(db, families)
        _seed_starters(db)
        _seed_context_schemas(db)
        _seed_system_layout_templates(db)
        from ..document_templates.services.document_migration_service import migrate_tenant_document_bindings

        try:
            migrate_tenant_document_bindings(db, tenant_id=1)
        except Exception:
            logger.exception("[document_templates] default bindings migration skipped")
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("[document_templates] seed failed")
        raise
    finally:
        db.close()


def _starter_content(kind_code: str) -> str | None:
    path = STARTERS_DIR / f"{kind_code}.twig"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    from ..document_templates.starters.compose_starters import starter_twig_for_kind

    return starter_twig_for_kind(kind_code)


def _ensure_missing_kinds(db: Session, families: dict) -> None:
    existing = {k.code for k in db.query(DocumentTemplateKind).all()}
    added = False
    for idx, row in enumerate(DOCUMENT_KINDS):
        code = str(row["code"])
        if code in existing:
            continue
        fam = families.get(str(row["family_code"]))
        if fam is None:
            continue
        db.add(
            DocumentTemplateKind(
                family_id=int(fam.id),
                code=code,
                name_pl=str(row["name_pl"]),
                provider_key=str(row["provider_key"]),
                schema_key=str(row["schema_key"]),
                sort_order=idx,
            )
        )
        added = True
    if added:
        db.commit()


def _seed_starters(db: Session) -> None:
    kinds = {k.code: k for k in db.query(DocumentTemplateKind).all()}
    for kind_code, kind in kinds.items():
        content = _starter_content(kind_code)
        if not content:
            continue
        exists = (
            db.query(DocumentTemplateStarter)
            .filter(DocumentTemplateStarter.kind_id == int(kind.id), DocumentTemplateStarter.code == "default")
            .first()
        )
        if exists:
            if exists.is_system and content and exists.twig_content != content:
                exists.twig_content = content
            continue
        db.add(
            DocumentTemplateStarter(
                kind_id=int(kind.id),
                code="default",
                name_pl=f"{kind.name_pl} — starter",
                description="Szablon systemowy do skopiowania.",
                twig_content=content,
                is_system=True,
                sort_order=0,
            )
        )


def _seed_context_schemas(db: Session) -> None:
    from ..document_templates.services.variable_tree_service import build_variable_tree_for_kind

    kinds = db.query(DocumentTemplateKind).all()
    for kind in kinds:
        exists = (
            db.query(DocumentContextSchema)
            .filter(
                DocumentContextSchema.kind_id == int(kind.id),
                DocumentContextSchema.schema_key == str(kind.schema_key),
            )
            .first()
        )
        if exists:
            continue
        tree = build_variable_tree_for_kind(str(kind.schema_key))
        db.add(
            DocumentContextSchema(
                kind_id=int(kind.id),
                schema_key=str(kind.schema_key),
                schema_json=json.dumps(tree, ensure_ascii=False),
            )
        )


def _read_partial(code: str) -> str:
    path = PARTIALS_DIR / f"{code}.twig"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return f"<!-- partial {code} -->"


def _seed_system_layout_templates(db: Session) -> None:
    """System BASE + PARTIAL templates (tenant_id=1) for deterministic layout inheritance."""
    from ..models.tenant import Tenant

    tenant = db.query(Tenant).filter(Tenant.id == 1).first()
    if tenant is None:
        return

    tenant_id = int(tenant.id)
    base_path = STARTERS_DIR / "base_document.twig"
    if not base_path.is_file():
        return

    base_tpl = (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.tenant_id == tenant_id,
            DocumentTemplate.template_code == SYSTEM_BASE_TEMPLATE_CODE,
        )
        .first()
    )
    base_version = None
    if base_tpl is None:
        base_tpl = DocumentTemplate(
            tenant_id=tenant_id,
            kind_id=None,
            template_role=TEMPLATE_ROLE_BASE,
            template_code=SYSTEM_BASE_TEMPLATE_CODE,
            source=SOURCE_SYSTEM,
            name="Szablon bazowy dokumentu",
            description="Layout ERP — header, content, footer, style.",
            is_system=True,
        )
        db.add(base_tpl)
        db.flush()
        base_version = DocumentTemplateVersion(
            template_id=int(base_tpl.id),
            version_number=1,
            status=VERSION_STATUS_PUBLISHED,
            twig_content=base_path.read_text(encoding="utf-8"),
            change_summary="Wersja systemowa",
        )
        db.add(base_version)
        db.flush()
    else:
        base_version = (
            db.query(DocumentTemplateVersion)
            .filter(
                DocumentTemplateVersion.template_id == int(base_tpl.id),
                DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
            )
            .order_by(DocumentTemplateVersion.version_number.desc())
            .first()
        )

    partial_versions: dict[str, int] = {}
    for code in SYSTEM_PARTIAL_CODES:
        content = _read_partial(code)
        partial_tpl = (
            db.query(DocumentTemplate)
            .filter(
                DocumentTemplate.tenant_id == tenant_id,
                DocumentTemplate.template_code == code,
            )
            .first()
        )
        if partial_tpl is None:
            partial_tpl = DocumentTemplate(
                tenant_id=tenant_id,
                kind_id=None,
                template_role=TEMPLATE_ROLE_PARTIAL,
                template_code=code,
                source=SOURCE_SYSTEM,
                name=code.replace("_", " ").title(),
                is_system=True,
            )
            db.add(partial_tpl)
            db.flush()
            pv = DocumentTemplateVersion(
                template_id=int(partial_tpl.id),
                version_number=1,
                status=VERSION_STATUS_PUBLISHED,
                twig_content=content,
                change_summary="Wersja systemowa",
            )
            db.add(pv)
            db.flush()
            partial_versions[code] = int(pv.id)
        else:
            pv = (
                db.query(DocumentTemplateVersion)
                .filter(
                    DocumentTemplateVersion.template_id == int(partial_tpl.id),
                    DocumentTemplateVersion.status == VERSION_STATUS_PUBLISHED,
                )
                .order_by(DocumentTemplateVersion.version_number.desc())
                .first()
            )
            if pv is not None:
                partial_versions[code] = int(pv.id)
                if pv.version_number == 1 and pv.twig_content != content:
                    pv.twig_content = content

    if base_version is not None and partial_versions:
        pins = {k: v for k, v in partial_versions.items() if k in ("document_header", "document_footer")}
        if pins and not base_version.partial_pins_json:
            base_version.partial_pins_json = json.dumps(pins)
