"""Compose ERP document starter Twig from shared blocks — single source for starter files."""

from __future__ import annotations

_WAREHOUSE_BODY = """{% extends "base_document" %}
{% block title %}{{ document.title | default(title) }} {{ document.number | default(document_number) }}{% endblock %}
{% block header %}
<header class="doc-header">{% include_document "document_header" %}</header>
{% endblock %}
{% block content %}
<h1 class="doc-title">{{ document.title | default(title) }}</h1>
{% include_document "document_summary" %}
<table class="doc-table">
  {% include_document "product_table_header" %}
  <tbody>
  {% for row in products %}
  <tr>
    <td>{{ loop.index }}</td>
    <td>
      <strong>{{ row.name | default(row.product.name) }}</strong>
      {% if row.sku or row.product.sku %}<br/><span class="text-muted">{{ row.sku | default(row.product.sku) }}</span>{% endif %}
    </td>
    <td>{{ row.sku | default(row.product.sku) | default('—') }}</td>
    <td>{{ row.ean | default(row.product.ean) | default('—') }}</td>
    <td class="text-right">{{ row.quantity | quantity(row.unit | default('szt.')) }}</td>
    <td>{{ row.unit | default('szt.') }}</td>
    <td>{{ row.locations | default(row.location) | default('—') }}</td>
  </tr>
  {% endfor %}
  </tbody>
  {% include_document "product_table_footer" %}
</table>
{% include_document "document_totals" %}
{% include_document "document_notes" %}
<div class="signature-row">
  {% include_document "warehouse_signature" %}
  {% include_document "operator_signature" %}
</div>
{% include_document "barcode_section" %}
{% include_document "qr_section" %}
{% endblock %}
{% block footer %}
<footer class="doc-footer">{% include_document "document_footer" %}</footer>
{% endblock %}
"""

_ORDER_BODY = """{% extends "base_document" %}
{% block title %}Zamówienie {{ order_number | default(document.number) }}{% endblock %}
{% block header %}
<header class="doc-header">{% include_document "document_header" %}</header>
{% endblock %}
{% block content %}
<h1 class="doc-title">{{ document.title | default('Potwierdzenie zamówienia') }}</h1>
{% include_document "document_summary" %}
{% if customer.name %}
<p><strong>Klient:</strong> {{ customer.name }}{% if customer.phone %} · {{ customer.phone | phone }}{% endif %}</p>
{% endif %}
<table class="doc-table">
  {% include_document "product_table_header" %}
  <tbody>
  {% for item in items %}
  <tr>
    <td>{{ loop.index }}</td>
    <td><strong>{{ item.product.name }}</strong></td>
    <td>{{ item.product.sku | default('—') }}</td>
    <td>{{ item.product.ean | default('—') }}</td>
    <td class="text-right">{{ item.quantity | quantity(item.unit) }}</td>
    <td>{{ item.unit | default('szt.') }}</td>
    <td>—</td>
  </tr>
  {% endfor %}
  </tbody>
  {% include_document "product_table_footer" %}
</table>
{% include_document "document_totals" %}
{% include_document "document_notes" %}
<div class="signature-row">
  {% include_document "company_signature" %}
  {% include_document "operator_signature" %}
</div>
{% endblock %}
{% block footer %}
<footer class="doc-footer">{% include_document "document_footer" %}</footer>
{% endblock %}
"""

_COMMERCE_BODY = """{% extends "base_document" %}
{% block title %}{{ document.type_label | default(document.title) }} {{ document.number }}{% endblock %}
{% block header %}
<header class="doc-header">{% include_document "document_header" %}</header>
{% endblock %}
{% block content %}
<h1 class="doc-title">{{ document.type_label | default(document.title) }}</h1>
{% include_document "document_summary" %}
<table class="doc-table">
  <thead><tr><th>Lp.</th><th>Nazwa</th><th>Ilość</th><th>Cena netto</th><th>Wartość</th><th>VAT</th></tr></thead>
  <tbody>
  {% for item in items %}
  <tr>
    <td>{{ loop.index }}</td>
    <td>{{ item.name | default(item.product_name) }}</td>
    <td>{{ item.quantity }}</td>
    <td class="text-right">{{ item.unit_price_net | money(currency) }}</td>
    <td class="text-right">{{ item.line_total_net | money(currency) }}</td>
    <td>{{ item.vat_rate | default('—') }}</td>
  </tr>
  {% endfor %}
  </tbody>
</table>
{% include_document "document_totals" %}
<div class="signature-row">{% include_document "company_signature" %}</div>
{% endblock %}
{% block footer %}
<footer class="doc-footer">{% include_document "document_footer" %}</footer>
{% endblock %}
"""

_PRODUCTION_CARD_BODY = """{% extends "base_document" %}
{% block title %}Karta produkcyjna {{ job_number }}{% endblock %}
{% block header %}
<header class="doc-header">{% include_document "document_header" %}</header>
{% endblock %}
{% block content %}
<h1 class="doc-title">Karta produkcyjna</h1>
<p class="text-muted">{{ job_kind_label }} · {{ job_number }} · {{ printed_at }}</p>
<div class="doc-summary-grid">
  <div><span class="text-muted">Produkt:</span> {{ header_product_line }}</div>
  <div><span class="text-muted">SKU:</span> {{ header_sku | default('—') }}</div>
  <div><span class="text-muted">Plan:</span> {{ header_planned_qty }}</div>
  <div><span class="text-muted">Receptura:</span> {{ recipe_version | default('—') }}</div>
</div>
{% if header_barcode_value %}{{ barcode(header_barcode_value) }}{% endif %}
<h2 class="doc-subtitle">Składniki</h2>
<table class="doc-table">
  <thead><tr><th>Nazwa</th><th>SKU</th><th>Wymagana</th><th>J.m.</th><th>Lokalizacja</th><th>Partia</th></tr></thead>
  <tbody>
  {% for row in components %}
  <tr>
    <td><strong>{{ row.name }}</strong></td>
    <td>{{ row.sku | default('—') }}</td>
    <td>{{ row.required_qty }}</td>
    <td>{{ row.unit | default('szt.') }}</td>
    <td>{{ row.suggested_location | default('—') }}</td>
    <td>{{ row.batch_number | default('—') }}</td>
  </tr>
  {% endfor %}
  </tbody>
</table>
<div class="signature-row">
  {% include_document "warehouse_signature" %}
  {% include_document "operator_signature" %}
  {% include_document "company_signature" %}
</div>
{% include_document "document_notes" %}
{% endblock %}
{% block footer %}
<footer class="doc-footer">{% include_document "document_footer" %}</footer>
{% endblock %}
"""

_PRODUCT_CARD_BODY = """{% extends "base_document" %}
{% block title %}Karta produktu {{ product.name }}{% endblock %}
{% block header %}
<header class="doc-header">{% include_document "document_header" %}</header>
{% endblock %}
{% block content %}
<h1 class="doc-title">{{ product.name }}</h1>
<div class="doc-summary-grid">
  <div><span class="text-muted">SKU:</span> {{ product.sku | default('—') }}</div>
  <div><span class="text-muted">EAN:</span> {{ product.ean | default('—') }}</div>
  <div><span class="text-muted">Producent:</span> {{ manufacturer.name | default('—') }}</div>
  <div><span class="text-muted">Stan:</span> {{ stock.available | default('—') }}</div>
</div>
{% if product.barcode_value %}{{ barcode(product.barcode_value) }}{% endif %}
{% endblock %}
{% block footer %}
<footer class="doc-footer">{% include_document "document_footer" %}</footer>
{% endblock %}
"""

_REPORT_BODY = """{% extends "base_document" %}
{% block title %}{{ title }}{% endblock %}
{% block header %}
<header class="doc-header">{% include_document "document_header" %}</header>
{% endblock %}
{% block content %}
<h1 class="doc-title">{{ title }}</h1>
{% if subtitle %}<p class="text-muted">{{ subtitle }}</p>{% endif %}
<table class="doc-table">
  <tbody>
  {% for row in rows %}
  <tr><td>{{ row.label | default(row.name) }}</td><td>{{ row.value }}</td></tr>
  {% endfor %}
  </tbody>
</table>
{% endblock %}
{% block footer %}
<footer class="doc-footer">{% include_document "document_footer" %}</footer>
{% endblock %}
"""

STARTER_CONTENT: dict[str, str] = {
    "wz": _WAREHOUSE_BODY.replace("{{ document.title | default(title) }}", "WZ").replace(
        "{{ document.title | default(title) }}", "WZ", 1
    ).replace("{% block title %}{{ document.title | default(title) }}", "{% block title %}WZ"),
    "pz": _WAREHOUSE_BODY.replace("{% block title %}{{ document.title | default(title) }}", "{% block title %}PZ").replace(
        "<h1 class=\"doc-title\">{{ document.title | default(title) }}</h1>",
        "<h1 class=\"doc-title\">Przyjęcie zewnętrzne (PZ)</h1>",
    ),
    "pw": _WAREHOUSE_BODY.replace("{% block title %}{{ document.title | default(title) }}", "{% block title %}PW").replace(
        "<h1 class=\"doc-title\">{{ document.title | default(title) }}</h1>",
        "<h1 class=\"doc-title\">Przyjęcie wewnętrzne (PW)</h1>",
    ),
    "rw": _WAREHOUSE_BODY.replace("{% block title %}{{ document.title | default(title) }}", "{% block title %}RW").replace(
        "<h1 class=\"doc-title\">{{ document.title | default(title) }}</h1>",
        "<h1 class=\"doc-title\">Rozchód wewnętrzny (RW)</h1>",
    ),
    "mm": _WAREHOUSE_BODY.replace("{% block title %}{{ document.title | default(title) }}", "{% block title %}MM").replace(
        "<h1 class=\"doc-title\">{{ document.title | default(title) }}</h1>",
        "<h1 class=\"doc-title\">Przesunięcie międzymagazynowe (MM)</h1>",
    ),
    "order_confirmation": _ORDER_BODY.replace(
        "<h1 class=\"doc-title\">{{ document.title | default('Potwierdzenie zamówienia') }}</h1>",
        "<h1 class=\"doc-title\">Potwierdzenie zamówienia</h1>",
    ),
    "picking_list": _ORDER_BODY.replace(
        "{% block title %}Zamówienie", "{% block title %}Lista kompletacyjna"
    ).replace(
        "<h1 class=\"doc-title\">{{ document.title | default('Potwierdzenie zamówienia') }}</h1>",
        "<h1 class=\"doc-title\">Lista kompletacyjna</h1>",
    ),
    "invoice": _COMMERCE_BODY,
    "receipt": _COMMERCE_BODY.replace("Faktura", "Paragon"),
    "correction": _COMMERCE_BODY.replace("{% block title %}", "{% block title %}Korekta ").replace(
        "{{ document.type_label | default(document.title) }}", "Korekta {{ document.type_label | default(document.title) }}"
    ),
    "production_card": _PRODUCTION_CARD_BODY,
    "production_material_pick_list": _PRODUCTION_CARD_BODY.replace(
        "Karta produkcyjna", "Lista pobrania materiałów"
    ),
    "production_report": _REPORT_BODY,
    "quality_report": _REPORT_BODY,
    "product_card": _PRODUCT_CARD_BODY,
    "product_catalog": _PRODUCT_CARD_BODY.replace("Karta produktu", "Katalog produktów"),
    "inventory_count": _WAREHOUSE_BODY.replace(
        "{% block title %}{{ document.title | default(title) }}", "{% block title %}Inwentaryzacja"
    ).replace(
        "<h1 class=\"doc-title\">{{ document.title | default(title) }}</h1>",
        "<h1 class=\"doc-title\">Dokument inwentaryzacyjny</h1>",
    ),
    "stock_transfer": _WAREHOUSE_BODY.replace(
        "{% block title %}{{ document.title | default(title) }}", "{% block title %}Przesunięcie"
    ).replace(
        "<h1 class=\"doc-title\">{{ document.title | default(title) }}</h1>",
        "<h1 class=\"doc-title\">Dokument przesunięcia</h1>",
    ),
    "relocation_document": _WAREHOUSE_BODY.replace(
        "{% block title %}{{ document.title | default(title) }}", "{% block title %}Rozlokowanie"
    ).replace(
        "<h1 class=\"doc-title\">{{ document.title | default(title) }}</h1>",
        "<h1 class=\"doc-title\">Dokument rozlokowania (nośniki)</h1>",
    ),
    "return_document": _ORDER_BODY.replace(
        "{% block title %}Zamówienie", "{% block title %}Zwrot"
    ).replace(
        "<h1 class=\"doc-title\">{{ document.title | default('Potwierdzenie zamówienia') }}</h1>",
        "<h1 class=\"doc-title\">Dokument zwrotu</h1>",
    ),
    "complaint_document": _ORDER_BODY.replace(
        "{% block title %}Zamówienie", "{% block title %}Reklamacja"
    ).replace(
        "<h1 class=\"doc-title\">{{ document.title | default('Potwierdzenie zamówienia') }}</h1>",
        "<h1 class=\"doc-title\">Dokument reklamacji</h1>",
    ),
}


def starter_twig_for_kind(kind_code: str) -> str | None:
    return STARTER_CONTENT.get(str(kind_code).strip())
