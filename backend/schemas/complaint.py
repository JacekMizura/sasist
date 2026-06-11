import json
from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from ..utils.ui_status_color import DEFAULT_PANEL_STATUS_HEX, parse_hex_color_strict

ComplaintUiMainGroup = Literal["NEW", "IN_PROGRESS", "DONE"]

ComplaintStatusCode = Literal[
    "NOWE",
    "OCZEKIWANIE_NA_PRODUKT",
    "WERYFIKACJA",
    "DECYZJA",
    "ZAAKCEPTOWANA",
    "ODRZUCONA",
]

ComplaintResolutionType = Literal["REPLACEMENT", "REFUND", "PARTIAL_REFUND", "REJECTION"]
ComplaintResolutionStatus = Literal["PENDING", "COMPLETED"]

ComplaintDeleteMode = Literal["archived", "deleted"]


class ComplaintDeleteResult(BaseModel):
    """Odpowiedź DELETE /complaints/{id}/ — bez 500 przy poprawnym żądaniu."""

    success: bool = True
    mode: ComplaintDeleteMode = "archived"


class ComplaintUiStatusBrief(BaseModel):
    id: int
    name: str
    color: str
    main_group: ComplaintUiMainGroup


class ComplaintUiStatusRead(BaseModel):
    id: int
    tenant_id: int
    main_group: ComplaintUiMainGroup
    name: str
    color: str
    sort_order: int = 0


class ComplaintUiStatusWithCount(ComplaintUiStatusRead):
    count: int = 0


class ComplaintUiPanelGroupBlock(BaseModel):
    main_group: ComplaintUiMainGroup
    total_count: int = 0
    sub_statuses: List[ComplaintUiStatusWithCount] = Field(default_factory=list)


class ComplaintUiStatusPanelSummary(BaseModel):
    groups: List[ComplaintUiPanelGroupBlock] = Field(default_factory=list)
    unassigned_count: int = 0


class ComplaintUiStatusCreate(BaseModel):
    name: str
    main_group: ComplaintUiMainGroup = "NEW"
    color: str = DEFAULT_PANEL_STATUS_HEX
    sort_order: int = 0

    @field_validator("color")
    @classmethod
    def _validate_color_hex(cls, v: str) -> str:
        return parse_hex_color_strict(v)


class ComplaintUiStatusUpdate(BaseModel):
    name: Optional[str] = None
    main_group: Optional[ComplaintUiMainGroup] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None

    @field_validator("color")
    @classmethod
    def _validate_color_hex_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return parse_hex_color_strict(v)


class ComplaintUiStatusPatch(BaseModel):
    sub_status_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("sub_status_id", "complaint_ui_status_id"),
    )


class ComplaintCreateFromOrderLine(BaseModel):
    order_item_id: int
    quantity: int = Field(..., ge=1)
    reason: Optional[str] = None
    defect_ids: Optional[List[str]] = Field(
        default=None,
        validation_alias=AliasChoices("defect_ids", "defects", "reasons", "complaint_reasons"),
    )


class ComplaintCreateFromOrder(BaseModel):
    order_id: int
    lines: List[ComplaintCreateFromOrderLine] = Field(..., min_length=1)
    note: Optional[str] = None
    reason: Optional[str] = None
    photo_urls: Optional[List[str]] = None
    defect_ids: Optional[List[str]] = Field(default=None, description="Tagi wad (np. factory, transport)")


class ComplaintOrderSummary(BaseModel):
    id: int
    number: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    source: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    value: Optional[float] = None
    currency: Optional[str] = None
    shipping_method: Optional[str] = None
    #: Koszt dostawy (z zamówienia / import_metadata) — do podsumowania zwrotów w reklamacji.
    shipping_cost: Optional[float] = None
    addresses_json: Optional[str] = None
    created_at: Optional[datetime] = Field(None, description="Data utworzenia zamówienia w systemie")


class ComplaintLineRead(BaseModel):
    id: int
    order_item_id: int
    product_id: Optional[int] = None
    quantity: int
    reason: Optional[str] = None
    product_name: Optional[str] = None
    sku: Optional[str] = None
    product_ean: Optional[str] = None
    product_image_url: Optional[str] = None
    unit_price: Optional[float] = None
    #: Przebieg pozycji (jak complaint.status)
    status: str = "NOWE"
    #: repair | exchange | reject | refund
    decision: Optional[str] = None
    #: Ostatni ukończony etap łańcucha operacji (zależny od decision)
    operation_status: Optional[str] = None
    #: Przy decision=exchange: EXCHANGE | REPLACEMENT
    exchange_kind: Optional[str] = None
    #: Rozliczenie pozycji (zwrot / część / odmowa)
    settlement_type: Optional[str] = None
    settlement_amount: Optional[float] = None
    settlement_currency: Optional[str] = None
    #: Producenci z katalogu (grupowanie wizualne)
    producer_name: Optional[str] = None
    #: Legacy alias (kept for compatibility).
    photo_urls: List[str] = Field(default_factory=list)
    customer_photos: List[str] = Field(default_factory=list)
    warehouse_photos: List[str] = Field(default_factory=list)
    defect_ids: List[str] = Field(default_factory=list)
    defects: List[Dict[str, str]] = Field(default_factory=list)
    #: Notatka magazynowa (WMS)
    note_warehouse: Optional[str] = None
    #: Linia Z-PZ utworzona po odbiorze fizycznym towaru
    warehouse_receipt_posted: bool = False


class ComplaintWmsUpdateItem(BaseModel):
    item_id: str
    note_warehouse: Optional[str] = None
    photos: List[str] = Field(default_factory=list)
    #: Gdy True, pole `photos` zastępuje całość `photo_urls_json` pozycji (usuwanie zdjęć).
    replace_photos: bool = False


class ComplaintWmsUpdateBody(BaseModel):
    items: List[ComplaintWmsUpdateItem] = Field(default_factory=list)


class ComplaintLinePatch(BaseModel):
    status: Optional[ComplaintStatusCode] = None
    decision: Optional[str] = None
    operation_status: Optional[str] = None
    exchange_kind: Optional[str] = None
    settlement_type: Optional[str] = None
    settlement_amount: Optional[float] = None
    settlement_currency: Optional[str] = Field(None, max_length=8)

    @field_validator("settlement_type")
    @classmethod
    def _norm_line_settlement_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip().upper()
        if not s:
            return None
        if s not in ALLOWED_COMPLAINT_RESOLUTION_TYPES:
            raise ValueError("Invalid line settlement_type")
        return s


class ComplaintLineOperationBody(BaseModel):
    """Akcja operacji fizycznej — mapowana na `complaint_lines.operation_status` po stronie API."""

    action: str = Field(..., min_length=1)


class ComplaintListRead(BaseModel):
    id: int
    title: str
    reference_code: Optional[str] = None
    created_at: Optional[datetime] = None
    response_deadline: Optional[datetime] = None
    auto_accepted: bool = False
    #: Zgodne z auto_accepted — uznana z mocy prawa po 14 dniach.
    accepted_by_law: bool = False
    response_deadline_days_remaining: Optional[int] = None
    response_deadline_is_overdue: bool = False
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    status: str = "NOWE"
    product_image_url: Optional[str] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    product_ean: Optional[str] = None
    line_quantity: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    defect_ids: List[str] = Field(default_factory=list)
    customer_reason: Optional[str] = None
    #: Liczba wierszy `complaint_lines` (kafel listy — skrót bez nazw produktów).
    lines_count: int = 0
    physical_receipt_mode: str = "WAREHOUSE"


class ComplaintStatusCountRow(BaseModel):
    status: str
    count: int


class ComplaintStatusSummary(BaseModel):
    total: int
    by_status: List[ComplaintStatusCountRow] = Field(default_factory=list)


class ComplaintStatusPatch(BaseModel):
    status: ComplaintStatusCode


ALLOWED_OPERATIONAL_DECISIONS = frozenset({"repair", "exchange", "replacement", "dispose", "outlet"})
ALLOWED_FINANCIAL_DECISIONS = frozenset({"replace", "refund", "price_reduction", "reject"})
ALLOWED_COMPLAINT_RESOLUTION_TYPES: frozenset[str] = frozenset({"REPLACEMENT", "REFUND", "PARTIAL_REFUND", "REJECTION"})


class ComplaintResolutionPatch(BaseModel):
    """Rozliczenie z klientem (etap DECYZJA). Kwoty w walucie zamówienia źródłowego."""

    resolution_type: ComplaintResolutionType
    resolution_amount: Optional[float] = None
    resolution_currency: Optional[str] = Field(None, max_length=8)


class ComplaintDecisionPatch(BaseModel):
    """Częściowa aktualizacja — tylko przesłane pola. Walidacja hierarchii po stronie API."""

    major_defect: Optional[bool] = None
    repair_failed: Optional[bool] = None
    replacement_failed: Optional[bool] = None
    operational_decision: Optional[str] = None
    financial_decision: Optional[str] = None
    defect_ids: Optional[List[str]] = None

    @field_validator("defect_ids")
    @classmethod
    def _cap_defect_ids(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        seen: set[str] = set()
        out: List[str] = []
        for x in v[:30]:
            s = str(x).strip()
            if not s or len(s) > 48 or s in seen:
                continue
            seen.add(s)
            out.append(s)
        return out


ComplaintLogisticsStatusCode = Literal[
    "WAITING_FOR_ITEM",
    "RECEIVED",
    "IN_INSPECTION",
    "IN_SERVICE",
    "RETURNED_FROM_SERVICE",
    "FORWARDED_TO_SERVICE",
    "SENT_DIRECTLY_TO_SERVICE",
]

ComplaintPhysicalReceiptMode = Literal["WAREHOUSE", "SERVICE_FORWARD", "DIRECT_SERVICE"]


class ComplaintPhysicalReceiptModePatch(BaseModel):
    physical_receipt_mode: ComplaintPhysicalReceiptMode


class ComplaintAuditEventRead(BaseModel):
    type: str = ""
    message: str = ""
    user: Optional[str] = None
    timestamp: str = ""
    meta: Optional[dict[str, Any]] = None


class ComplaintEventRead(BaseModel):
    """Machine-readable event row; UI builds Polish strings from event_type + payload."""

    id: str
    complaint_id: int
    line_id: Optional[int] = None
    event_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    actor: str = "System"


class ComplaintEventListResponse(BaseModel):
    items: List[ComplaintEventRead] = Field(default_factory=list)
    total: int = 0
    limit: int = 100
    offset: int = 0


ComplaintDocumentTypeCode = Literal["DECISION", "CORRECTION", "RMA"]


class ComplaintDocumentRead(BaseModel):
    id: int
    type: str
    title: Optional[str] = None
    file_url: str
    created_at: Optional[datetime] = None
    meta: Optional[Dict[str, Any]] = None


class ComplaintDocumentsRegenerateBody(BaseModel):
    types: Optional[List[ComplaintDocumentTypeCode]] = None


class ComplaintLogisticsActionBody(BaseModel):
    """Akcje logistyczne — nie zmieniają complaint.status (obrót prawny)."""

    action: Literal["set_inspection", "send_to_service", "return_from_service", "mark_received"]
    service_rma: Optional[str] = Field(None, max_length=128)
    expected_return_date: Optional[date] = None


class ComplaintRelatedBrief(BaseModel):
    """Powiązana reklamacja (rodzic lub potomki)."""

    id: int
    reference_code: Optional[str] = None
    title: Optional[str] = None
    status: str = "NOWE"
    created_at: Optional[datetime] = None


class ComplaintRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    order_id: Optional[int] = None
    parent_complaint_id: Optional[int] = None
    parent_complaint: Optional[ComplaintRelatedBrief] = None
    child_complaints: List[ComplaintRelatedBrief] = Field(default_factory=list)
    title: str
    reference_code: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    response_deadline: Optional[datetime] = None
    auto_accepted: bool = False
    #: Zgodne z auto_accepted — akceptacja z mocy prawa po bezczynności w terminie 14 dni.
    accepted_by_law: bool = False
    response_deadline_days_remaining: Optional[int] = Field(
        default=None,
        description="Różnica dat kalendarzowych (PL-style); ujemne = po terminie czasu zegarowego.",
    )
    response_deadline_is_overdue: bool = False
    status: str = "NOWE"
    order: Optional[ComplaintOrderSummary] = None
    lines: List[ComplaintLineRead] = Field(default_factory=list)
    photo_urls: List[str] = Field(default_factory=list)
    warehouse_photo_urls: List[str] = Field(default_factory=list)
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    order_source: Optional[str] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    customer_photo_urls: Optional[List[str]] = None
    defect_ids: List[str] = Field(default_factory=list)
    customer_reason: Optional[str] = None
    customer_address: Optional[str] = Field(
        default=None,
        description="Snapshot lub adres z zamówienia — podpowiedź przesyłki.",
    )
    waiting_for_product_since: Optional[datetime] = None
    waiting_reminder_sent_at: Optional[datetime] = None
    waiting_product_followup_due: bool = Field(
        default=False,
        description="True gdy oczekiwanie na produkt ≥7 dni i brak wysłanego przypomnienia (flaga UI).",
    )
    audit_events: List[ComplaintAuditEventRead] = Field(default_factory=list)
    complaint_events: List[ComplaintEventRead] = Field(
        default_factory=list,
        description="Structured event log (newest-first slice); prefer for timeline UI.",
    )
    major_defect: bool = False
    repair_failed: bool = False
    replacement_failed: bool = False
    operational_decision: Optional[str] = None
    financial_decision: Optional[str] = None
    logistics_status: str = "WAITING_FOR_ITEM"
    logistics_service_rma: Optional[str] = None
    logistics_expected_return_date: Optional[date] = None
    logistics_in_service_since: Optional[datetime] = None
    logistics_waiting_reminder: bool = False
    logistics_service_overdue_alert: bool = False
    resolution_type: Optional[str] = None
    resolution_status: Optional[str] = None
    resolution_amount: Optional[float] = None
    resolution_currency: Optional[str] = None
    documents: List[ComplaintDocumentRead] = Field(default_factory=list)
    warehouse_document_id: Optional[int] = None
    warehouse_document_type: Optional[str] = None
    warehouse_document_number: Optional[str] = None
    physical_receipt_mode: str = "WAREHOUSE"
    warehouse_actions_available: bool = True


def complaint_photo_url_dedupe_key(url: str) -> str:
    """Stable key for idempotent merge (same resource, different string forms)."""
    s = str(url).strip()
    if not s:
        return ""
    low = s.lower()
    if low.startswith("/uploads/"):
        return s.rstrip("/") or s
    if low.startswith("http://") or low.startswith("https://"):
        try:
            p = urlparse(s)
            path = p.path or ""
            if p.query:
                path = f"{path}?{p.query}"
            return path.rstrip("/") or s
        except Exception:
            return s.rstrip("/")
    return s.rstrip("/")


def merge_photo_url_strings_idempotent(
    existing: List[str],
    incoming: List[str],
    *,
    max_len: int,
) -> List[str]:
    """
    One stored entry per logical URL (identity key). Preserves order: existing keys first,
    then new keys from incoming. Same key from incoming does not append a second row.
    """
    merged: dict[str, str] = {}
    order_keys: List[str] = []

    def add(url: str) -> None:
        nonlocal merged, order_keys
        raw = str(url).strip()
        if not raw:
            return
        k = complaint_photo_url_dedupe_key(raw)
        if not k:
            return
        if k not in merged:
            merged[k] = raw
            order_keys.append(k)

    for u in existing:
        add(u)
        if len(order_keys) >= max_len:
            return [merged[kk] for kk in order_keys[:max_len]]
    for u in incoming:
        add(u)
        if len(order_keys) >= max_len:
            break
    return [merged[kk] for kk in order_keys[:max_len]]


def dedupe_complaint_photo_urls_preserve_order(urls: List[str]) -> List[str]:
    """Each logical URL at most once; keep first-seen string form."""
    if not urls:
        return []
    return merge_photo_url_strings_idempotent([], urls, max_len=len(urls))


def complaint_photo_urls_from_db(raw: Optional[str]) -> List[str]:
    if not raw or not str(raw).strip():
        return []
    try:
        data: Any = json.loads(raw)
        if isinstance(data, list):
            urls = [str(x) for x in data if x is not None and str(x).strip()]
            urls = dedupe_complaint_photo_urls_preserve_order(urls)
            return urls[:50]
    except Exception:
        pass
    return []
