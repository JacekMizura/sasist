"""API — konfiguracja modułu zwrotów (panel + WMS)."""

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ReturnDamageClassRW(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    label: str = Field(..., min_length=1, max_length=128)
    color_hex: str = Field(..., min_length=1, max_length=32)
    description: Optional[str] = None
    warehouse_behavior: Optional[str] = Field(None, max_length=64)
    resale_allowed: bool = True
    visible_wms: bool = True
    sort_order: int = 0
    is_active: bool = True


class ReturnDamageReasonRW(BaseModel):
    class_code: str = Field(..., min_length=1, max_length=32)
    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=256)
    visible_wms: bool = True
    sort_order: int = 0
    is_active: bool = True


DecisionCategory = Literal["ACCEPTED", "REJECTED"]


class ReturnProductDecisionRW(BaseModel):
    category: DecisionCategory
    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=256)
    visible_wms: bool = False
    sort_order: int = 0
    is_active: bool = True
    #: Dotyczy wyłącznie REJECTED: czy wygenerować linię przyjęcia zwrotnego (towar fizycznie obecny).
    creates_stock_document: bool = False


class ReturnCustomerReturnTypeRW(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=256)
    sort_order: int = 0
    is_active: bool = True


class ReturnOrderSourceRW(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=256)
    sort_order: int = 0
    is_active: bool = True


class ReturnDetailLayoutRW(BaseModel):
    left_column: List[str] = Field(default_factory=list)
    right_column: List[str] = Field(default_factory=list)
    """Opcjonalna szerokość bloku w podglądzie szczegółów — klucz = id sekcji."""
    section_widths: Dict[str, str] = Field(default_factory=dict)


class ReturnModuleConfigWrite(BaseModel):
    damage_classes: List[ReturnDamageClassRW] = Field(default_factory=list)
    damage_reasons: List[ReturnDamageReasonRW] = Field(default_factory=list)
    product_decisions: List[ReturnProductDecisionRW] = Field(default_factory=list)
    customer_return_types: List[ReturnCustomerReturnTypeRW] = Field(default_factory=list)
    order_sources: List[ReturnOrderSourceRW] = Field(default_factory=list)
    detail_layout: ReturnDetailLayoutRW = Field(default_factory=ReturnDetailLayoutRW)


class ReturnModuleConfigRead(ReturnModuleConfigWrite):
    """Pełny odczyt — identyczna struktura jak zapis (bez ids — rekonstruowalne po kodzie)."""

    pass


class WmsReturnModuleConfigRead(BaseModel):
    """Podzbiór dla terminali WMS — tylko wpisy widoczne w WMS + układ (opcjonalnie)."""

    damage_classes: List[ReturnDamageClassRW]
    damage_reasons: List[ReturnDamageReasonRW]
    product_decisions: List[ReturnProductDecisionRW]
    detail_layout: ReturnDetailLayoutRW
