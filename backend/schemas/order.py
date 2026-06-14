from datetime import datetime
from typing import List, Literal, Optional

from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator


class PanelFulfillmentHistoryEntry(BaseModel):
    """Zdarzenia magazynowe / OMS zapisywane w ``import_metadata_json.panel_fulfillment_history``."""

    at: str
    lines: List[str] = Field(default_factory=list)
    kind: Optional[str] = Field(None, description="np. order_line_removed | shortage_reduced")
    order_item_id: Optional[int] = Field(None, description="Id pozycji zamówienia powiązanej ze zdarzeniem")
    product_name: Optional[str] = None
    product_sku: Optional[str] = Field(None, description="SKU/symbol produktu w momencie zdarzenia")
    product_ean: Optional[str] = None
    quantity_ordered: Optional[float] = Field(
        None,
        description="Legacy: przy usunięciu linii = ilość linii; przy braku = zmniejszenie (preferuj quantity_affected)",
    )
    quantity_before: Optional[float] = Field(None, description="Ilość zamówiona na linii przed zdarzeniem (np. przed korektą braku)")
    quantity_affected: Optional[float] = Field(None, description="Ilość usunięta lub zmniejszona")
    unit_price: Optional[float] = None
    line_total: Optional[float] = Field(None, description="Wartość linii lub części usuniętej (snapshot)")

from ..utils.ui_status_color import DEFAULT_PANEL_STATUS_HEX, parse_hex_color_strict
from .customer import CustomerBriefOut

OrderUiMainGroup = Literal["NEW", "IN_PROGRESS", "DONE"]


class OrderUiPanelSubgroupRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    main_group: OrderUiMainGroup
    name: str
    sort_order: int = 0

    class Config:
        from_attributes = True


class OrderUiPanelSubgroupCreate(BaseModel):
    main_group: OrderUiMainGroup
    name: str


class OrderUiPanelSubgroupUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class OrderUiPanelSubgroupReorder(BaseModel):
    main_group: OrderUiMainGroup
    subgroup_id: int
    direction: Literal["up", "down"]


class ProductInOrder(BaseModel):
    id: int
    name: Optional[str] = None
    ean: Optional[str] = None
    sku: Optional[str] = None
    symbol: Optional[str] = None
    weight: Optional[float] = None
    volume: Optional[float] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    image_url: Optional[str] = None
    #: Katalog — cena zakupu netto (snapshot operacyjny; koszt „bieżący” linii w polach margin_*).
    purchase_price: Optional[float] = None

    class Config:
        from_attributes = True


class SourceBundleBrief(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None

    class Config:
        from_attributes = True


class OrderLineBundleComponentRead(BaseModel):
    product_id: Optional[int] = None
    product_name_snapshot: str
    sku_snapshot: Optional[str] = None
    ean_snapshot: Optional[str] = None
    quantity_per_bundle: int
    quantity_total: int
    purchase_price_net_snapshot: Optional[float] = None
    unit_price_net_snapshot: Optional[float] = None

    class Config:
        from_attributes = True


class OrderItemRead(BaseModel):
    id: int
    quantity: int
    product: ProductInOrder
    unit_volume_dm3: Optional[float] = None
    line_total_weight: Optional[float] = None
    unit_price: Optional[float] = None
    #: VAT linii (%) — zapis w ``order_items.vat_percent``; null gdy brak.
    vat_percent: Optional[float] = Field(default=None, ge=0, le=100)
    #: Cena jednostkowa netto (spójnie z ``sale_price`` katalogu i eksplozją bundle).
    unit_price_net: Optional[float] = Field(default=None, description="Alias semantyczny — tożsame z unit_price gdy ustawione")
    unit_price_gross: Optional[float] = None
    unit: Optional[str] = Field(default=None, max_length=64)
    list_price: Optional[float] = None
    #: Wartość linii z DB (przy archiwum REPLACED często zachowana do podglądu historii).
    total_price: Optional[float] = None
    #: Agregaty VAT / brutto (``unit_price`` i ``total_price`` traktowane jako netto).
    line_net_total: Optional[float] = None
    line_vat_amount: Optional[float] = None
    line_gross_total: Optional[float] = None
    #: Koszt zakupu linii (netto) wg ``get_products_current_costs`` × ilość.
    line_purchase_total_net: Optional[float] = None
    line_margin_amount: Optional[float] = None
    line_margin_percent: Optional[float] = None
    source_bundle_id: Optional[int] = None
    bundle_instance_id: Optional[str] = None
    bundle_qty: Optional[int] = Field(None, description="Number of bundles ordered for this instance (from metadata)")
    from_bundle: bool = False
    source_bundle: Optional[SourceBundleBrief] = None
    is_bundle_parent: bool = False
    parent_bundle_order_item_id: Optional[int] = Field(None, description="Komponent zestawu → id nagłówka")
    bundle_display_unit_price: Optional[float] = Field(None, description="Cena składowej w zestawie (prezentacja)")
    bundle_display_line_total: Optional[float] = Field(None, description="Wartość składowej w zestawie (prezentacja)")
    #: OMS (``metadata_json.oms_waiting_for_stock``) — czekanie na towar zamiast dalszej realizacji linii.
    oms_waiting_for_stock: bool = False
    replaced_from_order_item_id: Optional[int] = None
    replaced_from_product_name: Optional[str] = None
    #: ``REPLACED`` — linia zarchiwizowana po zamianie; ``TO_PICK`` — nowa linia oczekująca na zbieranie.
    oms_line_status: Optional[str] = None
    #: Snapshot z metadanych — ile szt. braku objęte „czeka na towar” (0 = nie ustawiono).
    oms_waiting_missing_qty: Optional[float] = None
    #: Z ``metadata_json.oms_replacement`` — ilości sprzed zamiany (widok historii w panelu).
    oms_replacement_original_quantity: Optional[int] = None
    oms_replacement_transferred_quantity: Optional[int] = None
    product_sales_offer_id: Optional[int] = None
    offer_name_snapshot: Optional[str] = None
    required_stock_disposition: str = "SALEABLE"
    bundle_fulfillment_mode: Optional[str] = Field(
        None,
        description="ON_DEMAND_ASSEMBLY | STOCK_PRODUCTION — snapshot z momentu utworzenia linii zestawu",
    )
    bundle_components: list[OrderLineBundleComponentRead] = Field(default_factory=list)

    class Config:
        from_attributes = True


class OrderItemLineEditPatch(BaseModel):
    """Edycja pól linii (bez akcji braków) — co najmniej jedno pole musi być ustawione."""

    quantity: Optional[int] = Field(None, ge=1)
    unit_price: Optional[float] = Field(None, ge=0)
    vat_percent: Optional[float] = Field(None, ge=0, le=100)
    unit: Optional[str] = Field(None, max_length=64)


class OrderItemPanelPatchBody(BaseModel):
    """Panel OMS: jedna akcja na brak — zamiana / usunięcie braku z zamówienia / czekanie na towar."""

    replace_product_id: Optional[int] = Field(None, ge=1, description="Nowy produkt — tylko na wyliczony brak (ilość)")
    waiting_for_stock: Optional[bool] = Field(
        None,
        description="True = oznacz brak jako czeka na towar (tylko wyliczona ilość); False = usuń",
    )
    remove_missing: Optional[bool] = Field(
        None,
        description="True = zmniejsz zamówioną o wyliczony brak (pobrań nie zmienia)",
    )
    line_edit: Optional[OrderItemLineEditPatch] = Field(
        default=None,
        description="Prosta edycja ilości/ceny/VAT/jednostki — wyłącznie gdy brak akcji braków.",
    )

    @model_validator(mode="after")
    def _exactly_one_action(self) -> "OrderItemPanelPatchBody":
        has_rep = self.replace_product_id is not None
        has_wait = self.waiting_for_stock is not None
        has_rm = self.remove_missing is True
        shortage_actions = int(has_rep) + int(has_wait) + int(has_rm)
        if self.line_edit is not None:
            if shortage_actions > 0:
                raise ValueError("Nie łącz line_edit z akcjami braków (replace / waiting / remove_missing).")
            le = self.line_edit
            has_unit = le.unit is not None and str(le.unit).strip() != ""
            if le.quantity is None and le.unit_price is None and le.vat_percent is None and not has_unit:
                raise ValueError("line_edit: ustaw co najmniej jedno pole (ilość, cena, VAT lub jednostka).")
            return self
        if shortage_actions != 1:
            raise ValueError("Użyj dokładnie jednej akcji: replace_product_id, waiting_for_stock lub remove_missing=true")
        return self


class OrderUiStatusBrief(BaseModel):
    id: int
    name: str
    color: str
    main_group: OrderUiMainGroup
    group_name: Optional[str] = None
    subgroup_name: Optional[str] = None
    badge_color: str = DEFAULT_PANEL_STATUS_HEX
    background_color: str = DEFAULT_PANEL_STATUS_HEX
    text_color: str = "#0f172a"
    image_url: Optional[str] = None
    is_active: bool = True


class OrderUiStatusRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    main_group: OrderUiMainGroup
    name: str
    color: str
    sort_order: int = 0
    #: Built-in / seeded labels cannot be reordered or deleted via panel APIs.
    is_system: bool = False
    group_name: Optional[str] = None
    subgroup_name: Optional[str] = None
    sort_group: int = 0
    sort_subgroup: int = 0
    sort_status: int = 0
    badge_color: str = DEFAULT_PANEL_STATUS_HEX
    background_color: str = DEFAULT_PANEL_STATUS_HEX
    text_color: str = "#0f172a"
    image_url: Optional[str] = None
    is_active: bool = True


class OrderUiStatusWithCount(OrderUiStatusRead):
    count: int = 0
    #: Powiązanie z konfiguracją WMS (``picking_config``) — rozróżnienie OMS vs magazyn.
    wms_workflow_role: Optional[Literal["picking_source", "picking_target", "both"]] = None


class OrderUiPanelGroupBlock(BaseModel):
    main_group: OrderUiMainGroup
    group_display_name: Optional[str] = Field(
        None,
        description="Zarezerwowane; zawsze null — nazwy grup głównych są stałe (UI z mapy main_group).",
    )
    total_count: int = 0
    sub_statuses: List[OrderUiStatusWithCount] = Field(default_factory=list)


class OrderUiStatusPanelSummary(BaseModel):
    groups: List[OrderUiPanelGroupBlock] = Field(default_factory=list)
    unassigned_count: int = 0


class OrderUiStatusCreate(BaseModel):
    name: str
    main_group: OrderUiMainGroup = "NEW"
    color: str = DEFAULT_PANEL_STATUS_HEX
    sort_order: int = 0
    group_name: Optional[str] = None
    subgroup_name: Optional[str] = None
    sort_group: int = 0
    sort_subgroup: int = 0
    sort_status: Optional[int] = None
    badge_color: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True

    @field_validator("color")
    @classmethod
    def _validate_color_hex(cls, v: str) -> str:
        return parse_hex_color_strict(v)

    @field_validator("badge_color", "background_color", "text_color")
    @classmethod
    def _validate_token_hex(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return parse_hex_color_strict(v)


class OrderUiStatusUpdate(BaseModel):
    name: Optional[str] = None
    main_group: Optional[OrderUiMainGroup] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    group_name: Optional[str] = None
    subgroup_name: Optional[str] = None
    sort_group: Optional[int] = None
    sort_subgroup: Optional[int] = None
    sort_status: Optional[int] = None
    badge_color: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("color")
    @classmethod
    def _validate_color_hex_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return parse_hex_color_strict(v)

    @field_validator("badge_color", "background_color", "text_color")
    @classmethod
    def _validate_token_hex_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return parse_hex_color_strict(v)


class OrderSubstatusReorderRequest(BaseModel):
    """Either ``ordered_ids`` (full custom reorder within group) or ``status_id`` + ``direction`` (swap with neighbour)."""

    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    main_group: OrderUiMainGroup
    status_id: Optional[int] = Field(None, ge=1, description="Panel sub-status id — for move up/down")
    direction: Optional[Literal["up", "down"]] = None
    ordered_ids: Optional[List[int]] = Field(
        None,
        description="All non-system status ids in this main_group in desired order (replaces custom order)",
    )

    @model_validator(mode="after")
    def _mode(self) -> "OrderSubstatusReorderRequest":
        full = self.ordered_ids is not None
        move = self.status_id is not None and self.direction is not None
        if full and move:
            raise ValueError("Use either ordered_ids or status_id+direction, not both")
        if not full and not move:
            raise ValueError("Provide ordered_ids (including empty list) or status_id+direction")
        return self


class OrderUiStatusPatch(BaseModel):
    sub_status_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("sub_status_id", "order_ui_status_id"),
    )


class OrderSelectedCartonBrief(BaseModel):
    """Selected packing carton on order (WMS / panel)."""

    id: str
    name: str
    dimensions: str = ""
    image_url: Optional[str] = None


class OrderDocumentRead(BaseModel):
    id: int
    document_type: str
    original_filename: str
    file_url: str
    created_at: Optional[datetime] = None


class OrderActivityLogRead(BaseModel):
    id: int
    event_type: str
    message: str
    created_at: Optional[datetime] = None


class OrderNoteRead(BaseModel):
    id: int
    type: str
    content: str
    created_at: Optional[datetime] = None


class OrderOperationalNoteRead(BaseModel):
    id: int
    order_id: int
    author_user_id: Optional[int] = None
    content: str
    show_in_picking: bool = False
    show_in_packing: bool = False
    show_in_returns: bool = False
    show_in_complaints: bool = False
    priority: Optional[int] = None
    color_tag: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class OrderOperationalNoteCreateBody(BaseModel):
    content: str = Field(..., min_length=1, max_length=8000)
    show_in_picking: bool = False
    show_in_packing: bool = False
    show_in_returns: bool = False
    show_in_complaints: bool = False
    priority: Optional[int] = Field(None, ge=0, le=100)
    color_tag: Optional[str] = Field(None, max_length=32)


class OrderLinkedDocumentRead(BaseModel):
    """Powiązane dokumenty sprzedaży i magazynowe (PA/FV ↔ WZ)."""

    id: str
    kind: Literal["sale", "warehouse"]
    document_type: str
    document_subtype: Optional[str] = None
    document_number: str
    detail_path: str
    print_kind: Optional[str] = None
    sale_document_id: Optional[str] = None
    stock_document_id: Optional[int] = None


class OrderRead(BaseModel):
    id: int
    tenant_id: int = Field(..., description="Tenant zamówienia (WMS / panel).")
    warehouse_id: int = Field(..., ge=1, description="Magazyn zamówienia — np. reklamacje i RMZ wg tego magazynu.")
    number: Optional[str] = None
    external_id: Optional[str] = None
    sales_document_number: Optional[str] = None
    order_origin: Optional[str] = None
    complaint_id: Optional[int] = None
    original_order_id: Optional[int] = None
    complaint_order_type: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = None
    #: Wewnętrzny kod skanowania WMS (ESP:O:id); unikat globalnie.
    scan_code: Optional[str] = None
    # Context for W / UI headers (from addresses_json + source); not persisted columns
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    source: Optional[str] = None
    items: List[OrderItemRead]
    total_volume: Optional[float] = None
    is_multi_item: bool = False
    # Detail view / WMS (same GET — avoids extra round-trips)
    order_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    value: Optional[float] = None
    discount_type: Optional[Literal["percent", "amount"]] = None
    discount_value: Optional[float] = None
    discount_amount: float = 0.0
    total_products_value: Optional[float] = None
    #: Przychód netto z dostawy (``import_metadata_json.shipping_cost`` domyślnie brutto → netto wg VAT dostawy).
    shipping_revenue_net: Optional[float] = None
    #: Towary po rabacie (netto) + przychód netto z dostawy — podstawa marży operacyjnej.
    total_revenue_net: Optional[float] = None
    total_purchase_cost: Optional[float] = None
    gross_profit: Optional[float] = None
    margin: Optional[float] = None
    shipping_method_id: Optional[str] = None
    shipping_method: Optional[str] = None
    shipping_method_logo_url: Optional[str] = None
    currency: Optional[str] = None
    addresses_json: Optional[str] = None
    order_ui_status: Optional[OrderUiStatusBrief] = None
    #: Panel-only prefs (stored in ``import_metadata_json``).
    panel_document_type: Optional[str] = Field(
        None,
        description="PARAGON | INVOICE when set",
    )
    panel_payment_method: Optional[str] = None
    panel_payment_status: Optional[str] = None
    #: Kwota opłacona (tekst z importu CSV lub ręczna).
    panel_amount_paid: Optional[str] = None
    #: Koszt dostawy z importu (``import_metadata_json.shipping_cost``).
    panel_shipping_cost: Optional[float] = None
    #: Tekst kosztu dostawy gdy nie udało się sparsować liczby (``shipping_cost_display``).
    panel_shipping_cost_display: Optional[str] = None
    #: Numery listów przewozowych z importu (jedna linia).
    panel_tracking_numbers: Optional[str] = None
    selected_carton_id: Optional[str] = None
    selected_carton: Optional[OrderSelectedCartonBrief] = None
    #: UUID ``document_series.id`` (SALE / INVOICE|RECEIPT) from ``import_metadata_json``.
    panel_document_series_id: Optional[str] = None
    customer_id: Optional[int] = None
    customer: Optional[CustomerBriefOut] = None
    panel_fulfillment_history: List[PanelFulfillmentHistoryEntry] = Field(
        default_factory=list,
        description="Historia usunięć / rozwiązań braków (panel) — poza zamianami z metadanych linii.",
    )
    order_documents: List[OrderDocumentRead] = Field(
        default_factory=list,
        description="Dokumenty wgrane do zamówienia (panel).",
    )
    order_activity_logs: List[OrderActivityLogRead] = Field(
        default_factory=list,
        description="Dziennik zdarzeń panelu (m.in. upload dokumentów).",
    )
    order_notes: List[OrderNoteRead] = Field(default_factory=list)
    #: Notatki operacyjne magazynu (WMS / moduły widoczności) — osobno od komentarza klienta.
    operational_notes: List[OrderOperationalNoteRead] = Field(default_factory=list)
    #: Skróty dla nagłówka listy / ikon (bez dodatkowych żądań).
    has_internal_note: bool = False
    has_customer_comment: bool = False
    latest_internal_note_preview: Optional[str] = None
    latest_customer_comment_preview: Optional[str] = None
    #: Flaga priorytetu (OMS): ``gray`` | ``blue`` | ``green`` | ``yellow`` | ``orange`` | ``red`` lub null.
    priority_color: Optional[str] = None
    #: Spakowano w WMS (``orders.packed_at``) — znacznik operacyjny, nie status panelu.
    wms_packed_at: Optional[datetime] = None
    wms_packed_by_label: Optional[str] = None
    wms_workflow_phase: Optional[str] = None
    order_channel: Optional[str] = Field(
        None,
        description="DIRECT_SALE | ONLINE | … — kanał sprzedaży.",
    )
    fulfillment_mode: Optional[str] = Field(
        None,
        description="IMMEDIATE | WMS | DELIVERY_ONLY | … — tryb realizacji.",
    )
    linked_documents: List[OrderLinkedDocumentRead] = Field(
        default_factory=list,
        description="Powiązane dokumenty PA/FV i WZ.",
    )
    fulfillment_assignment_phase: Optional[str] = Field(
        None,
        description="P3 — UNASSIGNED | FULFILLMENT_ASSIGNED | WAVE_CREATED | PICKING | PACKING | SHIPPED",
    )
    fulfillment_warehouse_name: Optional[str] = Field(
        None,
        description="Nazwa magazynu realizacji (orders.warehouse_id).",
    )
    fulfillment_warehouse_change_locked: bool = Field(
        False,
        description="True od WAVE_CREATED — brak zmiany magazynu przez operatora.",
    )
    fulfillment_assignment_strategy: Optional[str] = Field(
        None,
        description="Strategia z ostatniego audytu przypisania magazynu.",
    )
    fulfillment_assigned_at: Optional[datetime] = Field(
        None,
        description="Data ostatniego przypisania magazynu realizacji.",
    )
    fulfillment_assigned_by_label: Optional[str] = Field(
        None,
        description="AUTO lub nazwa użytkownika z audytu.",
    )
    fulfillment_assignment_reason: Optional[str] = Field(
        None,
        description="Powód z ostatniego audytu przypisania.",
    )

    class Config:
        from_attributes = True


class OrderAssignWarehouseBody(BaseModel):
    warehouse_id: int = Field(..., ge=1)
    reason: str = Field(..., min_length=1, max_length=2000)


class OrderCreateLine(BaseModel):
    product_id: Optional[int] = Field(default=None, ge=1)
    bundle_id: Optional[int] = Field(default=None, ge=1)
    offer_id: Optional[int] = Field(default=None, ge=1, description="Sales offer (Etap 3A)")
    quantity: int = Field(..., ge=1)
    required_stock_disposition: Optional[str] = Field(
        default=None,
        description="Pula magazynowa (domyślnie SALEABLE; backend akceptuje OUTLET_B)",
    )
    unit_price: Optional[float] = Field(
        None,
        description="Override unit price: for products = sale line; for bundles = price per one bundle",
    )

    @field_validator("required_stock_disposition")
    @classmethod
    def _validate_required_stock_disposition(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        from ..services.stock_disposition import disposition_for_new_order_line

        return disposition_for_new_order_line(v)

    @model_validator(mode="after")
    def _exactly_one_catalog_ref(self) -> "OrderCreateLine":
        has_offer = self.offer_id is not None and int(self.offer_id) > 0
        has_p = self.product_id is not None
        has_b = self.bundle_id is not None
        if has_offer and (has_p or has_b):
            raise ValueError("offer_id cannot be combined with product_id or bundle_id")
        if not has_offer and has_p == has_b:
            raise ValueError("Each line must set exactly one of product_id, bundle_id, or offer_id")
        return self


class OrderCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    login: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = None
    note: Optional[str] = None
    comment: Optional[str] = None
    shipping_cost: float = Field(0.0, ge=0)
    # Adresy jak w import / addresses_json (flat na wejściu → billing / shipping w JSON)
    billing_street: Optional[str] = None
    billing_city: Optional[str] = None
    billing_postal_code: Optional[str] = None
    billing_country: Optional[str] = None
    #: Firma / NIP do bliku ``billing`` w ``addresses_json`` (nie do ``note`` / ``comment``).
    company_name: Optional[str] = Field(None, max_length=512)
    nip: Optional[str] = Field(None, max_length=32)
    shipping_street: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_postal_code: Optional[str] = None
    shipping_country: Optional[str] = None
    items: List[OrderCreateLine] = Field(..., min_length=1)
    #: Optional FK to ``shipping_methods`` (same tenant + warehouse as order).
    shipping_method_id: Optional[str] = Field(None, max_length=36)
    #: Typ dokumentu sprzedaży (panel) — zapis w ``import_metadata_json``.
    document_type: Optional[str] = Field(None, description="PARAGON | INVOICE or empty")
    payment_method: Optional[str] = Field(None, max_length=128)
    payment_status: Optional[str] = Field(None, max_length=128)
    sales_document_number: Optional[str] = Field(None, max_length=128)
    #: When True, validate SUM(inventory) per product in warehouse before creating order (bundles + loose lines).
    check_bundle_stock: bool = False
    #: np. COMPLAINT — wymiana z reklamacji
    origin: Optional[str] = None
    complaint_id: Optional[int] = None
    original_order_id: Optional[int] = None
    #: Gdy origin=COMPLAINT: EXCHANGE (dostawa + odbiór) lub REPLACEMENT (tylko dostawa)
    complaint_order_type: Optional[Literal["EXCHANGE", "REPLACEMENT"]] = None
    customer_id: Optional[int] = Field(None, ge=1, description="Optional FK to customers (same tenant)")

    @field_validator("document_type")
    @classmethod
    def _validate_create_document_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        u = str(v).strip().upper()
        if u not in ("PARAGON", "INVOICE"):
            raise ValueError("document_type must be PARAGON or INVOICE")
        return u


class OrderCreateResponse(BaseModel):
    id: int
    number: Optional[str] = None


class OrderPatchBody(BaseModel):
    """Partial update for order header fields used in panel."""

    #: Appends one internal note entry to ``import_metadata_json.panel_internal_notes`` (list of dicts).
    internal_note_append: Optional[str] = Field(None, max_length=2000)
    #: Inserts ``OrderNote`` row ``type=customer`` (komunikacja dla klienta).
    customer_note_append: Optional[str] = Field(None, max_length=8000)
    #: Tworzy wpis ``order_operational_notes`` widoczny w zbieraniu i pakowaniu.
    operational_note_append: Optional[str] = Field(None, max_length=8000)
    shipping_method_id: Optional[str] = Field(None, max_length=36, description="Set to empty string to clear FK")
    document_type: Optional[str] = Field(None, description="PARAGON | INVOICE or empty string to clear")
    payment_method: Optional[str] = Field(None, max_length=128)
    payment_status: Optional[str] = Field(None, max_length=128)
    sales_document_number: Optional[str] = Field(None, max_length=128)
    first_name: Optional[str] = Field(None, max_length=128)
    last_name: Optional[str] = Field(None, max_length=128)
    phone: Optional[str] = Field(None, max_length=64)
    email: Optional[str] = Field(None, max_length=256)
    company_name: Optional[str] = Field(None, max_length=512)
    nip: Optional[str] = Field(None, max_length=32)
    priority_color: Optional[str] = Field(
        None,
        description="gray | blue | green | yellow | orange | red; null clears priority",
    )
    document_series_id: Optional[str] = Field(None, max_length=36, description="document_series.id (UUID)")
    discount_type: Optional[Literal["percent", "amount"]] = Field(
        None,
        description="Order-level discount mode. Send null or discount_value=0 to clear.",
    )
    discount_value: Optional[float] = Field(None, ge=0)
    #: Delivery block in ``addresses_json.shipping`` (same shape as order create / import).
    shipping_name: Optional[str] = Field(None, max_length=256)
    shipping_street: Optional[str] = Field(None, max_length=512)
    shipping_city: Optional[str] = Field(None, max_length=256)
    shipping_postal_code: Optional[str] = Field(None, max_length=64)
    shipping_country: Optional[str] = Field(None, max_length=128)
    customer_id: Optional[int] = Field(
        default=None,
        description="Link to customers.id (same tenant); JSON null clears the link",
    )

    @field_validator("document_type")
    @classmethod
    def _validate_patch_document_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return ""
        u = s.upper()
        if u not in ("PARAGON", "INVOICE"):
            raise ValueError("document_type must be PARAGON or INVOICE")
        return u

    @field_validator("customer_id")
    @classmethod
    def _validate_patch_customer_id(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if int(v) < 1:
            raise ValueError("customer_id must be >= 1")
        return int(v)

    @field_validator("priority_color")
    @classmethod
    def _normalize_patch_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip().lower()
        if not s:
            return None
        if s not in ORDER_PRIORITY_COLOR_VALUES:
            raise ValueError("priority_color must be one of: gray, blue, green, yellow, orange, red or empty/null")
        return s


class OrderAddLineBody(BaseModel):
    """Append one catalog product line or jedna linia zestawu (eksplozja + nagłówek) do zamówienia."""

    product_id: Optional[int] = Field(None, ge=1)
    bundle_id: Optional[int] = Field(None, ge=1)
    offer_id: Optional[int] = Field(default=None, ge=1, description="Sales offer (Etap 3A)")
    quantity: int = Field(1, ge=1)
    required_stock_disposition: Optional[str] = Field(
        default=None,
        description="Pula magazynowa (domyślnie SALEABLE; backend akceptuje OUTLET_B)",
    )
    unit_price: Optional[float] = Field(None, description="Override unit price; default from product sale_price")
    unit: Optional[str] = Field(None, max_length=32)
    vat_percent: Optional[float] = Field(None, ge=0, le=100)

    @field_validator("required_stock_disposition")
    @classmethod
    def _validate_required_stock_disposition(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        from ..services.stock_disposition import disposition_for_new_order_line

        return disposition_for_new_order_line(v)

    @model_validator(mode="after")
    def _exactly_one_catalog_line(self) -> "OrderAddLineBody":
        has_p = self.product_id is not None and int(self.product_id) > 0
        has_b = self.bundle_id is not None and int(self.bundle_id) > 0
        has_o = self.offer_id is not None and int(self.offer_id) > 0
        refs = sum(1 for x in (has_p, has_b, has_o) if x)
        if refs != 1:
            raise ValueError("Ustaw dokładnie jedno z pól: product_id, bundle_id lub offer_id")
        if has_o and (has_p or has_b):
            raise ValueError("offer_id cannot be combined with product_id or bundle_id")
        return self


class OrderListItemPreview(BaseModel):
    """First N order lines for list row UI (lightweight)."""

    quantity: int
    name: Optional[str] = None
    ean: Optional[str] = None
    sku: Optional[str] = None
    image_url: Optional[str] = None


class OrderListRead(BaseModel):
    id: int
    number: Optional[str] = None
    external_id: Optional[str] = None
    sales_document_number: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = None
    order_date: Optional[datetime] = None
    value: Optional[float] = None
    created_at: Optional[datetime] = None
    source: Optional[str] = None
    shipping_method_id: Optional[str] = None
    shipping_method: Optional[str] = None
    shipping_method_logo_url: Optional[str] = None
    currency: Optional[str] = None
    total_volume: Optional[float] = None
    is_multi_item: bool = False
    total_items: int = 0  # suma quantity (sztuk)
    position_count: int = 0  # liczba pozycji (unikalnych SKU)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    items_preview: List[OrderListItemPreview] = Field(
        default_factory=list,
        description="Pierwsze 3 aktywne linie (podgląd miniatury) — dla kompatybilności.",
    )
    items_display_lines: List[OrderListItemPreview] = Field(
        default_factory=list,
        description="Wszystkie aktywne linie (bez REPLACED / qty=0) — tooltip „+N poz.” i spójna liczba pozycji.",
    )
    #: Liczba pozycji zamówienia z ``wms_picking_line_missing_qty`` > 0 (badge „Braki” na liście OMS).
    wms_missing_line_count: int = 0
    order_ui_status: Optional[OrderUiStatusBrief] = None
    #: Z ``import_metadata_json`` — lista: badge płatności (bez wyliczania logiki UI po stronie klienta).
    panel_payment_status: Optional[str] = None
    panel_payment_method: Optional[str] = None
    gross_profit: Optional[float] = None
    margin_percent: Optional[float] = None
    priority_color: Optional[str] = Field(
        None,
        description="Flame priority: gray | blue | green | yellow | orange | red",
    )
    #: Ustawiane po pełnym spakowaniu w przepływie WMS (``orders.packed_at``) — nie opierać się na statusie tekstowym.
    wms_packed_at: Optional[datetime] = None
    #: Opcjonalna etykieta operatora (przyszłe źródło); tooltip na liście.
    wms_packed_by_label: Optional[str] = None
    #: Faza operacyjna WMS (``compute_wms_workflow_phase``): TO_PICK | PICKING | … | PACKED.
    wms_workflow_phase: Optional[str] = None
    #: Notatki magazynowe (jakikolwiek wpis w ``order_operational_notes``).
    has_internal_note: bool = False
    #: Komentarz klienta / historia komunikacji (meta lub ``order_notes.type=customer``).
    has_customer_comment: bool = False
    latest_internal_note_preview: Optional[str] = None
    latest_customer_comment_preview: Optional[str] = None
    order_channel: Optional[str] = Field(
        None,
        description="DIRECT_SALE | ONLINE | … — kanał sprzedaży.",
    )
    fulfillment_mode: Optional[str] = Field(
        None,
        description="IMMEDIATE | WMS | DELIVERY_ONLY | … — tryb realizacji.",
    )

    class Config:
        from_attributes = True


ORDER_PRIORITY_COLOR_VALUES = frozenset({"gray", "blue", "green", "yellow", "orange", "red"})


class OrderPriorityPatchBody(BaseModel):
    """PATCH ``/orders/{id}/priority`` — ustawienie lub skasowanie koloru priorytetu."""

    priority_color: Optional[str] = Field(
        None,
        description="Jeden z: gray, blue, green, yellow, orange, red; null lub pusty = brak priorytetu",
    )

    @field_validator("priority_color")
    @classmethod
    def _normalize_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip().lower()
        if not s:
            return None
        if s not in ORDER_PRIORITY_COLOR_VALUES:
            raise ValueError(
                "priority_color must be one of: gray, blue, green, yellow, orange, red or empty/null"
            )
        return s