"""In-memory cache for editor — invalidated on publish."""

from __future__ import annotations

import threading
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_lock = threading.Lock()
_variable_schema: dict[str, tuple[Any, float]] = {}
_sample_context: dict[str, tuple[Any, float]] = {}
_dependency_graph: dict[int, tuple[Any, float]] = {}
_TTL_SECONDS = 300.0


def _cache_get(store: dict, key: str | int) -> Any | None:
    import time

    with _lock:
        hit = store.get(key)
        if hit is None:
            return None
        value, expires = hit
        if time.time() > expires:
            store.pop(key, None)
            return None
        return value


def _cache_set(store: dict, key: str | int, value: Any) -> None:
    import time

    with _lock:
        store[key] = (value, time.time() + _TTL_SECONDS)


def cached_variable_schema(key: str, factory: Callable[[], T]) -> T:
    cached = _cache_get(_variable_schema, key)
    if cached is not None:
        return cached
    value = factory()
    _cache_set(_variable_schema, key, value)
    return value


def cached_sample_context(key: str, factory: Callable[[], T]) -> T:
    cached = _cache_get(_sample_context, key)
    if cached is not None:
        return cached
    value = factory()
    _cache_set(_sample_context, key, value)
    return value


def cached_dependency_graph(version_id: int, factory: Callable[[], T]) -> T:
    cached = _cache_get(_dependency_graph, version_id)
    if cached is not None:
        return cached
    value = factory()
    _cache_set(_dependency_graph, version_id, value)
    return value


def invalidate_tenant_editor_cache(tenant_id: int | None = None) -> None:
    """Clear caches after publication or import."""
    _ = tenant_id
    with _lock:
        _variable_schema.clear()
        _sample_context.clear()
        _dependency_graph.clear()
