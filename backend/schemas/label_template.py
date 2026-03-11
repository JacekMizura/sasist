from pydantic import BaseModel


class SavedLabelTemplatePayload(BaseModel):
    name: str
    template_json: str
    template_type: str | None = None  # location | product | cart | basket | order
    group_id: int | None = None


class LabelTemplateGroupPayload(BaseModel):
    template_type: str  # location | product | cart | basket | order
    name: str


class SavedLabelTemplateResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    template_type: str | None = None
    template_json: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
