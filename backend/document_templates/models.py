"""ORM models for Document Templates engine (separate from SavedLabelTemplate)."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..models.base import BaseModelMixin


class DocumentTemplateFamily(Base, BaseModelMixin):
    __tablename__ = "document_template_family"

    code = Column(String(64), nullable=False, unique=True, index=True)
    name_pl = Column(String(256), nullable=False)
    icon = Column(String(16), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    kinds = relationship("DocumentTemplateKind", back_populates="family")


class DocumentTemplateKind(Base, BaseModelMixin):
    __tablename__ = "document_template_kind"
    __table_args__ = (UniqueConstraint("family_id", "code", name="uq_document_template_kind_family_code"),)

    family_id = Column(Integer, ForeignKey("document_template_family.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(64), nullable=False, index=True)
    name_pl = Column(String(256), nullable=False)
    provider_key = Column(String(64), nullable=False)
    schema_key = Column(String(64), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)

    family = relationship("DocumentTemplateFamily", back_populates="kinds")
    templates = relationship("DocumentTemplate", back_populates="kind")
    bindings = relationship("DocumentTemplateBinding", back_populates="kind")
    starters = relationship("DocumentTemplateStarter", back_populates="kind")
    context_schemas = relationship("DocumentContextSchema", back_populates="kind")


class DocumentTemplate(Base, BaseModelMixin):
    __tablename__ = "document_template"
    __table_args__ = (
        UniqueConstraint("tenant_id", "template_code", name="uq_document_template_tenant_code"),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kind_id = Column(Integer, ForeignKey("document_template_kind.id", ondelete="RESTRICT"), nullable=True, index=True)
    template_role = Column(String(16), nullable=False, default="DOCUMENT", index=True)
    template_code = Column(String(128), nullable=True, index=True)
    source = Column(String(16), nullable=False, default="TENANT", index=True)
    extends_template_id = Column(Integer, ForeignKey("document_template.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    kind = relationship("DocumentTemplateKind", back_populates="templates")
    extends_template = relationship("DocumentTemplate", remote_side="DocumentTemplate.id")
    versions = relationship(
        "DocumentTemplateVersion",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="DocumentTemplateVersion.version_number",
    )


class DocumentTemplateVersion(Base, BaseModelMixin):
    __tablename__ = "document_template_version"
    __table_args__ = (
        UniqueConstraint("template_id", "version_number", name="uq_document_template_version_number"),
    )

    template_id = Column(Integer, ForeignKey("document_template.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, default="draft", index=True)
    twig_content = Column(Text, nullable=False)
    extends_version_id = Column(
        Integer,
        ForeignKey("document_template_version.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    partial_pins_json = Column(Text, nullable=True)
    change_summary = Column(String(512), nullable=True)
    published_at = Column(DateTime, nullable=True)
    published_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    template = relationship("DocumentTemplate", back_populates="versions")
    extends_version = relationship("DocumentTemplateVersion", remote_side="DocumentTemplateVersion.id")
    partial_pins = relationship(
        "DocumentTemplateVersionPartialPin",
        back_populates="document_version",
        cascade="all, delete-orphan",
        foreign_keys="DocumentTemplateVersionPartialPin.document_version_id",
    )


class DocumentTemplateVersionPartialPin(Base, BaseModelMixin):
    __tablename__ = "document_template_version_partial_pin"
    __table_args__ = (
        UniqueConstraint(
            "document_version_id",
            "partial_code",
            name="uq_document_template_version_partial_pin_code",
        ),
    )

    document_version_id = Column(
        Integer,
        ForeignKey("document_template_version.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    partial_template_id = Column(
        Integer,
        ForeignKey("document_template.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    partial_version_id = Column(
        Integer,
        ForeignKey("document_template_version.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    partial_code = Column(String(128), nullable=False, index=True)

    document_version = relationship(
        "DocumentTemplateVersion",
        back_populates="partial_pins",
        foreign_keys=[document_version_id],
    )
    partial_template = relationship("DocumentTemplate", foreign_keys=[partial_template_id])
    partial_version = relationship("DocumentTemplateVersion", foreign_keys=[partial_version_id])


class DocumentTemplateBinding(Base, BaseModelMixin):
    __tablename__ = "document_template_binding"

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kind_id = Column(Integer, ForeignKey("document_template_kind.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_code = Column(String(64), nullable=False, default="standard", index=True)
    template_id = Column(Integer, ForeignKey("document_template.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id = Column(Integer, ForeignKey("document_template_version.id", ondelete="SET NULL"), nullable=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True, index=True)
    priority = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)

    kind = relationship("DocumentTemplateKind", back_populates="bindings")
    template = relationship("DocumentTemplate")
    version = relationship("DocumentTemplateVersion")


class DocumentTemplateStarter(Base, BaseModelMixin):
    __tablename__ = "document_template_starter"
    __table_args__ = (UniqueConstraint("kind_id", "code", name="uq_document_template_starter_kind_code"),)

    kind_id = Column(Integer, ForeignKey("document_template_kind.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(64), nullable=False)
    name_pl = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    twig_content = Column(Text, nullable=False)
    thumbnail_url = Column(String(512), nullable=True)
    is_system = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)

    kind = relationship("DocumentTemplateKind", back_populates="starters")


class DocumentTemplateScopeAssignment(Base, BaseModelMixin):
    __tablename__ = "document_template_scope_assignment"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "kind_id",
            "scope_type",
            "scope_id",
            name="uq_document_template_scope_assignment",
        ),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kind_id = Column(Integer, ForeignKey("document_template_kind.id", ondelete="CASCADE"), nullable=False, index=True)
    scope_type = Column(String(32), nullable=False, index=True)
    scope_id = Column(Integer, nullable=False, index=True)
    version_id = Column(Integer, ForeignKey("document_template_version.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_code = Column(String(64), nullable=False, default="standard", index=True)

    kind = relationship("DocumentTemplateKind")
    version = relationship("DocumentTemplateVersion")


class DocumentContextSchema(Base, BaseModelMixin):
    __tablename__ = "document_context_schema"
    __table_args__ = (UniqueConstraint("kind_id", "schema_key", name="uq_document_context_schema_kind_key"),)

    kind_id = Column(Integer, ForeignKey("document_template_kind.id", ondelete="CASCADE"), nullable=False, index=True)
    schema_key = Column(String(64), nullable=False)
    schema_json = Column(Text, nullable=False)

    kind = relationship("DocumentTemplateKind", back_populates="context_schemas")
