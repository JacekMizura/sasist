"""Document Templates — canonical codes and status values."""

from __future__ import annotations

VERSION_STATUS_DRAFT = "draft"
VERSION_STATUS_PUBLISHED = "published"
VERSION_STATUS_ARCHIVED = "archived"

TEMPLATE_ROLE_BASE = "BASE"
TEMPLATE_ROLE_DOCUMENT = "DOCUMENT"
TEMPLATE_ROLE_PARTIAL = "PARTIAL"

SOURCE_SYSTEM = "SYSTEM"
SOURCE_STARTER = "STARTER"
SOURCE_MARKETPLACE = "MARKETPLACE"
SOURCE_TENANT = "TENANT"

DEFAULT_VARIANT_CODE = "standard"

CONTEXT_VARIABLE_TYPES = frozenset(
    {
        "string",
        "number",
        "boolean",
        "date",
        "datetime",
        "money",
        "quantity",
        "image",
        "barcode",
        "qr",
        "object",
        "array",
        "enum",
    }
)

DOCUMENT_FAMILIES: tuple[dict[str, str | int], ...] = (
    {"code": "orders", "name_pl": "Zamówienia", "icon": "📦", "sort_order": 10},
    {"code": "warehouse_documents", "name_pl": "Dokumenty magazynowe", "icon": "📄", "sort_order": 20},
    {"code": "production", "name_pl": "Produkcja", "icon": "🏭", "sort_order": 30},
    {"code": "products", "name_pl": "Produkty", "icon": "🏷", "sort_order": 40},
    {"code": "customers", "name_pl": "Klienci", "icon": "👤", "sort_order": 50},
    {"code": "suppliers", "name_pl": "Dostawcy", "icon": "🚚", "sort_order": 60},
    {"code": "reports", "name_pl": "Raporty", "icon": "📊", "sort_order": 70},
    {"code": "commerce", "name_pl": "Handel", "icon": "💳", "sort_order": 80},
)

DOCUMENT_KINDS: tuple[dict[str, str], ...] = (
    {"family_code": "production", "code": "production_card", "name_pl": "Karta produkcyjna", "provider_key": "production", "schema_key": "production_card"},
    {"family_code": "production", "code": "production_material_pick_list", "name_pl": "Lista pobrania materiałów", "provider_key": "production", "schema_key": "production_material_pick_list"},
    {"family_code": "production", "code": "production_report", "name_pl": "Raport produkcji", "provider_key": "report", "schema_key": "production_report"},
    {"family_code": "production", "code": "quality_report", "name_pl": "Raport jakości", "provider_key": "report", "schema_key": "quality_report"},
    {"family_code": "orders", "code": "order_confirmation", "name_pl": "Potwierdzenie zamówienia", "provider_key": "order", "schema_key": "order_confirmation"},
    {"family_code": "orders", "code": "picking_list", "name_pl": "Lista kompletacyjna", "provider_key": "order", "schema_key": "picking_list"},
    {"family_code": "orders", "code": "return_document", "name_pl": "Dokument zwrotu", "provider_key": "return", "schema_key": "return_document"},
    {"family_code": "orders", "code": "complaint_document", "name_pl": "Dokument reklamacji", "provider_key": "complaint", "schema_key": "complaint_document"},
    {"family_code": "warehouse_documents", "code": "wz", "name_pl": "WZ", "provider_key": "warehouse_document", "schema_key": "wz"},
    {"family_code": "warehouse_documents", "code": "pz", "name_pl": "PZ", "provider_key": "warehouse_document", "schema_key": "pz"},
    {"family_code": "warehouse_documents", "code": "pw", "name_pl": "PW", "provider_key": "warehouse_document", "schema_key": "pw"},
    {"family_code": "warehouse_documents", "code": "rw", "name_pl": "RW", "provider_key": "warehouse_document", "schema_key": "rw"},
    {"family_code": "warehouse_documents", "code": "mm", "name_pl": "MM", "provider_key": "warehouse_document", "schema_key": "mm"},
    {"family_code": "warehouse_documents", "code": "inventory_count", "name_pl": "Dokument inwentaryzacyjny", "provider_key": "inventory", "schema_key": "inventory_count"},
    {"family_code": "warehouse_documents", "code": "stock_transfer", "name_pl": "Dokument przesunięcia", "provider_key": "transfer", "schema_key": "stock_transfer"},
    {"family_code": "warehouse_documents", "code": "relocation_document", "name_pl": "Dokument rozlokowania", "provider_key": "transfer", "schema_key": "relocation_document"},
    {"family_code": "products", "code": "product_card", "name_pl": "Karta produktu", "provider_key": "product", "schema_key": "product_card"},
    {"family_code": "products", "code": "product_catalog", "name_pl": "Katalog produktów", "provider_key": "product", "schema_key": "product_catalog"},
    {"family_code": "commerce", "code": "invoice", "name_pl": "Faktura VAT", "provider_key": "order", "schema_key": "invoice"},
    {"family_code": "commerce", "code": "receipt", "name_pl": "Paragon", "provider_key": "order", "schema_key": "receipt"},
    {"family_code": "commerce", "code": "correction", "name_pl": "Korekta", "provider_key": "order", "schema_key": "correction"},
    {"family_code": "suppliers", "code": "supplier_order", "name_pl": "Zamówienie do dostawcy", "provider_key": "order", "schema_key": "supplier_order"},
)

SCOPE_TYPE_COMPANY = "COMPANY"
SCOPE_TYPE_WAREHOUSE = "WAREHOUSE"
SCOPE_TYPE_SERIES = "SERIES"
SCOPE_TYPE_PRODUCT = "PRODUCT"
SCOPE_TYPE_CUSTOMER = "CUSTOMER"
SCOPE_TYPE_SUPPLIER = "SUPPLIER"
SCOPE_TYPE_PRODUCTION = "PRODUCTION"
SCOPE_TYPE_RETURNS = "RETURNS"
SCOPE_TYPE_COMPLAINTS = "COMPLAINTS"
SCOPE_TYPE_MODULE = "MODULE"

SCOPE_TYPE_LABELS: dict[str, str] = {
    SCOPE_TYPE_COMPANY: "Firma",
    SCOPE_TYPE_WAREHOUSE: "Magazyn",
    SCOPE_TYPE_SERIES: "Seria dokumentów",
    SCOPE_TYPE_PRODUCT: "Produkty",
    SCOPE_TYPE_CUSTOMER: "Klienci",
    SCOPE_TYPE_SUPPLIER: "Dostawcy",
    SCOPE_TYPE_PRODUCTION: "Produkcja",
    SCOPE_TYPE_RETURNS: "Zwroty",
    SCOPE_TYPE_COMPLAINTS: "Reklamacje",
    SCOPE_TYPE_MODULE: "Moduł",
}

SYSTEM_BASE_TEMPLATE_CODE = "base_document"
SYSTEM_PARTIAL_CODES = (
    "document_header",
    "document_footer",
    "company_signature",
    "warehouse_signature",
    "operator_signature",
    "document_summary",
    "document_totals",
    "document_notes",
    "barcode_section",
    "qr_section",
    "product_table_header",
    "product_table_footer",
)

KIND_CODE_ALIASES: dict[str, str] = {
    "ORDER": "order_confirmation",
    "WZ": "wz",
    "PZ": "pz",
    "PW": "pw",
    "RW": "rw",
    "MM": "mm",
    "INVENTORY": "inventory_count",
    "TRANSFER": "stock_transfer",
    "RELOCATION": "relocation_document",
    "RETURN": "return_document",
    "COMPLAINT": "complaint_document",
    "PRODUCTION_CARD": "production_card",
    "PRODUCT_CARD": "product_card",
    "SUPPLIER_ORDER": "supplier_order",
    "INVOICE": "invoice",
    "RECEIPT": "receipt",
}
