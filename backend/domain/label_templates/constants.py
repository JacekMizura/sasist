"""Canonical label template type ids (stored in ``saved_label_templates.template_type``)."""

from __future__ import annotations

# Family „Zamówienia” (Orders print module)
LABEL_TEMPLATE_TYPE_ORDER = "order"
#: Typ „Etykieta zastępcza” — awaryjna etykieta WMS przy braku listu kurierskiego.
LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT = "order_replacement"
LABEL_TEMPLATE_TYPE_CARRIER = "carrier"

ORDER_FAMILY_TEMPLATE_TYPES: frozenset[str] = frozenset(
    {
        LABEL_TEMPLATE_TYPE_ORDER,
        LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT,
    }
)

LABEL_TEMPLATE_TYPE_LABELS_PL: dict[str, str] = {
    LABEL_TEMPLATE_TYPE_ORDER: "Zamówienie",
    LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT: "Etykieta zastępcza",
    LABEL_TEMPLATE_TYPE_CARRIER: "Nośnik",
}


def is_order_replacement_template_type(raw: object) -> bool:
    return str(raw or "").strip().lower() == LABEL_TEMPLATE_TYPE_ORDER_REPLACEMENT


def normalize_label_template_type(raw: object) -> str:
    return str(raw or "").strip().lower()
