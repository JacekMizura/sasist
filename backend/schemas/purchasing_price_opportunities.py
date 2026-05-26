"""Odpowiedź API: okazje cenowe (oszczędności zakupowe) — wyłącznie na realnych danych."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


OpportunityType = Literal[
    "cheaper_supplier",
    "price_increase",
    "threshold_discount",
    "bulk_discount",
    "low_rotation_high_cost",
]

Severity = Literal["low", "medium", "high"]


class PriceOpportunitySummaryOut(BaseModel):
    total_opportunities: int = 0
    total_possible_savings: float = Field(0.0, description="Suma szac. oszczędności / mies. (PLN) — heurystyka.")
    cheaper_supplier_cases: int = 0
    threshold_discount_cases: int = 0
    price_increase_cases: int = 0
    bulk_discount_cases: int = 0
    low_rotation_high_cost_cases: int = 0


class PriceHistoryPointOut(BaseModel):
    """Punkt historii ceny zakupu (PO lub dostawa)."""

    date: str
    unit_price: Optional[float] = None
    quantity: float = 0.0
    source: Literal["purchase_order", "delivery"]


class SupplierPriceOfferOut(BaseModel):
    supplier_id: int
    supplier_name: str
    purchase_price: Optional[float] = None
    min_order_qty: Optional[float] = None


class PriceOpportunityDrawerOut(BaseModel):
    """Rozszerzone dane do szuflady szczegółów (tylko przy zapytaniu z product_id)."""

    product_id: int
    product_name: str
    price_history: List[PriceHistoryPointOut] = Field(default_factory=list)
    supplier_offers: List[SupplierPriceOfferOut] = Field(default_factory=list)
    monthly_purchase_units: float = 0.0
    monthly_sales_units: float = 0.0


class PriceOpportunityRowOut(BaseModel):
    type: OpportunityType
    severity: Severity
    product_id: Optional[int] = Field(None, description="Opcjonalnie przy okazjach na poziomie dostawcy (np. próg dostawy).")
    product_name: str
    supplier_id: int
    supplier_name: str
    current_price: Optional[float] = None
    best_price: Optional[float] = None
    previous_price: Optional[float] = Field(None, description="Średnia z poprzednich zakupów (ten sam kontekst co typ).")
    price_diff_value: Optional[float] = None
    price_diff_percent: Optional[float] = None
    estimated_saving: float = 0.0
    monthly_volume: float = 0.0
    recommendation: str = ""
    action_label: str = ""


class PurchasingPriceOpportunitiesOut(BaseModel):
    summary: PriceOpportunitySummaryOut
    rows: List[PriceOpportunityRowOut] = Field(default_factory=list)
    data_message: Optional[str] = Field(
        None,
        description="Komunikat gdy brak porównań (np. brak drugiej oferty lub historii).",
    )
    drawer: Optional[PriceOpportunityDrawerOut] = None
