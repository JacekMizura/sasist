"""
Schematy odpowiedzi API symulacji przypisania zamówień do wózków.
"""

from pydantic import BaseModel


class SimulationAssignResponse(BaseModel):
    assigned_orders_count: int
    unassigned_orders_count: int
    cart_utilization_percent: float
    status: str
