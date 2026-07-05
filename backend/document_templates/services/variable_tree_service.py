"""Variable tree definitions for document template editor."""

from __future__ import annotations

from typing import Any


def _node(
    label: str,
    *,
    icon: str | None = None,
    insert: str | None = None,
    children: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {"label": label}
    if icon:
        out["icon"] = icon
    if insert:
        out["insert"] = insert
    if children:
        out["children"] = children
    return out


def _global_tree() -> list[dict[str, Any]]:
    return [
        _node("Firma", icon="🏢", children=[
            _node("Nazwa", insert="{{ company.name }}"),
            _node("NIP", insert="{{ company.nip }}"),
            _node("Adres", insert="{{ company.street }}, {{ company.postal_code }} {{ company.city }}"),
            _node("E-mail", insert="{{ company.email }}"),
            _node("Telefon", insert="{{ company.phone | phone }}"),
        ]),
        _node("Tenant", icon="🏬", children=[
            _node("Nazwa", insert="{{ tenant.name }}"),
        ]),
        _node("Magazyn", icon="📦", children=[
            _node("Nazwa", insert="{{ warehouse.name }}"),
            _node("Kod", insert="{{ warehouse.code }}"),
        ]),
        _node("Operator", icon="👤", children=[
            _node("Imię i nazwisko", insert="{{ operator.name }}"),
            _node("Pełna nazwa", insert="{{ operator.full_name }}"),
        ]),
        _node("Branding", icon="🎨", children=[
            _node("Logo URL", insert="{{ logo }}"),
            _node("Logo firmy (helper)", insert="{{ company_logo() }}"),
        ]),
        _node("System", icon="⚙️", children=[
            _node("Data i czas", insert="{{ current_datetime }}"),
            _node("Dziś", insert="{{ today }}"),
            _node("Teraz", insert="{{ now }}"),
            _node("Waluta", insert="{{ currency }}"),
            _node("Język", insert="{{ language }}"),
        ]),
    ]


def build_variable_tree_for_kind(schema_key: str) -> list[dict[str, Any]]:
    key = str(schema_key or "").strip()
    trees: dict[str, list[dict[str, Any]]] = {
        "production_card": _production_card_tree(),
        "production_material_pick_list": _production_card_tree(),
        "production_report": _report_tree(),
        "quality_report": _report_tree(),
        "order_confirmation": _order_tree(),
        "picking_list": _order_tree(),
        "return_document": _return_tree(),
        "complaint_document": _complaint_tree(),
        "invoice": _order_tree(),
        "receipt": _order_tree(),
        "correction": _order_tree(),
        "wz": _warehouse_tree("WZ"),
        "pz": _warehouse_tree("PZ"),
        "pw": _warehouse_tree("PW"),
        "rw": _warehouse_tree("RW"),
        "mm": _warehouse_tree("MM"),
        "inventory_count": _warehouse_tree("Inwentaryzacja"),
        "stock_transfer": _warehouse_tree("Przesunięcie"),
        "relocation_document": _warehouse_tree("Rozlokowanie"),
        "product_card": _product_tree(),
        "product_catalog": _product_tree(),
    }
    domain = trees.get(key, [_node("Dokument", icon="📄", children=_document_fields())])
    return _global_tree() + domain


def _production_card_tree() -> list[dict[str, Any]]:
    return [
        _node("Produkcja", icon="🏭", children=[
            _node("Numer zlecenia", insert="{{ job_number }}"),
            _node("Typ", insert="{{ job_kind_label }}"),
            _node("Data wydruku", insert="{{ printed_at }}"),
            _node("Produkt (nagłówek)", insert="{{ header_product_line }}"),
            _node("SKU", insert="{{ header_sku }}"),
            _node("EAN", insert="{{ header_ean }}"),
            _node("Ilość planowana", insert="{{ header_planned_qty }}"),
            _node("Receptura", insert="{{ recipe_version }}"),
            _node("Magazyn", insert="{{ warehouse_name }}"),
            _node("Operator", insert="{{ operator_name }}"),
            _node("Kod kreskowy", insert="{{ barcode(header_barcode_value) }}"),
            _node("Składniki — pętla", insert="""{% for row in components %}
<tr>
  <td>{{ row.name }}</td>
  <td>{{ row.required_qty }}</td>
  <td>{{ row.suggested_location }}</td>
</tr>
{% endfor %}"""),
            _node("Składnik → nazwa", insert="{{ row.name }}"),
            _node("Składnik → SKU", insert="{{ row.sku }}"),
            _node("Składnik → wymagana ilość", insert="{{ row.required_qty }}"),
            _node("Składnik → lokalizacja", insert="{{ row.suggested_location }}"),
            _node("Składnik → partia", insert="{{ row.batch_number }}"),
            _node("Składnik → kod kreskowy", insert="{{ barcode(row.barcode_value) }}"),
        ]),
    ]


def _order_tree() -> list[dict[str, Any]]:
    return [
        _node("Zamówienie", icon="📦", children=[
            _node("Numer", insert="{{ order_number }}"),
            _node("Data", insert="{{ order_date | date }}"),
            _node("Status", insert="{{ status }}"),
        ]),
        _node("Klient", icon="👤", children=[
            _node("Nazwa", insert="{{ customer.name }}"),
            _node("E-mail", insert="{{ customer.email }}"),
            _node("Telefon", insert="{{ customer.phone | phone }}"),
        ]),
        _node("Dostawa", icon="📍", children=[
            _node("Adres", insert="{{ delivery.street }}"),
            _node("Miasto", insert="{{ delivery.city }}"),
        ]),
        _node("Produkty", icon="🏷", children=[
            _node("Pętla pozycji", insert="""{% for item in items %}
<tr>
  <td>{{ item.product.name }}</td>
  <td>{{ item.product.sku }}</td>
  <td>{{ item.quantity }}</td>
</tr>
{% endfor %}"""),
            _node("Produkt → SKU", insert="{{ item.product.sku }}"),
            _node("Produkt → nazwa", insert="{{ item.product.name }}"),
            _node("Ilość", insert="{{ item.quantity }}"),
        ]),
        _node("Płatność", icon="💳", children=[
            _node("Metoda", insert="{{ payment.method }}"),
            _node("Suma netto", insert="{{ totals.net | money(currency) }}"),
            _node("Suma brutto", insert="{{ totals.gross | money(currency) }}"),
        ]),
        _node("Wysyłka", icon="🚚", children=[
            _node("Przewoźnik", insert="{{ shipping.carrier }}"),
            _node("Tracking", insert="{{ shipping.tracking_number }}"),
        ]),
    ]


def _document_fields() -> list[dict[str, Any]]:
    return [
        _node("Numer", insert="{{ document.number }}"),
        _node("Data", insert="{{ document.created_at | date }}"),
        _node("Status", insert="{{ document.status }}"),
        _node("Tytuł", insert="{{ document.title }}"),
        _node("Uwagi", insert="{{ document.notes }}"),
    ]


def _products_tree() -> list[dict[str, Any]]:
    return [
        _node("Produkty — pętla", insert="""{% for row in products %}
<tr>
  <td>{{ row.name }}</td>
  <td>{{ row.sku }}</td>
  <td>{{ row.quantity | quantity(row.unit) }}</td>
</tr>
{% endfor %}"""),
        _node("Nazwa", insert="{{ row.name }}"),
        _node("SKU", insert="{{ row.sku }}"),
        _node("EAN", insert="{{ row.ean }}"),
        _node("Ilość", insert="{{ row.quantity | quantity(row.unit) }}"),
        _node("Lokalizacja", insert="{{ row.locations | default(row.location) }}"),
        _node("Cena", insert="{{ row.price | money(currency) }}"),
        _node("Kod kreskowy", insert="{{ barcode(row.barcode) }}"),
    ]


def _warehouse_tree(label: str = "Dokument magazynowy") -> list[dict[str, Any]]:
    return [
        _node(label, icon="📄", children=_document_fields() + _products_tree()),
    ]


def _return_tree() -> list[dict[str, Any]]:
    return [
        _node("Zwrot", icon="↩️", children=[
            _node("Numer zwrotu", insert="{{ return_number }}"),
            _node("Zamówienie", insert="{{ order_number }}"),
            *_document_fields(),
            *_products_tree(),
        ]),
    ]


def _complaint_tree() -> list[dict[str, Any]]:
    return [
        _node("Reklamacja", icon="⚠️", children=[
            _node("Numer", insert="{{ complaint_number }}"),
            _node("Powód", insert="{{ reason }}"),
            *_document_fields(),
            *_products_tree(),
        ]),
    ]


def _product_tree() -> list[dict[str, Any]]:
    return [
        _node("Produkt", icon="🏷", children=[
            _node("Nazwa", insert="{{ product.name }}"),
            _node("SKU", insert="{{ product.sku }}"),
            _node("EAN", insert="{{ product.ean }}"),
            _node("Cena netto", insert="{{ prices.net | money(currency) }}"),
            _node("Stan", insert="{{ stock.available }}"),
        ]),
        _node("Producent", icon="🏭", children=[
            _node("Nazwa", insert="{{ manufacturer.name }}"),
        ]),
    ]


def _report_tree() -> list[dict[str, Any]]:
    return [
        _node("Raport", icon="📊", children=[
            _node("Tytuł", insert="{{ title }}"),
            _node("Podtytuł", insert="{{ subtitle }}"),
            _node("Wygenerowano", insert="{{ generated_at | datetime }}"),
            _node("Wiersze — pętla", insert="""{% for row in rows %}
<tr>
  <td>{{ row.label }}</td>
  <td>{{ row.value }}</td>
</tr>
{% endfor %}"""),
        ]),
    ]
