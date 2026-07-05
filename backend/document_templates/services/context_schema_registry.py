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
    _field("warehouse.name", "Magazyn → nazwa"),
    _field("warehouse.code", "Magazyn → kod"),
    _field("operator.name", "Operator → nazwa"),
    _field("operator.full_name", "Operator → imię i nazwisko"),
    _field("operator.email", "Operator → e-mail"),
    _field("document.number", "Dokument → numer"),
    _field("document.created_at", "Dokument → data", insert="{{ document.created_at | date }}"),
    _field("document.status", "Dokument → status"),
    _field("document.title", "Dokument → tytuł"),
    _field("document.notes", "Dokument → uwagi"),
    _field("current_datetime", "System → data i czas"),
    _field("currency", "System → waluta"),
    _field("logo", "Branding → logo URL"),
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
    _field("products[].warehouse_locations", "Produkt → lokalizacje magazynowe", vtype="array", loop_usable=True),
    _field("products[].warehouse_locations[].lot_number", "Partia w lokalizacji", insert="{{ loc.lot_number }}"),
    _field("products[].lots", "Produkt → partie"),
    _field("products[].serial_numbers", "Produkt → numery seryjne"),
    _field("products[].quantity", "Produkt → ilość", vtype="quantity", insert="{{ row.quantity | quantity(row.unit) }}"),
    _field("products[].unit", "Produkt → j.m."),
    _field("products[].price", "Produkt → cena", vtype="money", insert="{{ row.price | money(currency) }}"),
    _field("products[].value", "Produkt → wartość", vtype="money", insert="{{ row.value | money(currency) }}"),
    _field("products[].vat", "Produkt → VAT"),
]

SCHEMA_BY_KEY: dict[str, list[FieldDef]] = {
    "production_card": [
        _field("job_number", "Numer zlecenia"),
        _field("header_product_line", "Produkt docelowy"),
        _field("header_sku", "SKU produktu"),
        _field("components[].name", "Składnik → nazwa", insert="{{ row.name }}"),
        _field("components[].required_qty", "Składnik → ilość wymagana", vtype="quantity"),
    ],
    "order_confirmation": [
        _field("order_number", "Numer zamówienia"),
        _field("customer.name", "Klient → nazwa"),
        _field("totals.gross", "Suma brutto", vtype="money", insert="{{ totals.gross | money(currency) }}"),
    ],
    "wz": PRODUCT_FIELDS,
    "pz": PRODUCT_FIELDS,
    "pw": PRODUCT_FIELDS,
    "rw": PRODUCT_FIELDS,
    "mm": PRODUCT_FIELDS,
    "inventory_count": PRODUCT_FIELDS,
    "stock_transfer": PRODUCT_FIELDS,
    "relocation_document": PRODUCT_FIELDS,
    "return_document": PRODUCT_FIELDS,
    "complaint_document": PRODUCT_FIELDS,
    "product_card": [
        _field("product.name", "Produkt → nazwa"),
        _field("product.sku", "Produkt → SKU"),
        _field("product.ean", "Produkt → EAN"),
        _field("stock.available", "Stan dostępny"),
    ],
}


def fields_for_schema_key(schema_key: str) -> list[FieldDef]:
    key = str(schema_key or "").strip()
    domain = SCHEMA_BY_KEY.get(key, [])
    if key in {"picking_list", "invoice", "receipt", "correction", "production_material_pick_list"}:
        domain = SCHEMA_BY_KEY.get(key.replace("picking_list", "order_confirmation"), []) or domain
    if key in {"production_report", "quality_report", "product_catalog"}:
        domain = SCHEMA_BY_KEY.get("production_card" if "production" in key else "product_card", domain)
    return GLOBAL_FIELDS + domain
