/** Display helpers for Routing Graph designer (Polish UX). */

import type { RoutingAccessPoint, RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import { ROUTING_OP_OPTIONS } from "./routingLabels";

export function opTypeLabel(op: string | null | undefined): string | null {
  if (!op) return null;
  return ROUTING_OP_OPTIONS.find((o) => o.value === op)?.label ?? op;
}

/** Short UI title for lists/selects — never force “Punkt trasy” everywhere. */
export function nodeDisplayName(
  n: RoutingNode,
  accessPoints: RoutingAccessPoint[] = [],
  locations: { id: number; name: string }[] = []
): string {
  const op = opTypeLabel(n.operational_type);
  if (op) return n.label?.trim() ? `${op}: ${n.label.trim()}` : op;
  const aps = accessPoints.filter((a) => a.node_uuid === n.uuid);
  if (aps.length > 0) {
    const locName =
      locations.find((l) => l.id === aps[0].location_id)?.name ??
      aps[0].label ??
      "dostęp";
    return aps.length === 1 ? `Dostęp: ${locName}` : `Dostęp (${aps.length})`;
  }
  if (n.label?.trim() && n.label.trim() !== "Punkt trasy") return n.label.trim();
  return "Węzeł sieci";
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

export function confirmDeleteNodeMessage(
  n: RoutingNode,
  edges: RoutingEdge[],
  accessPoints: RoutingAccessPoint[]
): string {
  const edgeCount = edgesConnectedTo(n.uuid, edges).length;
  const apCount = accessPoints.filter((a) => a.node_uuid === n.uuid).length;
  const name = nodeDisplayName(n, accessPoints);
  const parts: string[] = [];
  if (edgeCount) parts.push(`${edgeCount} odcinek/odcinki (zostaną usunięte)`);
  if (apCount) parts.push(`${apCount} dostęp(y) do lokalizacji (zostaną odłączone)`);
  if (n.operational_type) parts.push(`punkt operacyjny „${opTypeLabel(n.operational_type)}”`);
  if (!parts.length) return `Usunąć węzeł „${name}”?`;
  return `Usunąć węzeł „${name}”?\n\nSkutki:\n• ${parts.join("\n• ")}`;
}
