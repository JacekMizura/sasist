"""
Intersection materialization for authored routing graph.

Visual crossings must become real junction nodes with split edges (turn connectivity).
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import uuid4

from .geometry import distance_m_between_cm, segment_intersection, split_edge_at_point
from .constants import NODE_TYPE_JUNCTION


def _new_uuid() -> str:
    return str(uuid4())


def materialize_intersections(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    *,
    snap_eps_cm: float = 2.0,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Find proper edge crossings; insert junction nodes and split edges.

    Input/output are plain dicts compatible with graph replace payloads:
    node: {uuid, x, y, node_type, ...}
    edge: {uuid, from_node_uuid, to_node_uuid, direction, enabled, ...}
    """
    nodes_out = [deepcopy(n) for n in nodes]
    edges_out = [deepcopy(e) for e in edges]
    by_uuid = {n["uuid"]: n for n in nodes_out}

    changed = True
    safety = 0
    while changed and safety < 500:
        safety += 1
        changed = False
        n = len(edges_out)
        for i in range(n):
            if changed:
                break
            for j in range(i + 1, n):
                e1 = edges_out[i]
                e2 = edges_out[j]
                n1a = by_uuid.get(e1["from_node_uuid"])
                n1b = by_uuid.get(e1["to_node_uuid"])
                n2a = by_uuid.get(e2["from_node_uuid"])
                n2b = by_uuid.get(e2["to_node_uuid"])
                if not n1a or not n1b or not n2a or not n2b:
                    continue
                # Share a node already → connected; skip
                shared = {e1["from_node_uuid"], e1["to_node_uuid"]} & {
                    e2["from_node_uuid"],
                    e2["to_node_uuid"],
                }
                if shared:
                    continue
                hit = segment_intersection(
                    (float(n1a["x"]), float(n1a["y"])),
                    (float(n1b["x"]), float(n1b["y"])),
                    (float(n2a["x"]), float(n2a["y"])),
                    (float(n2b["x"]), float(n2b["y"])),
                    eps=1e-4,
                )
                if hit is None:
                    continue
                hx, hy = hit
                # Reuse nearby existing node if any
                junction_uuid = None
                for existing in nodes_out:
                    if abs(float(existing["x"]) - hx) <= snap_eps_cm and abs(
                        float(existing["y"]) - hy
                    ) <= snap_eps_cm:
                        junction_uuid = existing["uuid"]
                        hx = float(existing["x"])
                        hy = float(existing["y"])
                        break
                if junction_uuid is None:
                    junction_uuid = _new_uuid()
                    nodes_out.append(
                        {
                            "uuid": junction_uuid,
                            "x": hx,
                            "y": hy,
                            "node_type": NODE_TYPE_JUNCTION,
                            "operational_type": None,
                            "label": "Skrzyżowanie",
                            "meta": {"auto_intersection": True},
                        }
                    )
                    by_uuid[junction_uuid] = nodes_out[-1]

                def _split(edge: dict[str, Any]) -> list[dict[str, Any]]:
                    fa = by_uuid[edge["from_node_uuid"]]
                    tb = by_uuid[edge["to_node_uuid"]]
                    if not split_edge_at_point(
                        (float(fa["x"]), float(fa["y"])),
                        (float(tb["x"]), float(tb["y"])),
                        (hx, hy),
                        eps=1e-3,
                    ):
                        return [edge]
                    base = {k: v for k, v in edge.items() if k not in ("uuid", "from_node_uuid", "to_node_uuid", "distance_m")}
                    e_a = {
                        **base,
                        "uuid": _new_uuid(),
                        "from_node_uuid": edge["from_node_uuid"],
                        "to_node_uuid": junction_uuid,
                        "distance_m": distance_m_between_cm(fa["x"], fa["y"], hx, hy),
                    }
                    e_b = {
                        **base,
                        "uuid": _new_uuid(),
                        "from_node_uuid": junction_uuid,
                        "to_node_uuid": edge["to_node_uuid"],
                        "distance_m": distance_m_between_cm(hx, hy, tb["x"], tb["y"]),
                    }
                    return [e_a, e_b]

                new_edges: list[dict[str, Any]] = []
                for idx, e in enumerate(edges_out):
                    if idx == i or idx == j:
                        continue
                    new_edges.append(e)
                new_edges.extend(_split(e1))
                new_edges.extend(_split(e2))
                edges_out = new_edges
                changed = True
                break

    # Refresh distances
    for e in edges_out:
        a = by_uuid.get(e["from_node_uuid"])
        b = by_uuid.get(e["to_node_uuid"])
        if a and b:
            e["distance_m"] = distance_m_between_cm(a["x"], a["y"], b["x"], b["y"])
    return nodes_out, edges_out
