"""
SILNIK PLANOWANIA KOMPLETACJI

Odpowiada za:
- przydzielanie zamówień do wózków
- pilnowanie limitu objętości
- zwracanie listy niewpasowanych zamówień

To jest czysta logika biznesowa.
Zero SQL.
Zero FastAPI.
"""

from typing import List, Dict


def plan_orders(carts: List[Dict], orders: List[Dict]) -> Dict:
    """
    carts:
        [
            {"cart_id": 1, "capacity": 1000},
            {"cart_id": 2, "capacity": 800}
        ]

    orders:
        [
            {"order_id": 101, "volume": 200},
            {"order_id": 102, "volume": 300}
        ]
    """

    # ============================
    # Przygotowanie struktury wynikowej
    # ============================

    assignments = []

    for cart in carts:
        assignments.append({
            "cart_id": cart["cart_id"],
            "capacity": cart["capacity"],
            "used_volume": 0.0,
            "assigned_orders": []
        })

    unassigned_orders = []

    # ============================
    # PROSTY ALGORYTM:
    # Pierwszy pasujący wózek
    # ============================

    for order in orders:
        placed = False

        for cart in assignments:
            if cart["used_volume"] + order["volume"] <= cart["capacity"]:
                cart["used_volume"] += order["volume"]
                cart["assigned_orders"].append(order["order_id"])
                placed = True
                break

        if not placed:
            unassigned_orders.append(order["order_id"])

    return {
        "assignments": assignments,
        "unassigned_orders": unassigned_orders
    }
