"""Lista produktów do zbiórki WMS (agregat z wielu zamówień) — odczyt z routingu po lokalizacjach."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from .picking_routing import PickListRow, PickingRoutingAllocationShortfall

WmsPickingOrderTypeFilter = Literal["single", "multi", "all"]


class WmsPickingProductPutHint(BaseModel):
    """Gdzie odłożyć skompletowaną ilość (z alokacji koszyków / wózka)."""

    label: str = Field(..., description="Np. B3, Wózek")
    quantity: float = Field(..., ge=0)


class WmsPickingCohortMissingLineRow(BaseModel):
    """Linia zamówienia ze zgłoszonym brakiem w kohortcie (sesja zbierania)."""

    order_id: int
    order_number: str
    product_id: int
    product_name: str
    product_ean: Optional[str] = Field(None, description="EAN produktu z katalogu")
    missing_quantity: float = Field(
        ...,
        ge=0,
        description="Operacyjny brak (cache: order_items.wms_picking_line_missing_qty; źródło: fulfillment_events + recompute)",
    )


class WmsPickingProductLine(BaseModel):
    product_id: int
    name: str
    ean: Optional[str] = None
    image_url: Optional[str] = None
    total_quantity: float = Field(..., ge=0)
    picked_quantity: float = Field(
        0,
        ge=0,
        description="Suma zdarzeń PICK (fulfillment_events) dla sesji / finalizacji — nie jest zerowana przy zmianie wymaganej ilości",
    )
    missing_quantity: float = Field(
        0,
        ge=0,
        description="Suma braków (MISSING / recompute) po liniach tego produktu w kohortcie",
    )
    remaining_to_pick: float = Field(
        0,
        ge=0,
        description="max(0, wymagane − zebrano − brak zgłoszony) — jeszcze do pobrania z magazynu",
    )
    primary_location_code: str = Field("", description="Pierwsza lokalizacja na trasie (lex wg nazwy)")
    primary_location_stock: float = Field(
        0,
        ge=0,
        description="Rzeczywisty stan magazynowy (Inventory) w lokalizacji głównej — nie ilość do pobrania z alokacji",
    )
    extra_locations_count: int = Field(
        0,
        ge=0,
        description="Liczba pozostałych lokalizacji (pierwsza już w primary) — do podpowiedzi +N",
    )
    route_sort_key: str = Field("", description="Klucz sortowania listy = primary_location_code")
    scanner_active: bool = Field(
        True,
        description="Czy skan EAN może otworzyć ten SKU: linia z ilością do pobrania z magazynu **lub** linia ze statusem braku (``missing``) z jawnym ``missing_quantity`` — SKU nie znika z aktywnej sesji po samym zgłoszeniu braku",
    )


class WmsPickingProductLocationRow(BaseModel):
    location_id: int
    location_code: str
    quantity: float = Field(
        ...,
        ge=0,
        description="Ilość do pobrania z tej lokalizacji wg alokacji routingu (nie stan fizyczny)",
    )
    stock_quantity: float = Field(
        0,
        ge=0,
        description="Stan fizyczny w lokalizacji (suma Inventory.quantity)",
    )
    put_hints: list[WmsPickingProductPutHint] = Field(default_factory=list)


class WmsPickingProductOrderRow(BaseModel):
    order_id: int
    order_number: str
    quantity: float = Field(..., ge=0, description="Ilość tego produktu w zamówieniu")
    picked_quantity: float = Field(
        0,
        ge=0,
        description="Zebrano na tym wózku (suma PICK w fulfillment_events dla cart_id sesji)",
    )
    missing_quantity: float = Field(
        0,
        ge=0,
        description="Operacyjny brak na linii (wms_picking_line_missing_qty, z ledger MISSING + recompute)",
    )
    quantity_to_pick: float = Field(
        0,
        ge=0,
        description="max(0, wymagane − zebrano − brak) — bez kasowania rekordów Pick",
    )
    line_value: Optional[float] = None
    shipping_method_name: Optional[str] = Field(None, description="Metoda dostawy (słownik lub legacy)")
    shipping_method_logo_url: Optional[str] = Field(None, description="Logo metody dostawy")
    basket_slot: Optional[str] = Field(
        None,
        description="Etykieta slotu (np. koszyk MULTI); null przy zbiorce zbiorczej bez koszyka",
    )
    shortage_declarable_qty: float = Field(
        0,
        ge=0,
        description="max(0, wymagane − zebrane na wózku − zgłoszony brak sesji) — ile można jeszcze zgłosić jako brak",
    )


class WmsPickingProductLinesResponse(BaseModel):
    products: list[WmsPickingProductLine]
    cohort_order_count: int = Field(0, ge=0, description="Liczba zamówień w kohortcie (ten sam status + filtr typu)")
    cohort_missing_lines: list[WmsPickingCohortMissingLineRow] = Field(
        default_factory=list,
        description="Linie ze zgłoszonym brakiem (podsumowanie przed finalizacją wózka)",
    )
    pick_list: list[PickListRow] = Field(default_factory=list, description="Surowa lista lokalizacja×produkt (opcjonalnie na UI)")
    shortfalls: list[PickingRoutingAllocationShortfall] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    allow_continue_other_lines_after_shortage: bool = Field(
        default=True,
        description="Z ustawień WMS: czy po zgłoszeniu braku na jednej linii picker może zbierać inne SKU w tej samej sesji.",
    )


class WmsPickingProductDetailResponse(BaseModel):
    product_id: int
    name: str
    ean: Optional[str] = None
    image_url: Optional[str] = None
    total_quantity: float = Field(..., ge=0)
    picked_quantity: float = Field(0, ge=0)
    missing_quantity: float = Field(
        0,
        ge=0,
        description="Suma braków na liniach tego produktu w kohortcie",
    )
    remaining_to_pick: float = Field(0, ge=0)
    locations: list[WmsPickingProductLocationRow]
    orders: list[WmsPickingProductOrderRow]
    active_fifo_order_id: Optional[int] = Field(
        None,
        description="Pierwsze zamówienie (Order.id) z listy orders z niedoborem linii — FIFO",
    )
    put_to_basket_label: Optional[str] = Field(
        None,
        description="W MULTI: etykieta koszyka dla aktywnej kolejki (odłóż tutaj)",
    )
    put_to_basket_color_index: int = Field(
        0,
        ge=0,
        description="Indeks koszyka na wózku (sort: row, column, id) — spójny kolor na UI",
    )
    allow_continue_other_lines_after_shortage: bool = Field(
        default=True,
        description="Jak w liście produktów — spójna polityka blokady innych linii po braku.",
    )
    shortage_declarable_total: float = Field(
        0,
        ge=0,
        description="Suma ``shortage_declarable_qty`` po zamówieniach sesji — do odblokowania „Zgłoś brak” gdy remaining_to_pick=0.",
    )


class WmsPickingQuickPickBody(BaseModel):
    """Zapis kompletacji: Pick z picked_at (FIFO po zamówieniach w kohortcie)."""

    product_id: int = Field(..., ge=1)
    location_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    cart_id: int = Field(..., ge=1, description="Aktywny wózek z sesji — Pick.cart_id i Order.cart_id")
    recovery_order_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Dogrywka recovery: tylko to zamówienie (bez kohorty statusu zbierania).",
    )


class WmsPickingRecoveryFinalizeBody(BaseModel):
    order_id: int = Field(..., ge=1)
    cart_id: int = Field(..., ge=1)


class WmsPickingRecoveryFinalizeResponse(BaseModel):
    ok: bool = True
    order_id: int = Field(..., ge=1)
    cart_id: int = Field(..., ge=1)


class WmsPickingFinalizeCartResponse(BaseModel):
    ok: bool = True
    orders_updated: int = Field(..., ge=0)
    cart_id: int = Field(..., ge=1)
    target_status_id: int = Field(..., ge=1)
    cohort_shortage_product_count: int = Field(
        0,
        ge=0,
        description="Liczba SKU (product_id) z linią ``wms_picking_line_missing_qty`` > 0 w kohortcie po finalizacji.",
    )
    cohort_shortage_unit_total: float = Field(
        0.0,
        ge=0,
        description="Suma ``wms_picking_line_missing_qty`` po liniach zamówień kohorty (szt. braków).",
    )
    cohort_shortage_order_ids: list[int] = Field(
        default_factory=list,
        description="ID zamówień z brakiem operacyjnym lub zamiennikiem do zebrania po finalizacji (kolejka Braki).",
    )


class WmsPickingResolveCartResponse(BaseModel):
    cart_id: int = Field(..., ge=1)
    name: str
    code: str = Field(..., min_length=1, description="Unikalny kod wózka do skanowania (np. CART-0001)")
    barcode: Optional[str] = None
    #: Etykieta do UI — nazwa wózka lub fallback id + wymiary (jak ``cart_display_name_for_wms``).
    display_name: str = Field(default="", min_length=0)
    cart_type: Optional[str] = Field(
        default=None,
        description="Wartość enum typu wózka (np. BULK, SECTIONAL) — dla sesji pakowania / WMS",
    )


class WmsPickingReportShortageBody(BaseModel):
    product_id: int = Field(..., ge=1)
    location_id: Optional[int] = Field(default=None, ge=1)
    missing_qty: float = Field(..., gt=0, description="Zgłoszona brakująca ilość (informacyjnie + audyt)")
    cart_id: int = Field(..., ge=1, description="Aktywny wózek z sesji zbierania — wymagany do poprawnego liczenia Picków")
    order_ids: Optional[list[int]] = Field(
        default=None,
        description="Opcjonalnie ID zamówień z widoku szczegółu produktu (przecięcie z kontekstem wózka)",
    )
    recovery_order_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Dogrywka: wymuś zamówienie w kontekście zgłoszenia braku (linia zamiennika)",
    )


class WmsPickingReportShortageResponse(BaseModel):
    ok: bool = True
    orders_updated: int = Field(..., ge=0)
    target_status_id: Optional[int] = Field(
        default=None,
        description="Nie ustawiany przy zgłoszeniu braku — status zamówienia zmienia się dopiero po finalize wózka.",
    )
    order_ids: list[int] = Field(default_factory=list)
    order_issue_task_ids: list[int] = Field(
        default_factory=list,
        description="Przy zgłoszeniu braku zawsze puste — zadania Order Issues tworzy dopiero finalize wózka.",
    )
    allow_continue_other_lines_after_shortage: bool = Field(
        default=True,
        description="Z ustawień WMS — dla UI po zgłoszeniu (kontynuacja vs pauza).",
    )
