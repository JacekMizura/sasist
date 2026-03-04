"""
CART ALLOCATION ENGINE

To jest czysta logika biznesowa.
Nie używa DB.
Nie robi commitów.
Nie zna FastAPI.

Odpowiada za:
- liczenie objętości zamówienia
- sprawdzanie dopasowania do koszyka
- alokację MULTI
- alokację BULK
"""

# ==========================================================
# LICZENIE OBJĘTOŚCI ZAMÓWIENIA
# ==========================================================

def calculate_order_volume(order) -> float:
    """
    Liczy objętość całego zamówienia
    na podstawie pozycji OrderItem.
    """

    total = 0

    # Iterujemy po wszystkich pozycjach zamówienia
    for item in order.items:

        product = item.product

        if not product:
            continue

        # Liczymy objętość pojedynczego produktu
        volume = (
            (product.length or 0) *
            (product.width or 0) *
            (product.height or 0)
        )

        # Mnożymy przez ilość
        total += volume * item.quantity

    return total


# ==========================================================
# SPRAWDZENIE CZY PRODUKTY MIESZCZĄ SIĘ WYMIAROWO
# ==========================================================

def products_fit_in_basket(order, basket) -> bool:
    """
    Każdy produkt w zamówieniu
    musi zmieścić się wymiarowo w koszyku.
    """

    for item in order.items:

        product = item.product

        if not product:
            continue

        product_max = max(
            product.length or 0,
            product.width or 0,
            product.height or 0
        )

        basket_max = max(
            basket.inner_length,
            basket.inner_width,
            basket.inner_height
        )

        # Jeśli choć jeden produkt nie mieści się
        if product_max > basket_max:
            return False

    return True


# ==========================================================
# ALOKACJA MULTI (koszykowa)
# ==========================================================

def allocate_multi(cart, order):
    """
    Szuka pierwszego wolnego koszyka,
    który spełnia warunki objętości i wymiaru.
    """

    order_volume = calculate_order_volume(order)

    for basket in cart.baskets:

        # Pomijamy zajęte koszyki
        if basket.order_id is not None:
            continue

        # Warunek objętości
        if order_volume > basket.usable_volume:
            continue

        # Warunek wymiarowy
        if not products_fit_in_basket(order, basket):
            continue

        return basket  # znaleziono dopasowanie

    return None


# ==========================================================
# ALOKACJA BULK
# ==========================================================

def allocate_bulk(cart, order):
    """
    Sprawdza czy zamówienie zmieści się
    w wózku BULK (85% limitu).
    """

    order_volume = calculate_order_volume(order)

    limit = cart.total_volume * 0.85

    if (cart.used_volume or 0) + order_volume > limit:
        return False

    return True
"""
FUNKCJA: calculate_order_volume

Liczy całkowitą objętość zamówienia
na podstawie jego pozycji.
"""

def calculate_order_volume(order):

    total_volume = 0

    for item in order.items:

        product = item.product

        if not product:
            continue

        # Jeśli produkt nie ma wymiarów → pomijamy
        if not product.length or not product.width or not product.height:
            continue

        volume = product.length * product.width * product.height

        total_volume += volume * item.quantity

    return total_volume
