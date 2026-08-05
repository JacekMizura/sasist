"""Pydantic — dodatkowe pola produktu."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

PRODUCT_CUSTOM_FIELD_TYPES = frozenset(
    {
        "TEXT",
        "NUMBER",
        "FILES",
        "SELECT_SINGLE",
        "SELECT_MULTI",
        "GPSR_ATTACHMENTS",
        "ATTACHMENTS",
    }
)

#: Typy załączników marketplace / Sellasist (settings.attachments.kind).
PRODUCT_ATTACHMENT_KINDS = (
    ("poradnik", "Poradnik"),
    ("regulamin_promocji", "Regulamin promocji"),
    ("regulamin_konkursu", "Regulamin konkursu"),
    ("fragment_ksiazki", "Fragment książki"),
    ("instrukcja_obslugi", "Instrukcja obsługi"),
    ("instrukcja_montazu", "Instrukcja montażu"),
    ("instrukcja_gry", "Instrukcja gry"),
    ("etykieta_energetyczna", "Etykieta energetyczna"),
    ("karta_produktu", "Karta produktu"),
    ("etykieta_opony", "Etykieta opony"),
    ("przetwarzanie_danych_urzadzenie", "Przetwarzanie danych (urządzenie)"),
    ("przetwarzanie_danych_oprogramowanie", "Przetwarzanie danych (oprogramowanie)"),
    ("koncesja_sor", "Koncesja ŚOR"),
)


class ProductCustomFieldOptionRead(BaseModel):
    id: int
    label: str
    sort_order: int = 0


class ProductCustomFieldOptionWrite(BaseModel):
    id: Optional[int] = None
    label: str = Field(..., min_length=1, max_length=512)
    sort_order: int = 0


class ProductCustomFieldRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    slug: str
    type: str
    settings_json: Optional[Dict[str, Any]] = None
    sort_order: int = 0
    is_active: bool = True
    options: List[ProductCustomFieldOptionRead] = Field(default_factory=list)


class ProductCustomFieldWrite(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    slug: Optional[str] = Field(None, max_length=128)
    type: str
    settings_json: Optional[Dict[str, Any]] = None
    sort_order: int = 0
    is_active: bool = True
    options: List[ProductCustomFieldOptionWrite] = Field(default_factory=list)


class ProductCustomFieldValueStore(BaseModel):
    field_id: int
    string_value: Optional[str] = None
    number_value: Optional[float] = None
    json_value: Optional[Any] = None


class ProductCustomFieldValuesPutBody(BaseModel):
    values: List[ProductCustomFieldValueStore] = Field(default_factory=list)


class ProductCustomFieldValueState(BaseModel):
    field_id: int
    string_value: Optional[str] = None
    number_value: Optional[float] = None
    json_value: Optional[Any] = None


class ProductCustomFieldWithValueRead(BaseModel):
    field: ProductCustomFieldRead
    value: Optional[ProductCustomFieldValueState] = None


class ProductCustomFieldsBulkDeleteBody(BaseModel):
    ids: List[int] = Field(..., min_length=1)
