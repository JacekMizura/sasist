"""
SCHEMATY API – PLANOWANIE KOMPLETACJI

To jest warstwa walidacji wejścia/wyjścia.
Brak logiki biznesowej.
"""

from pydantic import BaseModel
from typing import List


# ================================
# WEJŚCIE – pojedyncze zamówienie
# ================================

class OrderInput(BaseModel):
    order_id: int
    volume: float  # objętość całkowita zamówienia


# ================================
# WEJŚCIE – request do planowania
# ================================

class PlanningRequest(BaseModel):
    tenant_id: int
    warehouse_id: int
    orders: List[OrderInput]


# ================================
# WYJŚCIE – przydział
# ================================

class CartAssignment(BaseModel):
    cart_id: int
    used_volume: float
    capacity: float
    utilization_percent: float
    assigned_orders: List[int]


class PlanningResponse(BaseModel):
    assignments: List[CartAssignment]
    unassigned_orders: List[int]
