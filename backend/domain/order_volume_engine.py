"""
ORDER VOLUME ENGINE

Liczy realną objętość zamówienia
na podstawie pozycji i produktów.
"""


def calculate_order_volume(order):
    """
    Oblicza całkowitą objętość zamówienia.

    volume = suma (product.volume × quantity)
    """

    total_volume = 0

    for item in order.items:

        product_volume = item.product.volume or 0
        quantity = item.quantity or 0

        total_volume += product_volume * quantity

    return total_volume
