/**
 * Hit-test priority: POINT > EDGE at junctions / endpoints.
 */
import { describe, expect, it } from "vitest";
import { NODE_HIT_RADIUS_PX, resolveSelectHit } from "./routingHitTest";

describe("routingHitTest — node vs edge priority", () => {
  const nodes = [
    { uuid: "A", x: 0, y: 0 },
    { uuid: "B", x: 100, y: 0 },
    { uuid: "C", x: 200, y: 0 },
    { uuid: "D", x: 100, y: 100 },
  ];
  // A——B——C
  //    |
  //    D
  const edges = [
    { uuid: "AB", from_node_uuid: "A", to_node_uuid: "B" },
    { uuid: "BC", from_node_uuid: "B", to_node_uuid: "C" },
    { uuid: "BD", from_node_uuid: "B", to_node_uuid: "D" },
  ];
  const nodePx = new Map([
    ["A", { x: 0, y: 0 }],
    ["B", { x: 100, y: 0 }],
    ["C", { x: 200, y: 0 }],
    ["D", { x: 100, y: 100 }],
  ]);

  it("click exactly on junction B selects node, not any edge", () => {
    const hit = resolveSelectHit({
      xPx: 100,
      yPx: 0,
      nodes,
      edges,
      nodePx,
    });
    expect(hit).toEqual({ kind: "node", uuid: "B" });
  });

  it("click near B within hit radius still selects B over AB/BC/BD", () => {
    const hit = resolveSelectHit({
      xPx: 100 + NODE_HIT_RADIUS_PX - 1,
      yPx: 0,
      nodes,
      edges,
      nodePx,
    });
    expect(hit).toEqual({ kind: "node", uuid: "B" });
  });

  it("click mid AB outside node hitboxes selects edge AB", () => {
    const hit = resolveSelectHit({
      xPx: 50,
      yPx: 0,
      nodes,
      edges,
      nodePx,
    });
    expect(hit).toEqual({ kind: "edge", uuid: "AB" });
  });

  it("SELECT flow: B → AB mid → B → D keeps node/edge exclusivity", () => {
    let selectedNode: string | null = null;
    let selectedEdge: string | null = null;
    const tool = "select";

    const apply = (x: number, y: number) => {
      const hit = resolveSelectHit({ xPx: x, yPx: y, nodes, edges, nodePx });
      if (hit.kind === "node") {
        selectedNode = hit.uuid;
        selectedEdge = null;
      } else if (hit.kind === "edge") {
        selectedEdge = hit.uuid;
        selectedNode = null;
      }
    };

    apply(100, 0); // B
    expect(tool).toBe("select");
    expect(selectedNode).toBe("B");
    expect(selectedEdge).toBeNull();

    apply(50, 0); // AB mid
    expect(tool).toBe("select");
    expect(selectedEdge).toBe("AB");
    expect(selectedNode).toBeNull();

    apply(100, 0); // B again
    expect(selectedNode).toBe("B");
    expect(selectedEdge).toBeNull();

    apply(100, 100); // D
    expect(selectedNode).toBe("D");
    expect(selectedEdge).toBeNull();
    expect(tool).toBe("select");
  });

  it("closer node wins when two hitboxes overlap", () => {
    const nodes = [
      { uuid: "P1", x: 0, y: 0 },
      { uuid: "P2", x: 10, y: 0 },
    ];
    const nodePx = new Map([
      ["P1", { x: 0, y: 0 }],
      ["P2", { x: 10, y: 0 }],
    ]);
    const hit = resolveSelectHit({
      xPx: 7,
      yPx: 0,
      nodes,
      edges: [],
      nodePx,
    });
    expect(hit).toEqual({ kind: "node", uuid: "P2" });
  });

  it("hit radius is fixed px — outside radius is empty", () => {
    const nodes = [{ uuid: "A", x: 0, y: 0 }];
    const nodePx = new Map([["A", { x: 0, y: 0 }]]);
    expect(
      resolveSelectHit({
        xPx: NODE_HIT_RADIUS_PX + 1,
        yPx: 0,
        nodes,
        edges: [],
        nodePx,
      }).kind
    ).toBe("empty");
    expect(
      resolveSelectHit({
        xPx: NODE_HIT_RADIUS_PX - 1,
        yPx: 0,
        nodes,
        edges: [],
        nodePx,
      })
    ).toEqual({ kind: "node", uuid: "A" });
  });
});
