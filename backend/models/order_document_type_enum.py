"""Typ dokumentu zamówienia (panel / załączniki).

Trzymany poza ``enums.py`` / pakietem ``enums/``, żeby nie kolidować z istniejącym ``models/enums.py``.
"""

from enum import Enum


class OrderDocumentType(str, Enum):
    PARAGON = "PARAGON"
    PROFORMA = "PROFORMA"
    FAKTURA = "FAKTURA"
    RACHUNEK = "RACHUNEK"
    KOREKTA = "KOREKTA"
    #: Załącznik z pola „Dokument sprzedaży” (widok w sekcji Dokumenty, jeden rekord z wartością pola).
    DOKUMENT_SPRZEDAZY = "DOKUMENT_SPRZEDAZY"
    ZALACZNIK = "ZALACZNIK"
    LIST_PRZEWOZOWY = "LIST_PRZEWOZOWY"


ORDER_DOCUMENT_TYPE_VALUES = frozenset(e.value for e in OrderDocumentType)
