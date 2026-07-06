#!/usr/bin/env python3
"""Diagnose document template dependency cycle for a version_id.

Run:
  python -m backend.scripts.diagnose_template_dependency_cycle 36
"""

from __future__ import annotations

import json
import sys

from sqlalchemy.orm import sessionmaker

from backend.database import engine
from backend.document_templates.services.dependency_graph_service import DependencyGraphService


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python -m backend.scripts.diagnose_template_dependency_cycle <version_id>")
        return 1

    version_id = int(sys.argv[1])
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        graph = DependencyGraphService(db)
        walk = graph.dump_validator_walk(version_id)
        cycle = graph.detect_cycles_for_version(version_id)
        built = graph.build_dependency_graph(version_id)

        print(f"=== Walidator: drzewo DFS od version_id={version_id} ===")
        for row in walk:
            if row.get("missing"):
                print(f"  depth={row['depth']} MISSING version_id={row['version_id']} stack={row['stack']}")
                continue
            indent = "  " * int(row["depth"])
            includes = row.get("include_document") or []
            inc = ", ".join(
                f"{p['partial_code']}→v#{p['partial_version_id']}" for p in includes
            ) or "—"
            ext = row.get("extends_version_id")
            ext_s = f"v#{ext}" if ext else "—"
            print(
                f"{indent}v#{row['version_id']} "
                f"template_id={row['template_id']} "
                f"code={row.get('template_code')!r} "
                f"role={row.get('template_role')} "
                f"status={row.get('status')}"
            )
            print(f"{indent}  extends: {ext_s}")
            print(f"{indent}  include_document: {inc}")

        print("\n=== Ścieżka cyklu (detect_cycles_for_version) ===")
        if cycle:
            print(" → ".join(cycle))
        else:
            print("(brak cyklu)")

        print("\n=== build_dependency_graph (unikalne węzły, bez powtórzeń gałęzi) ===")
        print(json.dumps(built, indent=2, ensure_ascii=False))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
