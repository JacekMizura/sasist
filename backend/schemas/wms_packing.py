"""WMS packing — kolejka po statusie docelowym z konfiguracji zbierania."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, computed_field

from .order import OrderUiMainGroup
from .packaging_intelligence import PackagingSuggestionOut


class WmsPackingTargetStatusItem(BaseModel):
    """Status panelu będący celem zbierania (gotowe do pakowania)."""

    target_status_id: int = Field(..., ge=1, description="order_ui_status_id — parametr status w GET /wms/packing/modes i orders")
    status: str = Field(..., description="Nazwa statusu")
    color: str
    main_group: OrderUiMainGroup
    order_count: int = Field(..., ge=0, description="Łączna liczba zamówień w magazynie z tym statusem panelu")


class WmsPackingModeDistribution(BaseModel):
    """Rozkład zamówień w statusie po sposobie pakowania (przypisanie do wózka / typ wózka)."""

    no_cart: int = Field(..., ge=0, description="Zamówienia bez przypisanego wózka (cart_id IS NULL)")
    bulk: int = Field(..., ge=0, description="Na wózkach typu BULK")
    baskets: int = Field(..., ge=0, description="Na wózkach typu MULTI (koszyki)")


class WmsPackingOrderUiStatusBadge(BaseModel):
    name: str
    color: str
    main_group: OrderUiMainGroup


class WmsOrderTimelineEvent(BaseModel):
    """Zdarzenie osi czasu WMS w panelu zamówienia (OMS)."""

    at: datetime
    title: str
    body: List[str] = Field(default_factory=list)
    badge: str = Field(default="WMS", max_length=64)
    user_label: Optional[str] = Field(default=None, max_length=255)
    event_type: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Np. PICKING_STARTED | PICKED_ITEM | PICKING_FINISHED | PACKING_STARTED | PACKED_ITEM",
    )


class WmsLinePickedLocationRow(BaseModel):
    """Rzeczywiste zebranie per lokalizacja (Pick → Location), dla widoku OMS po zbieraniu."""

    location_label: str = Field(..., max_length=256)
    quantity: float = Field(..., ge=0)
    batch_number: Optional[str] = Field(default=None, max_length=128)
    expiry_date: Optional[str] = Field(default=None, description="ISO date (YYYY-MM-DD)")


class WmsLineAvailableLocationRow(BaseModel):
    """Lokalizacja ze stanem > 0 przed / podczas zbierania — etykieta + ilość + typ (badge OMS)."""

    location_label: str = Field(..., max_length=256)
    quantity: float = Field(..., ge=0)
    storage_type: Optional[str] = Field(default=None, max_length=32)


class WmsOperationTimesOut(BaseModel):
    """Czasy operacji WMS (sekundy); ``picking_seconds`` itd. — aliasy kompatybilności z UI."""

    picking_time: Optional[int] = Field(default=None, ge=0)
    packing_time: Optional[int] = Field(default=None, ge=0)
    total_time: Optional[int] = Field(default=None, ge=0)
    picking_seconds: Optional[int] = Field(default=None, ge=0)
    packing_seconds: Optional[int] = Field(default=None, ge=0)
    total_seconds: Optional[int] = Field(default=None, ge=0)
    picking_partial_label: Optional[str] = Field(
        default=None,
        description='Np. "21 min (4/5)" gdy pick < ilość zamówionych.',
        max_length=64,
    )
    #: Ściana czasu: pierwszy pick → koniec automatyki pakowania (gdy znany).
    warehouse_flow_seconds: Optional[int] = Field(default=None, ge=0)


class WmsPackingOrderLine(BaseModel):
    order_item_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=0, description="Katalog product.id dla agregacji braków w OMS")
    quantity: int = Field(..., ge=0)
    quantity_required: int = Field(
        default=0,
        ge=0,
        description="Ilość do spakowania po brakach / decyzjach OMS (≤ quantity); UI i walidacja finish.",
    )
    quantity_packed: int = Field(..., ge=0, description="Ilość spakowana na stanowisku (packing_quantity_packed), max do ilości zamówienia")
    picked_quantity: float = Field(
        0,
        ge=0,
        description="Suma zdarzeń PICK (fulfillment_events) dla linii — scope jak braki (wózek zamówienia lub zdarzenia sfinalizowane)",
    )
    #: Po domknięciu zbierania (``orders.picking_finished_at`` / ``picked_at``) — do UI (np. pełne „a/b” zamiast 0/b przy ledgerze).
    picked_quantity_final: float = Field(
        0,
        ge=0,
        description="Wartość prezentacyjna zbierania: po zamknięciu sesji = zamówione lub max(picked, zamówione−brak).",
    )
    missing_quantity: float = Field(
        0,
        ge=0,
        description="Operacyjny brak na linii (cache wms_picking_line_missing_qty; źródło ledger + recompute)",
    )
    #: shortage | waiting | resolved | none — spójnie z przeliczeniem OMS/WMS (badge zamiast samego „Brak”).
    shortage_display_kind: str = Field(
        default="none",
        description="shortage | waiting | resolved | none",
    )
    replaced_from_order_item_id: Optional[int] = Field(default=None)
    replaced_from_product_name: Optional[str] = Field(default=None, max_length=255)
    #: OMS: ``REPLACED`` (linia po zamianie) / ``TO_PICK`` (nowa linia) / null — spójność badge z panelem.
    oms_line_status: Optional[str] = Field(default=None, max_length=32)
    #: Audyt: ślad zamiany / zamiennika (jedna linia tekstu pod produktem w OMS).
    oms_line_secondary_trace: Optional[str] = Field(default=None, max_length=512)
    #: OMS: nazwa produktu docelowego po zamianie (linia ``REPLACED``) — badge „Zamieniono → …”.
    replacement_new_product_name: Optional[str] = Field(default=None, max_length=512)
    product_name: str
    ean: Optional[str] = None
    sku: Optional[str] = None
    image_url: Optional[str] = None
    #: Stan magazynowy (suma inventory w magazynie zamówienia)
    stock_quantity: Optional[int] = Field(default=None, description="Suma szt. z inventory dla produktu")
    #: Etykieta lokalizacji (np. R1-2-B)
    location_label: Optional[str] = None
    #: Typ magazynowy lokalizacji z ``locations.type`` (pick | reserve | floor) — spójny z ``normalizeStorageType`` w UI.
    location_storage_type: Optional[str] = Field(default=None, max_length=32)
    #: Status linii z ``order_items.wms_picking_line_status`` (np. ``to_pick`` | ``picked`` | ``missing``).
    wms_picking_line_status: Optional[str] = Field(default=None, max_length=32)
    #: Ilość w wybranej lokalizacji (do dopisku „(x10)”)
    location_bin_qty: Optional[int] = Field(default=None, ge=0)
    #: Wszystkie lokalizacje ze stanem > 0 (np. przed zbieraniem — lista alternatyw).
    available_location_labels: list[str] = Field(default_factory=list)
    #: Jak ``available_location_labels``, ale z ilościami i typem magazynowym (badge z qty).
    available_stock_locations: list[WmsLineAvailableLocationRow] = Field(default_factory=list)
    #: Po zbieraniu: rozładunek ilości ze zdarzeń PICK per lokalizacja.
    picked_locations: list[WmsLinePickedLocationRow] = Field(default_factory=list)
    color_name: Optional[str] = None
    catalog_number: Optional[str] = None
    product_symbol: Optional[str] = Field(default=None, description="Symbol produktu (osobno od SKU)")
    bundle_name: Optional[str] = None
    bundle_id: Optional[int] = Field(default=None, description="Bundle catalog id (P4.15B)")
    bundle_mode: Optional[str] = None
    bundle_component_index: Optional[int] = Field(default=None, ge=1)
    bundle_component_count: Optional[int] = Field(default=None, ge=1)
    is_bundle_component: bool = False
    parent_bundle_order_line_id: Optional[int] = None
    #: Ostatnia zarejestrowana zbiórka (audyt WMS) — kto, skąd, na jaki wózek.
    last_pick_audit_summary: Optional[str] = Field(default=None, max_length=512)
    #: Ostatnie pakowanie linii (audyt WMS) — operator, karton.
    last_pack_audit_summary: Optional[str] = Field(default=None, max_length=512)


class WmsOperationalNoteBrief(BaseModel):
    """Operacyjna notatka magazynu widoczna w danym module WMS (np. pakowanie)."""

    id: int = Field(..., ge=1)
    content: str = Field(..., max_length=8000)
    priority: Optional[int] = Field(default=None, ge=0, le=100)
    color_tag: Optional[str] = Field(default=None, max_length=32)
    show_in_picking: bool = False
    show_in_packing: bool = False
    show_in_returns: bool = False
    show_in_complaints: bool = False


class WmsPackingBundleComponentNode(BaseModel):
    order_item_id: int
    product_id: int
    product_name: str
    quantity_required: int = Field(..., ge=0)
    quantity_packed: int = Field(..., ge=0)
    bundle_component_index: int = Field(..., ge=1)
    is_packed: bool = False


class WmsPackingBundleTreeNode(BaseModel):
    bundle_id: int
    bundle_name: str
    bundle_mode: str
    parent_order_line_id: int
    components_total: int = Field(..., ge=0)
    components_packed: int = Field(0, ge=0)
    is_complete: bool = False
    components: list[WmsPackingBundleComponentNode] = Field(default_factory=list)


class WmsPackingOrderCard(BaseModel):
    order_id: int = Field(..., ge=1)
    number: str = Field(..., description="Numer do wyświetlenia, bez wymuszonego prefiksu #")
    packed_quantity: int = Field(..., ge=0)
    total_quantity: int = Field(..., ge=0)
    #: True gdy wszystkie linie mają quantity_packed >= quantity (źródło prawdy z backendu)
    is_completed: bool = Field(default=False, description="Zamówienie w pełni spakowane wg linii / sum")
    order_ui_status: Optional[WmsPackingOrderUiStatusBadge] = None
    shipping_method: Optional[str] = None
    shipping_method_logo_url: Optional[str] = Field(
        default=None,
        description="Logo metody dostawy (centralny słownik) lub null",
    )
    #: FK do ``shipping_methods`` (gdy zamówienie ma przypisaną metodę z słownika).
    shipping_method_id: Optional[str] = Field(
        default=None,
        description="UUID metody dostawy — m.in. do podpowiedzi kartonów na pakowaniu",
    )
    lines: list[WmsPackingOrderLine] = Field(default_factory=list)
    bundle_trees: list[WmsPackingBundleTreeNode] = Field(
        default_factory=list,
        description="Drzewo postępu bundle (P4.15B)",
    )
    basket_code: Optional[str] = Field(
        default=None,
        description="Etykieta koszyka (tryb baskets) — np. S-1-2 lub nazwa; null w bulk / no_cart",
    )
    customer_comment: Optional[str] = Field(default=None, description="Uwagi klienta (meta / import)")
    staff_notes: Optional[str] = Field(default=None, description="Notatki magazynu (meta)")
    sales_document_label: Optional[str] = Field(
        default=None,
        description="Numer dokumentu sprzedaży — jeśli jest, dokument uznany za wygenerowany",
    )
    document_prefix: str = Field(
        default="Pa",
        description="Fa lub Pa — oczekiwany typ dokumentu, gdy brak jeszcze numeru (szara plakietka)",
    )
    #: Oś czasu WMS (PICK + heurystyka pakowania) — panel zamówienia.
    wms_timeline: List[WmsOrderTimelineEvent] = Field(default_factory=list)
    wms_operation_times: Optional[WmsOperationTimesOut] = Field(default=None)
    #: Semantycznie tożsame z ``wms_timeline`` / ``wms_operation_times`` (API rozszerzone).
    timeline: List[WmsOrderTimelineEvent] = Field(default_factory=list)
    operation_times: Optional[WmsOperationTimesOut] = Field(default=None)
    #: ``orders.fulfillment_state`` (WMS) — nagłówek OMS / status operacyjny.
    wms_fulfillment_state: Optional[str] = Field(default=None, max_length=32)
    #: Kod wózka lub etykieta koszyka (gdy przypisane) — nagłówek OMS.
    wms_vehicle_label: Optional[str] = Field(default=None, max_length=64)
    #: Linie logistyki (wózek / koszyk) — OMS pod „zbieranie”; bez duplikacji z nagłówkiem pojazdu.
    wms_operational_logistics_lines: list[str] = Field(
        default_factory=list,
        description='Np. ["Wózek: #12"] lub ["Wózek koszykowy: #3","Koszyk: A2"]',
    )
    #: Faza workflow: ``cart_id`` + znaczniki — bez wyprowadzania z sum picków. Null gdy brak realnych danych WMS.
    wms_workflow_phase: Optional[str] = Field(
        default=None,
        max_length=32,
        description="PICKING | READY_TO_PACK | PACKING | PACKED | NEEDS_DECISION | MISSING lub null (poza przepływem WMS)",
    )
    wms_cart_id: Optional[int] = Field(default=None, description="order.cart_id (null po domknięciu zbierania)")
    wms_picking_finished_at: Optional[datetime] = Field(default=None)
    wms_packing_started_at: Optional[datetime] = Field(default=None)
    wms_packing_finished_at: Optional[datetime] = Field(default=None, description="Równoznaczne z orders.packed_at")
    #: Packaging Intelligence — Smart Matching + 3D Matching (wspólny model propozycji).
    packaging_suggestions: list[PackagingSuggestionOut] = Field(
        default_factory=list,
        description="PRIMARY + krótka lista alternatyw (nie pełna lista losowych kartonów)",
    )
    #: Jedna rekomendacja podstawowa — ten sam wpis co pierwszy element ``packaging_suggestions`` gdy istnieje.
    primary_packaging_suggestion: Optional[PackagingSuggestionOut] = Field(
        default=None,
        description="Główny wybór silnika pakowania",
    )
    #: Alternatywy operacyjne (zbliżony koszt / nie mieści się w primary / preferencje kuriera).
    packaging_alternatives: list[PackagingSuggestionOut] = Field(
        default_factory=list,
        description="Lista bez primary — zwinięta w UI",
    )
    #: Wybrany karton (OMS / pakowanie) — gdy ustawiony.
    selected_carton_id: Optional[str] = Field(default=None, description="cartons.id")
    selected_carton: Optional["WmsPackingRecommendedCarton"] = Field(default=None)
    #: Notatki operacyjne przypięte do modułu pakowania (widoczność ``show_in_packing``).
    operational_notes_packing: list[WmsOperationalNoteBrief] = Field(default_factory=list)
    #: Krótki nagłówek ostrzeżenia (np. baner na stanowisku pakowania).
    wms_operational_alert_title: Optional[str] = Field(default=None, max_length=120)


class WmsPackingCartOrdersOut(BaseModel):
    """Odpowiedź GET …/carts/by-code/{code}/orders — lista pakowania dla wózka po kodzie skanu."""

    cart_id: int = Field(..., ge=1)
    cart_code: str
    #: Etykieta użytkowa (nazwa wózka); ``cart_code`` zostaje do skanów / zgodności wstecz.
    cart_display_name: str = Field(default="", description="Nazwa wózka do UI (jak display_name)")
    cart_type: str = Field(..., description="BULK lub MULTI (jak resolve wózka)")
    orders: list[WmsPackingOrderCard] = Field(default_factory=list)


class WmsPackingBasketOrderOut(BaseModel):
    """Odpowiedź GET …/baskets/{code}/order — jedno zamówienie przypisane do koszyka."""

    order_id: int = Field(..., ge=1)
    basket_code: str = Field(..., description="Kod wyświetlany jak na liście (nazwa lub S-r-k)")


class WmsPackingShelfOrderOut(BaseModel):
    """Odpowiedź GET /wms/packing/resolve-shelf — zamówienie przypisane do półki kompletacyjnej."""

    order_id: int = Field(..., ge=1)
    shelf_label: str = Field(..., description="Etykieta półki, np. RK-01/A2")


class WmsPackingRecommendedCarton(BaseModel):
    """Karton z słownika magazynu — propozycja lub aktualny wybór na pakowaniu."""

    id: str = Field(..., description="UUID kartonu (cartons.id)")
    name: str = Field("", description="Nazwa kartonu")
    dimensions: str = Field("", description="Np. 30×20×15 cm")
    image_url: Optional[str] = Field(default=None, description="Miniatura z panelu materiałów")
    is_best: bool = Field(default=False, description="Domyślna propozycja (mock: pierwszy z listy)")


class OrderSelectCartonBody(BaseModel):
    carton_id: str = Field(..., min_length=1, max_length=64, description="cartons.id")


class OrderSelectCartonResponse(BaseModel):
    selected_carton_id: Optional[str] = None
    selected_carton: Optional[WmsPackingRecommendedCarton] = None


class WmsPackingFinishBody(BaseModel):
    """Opcje domknięcia pakowania — wymaga uprawnień dla ``allow_without_carton``."""

    allow_without_carton: bool = Field(
        default=False,
        description="Domknij potok bez wybranego kartonu — tylko dla operatorów z uprawnieniem magazynowym",
    )


class WmsPackingOrderDetailOut(WmsPackingOrderCard):
    """Szczegół zamówienia na ekranie pakowania (klient + pierwsza linia do spakowania)."""

    customer_name: str = Field("", description="Imię i nazwisko / firma z addresses_json")
    shipping_address: str = Field("", description="Zarezerwowane; na ekranie pakowania puste")
    customer_phone: Optional[str] = Field(None, description="Telefon z addresses_json (billing/shipping/customer)")
    shipping_method_name: Optional[str] = Field(
        None, description="Nazwa metody wysyłki (jak shipping_method na karcie)"
    )
    payment_label: Optional[str] = Field(None, description="Np. wartość + waluta (legacy)")
    current_line: Optional[WmsPackingOrderLine] = Field(
        None, description="Pierwsza linia z quantity_packed < quantity (FIFO po order_item_id)"
    )
    #: Pozycja w kolejce pakowania (1-based) i rozmiar kolejki (jak w UI „1/10”)
    queue_index: int = Field(default=1, ge=1)
    queue_total: int = Field(default=1, ge=1)
    order_value_display: Optional[str] = Field(default=None, description="Wartość zamówienia do wyświetlenia (PLN)")
    shipping_fee_display: Optional[str] = Field(default=None, description="Np. dopisek kosztu dostawy")
    payment_method_text: Optional[str] = Field(default=None, description="Opis płatności (np. Allegro Pay / opłacone)")
    pickup_point: Optional[bool] = Field(default=None, description="Czy punkt odbioru (jeśli znane)")
    waybill_count: int = Field(default=1, ge=1, description="Liczba listów przewozowych")
    cart_display_code: Optional[str] = Field(default=None, description="Kod wózka (np. WP-2)")
    recommended_cartons: list[WmsPackingRecommendedCarton] = Field(
        default_factory=list,
        description="2–3 aktywne kartony z magazynu (mock); pierwszy ma is_best",
    )
    #: Wszystkie kartony powiązane z ``shipping_method_id`` zamówienia (pełny wybór w modalu).
    shipping_compatible_cartons: list[WmsPackingRecommendedCarton] = Field(
        default_factory=list,
        description="Kartony z linku carton↔shipping_method; przy braku metody — wszystkie aktywne w magazynie",
    )

    @computed_field
    @property
    def labels_count(self) -> int:
        """Alias w API (etykiety / listy przewozowe) — zgodny z ``waybill_count``."""
        return int(self.waybill_count)


class WmsPackingResolveEanOut(BaseModel):
    order_id: int = Field(..., ge=1)


class WmsPackingPostPackStepResult(BaseModel):
    """Wynik jednego kroku potoku po pełnym spakowaniu (kolejność zgodna z konfiguracją)."""

    step: str
    ok: bool
    skipped: bool = False
    message: Optional[str] = None


class WmsPackingScanOut(BaseModel):
    detail: WmsPackingOrderDetailOut
    fully_packed: bool = Field(..., description="True gdy wszystkie linie mają pełną ilość spakowaną")
    #: Wypełniane na odpowiedzi ``POST …/finish`` — z ustawień pakowania magazynu.
    packing_after_finish_action: Optional[Literal["STAY", "GO_TO_LIST"]] = Field(
        default=None,
        description="STAY = zostaj na ekranie zamówienia; GO_TO_LIST = wróć na listę kolejki",
    )
    next_order_id: Optional[int] = Field(None, description="Następne zamówienie w kolejce FIFO po domknięciu")
    last_packed_order_item_id: Optional[int] = Field(
        default=None,
        description="order_items.id — ostatnia zaktualizowana linia (podświetlenie w UI)",
    )
    post_pack_pipeline: Optional[List[WmsPackingPostPackStepResult]] = Field(
        default=None,
        description="Wyniki kroków po pełnym spakowaniu (dokument, przesyłka, druk, status) — null gdy nie dotyczy",
    )


class WmsPackingEntryOut(BaseModel):
    """Bootstrap sesji pakowania — bezpośrednie wejście z workflow braków."""

    success: bool = True
    order_id: int = Field(..., ge=1)
    packing_session_id: Optional[int] = None
    packing_session_created: bool = False
    status_id: int = Field(..., ge=1)
    status_name: str = ""
    status_color: str = "#94a3b8"
    main_group: OrderUiMainGroup = "NEW"
    mode: Literal["no_cart", "bulk", "baskets"]
    cart_id: Optional[int] = Field(default=None, ge=1)
    cart_code: Optional[str] = None
    cart_type: Optional[str] = None
    source_workflow: str = Field(default="shortage", max_length=32)


class WmsPackingScanBody(BaseModel):
    ean: str = Field(..., min_length=1, description="Zeskanowany kod (EAN / kod dodatkowy jak przy przyjęciu)")


class WmsPackingLinePackBody(BaseModel):
    order_item_id: int = Field(..., ge=1)
    quantity: int = Field(..., ge=1, description="Ile szt. dopisać do packing_quantity_packed (nie więcej niż brak)")
