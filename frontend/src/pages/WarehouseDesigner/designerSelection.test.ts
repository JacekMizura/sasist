import { describe, expect, it } from "vitest";
import {
  clearSelectionForWorkspaceSwitch,
  emptyDesignerSelection,
  selectionAllowedInWorkspace,
} from "./designerSelection";

describe("designerSelection", () => {
  it("empty is allowed everywhere", () => {
    expect(selectionAllowedInWorkspace(emptyDesignerSelection(), "designing")).toBe(true);
    expect(selectionAllowedInWorkspace(emptyDesignerSelection(), "routes")).toBe(true);
  });

  it("layout kinds only in designing", () => {
    expect(selectionAllowedInWorkspace({ kind: "rack", rackId: 1 }, "designing")).toBe(true);
    expect(selectionAllowedInWorkspace({ kind: "passage", rackUuid: "r", passageUuid: "p" }, "routes")).toBe(
      false
    );
    expect(selectionAllowedInWorkspace({ kind: "node", nodeUuid: "n" }, "designing")).toBe(false);
    expect(selectionAllowedInWorkspace({ kind: "edge", edgeUuid: "e" }, "routes")).toBe(true);
  });

  it("workspace switch clears selection", () => {
    expect(clearSelectionForWorkspaceSwitch("designing", "routes")).toEqual({ kind: null });
    expect(clearSelectionForWorkspaceSwitch("routes", "designing")).toEqual({ kind: null });
  });
});
