"""
ENUMY SYSTEMOWE
Oddzielamy je od modeli, żeby uniknąć duplikacji
"""

import enum


class CartType(enum.Enum):
    MULTI = "multi"
    BULK = "bulk"


class CartStatus(enum.Enum):
    AVAILABLE = "pusty"
    IN_PROGRESS = "w trakcie zbierania"
    FULL = "pełny"
    SERVICE = "w serwisie"
