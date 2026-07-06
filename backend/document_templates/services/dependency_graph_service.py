"""Full dependency graph — cycle detection and impact analysis."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ..constants import TEMPLATE_ROLE_BASE, TEMPLATE_ROLE_DOCUMENT, TEMPLATE_ROLE_PARTIAL
from ..models import DocumentTemplate, DocumentTemplateVersion, DocumentTemplateVersionPartialPin
from ..services.twig_parse_service import collect_all_include_codes, extract_extends_target
from ..errors import DocumentTemplateError


class DependencyGraphService:
    MAX_DEPTH = 32

    def __init__(self, db: Session) -> None:
        self._db = db

    def detect_cycles_for_version(self, version_id: int) -> list[str] | None:
        version = self._get_version(version_id)
        if version is None:
            return None
        stack: list[int] = []
        path: list[str] = []
        return self._walk_version(int(version.id), stack, path, depth=0)

    def describe_version_node(self, version_id: int) -> dict[str, Any] | None:
        version = self._get_version(version_id)
        if version is None:
            return None
        template = version.template
        includes = [
            {
                "partial_code": str(pin.partial_code),
                "partial_version_id": int(pin.partial_version_id),
                "partial_template_id": int(pin.partial_template_id),
            }
            for pin in self._partial_pins_for_version(version)
        ]
        return {
            "version_id": int(version.id),
            "version_number": int(version.version_number),
            "status": version.status,
            "template_id": int(version.template_id),
            "template_code": template.template_code,
            "template_name": template.name,
            "template_role": template.template_role,
            "extends_version_id": int(version.extends_version_id) if version.extends_version_id else None,
            "include_document": includes,
        }

    def dump_validator_walk(self, version_id: int) -> list[dict[str, Any]]:
        """Depth-first walk identical to publication cycle validation — full branch tree."""
        out: list[dict[str, Any]] = []

        def walk(vid: int, stack: list[int], depth: int) -> None:
            node = self.describe_version_node(vid)
            if node is None:
                out.append({"version_id": vid, "missing": True, "depth": depth, "stack": list(stack)})
                return
            node = {
                **node,
                "depth": depth,
                "stack_version_ids": list(stack),
                "on_recursion_stack": vid in stack,
            }
            out.append(node)
            if depth > self.MAX_DEPTH or vid in stack:
                return
            stack.append(vid)
            version = self._get_version(vid)
            if version is None:
                stack.pop()
                return
            if version.extends_version_id:
                walk(int(version.extends_version_id), stack, depth + 1)
            for pin in self._partial_pins_for_version(version):
                walk(int(pin.partial_version_id), stack, depth + 1)
            stack.pop()

        walk(int(version_id), [], 0)
        return out

    def _walk_version(
        self,
        version_id: int,
        stack: list[int],
        path: list[str],
        *,
        depth: int,
    ) -> list[str] | None:
        if depth > self.MAX_DEPTH:
            return path + ["…(limit głębokości)"]
        if version_id in stack:
            idx = stack.index(version_id)
            return path[idx:] + [self.version_label(version_id)]
        version = self._get_version(version_id)
        if version is None:
            return None

        stack.append(version_id)
        path.append(self.version_label(version_id))
        try:
            if version.extends_version_id:
                cycle = self._walk_version(int(version.extends_version_id), stack, path, depth=depth + 1)
                if cycle:
                    return cycle

            for pin in self._partial_pins_for_version(version):
                cycle = self._walk_version(int(pin.partial_version_id), stack, path, depth=depth + 1)
                if cycle:
                    return cycle
        finally:
            stack.pop()
            path.pop()

        return None

    def dependents_of_base_version(self, base_version_id: int) -> list[dict[str, Any]]:
        rows = (
            self._db.query(DocumentTemplateVersion)
            .filter(DocumentTemplateVersion.extends_version_id == int(base_version_id))
            .all()
        )
        return [self._dependent_summary(v) for v in rows]

    def dependents_of_partial_version(self, partial_version_id: int) -> list[dict[str, Any]]:
        pin_rows = (
            self._db.query(DocumentTemplateVersionPartialPin)
            .filter(DocumentTemplateVersionPartialPin.partial_version_id == int(partial_version_id))
            .all()
        )
        version_ids = {int(p.document_version_id) for p in pin_rows}
        draft_rows = (
            self._db.query(DocumentTemplateVersion)
            .filter(DocumentTemplateVersion.partial_pins_json.isnot(None))
            .all()
        )
        for dv in draft_rows:
            pins = self._parse_pins_json(dv.partial_pins_json)
            if int(partial_version_id) in pins.values():
                version_ids.add(int(dv.id))

        out: list[dict[str, Any]] = []
        for vid in sorted(version_ids):
            version = self._get_version(vid)
            if version is not None:
                out.append(self._dependent_summary(version))
        return out

    def impact_of_version_change(self, version_id: int) -> dict[str, Any]:
        version = self._get_version(version_id)
        if version is None:
            raise DocumentTemplateError("Wersja nie istnieje.", code="not_found")
        template = version.template
        role = str(template.template_role or TEMPLATE_ROLE_DOCUMENT)

        if role == TEMPLATE_ROLE_BASE:
            dependents = self.dependents_of_base_version(int(version.id))
            return {
                "version_id": int(version.id),
                "template_role": role,
                "template_code": template.template_code,
                "template_name": template.name,
                "dependents": dependents,
                "message": "Dostępna jest nowa wersja BASE. Migracja wymaga nowej wersji dokumentu.",
            }
        if role == TEMPLATE_ROLE_PARTIAL:
            dependents = self.dependents_of_partial_version(int(version.id))
            return {
                "version_id": int(version.id),
                "template_role": role,
                "template_code": template.template_code,
                "template_name": template.name,
                "dependents": dependents,
                "message": "Dostępna jest nowa wersja partiala. Migracja wymaga nowej wersji dokumentu.",
            }
        return {
            "version_id": int(version.id),
            "template_role": role,
            "template_code": template.template_code,
            "template_name": template.name,
            "dependents": [],
            "message": "",
        }

    def can_delete_template(self, template_id: int) -> dict[str, Any]:
        template = (
            self._db.query(DocumentTemplate).filter(DocumentTemplate.id == int(template_id)).first()
        )
        if template is None:
            raise DocumentTemplateError("Szablon nie istnieje.", code="not_found")

        dependents: list[dict[str, Any]] = []
        versions = (
            self._db.query(DocumentTemplateVersion)
            .filter(DocumentTemplateVersion.template_id == int(template_id))
            .all()
        )
        for v in versions:
            if str(template.template_role) == TEMPLATE_ROLE_BASE:
                dependents.extend(self.dependents_of_base_version(int(v.id)))
            elif str(template.template_role) == TEMPLATE_ROLE_PARTIAL:
                dependents.extend(self.dependents_of_partial_version(int(v.id)))

        unique = {d["version_id"]: d for d in dependents}
        blocked = len(unique) > 0
        return {
            "template_id": int(template_id),
            "can_delete": not blocked,
            "dependents": list(unique.values()),
            "reason": "Szablon jest używany przez opublikowane wersje dokumentów." if blocked else None,
        }

    def documents_needing_revalidation_after_base_publish(self, base_version_id: int) -> list[dict[str, Any]]:
        return self.dependents_of_base_version(base_version_id)

    def documents_needing_revalidation_after_partial_publish(self, partial_version_id: int) -> list[dict[str, Any]]:
        return self.dependents_of_partial_version(partial_version_id)

    def build_dependency_graph(self, version_id: int) -> dict[str, Any]:
        version = self._get_version(version_id)
        if version is None:
            raise DocumentTemplateError("Wersja nie istnieje.", code="not_found")

        nodes: dict[int, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []

        def add_node(v: DocumentTemplateVersion) -> None:
            tpl = v.template
            nodes[int(v.id)] = {
                "version_id": int(v.id),
                "version_number": int(v.version_number),
                "status": v.status,
                "template_id": int(v.template_id),
                "template_code": tpl.template_code,
                "template_name": tpl.name,
                "template_role": tpl.template_role,
            }

        def traverse(vid: int, visited: set[int], depth: int) -> None:
            if depth > self.MAX_DEPTH or vid in visited:
                return
            visited.add(vid)
            v = self._get_version(vid)
            if v is None:
                return
            add_node(v)
            if v.extends_version_id:
                parent_id = int(v.extends_version_id)
                edges.append({"from": vid, "to": parent_id, "type": "extends"})
                traverse(parent_id, visited, depth + 1)
            for pin in self._partial_pins_for_version(v):
                pid = int(pin.partial_version_id)
                edges.append({"from": vid, "to": pid, "type": "include", "partial_code": pin.partial_code})
                traverse(pid, visited, depth + 1)

        traverse(int(version.id), set(), 0)
        return {"root_version_id": int(version.id), "nodes": list(nodes.values()), "edges": edges}

    def _dependent_summary(self, version: DocumentTemplateVersion) -> dict[str, Any]:
        tpl = version.template
        kind_label = None
        if tpl.kind is not None:
            kind_label = tpl.kind.name_pl
        return {
            "version_id": int(version.id),
            "version_number": int(version.version_number),
            "status": version.status,
            "template_id": int(tpl.id),
            "template_name": tpl.name,
            "template_code": tpl.template_code,
            "template_role": tpl.template_role,
            "kind_name": kind_label,
            "extends_version_id": int(version.extends_version_id) if version.extends_version_id else None,
        }

    def _get_version(self, version_id: int) -> DocumentTemplateVersion | None:
        return (
            self._db.query(DocumentTemplateVersion)
            .filter(DocumentTemplateVersion.id == int(version_id))
            .first()
        )

    def _partial_pins_for_version(self, version: DocumentTemplateVersion) -> list[DocumentTemplateVersionPartialPin]:
        if version.partial_pins:
            return list(version.partial_pins)
        pins_json = self._parse_pins_json(version.partial_pins_json)
        out: list[DocumentTemplateVersionPartialPin] = []
        for code, pvid in pins_json.items():
            pv = self._get_version(pvid)
            if pv is None:
                continue
            out.append(
                DocumentTemplateVersionPartialPin(
                    document_version_id=int(version.id),
                    partial_template_id=int(pv.template_id),
                    partial_version_id=int(pvid),
                    partial_code=str(code),
                )
            )
        return out

    @staticmethod
    def _parse_pins_json(raw: str | None) -> dict[str, int]:
        if not raw:
            return {}
        try:
            data = json.loads(raw)
            return {str(k): int(v) for k, v in data.items()}
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}

    def version_label(self, version_id: int) -> str:
        version = self._get_version(version_id)
        if version is None:
            return f"v#{version_id}"
        tpl = version.template
        code = str(tpl.template_code or tpl.name or f"tpl#{tpl.template_id}")
        return f"v#{version_id} ({code})"
