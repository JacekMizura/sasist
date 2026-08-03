"""In-request event buffer (debounce / batch window for the Dispatcher)."""

from __future__ import annotations

from contextvars import ContextVar

from .types import SupplyFlowEvent

_buffer: ContextVar[list[SupplyFlowEvent] | None] = ContextVar(
    "supply_flow_event_buffer", default=None
)


def get_buffer() -> list[SupplyFlowEvent]:
    buf = _buffer.get()
    if buf is None:
        buf = []
        _buffer.set(buf)
    return buf


def clear_buffer() -> list[SupplyFlowEvent]:
    buf = _buffer.get() or []
    _buffer.set([])
    return list(buf)


def enqueue(event: SupplyFlowEvent) -> None:
    get_buffer().append(event)


def peek_buffer() -> list[SupplyFlowEvent]:
    return list(_buffer.get() or [])
