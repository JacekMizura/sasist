"""Print context DTOs — typed payloads for Twig rendering."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import date, datetime
from typing import Any


def dto_to_dict(obj: Any) -> Any:
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: dto_to_dict(v) for k, v in asdict(obj).items()}
    if isinstance(obj, list):
        return [dto_to_dict(x) for x in obj]
    if isinstance(obj, dict):
        return {k: dto_to_dict(v) for k, v in obj.items()}
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj


@dataclass
class GlobalPrintContext:
    company: dict[str, Any] = field(default_factory=dict)
    tenant: dict[str, Any] = field(default_factory=dict)
    warehouse: dict[str, Any] = field(default_factory=dict)
    operator: dict[str, Any] = field(default_factory=dict)
    settings: dict[str, Any] = field(default_factory=dict)
    branding: dict[str, Any] = field(default_factory=dict)
    theme: dict[str, Any] = field(default_factory=dict)
    system: dict[str, Any] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)
    current_datetime: str = ""
    today: str = ""
    now: str = ""
    logo: str | None = None
    currency: str = "PLN"
    language: str = "pl"


@dataclass
class ProductionComponentRow:
    name: str
    sku: str | None = None
    ean: str | None = None
    image_url: str | None = None
    required_qty: str = "0"
    unit: str = "szt."
    suggested_location: str = "—"
    available_qty: str = "0"
    batch_number: str = "—"
    lot: str = "—"
    expiry_date: str = "—"
    barcode_value: str | None = None
    barcode_image_url: str | None = None


@dataclass
class ProductionPrintContext:
    job_number: str = ""
    job_kind_label: str = ""
    printed_at: str = ""
    header_image_url: str | None = None
    header_product_line: str = ""
    header_sku: str | None = None
    header_ean: str | None = None
    header_planned_qty: str = "0"
    header_date: str = ""
    operator_name: str | None = None
    warehouse_name: str | None = None
    recipe_version: str = "—"
    started_at_display: str = "________________"
    completed_at_display: str = "________________"
    header_barcode_value: str | None = None
    header_barcode_image_url: str | None = None
    components: list[ProductionComponentRow] = field(default_factory=list)


@dataclass
class OrderLinePrintContext:
    product: dict[str, Any] = field(default_factory=dict)
    quantity: str = "0"
    unit: str = "szt."
    unit_price_net: str = "0.00"
    line_total_net: str = "0.00"


@dataclass
class OrderPrintContext:
    order_number: str = ""
    order_date: str = ""
    status: str = ""
    title: str = ""
    document: dict[str, Any] = field(default_factory=dict)
    customer: dict[str, Any] = field(default_factory=dict)
    delivery: dict[str, Any] = field(default_factory=dict)
    payment: dict[str, Any] = field(default_factory=dict)
    shipping: dict[str, Any] = field(default_factory=dict)
    items: list[OrderLinePrintContext] = field(default_factory=list)
    totals: dict[str, Any] = field(default_factory=dict)
    custom_fields: dict[str, Any] = field(default_factory=dict)


@dataclass
class WarehouseDocumentLinePrintContext:
    product: dict[str, Any] = field(default_factory=dict)
    quantity: str = "0"
    unit: str = "szt."
    location: str | None = None
    batch_number: str | None = None


@dataclass
class WarehousePrintContext:
    document_number: str = ""
    document_type: str = ""
    document_date: str = ""
    status: str = ""
    title: str = ""
    document: dict[str, Any] = field(default_factory=dict)
    products: list[dict[str, Any]] = field(default_factory=list)
    source_warehouse: dict[str, Any] = field(default_factory=dict)
    destination_warehouse: dict[str, Any] = field(default_factory=dict)
    partner: dict[str, Any] = field(default_factory=dict)
    lines: list[WarehouseDocumentLinePrintContext] = field(default_factory=list)
    notes: str | None = None
    order_number: str | None = None
    totals: dict[str, Any] = field(default_factory=dict)


@dataclass
class InventoryPrintContext:
    document_number: str = ""
    document_date: str = ""
    status: str = ""
    title: str = "Dokument inwentaryzacyjny"
    document: dict[str, Any] = field(default_factory=dict)
    warehouse: dict[str, Any] = field(default_factory=dict)
    products: list[dict[str, Any]] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)
    notes: str | None = None


@dataclass
class TransferPrintContext:
    document_number: str = ""
    document_date: str = ""
    status: str = ""
    title: str = ""
    document: dict[str, Any] = field(default_factory=dict)
    source: dict[str, Any] = field(default_factory=dict)
    target: dict[str, Any] = field(default_factory=dict)
    carrier: dict[str, Any] = field(default_factory=dict)
    products: list[dict[str, Any]] = field(default_factory=list)
    notes: str | None = None


@dataclass
class ReturnPrintContext:
    return_number: str = ""
    order_number: str = ""
    status: str = ""
    title: str = "Dokument zwrotu"
    document: dict[str, Any] = field(default_factory=dict)
    customer: dict[str, Any] = field(default_factory=dict)
    products: list[dict[str, Any]] = field(default_factory=list)
    totals: dict[str, Any] = field(default_factory=dict)
    notes: str | None = None


@dataclass
class ComplaintPrintContext:
    complaint_number: str = ""
    order_number: str = ""
    status: str = ""
    title: str = "Dokument reklamacji"
    document: dict[str, Any] = field(default_factory=dict)
    customer: dict[str, Any] = field(default_factory=dict)
    products: list[dict[str, Any]] = field(default_factory=list)
    totals: dict[str, Any] = field(default_factory=dict)
    reason: str | None = None
    notes: str | None = None


@dataclass
class ProductPrintContext:
    title: str = "Karta produktu"
    document_number: str = ""
    product: dict[str, Any] = field(default_factory=dict)
    manufacturer: dict[str, Any] = field(default_factory=dict)
    stock: dict[str, Any] = field(default_factory=dict)
    prices: dict[str, Any] = field(default_factory=dict)
    images: list[str] = field(default_factory=list)


@dataclass
class CustomerPrintContext:
    customer: dict[str, Any] = field(default_factory=dict)
    addresses: list[dict[str, Any]] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)


@dataclass
class SupplierPrintContext:
    supplier: dict[str, Any] = field(default_factory=dict)
    contact: dict[str, Any] = field(default_factory=dict)
    order: dict[str, Any] = field(default_factory=dict)
    lines: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ReportPrintContext:
    title: str = ""
    subtitle: str = ""
    generated_at: str = ""
    filters: dict[str, Any] = field(default_factory=dict)
    rows: list[dict[str, Any]] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)


PrintContext = (
    ProductionPrintContext
    | OrderPrintContext
    | WarehousePrintContext
    | InventoryPrintContext
    | TransferPrintContext
    | ReturnPrintContext
    | ComplaintPrintContext
    | ProductPrintContext
    | CustomerPrintContext
    | SupplierPrintContext
    | ReportPrintContext
)
