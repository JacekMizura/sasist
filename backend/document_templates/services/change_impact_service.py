"""Change impact analysis — UI/API facade over DependencyGraphService."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .dependency_graph_service import DependencyGraphService


class ChangeImpactAnalysisService:
    def __init__(self, db: Session) -> None:
        self._graph = DependencyGraphService(db)

    def analyze_base_publish(self, base_version_id: int) -> dict[str, Any]:
        impact = self._graph.impact_of_version_change(base_version_id)
        impact["analysis_type"] = "base_publish"
        return impact

    def analyze_partial_publish(self, partial_version_id: int) -> dict[str, Any]:
        impact = self._graph.impact_of_version_change(partial_version_id)
        impact["analysis_type"] = "partial_publish"
        return impact

    def analyze_delete_template(self, template_id: int) -> dict[str, Any]:
        result = self._graph.can_delete_template(template_id)
        result["analysis_type"] = "delete_template"
        return result

    def list_stale_documents_for_base(self, base_template_id: int) -> dict[str, Any]:
        from ..models import DocumentTemplate, DocumentTemplateVersion

        db = self._graph._db
        latest = (
            db.query(DocumentTemplateVersion)
            .join(DocumentTemplate, DocumentTemplate.id == DocumentTemplateVersion.template_id)
            .filter(DocumentTemplate.id == int(base_template_id))
            .order_by(DocumentTemplateVersion.version_number.desc())
            .first()
        )
        if latest is None:
            return {"latest_version_id": None, "stale_documents": []}

        all_versions = (
            db.query(DocumentTemplateVersion)
            .filter(DocumentTemplateVersion.extends_version_id.isnot(None))
            .all()
        )
        stale = []
        for v in all_versions:
            if v.extends_version_id is None:
                continue
            pinned_base = db.query(DocumentTemplateVersion).filter(
                DocumentTemplateVersion.id == int(v.extends_version_id)
            ).first()
            if pinned_base is None:
                continue
            if int(pinned_base.template_id) == int(base_template_id):
                if int(pinned_base.id) != int(latest.id):
                    stale.append(self._graph._dependent_summary(v))

        return {
            "latest_version_id": int(latest.id),
            "latest_version_number": int(latest.version_number),
            "stale_documents": stale,
            "message": "Dostępna jest nowa wersja BASE.",
        }
