#!/usr/bin/env python3
"""Debug POST /api/document-templates/preview/* — reproduce frontend payload."""

from __future__ import annotations

import json
import traceback
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.auth.deps import get_current_user
from backend.document_templates.services.document_migration_service import (
    _default_partial_pins,
    _system_base_published_version,
)
from backend.document_templates.services.template_editor_service import get_editor_context
from backend.document_templates.services.template_service import create_template_from_starter
from backend.main import app


def _override_user():
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1, login="debug", role="super_admin", is_active=True
    )


def _clear_override():
    app.dependency_overrides.pop(get_current_user, None)


def _print_response(label: str, resp) -> None:
    print(f"\n=== {label} ===")
    print(f"HTTP {resp.status_code}")
    ct = resp.headers.get("content-type", "")
    print(f"Content-Type: {ct}")
    if "pdf" in ct:
        print(f"Body: {len(resp.content)} bytes")
        if resp.status_code >= 400:
            try:
                print(f"Body text: {resp.content[:500]!r}")
            except Exception:
                pass
    else:
        text = resp.text
        print(f"Body ({len(text)} chars):\n{text[:2000]}")


def main() -> None:
    _override_user()
    client = TestClient(app, raise_server_exceptions=False)
    tenant_id = 1

    from backend.database import SessionLocal

    db = SessionLocal()
    try:
        tpl = create_template_from_starter(
            db,
            tenant_id=tenant_id,
            kind_code="wz",
            name="Debug WZ Preview",
            starter_code="default",
        )
        db.commit()
        template_id = int(tpl["id"])
        editor = get_editor_context(db, tenant_id=tenant_id, template_id=template_id)
        twig = editor["detail"]["twig_content"]
        draft = editor["detail"].get("draft_version") or {}
        extends_id = draft.get("extends_version_id") or (
            (editor.get("extends_base") or {}).get("pinned_version") or {}
        ).get("id")
        pins: dict[str, int] = {}
        if draft.get("partial_pins_json"):
            pins.update(json.loads(draft["partial_pins_json"]))
        for p in editor.get("partials_used") or []:
            if p.get("pinned_version", {}).get("id"):
                pins[p["partial_code"]] = int(p["pinned_version"]["id"])
        partial_pins_json = json.dumps(pins) if pins else None

        base_version = _system_base_published_version(db, tenant_id=tenant_id)
        default_pins = _default_partial_pins(db, tenant_id=tenant_id)

        print("--- Editor context (frontend load simulation) ---")
        print(f"template_id: {template_id}")
        print(f"kind_code: {editor['detail']['kind']['code']}")
        print(f"extends_version_id from editor: {extends_id}")
        print(f"partial_pins_json from editor: {partial_pins_json}")
        print(f"system base published version id: {getattr(base_version, 'id', None)}")
        print(f"default partial pin count: {len(default_pins)}")

        frontend_payload = {
            "kind_code": editor["detail"]["kind"]["code"],
            "twig_content": twig,
            "context_mode": "sample",
            "extends_version_id": extends_id,
            "partial_pins_json": partial_pins_json,
            "params": {},
            "warehouse_id": 1,
        }

        print("\n--- Frontend payload (exact shape) ---")
        print(json.dumps(frontend_payload, indent=2, ensure_ascii=False))

        # Case A: frontend payload
        resp_html = client.post(
            "/api/document-templates/preview/html",
            params={"tenant_id": tenant_id},
            json=frontend_payload,
        )
        _print_response("POST preview/html (frontend payload)", resp_html)

        # Case B: missing extends (simulates broken production template)
        broken_payload = dict(frontend_payload)
        broken_payload["extends_version_id"] = None
        broken_payload["partial_pins_json"] = None
        resp_broken = client.post(
            "/api/document-templates/preview/html",
            params={"tenant_id": tenant_id},
            json=broken_payload,
        )
        _print_response("POST preview/html (NO pins — repro 400)", resp_broken)

        # Direct exception trace for broken case
        print("\n--- Direct preview_document traceback (no pins) ---")
        try:
            from backend.document_templates.services.document_render_service import preview_document

            preview_document(
                db,
                tenant_id=tenant_id,
                kind_code=broken_payload["kind_code"],
                template=broken_payload["twig_content"],
                params={},
                warehouse_id=1,
                extends_version_id=None,
                partial_pins_json=None,
            )
        except Exception as exc:
            print(f"Exception type: {type(exc).__name__}")
            print(f"Exception message: {exc}")
            print(f"Exception code: {getattr(exc, 'code', None)}")
            traceback.print_exc()

        resp_pdf = client.post(
            "/api/document-templates/preview/pdf",
            params={"tenant_id": tenant_id},
            json=frontend_payload,
        )
        _print_response("POST preview/pdf (frontend payload)", resp_pdf)

        resp_pdf_broken = client.post(
            "/api/document-templates/preview/pdf",
            params={"tenant_id": tenant_id},
            json=broken_payload,
        )
        _print_response("POST preview/pdf (NO pins)", resp_pdf_broken)

        # Case C: legacy draft without saved pins — use editor preview_pins
        print("\n--- Legacy draft simulation (pins cleared on version) ---")
        version = (
            db.query(__import__("backend.document_templates.models", fromlist=["DocumentTemplateVersion"]).DocumentTemplateVersion)
            .filter_by(template_id=template_id, status="draft")
            .first()
        )
        if version:
            version.extends_version_id = None
            version.partial_pins_json = None
            db.commit()
        legacy_editor = get_editor_context(db, tenant_id=tenant_id, template_id=template_id)
        legacy_payload = {
            "kind_code": legacy_editor["detail"]["kind"]["code"],
            "twig_content": legacy_editor["detail"]["twig_content"],
            "context_mode": "sample",
            "extends_version_id": legacy_editor["preview_pins"]["extends_version_id"],
            "partial_pins_json": legacy_editor["preview_pins"]["partial_pins_json"],
            "params": {},
            "warehouse_id": 1,
        }
        print(f"preview_pins from editor: {json.dumps(legacy_editor['preview_pins'], ensure_ascii=False)}")
        resp_legacy = client.post(
            "/api/document-templates/preview/html",
            params={"tenant_id": tenant_id},
            json=legacy_payload,
        )
        _print_response("POST preview/html (legacy + preview_pins)", resp_legacy)

        # PDF engine check
        print("\n--- PDF engine availability ---")
        try:
            from backend.services.structure_report_pdf_service import html_document_to_pdf_bytes

            pdf = html_document_to_pdf_bytes("<html><body><h1>test</h1></body></html>")
            print(f"html_document_to_pdf_bytes OK: {len(pdf)} bytes")
        except Exception as exc:
            print(f"PDF engine FAILED: {type(exc).__name__}: {exc}")
            traceback.print_exc()

    finally:
        db.close()
        _clear_override()


if __name__ == "__main__":
    main()
