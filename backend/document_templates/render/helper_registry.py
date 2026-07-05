"""Registry for Twig functions and filters — extend without touching RenderPipeline."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any


class TwigHelperRegistry:
    """Registers Twig helpers consumed by the internal template engine backend."""

    def __init__(self) -> None:
        self._functions: dict[str, Callable[..., Any]] = {}
        self._filters: dict[str, Callable[..., Any]] = {}

    def register_function(self, name: str, fn: Callable[..., Any]) -> None:
        key = str(name or "").strip()
        if not key:
            raise ValueError("Twig function name is required.")
        self._functions[key] = fn

    def register_filter(self, name: str, fn: Callable[..., Any]) -> None:
        key = str(name or "").strip()
        if not key:
            raise ValueError("Twig filter name is required.")
        self._filters[key] = fn

    def functions(self) -> dict[str, Callable[..., Any]]:
        return dict(self._functions)

    def filters(self) -> dict[str, Callable[..., Any]]:
        return dict(self._filters)


DEFAULT_TWIG_HELPER_REGISTRY = TwigHelperRegistry()


def get_twig_helper_registry() -> TwigHelperRegistry:
    return DEFAULT_TWIG_HELPER_REGISTRY
