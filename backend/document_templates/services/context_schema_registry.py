"""Typed variable schema registry — Sellasist-style field definitions per document kind."""

from __future__ import annotations

from typing import Any

from ..constants import CONTEXT_VARIABLE_TYPES

FieldDef = dict[str, Any]

PROVIDER_LABELS: dict[str, str] = {
    "global": "Dane globalne",
    "production": "Produkcja",
    "order": "Zamówienia i handel",
    "warehouse_document": "Dokumenty magazynowe",
    "inventory": "Inwentaryzacja",
    "transfer": "Przesunięcia i rozlokowanie",
    "return": "Zwroty",
    "complaint": "Reklamacje",
    "product": "Produkty",
    "customer": "Klienci",
    "supplier": "Dostawcy",
    "report": "Raporty",
}


def _field(
    path: str,
    label: str,
    *,
    vtype: str = "string",
    insert: str | None = None,
    description: str | None = None,
    required: bool = False,
    loop_usable: bool = False,
    loop_var: str | None = None,
) -> FieldDef:
    return {
        "path": path,
        "label": label,
        "type": vtype if vtype in CONTEXT_VARIABLE_TYPES else "string",
        "insert": insert or f"{{{{ {path.replace('[]', '')} }}}}",
        "description": description or label,
        "required": required,
        "loop_usable": loop_usable or ("[]" in path),
        "loop_var": loop_var,
    }


GLOBAL_FIELDS: list[FieldDef] = [
    _field("company.name", "Firma → nazwa"),
    _field("company.nip", "Firma → NIP"),
    _field("company.street", "Firma → ulica"),
    _field("company.city", "Firma → miasto"),
    _field("company.postal_code", "Firma → kod pocztowy"),
    _field("company.email", "Firma → e-mail"),
    _field("company.phone", "Firma → telefon", insert="{{ company.phone | phone }}"),
    _field("tenant.name", "Tenant → nazwa"),
    _field("warehouse.name", "Magazyn → nazwa"),
    _field("warehouse.code", "Magazyn → kod"),
    _field("operator.name", "Operator → nazwa"),
    _field("operator.full_name", "Operator → imię i nazwisko"),
    _field("operator.email", "Operator → e-mail"),
    _field("branding.logo_url", "Branding → logo URL"),
    _field("branding.font_family", "Branding → czcionka"),
    _field("branding.primary_color", "Branding → kolor główny"),
    _field("theme.font_size_base", "Motyw → rozmiar czcionki"),
    _field("theme.text_color", "Motyw → kolor tekstu"),
    _field("theme.muted_color", "Motyw → kolor stonowany"),
    _field("theme.border_color", "Motyw → kolor obramowania"),
    _field("theme.table_header_bg", "Motyw → tło nagłówka tabeli"),
    _field("document.number", "Dokument → numer"),
    _field("document.created_at", "Dokument → data", insert="{{ document.created_at | date }}"),
    _field("document.status", "Dokument → status"),
    _field("document.title", "Dokument → tytuł"),
    _field("document.type", "Dokument → typ"),
    _field("document.type_label", "Dokument → etykieta typu"),
    _field("document.notes", "Dokument → uwagi"),
    _field("document.barcode_value", "Dokument → kod kreskowy", insert="{{ barcode(document.barcode_value) }}"),
    _field("document.qr_value", "Dokument → QR", insert="{{ qr(document.qr_value) }}"),
    _field("current_datetime", "System → data i czas"),
    _field("today", "System → dziś"),
    _field("now", "System → teraz"),
    _field("currency", "System → waluta"),
    _field("language", "System → język"),
    _field("logo", "Branding → logo URL"),
]

# Top-level aliases returned by domain providers (used in starters as fallbacks).
COMMON_DOMAIN_FIELDS: list[FieldDef] = [
    _field("title", "Tytuł dokumentu"),
    _field("document_number", "Numer dokumentu (alias)"),
    _field("document_type", "Typ dokumentu"),
    _field("document_date", "Data dokumentu", insert="{{ document_date | date }}"),
    _field("status", "Status dokumentu"),
    _field("notes", "Uwagi"),
    _field("order_number", "Numer zamówienia"),
    _field("barcode_value", "Kod kreskowy (alias)"),
    _field("qr_value", "QR (alias)"),
]

PRODUCT_FIELDS: list[FieldDef] = [
    _field("products", "Lista produktów", vtype="array", loop_usable=True, loop_var="row"),
    _field("products[].name", "Produkt → nazwa", insert="{{ row.name }}"),
    _field("products[].sku", "Produkt → SKU", insert="{{ row.sku }}"),
    _field("products[].ean", "Produkt → EAN", insert="{{ row.ean }}"),
    _field("products[].catalog_number", "Produkt → numer katalogowy"),
    _field("products[].barcode", "Produkt → kod kreskowy", insert="{{ barcode(row.barcode) }}"),
    _field("products[].image", "Produkt → zdjęcie", vtype="image", insert="{{ image(row.image) }}"),
    _field("products[].manufacturer", "Produkt → producent"),
    _field("products[].locations", "Produkt → lokalizacje", insert="{{ row.locations }}"),
    _field("products[].location", "Produkt → lokalizacja", insert="{{ row.location }}"),
    _field("products[].product.name", "Produkt → nazwa (zagnieżdżona)", insert="{{ row.product.name }}"),
    _field("products[].product.sku", "Produkt → SKU (zagnieżdżona)", insert="{{ row.product.sku }}"),
    _field("products[].product.ean", "Produkt → EAN (zagnieżdżona)", insert="{{ row.product.ean }}"),
    _field("products[].warehouse_locations", "Produkt → lokalizacje magazynowe", vtype="array", loop_usable=True),
    _field("products[].warehouse_locations[].lot_number", "Partia w lokalizacji", insert="{{ loc.lot_number }}"),
    _field("products[].lots", "Produkt → partie"),
    _field("products[].serial_numbers", "Produkt → numery seryjne"),
    _field("products[].quantity", "Produkt → ilość", vtype="quantity", insert="{{ row.quantity | quantity(row.unit) }}"),
    _field("products[].unit", "Produkt → j.m."),
    _field("products[].price", "Produkt → cena", vtype="money", insert="{{ row.price | money(currency) }}"),
    _field("products[].value", "Produkt → wartość", vtype="money", insert="{{ row.value | money(currency) }}"),
    _field("products[].vat", "Produkt → VAT"),
    _field("partner.name", "Kontrahent → nazwa"),
    _field("source_warehouse.name", "Magazyn źródłowy → nazwa"),
    _field("destination_warehouse.name", "Magazyn docelowy → nazwa"),
    _field("totals.net", "Suma netto", vtype="money", insert="{{ totals.net | money(currency) }}"),
    _field("totals.vat", "Suma VAT", vtype="money", insert="{{ totals.vat | money(currency) }}"),
    _field("totals.gross", "Suma brutto", vtype="money", insert="{{ totals.gross | money(currency) }}"),
]

WAREHOUSE_FIELDS: list[FieldDef] = COMMON_DOMAIN_FIELDS + PRODUCT_FIELDS

ORDER_FIELDS: list[FieldDef] = [
    *COMMON_DOMAIN_FIELDS,
    _field("order_date", "Data zamówienia", insert="{{ order_date | date }}"),
    _field("customer.name", "Klient → nazwa"),
    _field("customer.email", "Klient → e-mail"),
    _field("customer.phone", "Klient → telefon", insert="{{ customer.phone | phone }}"),
    _field("delivery.street", "Dostawa → ulica"),
    _field("delivery.city", "Dostawa → miasto"),
    _field("delivery.postal_code", "Dostawa → kod pocztowy"),
    _field("payment.method", "Płatność → metoda"),
    _field("shipping.carrier", "Wysyłka → przewoźnik"),
    _field("shipping.tracking_number", "Wysyłka → numer śledzenia"),
    _field("items", "Pozycje zamówienia", vtype="array", loop_usable=True, loop_var="item"),
    _field("items[].product.name", "Pozycja → nazwa produktu", insert="{{ item.product.name }}"),
    _field("items[].product.sku", "Pozycja → SKU", insert="{{ item.product.sku }}"),
    _field("items[].product.ean", "Pozycja → EAN", insert="{{ item.product.ean }}"),
    _field("items[].quantity", "Pozycja → ilość", vtype="quantity"),
    _field("items[].unit", "Pozycja → j.m."),
    _field("items[].name", "Pozycja → nazwa", insert="{{ item.name }}"),
    _field("items[].product_name", "Pozycja → nazwa (legacy)", insert="{{ item.product_name }}"),
    _field("items[].vat_rate", "Pozycja → stawka VAT"),
    _field("totals.net", "Suma netto", vtype="money", insert="{{ totals.net | money(currency) }}"),
    _field("totals.gross", "Suma brutto", vtype="money", insert="{{ totals.gross | money(currency) }}"),
]

PRODUCTION_FIELDS: list[FieldDef] = [
    _field("job_number", "Numer zlecenia"),
    _field("job_kind_label", "Typ zlecenia"),
    _field("printed_at", "Data wydruku", insert="{{ printed_at | datetime }}"),
    _field("header_product_line", "Produkt docelowy"),
    _field("header_sku", "SKU produktu"),
    _field("header_ean", "EAN produktu"),
    _field("header_planned_qty", "Ilość planowana", vtype="quantity"),
    _field("header_date", "Data zlecenia", insert="{{ header_date | date }}"),
    _field("operator_name", "Operator produkcji"),
    _field("warehouse_name", "Magazyn produkcji"),
    _field("recipe_version", "Receptura"),
    _field("header_barcode_value", "Kod kreskowy nagłówka", insert="{{ barcode(header_barcode_value) }}"),
    _field("components", "Składniki", vtype="array", loop_usable=True, loop_var="row"),
    _field("components[].name", "Składnik → nazwa", insert="{{ row.name }}"),
    _field("components[].sku", "Składnik → SKU", insert="{{ row.sku }}"),
    _field("components[].required_qty", "Składnik → ilość wymagana", vtype="quantity"),
    _field("components[].unit", "Składnik → j.m."),
    _field("components[].suggested_location", "Składnik → lokalizacja"),
    _field("components[].batch_number", "Składnik → partia"),
]

REPORT_FIELDS: list[FieldDef] = [
    _field("title", "Raport → tytuł"),
    _field("subtitle", "Raport → podtytuł"),
    _field("generated_at", "Raport → wygenerowano", insert="{{ generated_at | datetime }}"),
    _field("rows", "Wiersze raportu", vtype="array", loop_usable=True, loop_var="row"),
    _field("rows[].label", "Wiersz → etykieta", insert="{{ row.label }}"),
    _field("rows[].name", "Wiersz → nazwa", insert="{{ row.name }}"),
    _field("rows[].value", "Wiersz → wartość", insert="{{ row.value }}"),
    _field("summary.total", "Podsumowanie → razem"),
]

PRODUCT_CARD_FIELDS: list[FieldDef] = [
    _field("product.name", "Produkt → nazwa"),
    _field("product.sku", "Produkt → SKU"),
    _field("product.ean", "Produkt → EAN"),
    _field("product.barcode_value", "Produkt → kod kreskowy", insert="{{ barcode(product.barcode_value) }}"),
    _field("manufacturer.name", "Producent → nazwa"),
    _field("stock.available", "Stan dostępny"),
    _field("stock.reserved", "Stan zarezerwowany"),
    _field("prices.net", "Cena netto", vtype="money", insert="{{ prices.net | money(currency) }}"),
    _field("prices.gross", "Cena brutto", vtype="money", insert="{{ prices.gross | money(currency) }}"),
]

RETURN_FIELDS: list[FieldDef] = [
    *COMMON_DOMAIN_FIELDS,
    _field("return_number", "Numer zwrotu"),
    *PRODUCT_FIELDS,
]

COMPLAINT_FIELDS: list[FieldDef] = [
    *COMMON_DOMAIN_FIELDS,
    _field("complaint_number", "Numer reklamacji"),
    _field("reason", "Powód reklamacji"),
    *PRODUCT_FIELDS,
]

SCHEMA_BY_KEY: dict[str, list[FieldDef]] = {
    "production_card": PRODUCTION_FIELDS,
    "production_material_pick_list": PRODUCTION_FIELDS,
    "production_report": REPORT_FIELDS,
    "quality_report": REPORT_FIELDS,
    "order_confirmation": ORDER_FIELDS,
    "picking_list": ORDER_FIELDS,
    "invoice": ORDER_FIELDS,
    "receipt": ORDER_FIELDS,
    "correction": ORDER_FIELDS,
    "wz": WAREHOUSE_FIELDS,
    "pz": WAREHOUSE_FIELDS,
    "pw": WAREHOUSE_FIELDS,
    "rw": WAREHOUSE_FIELDS,
    "mm": WAREHOUSE_FIELDS,
    "inventory_count": WAREHOUSE_FIELDS,
    "stock_transfer": WAREHOUSE_FIELDS,
    "relocation_document": WAREHOUSE_FIELDS,
    "return_document": RETURN_FIELDS,
    "complaint_document": COMPLAINT_FIELDS,
    "product_card": PRODUCT_CARD_FIELDS,
    "product_catalog": PRODUCT_CARD_FIELDS,
}


def fields_for_schema_key(schema_key: str) -> list[FieldDef]:
    key = str(schema_key or "").strip()
    domain = SCHEMA_BY_KEY.get(key, [])
    if key == "picking_list" and not domain:
        domain = SCHEMA_BY_KEY.get("order_confirmation", [])
    if key == "product_catalog" and not domain:
        domain = SCHEMA_BY_KEY.get("product_card", [])
    return GLOBAL_FIELDS + domain
