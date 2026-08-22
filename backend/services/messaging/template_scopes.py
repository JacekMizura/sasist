"""MessageTemplate supported_contexts SSOT helpers (legacy entity_scope compatible)."""

from __future__ import annotations

import json
import re
from typing import Any, Iterable, Optional, Sequence

ALL_CONTEXTS: tuple[str, ...] = ("ORDER", "RETURN", "COMPLAINT")
_ALLOWED = frozenset(ALL_CONTEXTS)
_LEGACY_SINGLE = frozenset({"ORDER", "RETURN", "COMPLAINT", "ALL"})


def normalize_supported_contexts(
    raw: Any,
    *,
    default_all_on_empty: bool = True,
) -> list[str]:
    """
    Parse DB/API value into canonical ordered unique list.

    Accepts:
    - legacy: ALL | ORDER | RETURN | COMPLAINT
    - CSV / plus: ORDER,RETURN or ORDER+RETURN
    - JSON list: ["ORDER","RETURN"]
    - Python list/tuple
    """
    if raw is None:
        return list(ALL_CONTEXTS) if default_all_on_empty else []

    if isinstance(raw, (list, tuple, set)):
        items = [str(x).strip().upper() for x in raw]
        if not items:
            return list(ALL_CONTEXTS) if default_all_on_empty else []
    else:
        s = str(raw).strip()
        if not s:
            return list(ALL_CONTEXTS) if default_all_on_empty else []
        upper = s.upper()
        if upper == "ALL":
            return list(ALL_CONTEXTS)
        if upper in ("ORDER", "RETURN", "COMPLAINT"):
            return [upper]
        if s.startswith("["):
            try:
                parsed = json.loads(s)
            except (json.JSONDecodeError, TypeError):
                parsed = None
            if isinstance(parsed, list):
                items = [str(x).strip().upper() for x in parsed]
            else:
                items = [p for p in re.split(r"[,+|;\s]+", upper) if p]
        else:
            items = [p for p in re.split(r"[,+|;\s]+", upper) if p]

    seen: set[str] = set()
    for it in items:
        if not it or it == "ALL":
            if it == "ALL":
                return list(ALL_CONTEXTS)
            continue
        if it not in _ALLOWED:
            continue
        seen.add(it)

    if not seen:
        return list(ALL_CONTEXTS) if default_all_on_empty else []
    return [c for c in ALL_CONTEXTS if c in seen]


def serialize_supported_contexts(contexts: Sequence[str]) -> str:
    """Canonical DB storage — CSV in ALL_CONTEXTS order."""
    normalized = normalize_supported_contexts(list(contexts), default_all_on_empty=False)
    if not normalized:
        raise ValueError("supported_contexts_required")
    return ",".join(normalized)


def template_supports_entity(stored: Any, entity_type: Optional[str]) -> bool:
    """True if template is available for entity_type (None = no filter)."""
    if not entity_type:
        return True
    et = str(entity_type).strip().upper()
    if not et:
        return True
    return et in normalize_supported_contexts(stored)


def contexts_from_modules(*, order: bool, returns: bool, complaints: bool) -> list[str]:
    selected: list[str] = []
    if order:
        selected.append("ORDER")
    if returns:
        selected.append("RETURN")
    if complaints:
        selected.append("COMPLAINT")
    return normalize_supported_contexts(selected, default_all_on_empty=False)


def modules_from_contexts(contexts: Iterable[str]) -> dict[str, bool]:
    s = set(normalize_supported_contexts(list(contexts)))
    return {
        "order": "ORDER" in s,
        "returns": "RETURN" in s,
        "complaints": "COMPLAINT" in s,
    }


def format_contexts_label(contexts: Any) -> str:
    ctx = normalize_supported_contexts(contexts)
    if set(ctx) == set(ALL_CONTEXTS):
        return "Wszystkie moduły"
    labels = {"ORDER": "Zamówienia", "RETURN": "Zwroty", "COMPLAINT": "Reklamacje"}
    return ", ".join(labels[c] for c in ctx if c in labels)


def coerce_write_contexts(
    *,
    supported_contexts: Any = None,
    entity_scope: Any = None,
) -> list[str]:
    """Prefer supported_contexts; fall back to legacy entity_scope; default all."""
    if supported_contexts is not None:
        ctx = normalize_supported_contexts(supported_contexts, default_all_on_empty=False)
        if not ctx:
            raise ValueError("supported_contexts_required")
        return ctx
    if entity_scope is not None:
        return normalize_supported_contexts(entity_scope)
    return list(ALL_CONTEXTS)
