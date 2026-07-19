"""Lista produktów do zbiórki WMS (agregat z wielu zamówień) — odczyt z routingu po lokalizacjach."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from .picking_routing import PickListRow, PickingRoutingAllocationShortfall

WmsPickingOrderTypeFilter = Literal["single", "multi", "all"]

# Stan rozliczenia linii SKU w sesji zbierania (SSOT dla UI — nie mylić z completed=True przy braku).
WmsPickingLineResolutionStatus = Literal["ACTIVE", "PARTIAL", "COMPLETED_PICK", "SHORTAGE"]


class WmsPickingProductBundleBreakdownRow(BaseModel):
    """Rozbicie zagregowanego SKU per zamówienie + bundle (P4.15B)."""

    order_id: int
    order_number: str
    bundle_id: Optional[int] = None
    bundle_name: Optional[str] = None
    bundle_mode: Optional[str] = None
    quantity: float = Field(..., ge=0)


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
    completed: bool = Field(
        False,
        description="True gdy remaining_to_pick≈0 (zebrano i/lub brak rozliczyły demand) — linia zostaje w snapshotcie sesji",
    )
    resolution_status: WmsPickingLineResolutionStatus = Field(
        "ACTIVE",
        description=(
            "ACTIVE / PARTIAL (jeszcze do pobrania) | COMPLETED_PICK (pełne zebranie bez braku) | "
            "SHORTAGE (remaining≈0 i missing>0 — zakończone problemowo, NIE mylić z ZEBRANO)"
        ),
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
    consolidation_pick: bool = Field(
        False,
        description="P5.6 — lokalna pozycja konsolidacji (multi_mode=consolidation_rack)",
    )
    consolidation_shelf_label: Optional[str] = Field(
        None,
        description="Etykieta półki kompletacyjnej (np. RK-01/A2)",
    )
    bundle_breakdown: list[WmsPickingProductBundleBreakdownRow] = Field(
        default_factory=list,
        description="Rozbicie ilości per zamówienie/bundle gdy SKU występuje w wielu kontekstach",
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
    order_item_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="ID linii OrderItem dla tego produktu w zamówieniu (zgłoszenie braku)",
    )
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
    consolidation_pick: bool = Field(
        False,
        description="P5.6 — lokalna pozycja konsolidacji na regale kompletacyjnym",
    )
    consolidation_shelf_label: Optional[str] = Field(
        None,
        description="Półka docelowa (np. RK-01/A2)",
    )
    bundle_id: Optional[int] = Field(None, description="Bundle catalog id (P4.15B)")
    bundle_name: Optional[str] = None
    bundle_mode: Optional[str] = Field(None, description="ON_DEMAND_ASSEMBLY | STOCK_PRODUCTION")
    bundle_component_index: Optional[int] = Field(None, ge=1)
    bundle_component_count: Optional[int] = Field(None, ge=1)
    is_bundle_component: bool = False
    parent_bundle_order_line_id: Optional[int] = None


class WmsPickingBundleComponentStatus(BaseModel):
    order_item_id: int
    product_id: int
    product_name: str
    quantity: float = Field(..., ge=0)
    picked_quantity: float = Field(0, ge=0)
    quantity_to_pick: float = Field(0, ge=0)
    bundle_component_index: int = Field(..., ge=1)
    is_current_product: bool = False
    pick_done: bool = False


class WmsPickingOrderBundleTree(BaseModel):
    order_id: int
    order_number: str
    bundle_id: int
    bundle_name: str
    bundle_mode: str
    parent_order_line_id: int
    components_total: int = Field(..., ge=0)
    components_done: int = Field(0, ge=0)
    components: list[WmsPickingBundleComponentStatus] = Field(default_factory=list)


class WmsPickingSessionStats(BaseModel):
    """Liczniki sesji zbierania — SSOT z backendu (nie lokalny React)."""

    zebrane: int = Field(0, ge=0)
    do_zebrania: int = Field(0, ge=0)
    w_trakcie: int = Field(0, ge=0)
    braki: int = Field(0, ge=0, description="SKU z resolution_status=SHORTAGE — nie liczone jako zebrane")


class WmsPickingProductLinesResponse(BaseModel):
    products: list[WmsPickingProductLine]
    cohort_order_count: int = Field(
        0,
        ge=0,
        description=(
            "Liczba zamówień w zakresie listy: z cart_id = list_orders_on_cart (SSOT); "
            "bez wózka = kohorta statusu hub."
        ),
    )
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
    picking_mode: Optional[str] = Field(
        default=None,
        description="normal | recovery — tryb listy produktów",
    )
    recovery_order_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Zamówienie dogrywki (gdy picking_mode=recovery)",
    )
    recovery_completed: bool = Field(
        default=False,
        description="True gdy dogrywka nie ma już linii z remaining/active pick — completed SKU mogą nadal być w products",
    )
    session_stats: WmsPickingSessionStats = Field(
        default_factory=WmsPickingSessionStats,
        description="Do zebrania / W trakcie / Zebrane — z aktywnej sesji i przypisanych zamówień.",
    )
    #: MULTI baskets — product-level pending put (no Pick yet). Never confuse with active_series.
    basket_put_pending: Optional[dict] = Field(
        default=None,
        description=(
            "Oczekujące odłożenie (pending qty, bez PICK): product_id, name, ean, sku, quantity, … "
            "None gdy brak pending — nawet jeśli aktywna jest series."
        ),
    )
    basket_put_active_series: Optional[dict] = Field(
        default=None,
        description="Aktywna seria odkładania (po basket confirm) — nie jest „oczekującą sztuką”.",
    )
    requires_basket_put_confirm: bool = Field(
        default=False,
        description="True dla wózka MULTI/baskets.",
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
    resolution_status: WmsPickingLineResolutionStatus = Field(
        "ACTIVE",
        description="Jak na liście produktów — ACTIVE|PARTIAL|COMPLETED_PICK|SHORTAGE",
    )
    locations: list[WmsPickingProductLocationRow]
    orders: list[WmsPickingProductOrderRow]
    active_fifo_order_id: Optional[int] = Field(
        None,
        description="Pierwsze zamówienie (Order.id) z listy orders z niedoborem linii — FIFO",
    )
    put_to_basket_label: Optional[str] = Field(
        None,
        description=(
            "W MULTI: etykieta aktywnej serii koszyka (po potwierdzeniu). "
            "Nie jest to wymuszony FIFO destination przed skanem koszyka — "
            "użyj basket_put_pending.eligible_baskets / orders[].basket_slot."
        ),
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
    consolidation_active: bool = Field(
        False,
        description="P5.4 — zamówienie w STAGING z przypisaną półką kompletacyjną.",
    )
    consolidation_shelf_label: Optional[str] = Field(
        None,
        description="Etykieta półki kompletacyjnej (np. RK-01/A2) — zamiast koszyka.",
    )
    consolidation_plan_id: Optional[int] = None
    consolidation_plan_item_id: Optional[int] = None
    pending_shelf_deposit: bool = Field(
        False,
        description="True gdy lokalna pozycja planu ma status PICKED i czeka na potwierdzenie odłożenia.",
    )
    order_bundle_trees: list[WmsPickingOrderBundleTree] = Field(
        default_factory=list,
        description="Drzewo bundle per zamówienie w kohortcie (P4.15B)",
    )
    #: MULTI baskets — pending put confirmation (SSOT from session metadata).
    basket_put_pending: Optional[dict] = Field(
        default=None,
        description="Oczekujące potwierdzenie koszyka: expected_basket_label, quantity, product_id, …",
    )
    basket_put_active_series: Optional[dict] = Field(
        default=None,
        description="Aktywna seria odkładania do zweryfikowanego koszyka.",
    )
    requires_basket_put_confirm: bool = Field(
        default=False,
        description="True dla wózka MULTI/baskets — skan produktu nie finalizuje sztuki bez koszyka.",
    )


class WmsPickingConfirmBasketPutBody(BaseModel):
    cart_id: int = Field(..., ge=1)
    basket_scan: str = Field(..., min_length=1, max_length=128)
    manual: bool = Field(
        default=False,
        description="True gdy potwierdzenie koszyka z ręcznego wpisu (audit MANUAL_BASKET_CONFIRMATION).",
    )
    recovery_order_id: Optional[int] = Field(default=None, ge=1)
    product_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Kontekst produktu z ekranu detail — pozwala wybrać koszyk bez pending (Pick=0).",
    )
    location_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Lokalizacja źródłowa dla aktywacji serii bez pending (wymagana z product_id).",
    )


class WmsPickingCancelPendingBasketPutBody(BaseModel):
    """Anuluj wyłącznie pending put (bez PICK) — fizycznie pobrana sztuka wraca „do półki” w UX."""

    cart_id: int = Field(..., ge=1)


class WmsPickingQuickPickBody(BaseModel):
    """Zapis kompletacji: Pick z picked_at (FIFO po zamówieniach w kohortcie)."""

    product_id: int = Field(..., ge=1)
    location_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    cart_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Aktywny wózek — wymagany gdy brak picking_session_id (cart picking).",
    )
    picking_session_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Sesja cartless (bulk / cart_no_scan) — Pick.cart_id=NULL.",
    )
    recovery_order_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Dogrywka recovery: tylko to zamówienie (bez kohorty statusu zbierania).",
    )

    @model_validator(mode="after")
    def _require_cart_or_session(self) -> "WmsPickingQuickPickBody":
        if self.picking_session_id is None and self.cart_id is None:
            raise ValueError("Wymagany cart_id albo picking_session_id.")
        if self.picking_session_id is not None and self.cart_id is not None:
            raise ValueError("Nie łącz cart_id z picking_session_id.")
        return self


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
    cart_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Aktywny wózek — wymagany gdy brak picking_session_id.",
    )
    picking_session_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Sesja cartless — bez WarehouseCart.",
    )
    order_ids: Optional[list[int]] = Field(
        default=None,
        description="Opcjonalnie ID zamówień z widoku szczegółu produktu (przecięcie z kontekstem wózka)",
    )
    recovery_order_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Dogrywka: wymuś zamówienie w kontekście zgłoszenia braku (linia zamiennika)",
    )
    order_item_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Konkretna linia zamówienia (zamiennik / recovery) — bez zgadywania po product_id",
    )
    problem_kind: Optional[Literal["product_shortage", "qty_mismatch"]] = Field(
        default="product_shortage",
        description="product_shortage = klasyczny brak; qty_mismatch = rozbieżność bez zerowania lokalizacji",
    )

    @model_validator(mode="after")
    def _require_cart_or_session(self) -> "WmsPickingReportShortageBody":
        if self.picking_session_id is None and self.cart_id is None:
            raise ValueError("Wymagany cart_id albo picking_session_id.")
        if self.picking_session_id is not None and self.cart_id is not None:
            raise ValueError("Nie łącz cart_id z picking_session_id.")
        return self


class WmsPickingReportShortageResponse(BaseModel):
    ok: bool = True
    already_resolved: bool = Field(
        False,
        description="True gdy shortage był już pełny — NO-OP bez nowego eventu biznesowego",
    )
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
    product_line: Optional[WmsPickingProductLine] = Field(
        default=None,
        description=(
            "Snapshot linii produktu po zapisie braku (ten sam builder co product-lines) — "
            "FE może zaktualizować listę bez wyścigu ze stale GET."
        ),
    )


class WmsPickingUndoPickBody(BaseModel):
    product_id: int = Field(..., ge=1)
    cart_id: int = Field(..., ge=1)
    quantity: float = Field(1, gt=0, description="Ile szt. draft picków cofnąć (LIFO)")
    location_id: Optional[int] = Field(default=None, ge=1)
    order_ids: Optional[list[int]] = None
    recovery_order_id: Optional[int] = Field(default=None, ge=1)


class WmsPickingUndoPickResponse(BaseModel):
    ok: bool = True
    undone_qty: float = Field(..., ge=0)
    inventory_unchanged: bool = True
    order_ids: list[int] = Field(default_factory=list)
    location_id: Optional[int] = None


class WmsPickingEmptyLocationBody(BaseModel):
    product_id: int = Field(..., ge=1)
    location_id: int = Field(..., ge=1)
    cart_id: int = Field(..., ge=1)
    observed_stock_qty: Optional[float] = Field(
        default=None,
        ge=0,
        description="Stan widziany na UI — concurrency check (odrzut gdy DB się różni)",
    )
    order_ids: Optional[list[int]] = None
    recovery_order_id: Optional[int] = Field(default=None, ge=1)


class WmsPickingAlternateLocation(BaseModel):
    location_id: int
    location_code: str
    stock_quantity: float = Field(..., ge=0)


class WmsPickingEmptyLocationResponse(BaseModel):
    ok: bool = True
    shortage_kind: str = Field(..., description="LOCATION_SHORTAGE | PRODUCT_SHORTAGE")
    location_id: int
    location_code: str
    product_id: int
    product_ean: Optional[str] = None
    previous_qty: float
    new_qty: float = 0
    formal_stock_qty: Optional[float] = Field(
        default=None,
        description="Formalny stock po operacji (w DOCUMENTS_ONLY może pozostać previous_qty)",
    )
    stock_effect: str = Field(
        default="zeroed",
        description="zeroed | pending_document_correction | already_zero",
    )
    routing_blocked: bool = True
    undone_pick_qty: float = 0
    alternate_locations: list[WmsPickingAlternateLocation] = Field(default_factory=list)
    stock_document_id: Optional[int] = None
    inventory_document_id: Optional[int] = None
    inventory_document_number: Optional[str] = None



class WmsRecoveryBatchRouteGroup(BaseModel):
    location_code: str = ""
    line_count: int = 0
    order_ids: list[int] = Field(default_factory=list)
    lines: list[dict] = Field(default_factory=list)


class WmsRecoveryBatchSessionRead(BaseModel):
    id: int
    label: str = ""
    status: str = "open"
    order_ids: list[int] = Field(default_factory=list)
    order_count: int = 0
    line_count: int = 0
    route_groups: list[WmsRecoveryBatchRouteGroup] = Field(default_factory=list)


class WmsRecoveryBatchCreateBody(BaseModel):
    order_ids: list[int] = Field(default_factory=list, description="Puste = auto z top priority")
    max_orders: int = Field(default=8, ge=1, le=20)
