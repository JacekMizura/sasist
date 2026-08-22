"""Canonical message-template variable registry (SSOT)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ValueKind = Literal["TEXT", "HTML", "URL"]
VarGroup = Literal[
    "order",
    "customer",
    "billing",
    "shipping",
    "payment",
    "delivery",
    "products",
    "documents",
    "shop",
    "return",
    "complaint",
]

GROUP_LABELS: dict[str, str] = {
    "order": "Zamówienie",
    "customer": "Klient",
    "billing": "Adres faktury",
    "shipping": "Adres dostawy",
    "payment": "Płatność i dostawa",
    "delivery": "Płatność i dostawa",
    "products": "Produkty",
    "documents": "Dokumenty",
    "shop": "Sklep",
    "return": "Zwrot / reklamacja",
    "complaint": "Zwrot / reklamacja",
}


@dataclass(frozen=True)
class TemplateVariableDef:
    key: str
    label: str
    description: str
    group: VarGroup
    value_kind: ValueKind = "TEXT"
    #: Entity contexts that can resolve this variable (empty = any).
    supported_contexts: tuple[str, ...] = ()
    #: Legacy alias keys that resolve to the same value (e.g. order_number → order_id).
    aliases: tuple[str, ...] = ()


# V1 catalog — only keys we can resolve from Sasist SSOT.
TEMPLATE_VARIABLES: tuple[TemplateVariableDef, ...] = (
    # ORDER
    TemplateVariableDef(
        "order_id",
        "Numer zamówienia",
        "Numer / identyfikator zamówienia w Sasist",
        "order",
        supported_contexts=("ORDER",),
        aliases=("order_number",),
    ),
    TemplateVariableDef(
        "external_order_id",
        "Numer zewnętrzny",
        "Identyfikator zamówienia z marketplace / OMS",
        "order",
        supported_contexts=("ORDER",),
    ),
    TemplateVariableDef(
        "order_email",
        "E-mail klienta",
        "Adres e-mail nabywcy",
        "order",
        supported_contexts=("ORDER",),
        aliases=("customer_email",),
    ),
    TemplateVariableDef(
        "order_date",
        "Data zamówienia",
        "Data złożenia zamówienia",
        "order",
        supported_contexts=("ORDER",),
    ),
    TemplateVariableDef(
        "order_comment",
        "Komentarz klienta",
        "Uwagi klienta do zamówienia",
        "order",
        supported_contexts=("ORDER",),
    ),
    TemplateVariableDef(
        "sum",
        "Kwota zamówienia",
        "Całkowita wartość zamówienia",
        "order",
        supported_contexts=("ORDER",),
    ),
    TemplateVariableDef(
        "to_pay",
        "Do zapłaty",
        "Kwota pozostała do zapłaty (gdy dostępna)",
        "order",
        supported_contexts=("ORDER",),
    ),
    TemplateVariableDef(
        "currency",
        "Waluta",
        "Kod waluty zamówienia",
        "order",
        supported_contexts=("ORDER",),
    ),
    TemplateVariableDef(
        "status",
        "Status zamówienia",
        "Nazwa statusu panelowego",
        "order",
        supported_contexts=("ORDER",),
        aliases=("status_name",),
    ),
    TemplateVariableDef(
        "weight",
        "Waga",
        "Suma wag pozycji (kg), jeśli produkty mają wagę",
        "order",
        supported_contexts=("ORDER",),
    ),
    # CUSTOMER
    TemplateVariableDef(
        "customer_name",
        "Imię i nazwisko klienta",
        "Imię i nazwisko z kartoteki klienta",
        "customer",
        supported_contexts=("ORDER", "RETURN", "COMPLAINT"),
    ),
    TemplateVariableDef(
        "customer_phone",
        "Telefon klienta",
        "Telefon z kartoteki klienta",
        "customer",
        supported_contexts=("ORDER", "RETURN", "COMPLAINT"),
    ),
    # BILLING
    TemplateVariableDef("bill_address_name", "Imię (faktura)", "Imię z adresu fakturowego", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_surname", "Nazwisko (faktura)", "Nazwisko z adresu fakturowego", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_street", "Ulica (faktura)", "Ulica z adresu fakturowego", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_home_number", "Nr domu (faktura)", "Numer budynku / lokalu", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_postcode", "Kod pocztowy (faktura)", "Kod pocztowy", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_city", "Miasto (faktura)", "Miasto", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_state", "Województwo (faktura)", "Województwo / region", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_phone", "Telefon (faktura)", "Telefon na fakturze", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_company_name", "Firma (faktura)", "Nazwa firmy", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_company_nip", "NIP (faktura)", "NIP nabywcy", "billing", supported_contexts=("ORDER",)),
    TemplateVariableDef("bill_address_country", "Kraj (faktura)", "Kraj", "billing", supported_contexts=("ORDER",)),
    # SHIPPING
    TemplateVariableDef("shipment_address_name", "Imię (dostawa)", "Imię odbiorcy", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_surname", "Nazwisko (dostawa)", "Nazwisko odbiorcy", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_street", "Ulica (dostawa)", "Ulica dostawy", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_home_number", "Nr domu (dostawa)", "Numer budynku / lokalu", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_postcode", "Kod pocztowy (dostawa)", "Kod pocztowy", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_city", "Miasto (dostawa)", "Miasto dostawy", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_state", "Województwo (dostawa)", "Województwo / region", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_phone", "Telefon (dostawa)", "Telefon odbiorcy", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_company_name", "Firma (dostawa)", "Nazwa firmy odbiorcy", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_company_nip", "NIP (dostawa)", "NIP odbiorcy", "shipping", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_address_country", "Kraj (dostawa)", "Kraj dostawy", "shipping", supported_contexts=("ORDER",)),
    # PAYMENT / DELIVERY
    TemplateVariableDef("payment_name", "Metoda płatności", "Nazwa metody płatności", "payment", supported_contexts=("ORDER",)),
    TemplateVariableDef("shipment_name", "Metoda dostawy", "Nazwa metody dostawy", "delivery", supported_contexts=("ORDER",)),
    # PRODUCTS
    TemplateVariableDef(
        "products_with_quantity",
        "Lista produktów",
        "Tekstowa lista produktów z ilościami",
        "products",
        supported_contexts=("ORDER",),
    ),
    TemplateVariableDef(
        "cart",
        "Tabela produktów (HTML)",
        "Tabela HTML pozycji zamówienia",
        "products",
        value_kind="HTML",
        supported_contexts=("ORDER",),
    ),
    # DOCUMENTS
    TemplateVariableDef(
        "invoice_number",
        "Numer faktury",
        "Numer dokumentu sprzedaży (FV), jeśli wystawiony",
        "documents",
        supported_contexts=("ORDER",),
    ),
    TemplateVariableDef(
        "receipt_number",
        "Numer paragonu",
        "Numer paragonu (PA), jeśli wystawiony",
        "documents",
        supported_contexts=("ORDER",),
    ),
    # SHOP
    TemplateVariableDef("shop_name", "Nazwa sklepu / tenanta", "Nazwa podmiotu (tenant)", "shop"),
    # RETURN / COMPLAINT (entity-specific)
    TemplateVariableDef(
        "return_id",
        "Identyfikator zwrotu",
        "ID / numer RMZ",
        "return",
        supported_contexts=("RETURN",),
        aliases=("rmz_number",),
    ),
    TemplateVariableDef(
        "complaint_number",
        "Numer reklamacji",
        "Numer / referencja reklamacji",
        "complaint",
        supported_contexts=("COMPLAINT",),
    ),
)


def _build_index() -> dict[str, TemplateVariableDef]:
    out: dict[str, TemplateVariableDef] = {}
    for d in TEMPLATE_VARIABLES:
        if d.key in out:
            raise RuntimeError(f"duplicate template variable key: {d.key}")
        out[d.key] = d
        for a in d.aliases:
            if a in out and out[a].key != d.key:
                raise RuntimeError(f"duplicate template variable alias: {a}")
            out[a] = d
    return out


VARIABLE_BY_KEY: dict[str, TemplateVariableDef] = _build_index()


def list_variable_catalog(*, entity_type: str | None = None) -> list[dict]:
    """API payload — unique defs, optionally filtered by context."""
    et = (entity_type or "").strip().upper() or None
    seen: set[str] = set()
    items: list[dict] = []
    for d in TEMPLATE_VARIABLES:
        if d.key in seen:
            continue
        seen.add(d.key)
        if et and d.supported_contexts and et not in d.supported_contexts:
            continue
        items.append(
            {
                "key": d.key,
                "token": f"{{{d.key}}}",
                "label": d.label,
                "description": d.description,
                "group": d.group,
                "group_label": GROUP_LABELS.get(d.group, d.group),
                "value_kind": d.value_kind,
                "supported_contexts": list(d.supported_contexts),
                "aliases": list(d.aliases),
            }
        )
    return items


def list_variable_groups(*, entity_type: str | None = None) -> list[dict]:
    """Group catalog; merge registry groups that share the same display label."""
    items = list_variable_catalog(entity_type=entity_type)
    label_order: list[str] = []
    by_label: dict[str, list[dict]] = {}
    for it in items:
        label = GROUP_LABELS.get(it["group"], it["group"])
        if label not in by_label:
            by_label[label] = []
            label_order.append(label)
        by_label[label].append(it)
    # Stable order following GROUP_LABELS first-seen labels
    preferred: list[str] = []
    seen_labels: set[str] = set()
    for g in GROUP_LABELS:
        lab = GROUP_LABELS[g]
        if lab in by_label and lab not in seen_labels:
            preferred.append(lab)
            seen_labels.add(lab)
    for lab in label_order:
        if lab not in seen_labels:
            preferred.append(lab)
    groups: list[dict] = []
    for lab in preferred:
        vars_ = by_label.get(lab) or []
        if not vars_:
            continue
        groups.append(
            {
                "id": lab.lower().replace(" ", "_").replace("/", "_"),
                "label": lab,
                "variables": vars_,
            }
        )
    return groups
