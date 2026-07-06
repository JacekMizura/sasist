"""Pydantic schemas for Document Templates API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class DocumentTemplateCreateFromStarter(BaseModel):
    kind_code: str
    name: str = Field(min_length=1, max_length=256)
    starter_code: str = "default"
    variant_code: str = "standard"


class DocumentTemplateSaveDraft(BaseModel):
    twig_content: str
    change_summary: str | None = Field(default=None, max_length=512)
    extends_version_id: int | None = None
    partial_pins_json: str | None = None


class DocumentTemplateUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=256)


class DocumentTemplatePublish(BaseModel):
    version_id: int | None = None
    skip_validation: bool = False
    change_summary: str | None = Field(default=None, max_length=512)


class DocumentTemplateLiveValidatePayload(BaseModel):
    kind_code: str
    twig_content: str


class DocumentTemplateUsageSearchPayload(BaseModel):
    symbol: str
    symbol_type: str = "variable"


class DocumentTemplateImportPayload(BaseModel):
    manifest: dict[str, Any]
    templates: list[dict[str, Any]]
    resolutions: dict[str, str] = Field(default_factory=dict)


class DocumentTemplateBindingPayload(BaseModel):
    kind_code: str
    template_id: int
    version_id: int | None = None
    warehouse_id: int | None = None
    variant_code: str = "standard"
    priority: int = 100
    is_default: bool = True


class TemplateKindAssignmentItem(BaseModel):
    kind_code: str
    assigned: bool = False
    is_default: bool = False


class TemplateKindAssignmentsPayload(BaseModel):
    assignments: list[TemplateKindAssignmentItem] = Field(default_factory=list)


class DocumentTemplatePreviewPayload(BaseModel):
    kind_code: str
    twig_content: str
    params: dict[str, Any] = Field(default_factory=dict)
    warehouse_id: int | None = None
    version_id: int | None = None
    context_mode: str = "sample"
    extends_version_id: int | None = None
    partial_pins_json: str | None = None


class DocumentTemplateStarterImportPayload(BaseModel):
    kind_code: str
    code: str | None = None
    payload: dict[str, Any]


class DocumentTemplateStarterClonePayload(BaseModel):
    new_code: str | None = None
    name_pl: str | None = None


class DocumentTemplateScopeAssignmentPayload(BaseModel):
    kind_code: str
    scope_type: str
    scope_id: int = Field(ge=1)
    version_id: int | None = Field(default=None, ge=1)
    variant_code: str = "standard"


class DocumentTemplateVersionReplacePayload(BaseModel):
    to_version_id: int = Field(ge=1)
    confirm: bool = False
