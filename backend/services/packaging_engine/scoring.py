"""Normalizacja pewności i wypełnienia."""


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def confidence_from_fill(fill_ratio: float, *, fits: bool) -> float:
    """fill_ratio = objętość_zamówienia / objętość_kartonu (0–∞)."""
    if not fits:
        return clamp01(0.15 + 0.25 * min(1.0, fill_ratio))
    if fill_ratio <= 0:
        return 0.35
    # Im bliżej sensownego wypełnienia (bez przepełnienia), tym wyżej.
    if fill_ratio <= 0.55:
        return clamp01(0.55 + fill_ratio * 0.5)
    if fill_ratio <= 0.88:
        return clamp01(0.72 + (0.88 - fill_ratio) * 0.35)
    return clamp01(0.62 + (1.0 - fill_ratio) * 0.4)
