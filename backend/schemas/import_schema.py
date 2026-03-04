"""
SCHEMAS DO IMPORTU CSV

Pozwalają mapować kolumny z CSV
na pola systemowe Order.
"""

from pydantic import BaseModel
from typing import Dict


class OrderImportMapping(BaseModel):
    """
    mapping:
    klucz = nazwa kolumny w CSV
    wartość = pole w modelu Order
    """

    mapping: Dict[str, str]
    tenant_id: int
    warehouse_id: int
"""
MAPOWANIE CSV → PRODUCT
"""

class ProductImportMapping(BaseModel):
    """
    mapping:
    klucz = nazwa kolumny w CSV
    wartość = pole w modelu Product
    """

    mapping: Dict[str, str]
    tenant_id: int
    warehouse_id: int
