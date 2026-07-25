/** Node delete / merge actions for Routing Designer. */

import type { RoutingNode } from "../../../api/warehouseRoutingApi";
import { confirmDeleteNodeMessage, edgesConnectedTo } from "./routingDisplay";
import type { useRoutingGraph } from "./useRoutingGraph";

type Hook = ReturnType<typeof useRoutingGraph>;

export function deleteSelectedNode(
  routing: Hook,
  selectedNode: RoutingNode,
  setSelectedNodeUuid: (u: string | null) => void,
  locations: { id: number; name: string; location_type?: string | null }[] = []
) {
  const connected = edgesConnectedTo(selectedNode.uuid, routing.edges);
  const deg = connected.length;

  if (deg === 2 && typeof routing.previewMergeDegree2 === "function") {
    const preview = routing.previewMergeDegree2(selectedNode.uuid);
    if (preview) {
      const ok = window.confirm(
        `Usunięcie punktu połączy sąsiadów w jeden odcinek (≈ ${preview.lengthM.toFixed(1)} m).\n\nScalić?`
      );
      if (!ok) return false;
      if (routing.mergeDegree2(selectedNode.uuid)) {
        setSelectedNodeUuid(null);
        routing.normalizeAfterEdit?.();
        return true;
      }
      return false;
    }
  }

  if (deg > 2) {
    const ok = window.confirm(
      `Ten punkt ma ${deg} połączenia. Usunięcie usunie też wszystkie połączone odcinki. Kontynuować?`
    );
    if (!ok) return false;
    routing.removeNode(selectedNode.uuid);
    setSelectedNodeUuid(null);
    return true;
  }

  const msg = confirmDeleteNodeMessage(
    selectedNode,
    routing.edges,
    routing.accessPoints,
    routing.nodes,
    locations
  );
  if (!window.confirm(msg)) return false;
  routing.removeNode(selectedNode.uuid);
  setSelectedNodeUuid(null);
  return true;
}
