/** Global selection SSOT for Warehouse Designer (Layout vs Routing worlds). */

export type DesignerSelection =
  | { kind: null }
  | { kind: "rack"; rackId: number | string }
  | { kind: "passage"; rackUuid: string; passageUuid: string }
  | { kind: "node"; nodeUuid: string }
  | { kind: "edge"; edgeUuid: string };

export function emptyDesignerSelection(): DesignerSelection {
  return { kind: null };
}

export type DesignerWorkspace = "designing" | "routes";

/** Layout world: Building, Rack, Passage, Walls, Zones. Routing world: Node, Edge. */
export function selectionAllowedInWorkspace(
  selection: DesignerSelection,
  workspace: DesignerWorkspace
): boolean {
  if (selection.kind === null) return true;
  if (workspace === "designing") {
    return selection.kind === "rack" || selection.kind === "passage";
  }
  return selection.kind === "node" || selection.kind === "edge";
}

export function clearSelectionForWorkspaceSwitch(
  _from: DesignerWorkspace,
  _to: DesignerWorkspace
): DesignerSelection {
  return emptyDesignerSelection();
}
