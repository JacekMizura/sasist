"""
SIMULATION ENGINE
=================

To jest czysta warstwa domenowa.

Ten plik:
- NIE zna FastAPI
- NIE zna SQLAlchemy
- NIE zna bazy danych
- NIE ma globalnego stanu

Przyjmuje dane jako zwykłe dict / list
Zwraca wynik jako dict

Można go użyć:
- z API
- z CLI
- z workerów async
- w testach jednostkowych
"""

from typing import Dict, List


# =====================================================
# SYMULACJA SINGLE ORDER (WÓZKI)
# =====================================================
# Logika:
# - Każdy cart ma określoną pojemność (total_volume)
# - W jednej rundzie pakujemy tyle zamówień,
#   ile zmieści się do tej pojemności
# - quantity oznacza ile fizycznych wózków mamy
# =====================================================

def simulate_single(
    order_volumes: Dict[str, float],
    carts: List[dict]
):
    """
    order_volumes:
        {
            "order1": 1200,
            "order2": 800,
            ...
        }

    carts:
        [
            {
                "name": "Cart A",
                "total_volume": 5000,
                "quantity": 2
            }
        ]
    """

    best_result = None

    # Iterujemy po wszystkich dostępnych typach wózków
    for cart in carts:

        capacity = cart["total_volume"]     # ile zmieści 1 wózek
        quantity = cart["quantity"]        # ile mamy fizycznie wózków

        # Jeśli wózek nie ma pojemności → pomijamy
        if capacity <= 0:
            continue

        # Sortujemy zamówienia od największego do najmniejszego
        sorted_orders = sorted(
            order_volumes.items(),
            key=lambda x: x[1],
            reverse=True
        )

        rounds = 0
        remaining = sorted_orders.copy()

        # Dopóki są nieobsłużone zamówienia
        while remaining:

            used_volume = 0
            new_remaining = []

            # Pakujemy zamówienia do jednej rundy
            for order_id, volume in remaining:

                if used_volume + volume <= capacity:
                    used_volume += volume
                else:
                    new_remaining.append((order_id, volume))

            remaining = new_remaining
            rounds += 1

        # Jeśli mamy kilka fizycznych wózków,
        # rundy dzielą się przez ich ilość
        if quantity > 0:
            effective_rounds = rounds // quantity
        else:
            effective_rounds = rounds

        result = {
            "cart_name": cart["name"],
            "rounds": effective_rounds
        }

        # Wybieramy najlepszą strategię (najmniej rund)
        if best_result is None or effective_rounds < best_result["rounds"]:
            best_result = result

    return best_result


# =====================================================
# SYMULACJA MULTI ORDER (REGAŁY)
# =====================================================
# Logika:
# - 1 poziom regału = 1 zamówienie równolegle
# - quantity = ile mamy takich regałów
# - capacity = levels * quantity
# =====================================================

def simulate_multi(
    order_volumes: Dict[str, float],
    racks: List[dict]
):
    """
    racks:
        [
            {
                "name": "Rack A",
                "levels": 5,
                "quantity": 2
            }
        ]
    """

    best_result = None

    total_orders = len(order_volumes)

    for rack in racks:

        levels = rack["levels"]        # ile poziomów ma 1 regał
        quantity = rack["quantity"]   # ile takich regałów mamy

        if levels <= 0:
            continue

        # Ile zamówień możemy robić równolegle
        parallel_capacity = levels * quantity

        if parallel_capacity <= 0:
            continue

        # Ile pełnych rund potrzeba
        rounds = total_orders // parallel_capacity

        # Jeśli zostaje reszta → dodatkowa runda
        if total_orders % parallel_capacity != 0:
            rounds += 1

        result = {
            "rack_name": rack["name"],
            "rounds": rounds
        }

        if best_result is None or rounds < best_result["rounds"]:
            best_result = result

    return best_result
