#!/usr/bin/env python3
"""
Debug script: run backend label layout with a record that has locations with loc_name.
Use: from backend dir: python -m scripts.debug_loc_name_binding
Or: python scripts/debug_loc_name_binding.py (from backend dir)
"""
import sys
from pathlib import Path

# Run from repo root: add parent of backend so "backend" is a package (for ..pdf_fonts etc.)
backend_dir = Path(__file__).resolve().parent.parent
repo_root = backend_dir.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from backend.services.label_engine import compute_layout, build_label_pdf_engine

# One page record: same shape as Print Queue / Rack download (dataset = locations)
record = {
    "locations": [
        {"loc_name": "A30-3-1"},
        {"loc_name": "A30-3-2"},
        {"loc_name": "A30-3-3"},
    ],
    "loc_name": "page-level fallback",
    "location_code": "A30-3",
}

# Minimal template: repeater with dataset "locations", one text element binding {loc_name}
layout = {
    "elements": [
        {
            "type": "repeater",
            "dataset": "locations",
            "x": 0,
            "y": 0,
            "width": 80,
            "height": 40,
            "itemWidth": 25,
            "itemHeight": 15,
            "layout": "horizontal",
            "template": {
                "elements": [
                    {
                        "type": "text",
                        "binding": "{loc_name}",
                        "x": 0,
                        "y": 0,
                        "width": 22,
                        "height": 10,
                        "fontSize": 8,
                    },
                ]
            },
        }
    ],
}

if __name__ == "__main__":
    print("=== record keys:", list(record.keys()))
    print("=== record[locations]:", record["locations"])
    print("=== 1) compute_layout (watch for BINDING / TEXT ELEMENT logs)...\n")
    items = compute_layout(layout, record, 100.0, 60.0)
    print("\n=== Layout items (text field only):")
    for i, it in enumerate(items):
        if it.get("type") in ("text", "statictext"):
            print(f"  [{i}] type={it.get('type')} text={repr(it.get('text'))}")

    print("\n=== 2) build_label_pdf_engine (watch for TEXT DRAW INPUT logs)...\n")
    pdf_bytes = build_label_pdf_engine(layout, 100.0, 60.0, [record])
    print(f"\n=== PDF size: {len(pdf_bytes)} bytes")
