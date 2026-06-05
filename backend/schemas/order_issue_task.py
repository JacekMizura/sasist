"""API: zadania Order Issues (braki)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class OrderIssueTaskLogEntry(BaseModel):
    at: str
    message: str
    kind: str


class NewProductLineHint(BaseModel):
    product_id: int
    order_item_id: int
    sku: str = ""
    ean: str = ""
    location_code: str = ""


class OrderIssuePickedLocationRow(BaseModel):
    location_label: str = ""
    quantity: float = 0.0
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None


class OrderIssueShortageLine(BaseModel):
    order_item_id: int
    product_id: int
    product_name: str = ""
    image_url: Optional[str] = None
    ordered_qty: float = Field(..., description="Zamówione na linii")
    picked_qty: float = Field(..., description="Suma Pick w magazynie")
    missing_qty: float = Field(..., description="Operacyjny brak linii (jak OMS / wms-fulfillment); > 0")
    location_code: str = Field("", description="Etykieta lokalizacji (nearest)")
    nearest_location_code: str = Field(default="", description="Najbliższa lokalizacja wg trasy zbierania")
    nearest_location_id: Optional[int] = Field(default=None, description="ID lokalizacji magazynowej")
    available_qty: float = Field(default=0.0, ge=0, description="Dostępna ilość w najbliższej lokalizacji")
    oms_action_summary: str = Field(
        "",
        description="Krótki opis decyzji OMS (np. zamiana / usunięcie) — uzupełniane gdy brak operacyjny = 0 a zadanie nadal otwarte.",
    )


class OrderIssueDetailLine(OrderIssueShortageLine):
    """Pełny kontekst linii zamówienia na ekranie szczegółów Braki WMS."""

    sku: str = ""
    ean: str = ""
    line_kind: str = Field(
        default="neutral",
        description="collected | shortage_unresolved | shortage_resolved | substitute | removed | waiting | to_pick",
    )
    badge_label: str = Field(default="", description="Etykieta PL na karcie linii")
    shortage_display_kind: str = Field(
        default="none",
        description="shortage | waiting | resolved | none — jak OMS/WMS fulfillment",
    )
    oms_line_status: Optional[str] = None
    pick_audit_summary: Optional[str] = None
    picked_locations: list[OrderIssuePickedLocationRow] = Field(default_factory=list)
    substitute_for_product_name: Optional[str] = Field(
        default=None,
        description="Dla zamiennika: nazwa produktu zastępowanego",
    )
    remaining_qty: float = Field(
        default=0.0,
        ge=0,
        description="Ilość pozostała do zebrania na linii",
    )


class BrakiWorkstreams(BaseModel):
    """Aktywne strumienie pracy w zamówieniu Braki (mogą współistnieć)."""

    has_pick_work: bool = False
    has_relocation_work: bool = False
    has_packing_ready: bool = False
    has_oms_pending: bool = False
    pick_line_count: int = 0
    relocation_line_count: int = 0
    packing_ready_line_count: int = 0
    oms_line_count: int = 0
    collected_line_count: int = 0


class OrderIssueOrderContext(BaseModel):
    """Sekcje operacyjne szczegółów Braki WMS (magazyn)."""

    collected_lines: list[OrderIssueDetailLine] = Field(default_factory=list)
    shortage_decision_lines: list[OrderIssueDetailLine] = Field(
        default_factory=list,
        description="Linie oczekujące na decyzję OMS",
    )
    remaining_pick_lines: list[OrderIssueDetailLine] = Field(default_factory=list)
    relocation_lines: list[OrderIssueDetailLine] = Field(
        default_factory=list,
        description="Tylko zebrane produkty wymagające rozlokowania",
    )
    packing_ready_lines: list[OrderIssueDetailLine] = Field(
        default_factory=list,
        description="Linie gotowe do pakowania (packing_eligible)",
    )


class OrderIssueTaskListItem(BaseModel):
    id: int
    order_id: int
    order_number: str
    order_status: str
    customer_name: str = Field(default="—", description="Imię i nazwisko lub firma — podgląd na karcie kolejki")
    delivery_name: str = Field(default="—", description="Nazwa odbiorcy z adresu dostawy")
    customer_phone: str = Field(default="—", description="Telefon klienta / dostawy")
    customer_email: str = Field(default="—", description="E-mail klienta / dostawy")
    customer_address: str = Field(default="—", description="Adres dostawy (skrót)")
    unresolved_shortage_count: int = Field(default=0, ge=0, description="Linie z dodatnim brakiem operacyjnym")
    replacement_pick_pending_count: int = Field(
        default=0,
        ge=0,
        description="Linie TO_PICK z niepełnym zbiorem po zamianie produktu",
    )
    issue_queue_summary_line: str = Field(
        default="",
        description="Jedna linia opisu dla operatora (PL)",
    )
    issue_queue_status_label: str = Field(
        default="",
        description="Etykieta statusu kolejki (np. Oczekuje na kompletację)",
    )
    substitute_product_id: int = Field(default=0, ge=0, description="Pierwszy produkt zastępczy z niepełnym zbiorem")
    substitute_product_name: str = Field(default="", description="Nazwa zamiennika — karta kolejki")
    order_ui_status_name: Optional[str] = None
    task_type: str = Field(..., description="Zapisany typ (np. MIXED)")
    recommended_action: str = Field(
        ...,
        description="RETURN_TO_STOCK | READY_FOR_PACKING | REQUIRES_PICKING | WAITING_FOR_STOCK | MIXED",
    )
    ui_decision: str = Field(
        ...,
        description="CANCELLED_RETURN | READY_PACK | NEW_PRODUCT | ALL_MISSING | PARTIAL",
    )
    new_product_lines: list[NewProductLineHint] = Field(default_factory=list)
    shortage_lines: list[OrderIssueShortageLine] = Field(
        default_factory=list,
        description="Linie z aktywnym brakiem operacyjnym (missing_qty > 0) — skrót dla listy kolejki",
    )
    order_context: OrderIssueOrderContext = Field(
        default_factory=OrderIssueOrderContext,
        description="Pełny kontekst zamówienia: zebrane, braki/decyzje, pozostałe do zbierania",
    )
    status: str
    missing_items: list[dict[str, Any]] = Field(default_factory=list)
    picked_items: list[dict[str, Any]] = Field(default_factory=list)
    missing_skus_label: str = Field("", description="Skrót SKU do tabeli")
    logs: list[OrderIssueTaskLogEntry] = Field(default_factory=list)
    created_at: str
    last_shortage_at: str = Field(
        default="",
        description="ISO czasu ostatniego zdarzenia shortage_reported lub utworzenia zadania",
    )
    braki_queue_bucket: str = Field(
        default="awaiting_oms",
        description="Stan operacyjny kolejki: awaiting_oms | recovery_ready | waiting_customer",
    )
    braki_workflow_status: str = Field(
        default="awaiting",
        description="Główny status workflow (filtr listy): awaiting | relocation | relocation_partial | pick | ready_pack | pick_and_relocation",
    )
    braki_workflow_status_label: str = Field(
        default="",
        description="Etykieta PL statusu workflow",
    )
    recovery_packing_allowed: bool = Field(
        default=False,
        description="Resolver: zamówienie może wejść do pakowania",
    )
    recovery_active_lines: int = Field(
        default=0,
        ge=0,
        description="Resolver: linie z aktywną dogrywką",
    )
    recovery_unresolved_lines: int = Field(
        default=0,
        ge=0,
        description="Resolver: nierozwiązane linie recovery",
    )
    recovery_has_relocation_work: bool = Field(
        default=False,
        description="Resolver: wymagane / trwające rozlokowanie",
    )
    relocation_task_id: int | None = Field(
        default=None,
        description="Aktywne zadanie RELOCATION dla zamówienia (po self-heal)",
    )
    can_close_shortage: bool = Field(
        default=False,
        description="Resolver: operator może zamknąć kartę Braki (Usuń z Braków)",
    )
    recovery_state_hash: str = Field(
        default="",
        description="Skrót stanu resolvera (debug)",
    )
    braki_workstreams: BrakiWorkstreams = Field(
        default_factory=BrakiWorkstreams,
        description="Aktywne strumienie pracy — mieszane stany w jednym zamówieniu",
    )
    shortage_priority_score: int = Field(
        default=0,
        ge=0,
        description="Dynamiczny scoring priorytetu braku (resolver)",
    )
    shortage_priority_level: str = Field(
        default="LOW",
        description="CRITICAL | HIGH | NORMAL | LOW",
    )
    shortage_priority_label: str = Field(
        default="",
        description="Etykieta PL priorytetu",
    )
    shortage_priority_factors: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Czynniki wpływające na score (debug / UI)",
    )
    shortage_lifecycle_phase: Optional[str] = Field(
        default=None,
        description="Canonical lifecycle phase z resolvera",
    )
    partial_data: bool = Field(
        default=False,
        description="Karta zbudowana z fallbacku — niepełne dane resolvera",
    )
    queue_warnings: list[str] = Field(
        default_factory=list,
        description="Ostrzeżenia dla operatora (nie blokuje renderu karty)",
    )


class OrderIssueTaskSkippedItem(BaseModel):
    task_id: int
    order_id: int
    order_number: str = ""
    error_code: str = Field(
        default="TASK_SERIALIZATION_FAILED",
        description="Kod błędu serializacji (np. TASK_SERIALIZATION_FAILED)",
    )
    error_message: str = Field(..., description="Powód pominięcia przy serializacji (czytelny, bez surowych wyjątków Python)")


class OrderIssueTaskListResponse(BaseModel):
    success: bool = True
    tasks: list[OrderIssueTaskListItem]
    skipped_tasks: list[OrderIssueTaskSkippedItem] = Field(
        default_factory=list,
        description="OPEN zadania pominięte z powodu błędu serializacji — kolejka nie jest pusta, ale karta nie mogła zostać zbudowana",
    )
    filter_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Liczniki filtrów workflow (all, awaiting, relocation, …)",
    )


class OrderIssueTaskLogBody(BaseModel):
    message: str = Field(..., min_length=1)
    kind: str = Field(
        ...,
        description="returned_to_stock | missing_resolved | new_product_in_picking | task_done | …",
    )


class OrderIssueTaskDoneBody(BaseModel):
    message: Optional[str] = None


class OrderIssueTaskArchiveBody(BaseModel):
    message: Optional[str] = None


class OrderIssueTaskForceRemoveBody(BaseModel):
    mode: Literal["full", "wms_only", "oms_review"] = Field(
        ...,
        description="full — zamknij wszystko; wms_only — tylko workflow magazynowy; oms_review — zwrot do OMS",
    )
    message: Optional[str] = None
