#!/usr/bin/env python3
"""
Move all root template.elements (except the single repeater) into repeater.template.elements.

For each moved element: element.x -= repeater.x, element.y -= repeater.y (group: only group x/y).

Usage:
  python scripts/move_root_into_repeater_template.py path/to/template.json
  python scripts/move_root_into_repeater_template.py path/to/template.json -o out.json

Reads either a full label template object or a wrapper with template_json string.
"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any


class MoveRootError(ValueError):
    pass


def _shift(el: dict[str, Any], rx: float, ry: float) -> dict[str, Any]:
    out = deepcopy(el)
    t = out.get("type")
    if t == "group":
        out["x"] = out.get("x", 0) - rx
        out["y"] = out.get("y", 0) - ry
        return out
    if t == "repeater":
        out["x"] = out.get("x", 0) - rx
        out["y"] = out.get("y", 0) - ry
        return out
    if "x" in out and "y" in out:
        out["x"] = out["x"] - rx
        out["y"] = out["y"] - ry
    return out


def move_root_into_repeater(obj: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """Return (modified_template_dict, moved_count)."""
    elements = obj.get("elements")
    if not isinstance(elements, list):
        raise MoveRootError("template.elements must be a list")

    rep_indices = [i for i, e in enumerate(elements) if isinstance(e, dict) and e.get("type") == "repeater"]
    if len(rep_indices) == 0:
        raise MoveRootError("Root has no repeater element.")
    if len(rep_indices) > 1:
        raise MoveRootError(f"Expected exactly one root repeater, found {len(rep_indices)}.")

    rep_i = rep_indices[0]
    repeater = deepcopy(elements[rep_i])
    if not isinstance(repeater, dict):
        raise MoveRootError("Repeater must be an object")

    rx = repeater.get("x", 0)
    ry = repeater.get("y", 0)
    others = [deepcopy(e) for i, e in enumerate(elements) if i != rep_i]

    if len(others) == 0:
        raise MoveRootError("Nothing to move: root only contains the repeater.")

    tpl = repeater.get("template") or {}
    if not isinstance(tpl, dict):
        tpl = {}
    existing = tpl.get("elements") or []
    if not isinstance(existing, list):
        existing = []

    moved = [_shift(e, rx, ry) for e in others]
    tpl["elements"] = list(existing) + moved
    repeater["template"] = tpl

    out = deepcopy(obj)
    out["elements"] = [repeater]
    out["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if len(tpl["elements"]) == 0:
        raise MoveRootError("repeater.template.elements would be empty.")

    return out, len(others)


def _load_payload(raw: str) -> tuple[dict[str, Any], bool]:
    """
    Returns (template_object, wrapped).
    If input has template_json string, parse inner JSON and return wrapped=True for save hint.
    """
    outer = json.loads(raw)
    if isinstance(outer.get("template_json"), str):
        inner = json.loads(outer["template_json"])
        if not isinstance(inner, dict):
            raise MoveRootError("template_json must stringify an object")
        return inner, True
    if not isinstance(outer, dict):
        raise MoveRootError("Root JSON must be an object")
    return outer, False


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", help="JSON file (template or API row with template_json)")
    p.add_argument("-o", "--output", help="Write result here (default: stdout for template-only)")
    p.add_argument("--in-place", action="store_true", help="Overwrite input file")
    args = p.parse_args()

    path = args.input
    with open(path, encoding="utf-8") as f:
        raw = f.read()

    try:
        data, is_wrapped = _load_payload(raw)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        fixed, moved = move_root_into_repeater(data)
    except MoveRootError as e:
        print(str(e), file=sys.stderr)
        sys.exit(2)

    if is_wrapped:
        outer = json.loads(raw)
        outer["template_json"] = json.dumps(fixed, ensure_ascii=False)
        outer_out = outer
    else:
        outer_out = fixed

    out_str = json.dumps(outer_out, ensure_ascii=False, indent=2)
    if args.in_place:
        with open(path, "w", encoding="utf-8") as f:
            f.write(out_str)
        print(f"OK: moved {moved} root element(s) into repeater.template; updated {path}", file=sys.stderr)
    elif args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out_str)
        print(f"OK: moved {moved} root element(s); wrote {args.output}", file=sys.stderr)
    else:
        print(json.dumps(fixed, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
