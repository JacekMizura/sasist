"""
TEST SILNIKA PLANOWANIA (bez API, bez bazy)

Uruchamiamy ręcznie:
python -m backend.tests.test_planning_engine
"""

from backend.domain.planning_engine import assign_orders_to_carts


# ==========================================
# MOCK PRODUKTÓW (jakby były z CSV/bazy)
# ==========================================

products_lookup = {
    "111": {"volume": 10.0},
    "222": {"volume": 25.0},
    "333": {"volume": 50.0},
}


# ==========================================
# MOCK ZAMÓWIEŃ
# ==========================================

orders = [
    {
        "id": 1,
        "items": [
            {"ean": "111", "quantity": 2},  # 2 × 10 = 20
        ]
    },
    {
        "id": 2,
        "items": [
            {"ean": "222", "quantity": 1},  # 25
        ]
    },
    {
        "id": 3,
        "items": [
            {"ean": "333", "quantity": 1},  # 50
        ]
    },
    {
        "id": 4,
        "items": [
            {"ean": "111", "quantity": 1},  # 10
        ]
    }
]


# ==========================================
# MOCK WÓZKÓW
# ==========================================

carts = [
    {"id": 1, "max_volume": 60.0},
    {"id": 2, "max_volume": 40.0},
]


# ==========================================
# URUCHOMIENIE SILNIKA
# ==========================================

if __name__ == "__main__":

    result = assign_orders_to_carts(
        orders=orders,
        carts=carts,
        products_lookup=products_lookup
    )

    print("\n=== WYNIK PLANOWANIA ===\n")

    for cart in result["carts"]:
        print(f"Wózek {cart['cart_id']}")
        print(f"  Użyta objętość: {cart['used_volume']}")
        print(f"  Zamówienia: {cart['orders']}")
        print()

    print("Nieprzydzielone zamówienia:", result["unassigned_orders"])
