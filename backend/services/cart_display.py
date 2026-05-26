"""Ścieżki prezentacji wózka WMS — nazwa widoczna zamiast samego ``code``."""

from __future__ import annotations


def cart_display_name_for_wms(cart) -> str:
    """
    Preferuje nazwę wózka (jak UI „display_name”); fallback ``id`` + wymiary ``L×W×H``.
    """
    name = (getattr(cart, "name", None) or "").strip()
    if name:
        return name
    num = int(getattr(cart, "id", 0) or 0)
    l = getattr(cart, "length", None)
    w = getattr(cart, "width", None)
    h = getattr(cart, "height", None)
    dims: list[str] = []
    for x in (l, w, h):
        try:
            if x is not None and float(x) > 0:
                dims.append(f"{float(x):g}")
        except (TypeError, ValueError):
            continue
    size = "×".join(dims) if dims else ""
    return f"{num} {size}".strip()
