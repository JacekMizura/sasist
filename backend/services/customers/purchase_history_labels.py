"""Polish labels for customer purchase history UI."""

from __future__ import annotations

ORDER_CHANNEL_LABELS_PL: dict[str, str] = {
    "ONLINE": "Sklep online",
    "MARKETPLACE": "Marketplace",
    "DIRECT_SALE": "Sprzedaż stacjonarna",
    "SHOWROOM": "Showroom",
    "PHONE": "Telefon",
    "MANUAL": "Ręczne",
}


def order_channel_label_pl(raw: str | None) -> str:
    key = (raw or "").strip().upper()
    if not key:
        return "Nieznany"
    return ORDER_CHANNEL_LABELS_PL.get(key, key.replace("_", " ").title())


SORT_FIELD_MAP: dict[str, str] = {
    "date": "order_date",
    "document_number": "number",
    "gross": "gross",
    "net": "net",
    "status": "status",
}
