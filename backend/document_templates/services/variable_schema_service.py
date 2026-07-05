"""Rich variable schema — Sellasist-style metadata for editor."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..constants import CONTEXT_VARIABLE_TYPES
from ..providers.registry import build_domain_print_context
from ..services.context_pipeline_orchestrator import merge_context_fragments
from ..services.context_schema_registry import PROVIDER_LABELS, fields_for_schema_key
from ..services.editor_cache_service import cached_sample_context, cached_variable_schema
from ..services.template_service import get_kind_by_code
from ..providers.global_context_provider import build_global_print_context_dto
from .variable_tree_service import build_variable_tree_for_kind


def _provider_for_path(path: str, kind_provider: str) -> tuple[str, str]:
    root = path.split(".")[0].split("[")[0]
    global_roots = {
        "company",
        "tenant",
        "warehouse",
        "operator",
        "settings",
        "branding",
        "theme",
        "system",
        "meta",
        "logo",
        "currency",
        "language",
        "current_datetime",
        "today",
        "now",
    }
    if root in global_roots:
        return "global", PROVIDER_LABELS.get("global", "Dane globalne")
    if root in {"products", "lines", "items", "components", "rows"}:
        return kind_provider, PROVIDER_LABELS.get(kind_provider, kind_provider)
    return kind_provider, PROVIDER_LABELS.get(kind_provider, kind_provider)


def _resolve_sample(context: dict[str, Any], path: str) -> Any:
    clean = path.replace("[]", "")
    parts = [p for p in clean.split(".") if p]
    cur: Any = context
    for part in parts:
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list) and cur:
            cur = cur[0]
            if isinstance(cur, dict):
                cur = cur.get(part)
            else:
                return None
        else:
            return None
    if isinstance(cur, list) and cur:
        return cur[0]
    return cur


def _enrich_field(raw: dict[str, Any], *, kind_provider: str, sample_ctx: dict[str, Any]) -> dict[str, Any]:
    path = str(raw["path"])
    is_collection = "[]" in path
    loop_path = path if is_collection else None
    provider_key, provider_label = _provider_for_path(path, kind_provider)
    sample = _resolve_sample(sample_ctx, path)
    if sample is None and not is_collection:
        sample = _resolve_sample(sample_ctx, path.replace("[]", ""))
    return {
        "path": path,
        "label": raw.get("label") or path,
        "type": raw.get("type") or "string",
        "description": raw.get("description") or raw.get("label") or "",
        "sample_value": "" if sample is None else str(sample),
        "required": bool(raw.get("required", False)),
        "provider_key": provider_key,
        "provider_label": provider_label,
        "is_collection": is_collection,
        "loop_usable": is_collection or bool(raw.get("loop_usable")),
        "loop_var": raw.get("loop_var") or ("row" if "products" in path else "item"),
        "insert": raw.get("insert") or f"{{{{ {path.replace('[]', '')} }}}}",
    }


def build_sample_context_for_kind(db: Session, *, tenant_id: int, kind_code: str) -> dict[str, Any]:
    cache_key = f"{tenant_id}:{kind_code}"

    def factory() -> dict[str, Any]:
        kind = get_kind_by_code(db, kind_code=kind_code)
        domain = build_domain_print_context(
            db,
            provider_key=str(kind.provider_key),
            kind_code=str(kind.code),
            tenant_id=int(tenant_id),
            params={"sample": True},
        )
        global_ctx = build_global_print_context_dto(db, tenant_id=int(tenant_id))
        from ..dto.print_context import dto_to_dict

        return merge_context_fragments(dto_to_dict(domain), dto_to_dict(global_ctx))

    return cached_sample_context(cache_key, factory)


def build_variable_schema(db: Session, *, tenant_id: int, kind_code: str) -> dict[str, Any]:
    cache_key = f"{tenant_id}:{kind_code}"

    def factory() -> dict[str, Any]:
        kind = get_kind_by_code(db, kind_code=kind_code)
        sample_ctx = build_sample_context_for_kind(db, tenant_id=tenant_id, kind_code=kind_code)
        raw_fields = fields_for_schema_key(str(kind.schema_key))
        fields = [_enrich_field(f, kind_provider=str(kind.provider_key), sample_ctx=sample_ctx) for f in raw_fields]
        tree = _attach_fields_to_tree(build_variable_tree_for_kind(str(kind.schema_key)), fields)
        return {"fields": fields, "tree": tree, "kind_code": kind_code, "schema_key": kind.schema_key}

    return cached_variable_schema(cache_key, factory)


def _attach_fields_to_tree(tree: list[dict[str, Any]], fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_insert = {f.get("insert"): f for f in fields if f.get("insert")}
    return [_walk_tree_node(node, by_insert) for node in tree]


def _walk_tree_node(node: dict[str, Any], by_insert: dict[str, Any]) -> dict[str, Any]:
    out = dict(node)
    if node.get("insert") and node["insert"] in by_insert:
        meta = by_insert[node["insert"]]
        out.update(
            {
                "path": meta["path"],
                "type": meta["type"],
                "description": meta["description"],
                "sample_value": meta["sample_value"],
                "required": meta["required"],
                "provider_key": meta["provider_key"],
                "provider_label": meta["provider_label"],
                "is_collection": meta["is_collection"],
                "loop_usable": meta["loop_usable"],
            }
        )
    if node.get("children"):
        out["children"] = [_walk_tree_node(c, by_insert) for c in node["children"]]
    return out


def autocomplete_suggestions(fields: list[dict[str, Any]], prefix: str) -> list[dict[str, Any]]:
    """Contextual autocomplete — prefix like 'company.' or 'products[].'."""
    p = prefix.strip()
    if not p:
        roots = sorted({f["path"].split(".")[0].split("[")[0] for f in fields})
        return [{"label": r, "insert": r, "detail": "Zmienna"} for r in roots]
    if p.endswith("."):
        parent = p[:-1].replace("[]", "")
        matches = [f for f in fields if f["path"].startswith(parent + ".") and "[]" not in f["path"].split(".")[-2:]]
        if parent == "products" or parent.endswith("products"):
            matches = [f for f in fields if f["path"].startswith("products[].")]
        return [
            {
                "label": f["path"].split(".")[-1].replace("[]", ""),
                "insert": f["path"].replace("[]", ""),
                "detail": f["type"],
                "documentation": f.get("description"),
            }
            for f in matches[:40]
        ]
    partial = [f for f in fields if f["path"].startswith(p)]
    return [
        {"label": f["path"], "insert": f["path"].replace("[]", ""), "detail": f["type"]}
        for f in partial[:30]
    ]
