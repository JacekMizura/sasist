from pydantic import BaseModel


class SavedLabelTemplatePayload(BaseModel):
    name: str
    template_json: str


class SavedLabelTemplateResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    template_json: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
