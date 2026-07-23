/** Display helpers for Routing Graph designer (Polish warehouse language — no UUID, no “węzeł”). */

import type { RoutingAccessPoint, RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import { ROUTING_OP_OPTIONS } from "./routingLabels";

export function opTypeLabel(op: string | null | undefined): string | null {
  if (!op) return null;
  return ROUTING_OP_OPTIONS.find((o) => o.value === op)?.label ?? op;
}

function isGenericLabel(label: string | null | undefined): boolean {
  const t = (label ?? "").trim();
  return !t || t === "Punkt trasy" || t === "Węzeł sieci";
}

/** Stable “Punkt N” for unlabeled junctions (order in list). */
export function pointNumber(n: RoutingNode, allNodes: RoutingNode[]): number {
  const junctions = allNodes.filter((x) => !x.operational_type);
  const idx = junctions.findIndex((x) => x.uuid === n.uuid);
  if (idx >= 0) return idx + 1;
  const allIdx = allNodes.findIndex((x) => x.uuid === n.uuid);
  return allIdx >= 0 ? allIdx + 1 : 0;
}

/** Short UI title — never UUID, never force “Punkt trasy” / “Węzeł”. */
export function nodeDisplayName(
  n: RoutingNode,
  accessPoints: RoutingAccessPoint[] = [],
  locations: { id: number; name: string }[] = [],
  allNodes: RoutingNode[] = []
): string {
  const op = opTypeLabel(n.operational_type);
  if (op) {
    const lab = n.label?.trim();
    if (!lab || isGenericLabel(lab) || lab === op) return op;
    // Avoid “Pakowanie: Pakowanie”
    if (lab.toLowerCase() === op.toLowerCase()) return op;
    return lab;
  }
  if (!isGenericLabel(n.label)) return n.label!.trim();
  const num = allNodes.length ? pointNumber(n, allNodes) : 0;
  return num > 0 ? `Punkt ${num}` : "Punkt trasy";
}

export function nodeKind(
  n: RoutingNode,
  accessPoints: RoutingAccessPoint[]
): "operational" | "access" | "junction" {
  if (n.operational_type) return "operational";
  if (accessPoints.some((a) => a.node_uuid === n.uuid)) return "access";
  return "junction";
}

export function edgesConnectedTo(nodeUuid: string, edges: RoutingEdge[]): RoutingEdge[] {
  return edges.filter((e) => e.from_node_uuid === nodeUuid || e.to_node_uuid === nodeUuid);
}

export function orphanNodeUuids(nodes: RoutingNode[], edges: RoutingEdge[]): string[] {
  const connected = new Set<string>();
  for (const e of edges) {
    if (!e.enabled) continue;
    connected.add(e.from_node_uuid);
    connected.add(e.to_node_uuid);
  }
  return nodes.filter((n) => !connected.has(n.uuid)).map((n) => n.uuid);
}

export function confirmDeleteNodeMessage(
  n: RoutingNode,
  edges: RoutingEdge[],
  accessPoints: RoutingAccessPoint[],
  allNodes: RoutingNode[] = [],
  locations: { id: number; name: string }[] = []
): string {
  const edgeCount = edgesConnectedTo(n.uuid, edges).length;
  const aps = accessPoints.filter((a) => a.node_uuid === n.uuid);
  const name = nodeDisplayName(n, accessPoints, locations, allNodes);

  if (!edgeCount && !aps.length && !n.operational_type) {
    return `Usunąć ten punkt?`;
  }

  const parts: string[] = [];
  if (edgeCount === 1) parts.push("Usunięty zostanie 1 połączony odcinek.");
  else if (edgeCount > 1) parts.push(`Usunięte zostaną również ${edgeCount} połączone odcinki.`);
  if (aps.length) {
    const names = aps
      .map((a) => locations.find((l) => l.id === a.location_id)?.name)
      .filter(Boolean);
    if (names.length) {
      parts.push(`Odłączone lokalizacje: ${names.join(", ")}.`);
    } else {
      parts.push(
        aps.length === 1
          ? "Odłączona zostanie 1 przypisana lokalizacja."
          : `Odłączone zostaną ${aps.length} przypisane lokalizacje.`
      );
    }
  }
  if (n.operational_type) {
    parts.push(`To jest punkt specjalny („${opTypeLabel(n.operational_type)}”).`);
  }
  return `Usunąć ten punkt?\n\n${parts.join("\n")}`;
}
