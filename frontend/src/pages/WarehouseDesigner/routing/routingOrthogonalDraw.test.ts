/** Orthogonal prefer + Shift free-angle + intersection regression. */

import { describe, expect, it } from "vitest";
import {
  applyDrawStep,
  preferOrthogonalCm,
  type InteractionGraph,
} from "./routingCanvasInteraction";

function emptyGraph(): InteractionGraph {
  return { nodes: [], edges: [] };
}

let n = 0;
const id = () => `n-${++n}`;

describe("orthogonal prefer draw", () => {
  it("23 snaps near-horizontal to same Y", () => {
    const from = { x: 100, y: 200 };
    const r = preferOrthogonalCm(from, 180, 210);
    expect(r.guide).toBe("h");
    expect(r.y).toBe(200);
    expect(r.x).toBe(180);
  });

  it("24 Shift freeAngle keeps diagonal", () => {
    const from = { x: 100, y: 200 };
    const r = preferOrthogonalCm(from, 180, 260, { freeAngle: true });
    expect(r.guide).toBe("none");
    expect(r.x).toBe(180);
    expect(r.y).toBe(260);
  });

  it("25 intersection / T-junction still materializes after ortho draw", () => {
    n = 0;
    // Horizontal road
    let g = emptyGraph();
    let draft: string | null = null;
    let step = applyDrawStep(g, draft, { x: 0, y: 100 }, id);
    g = step.graph;
    draft = step.draftFromUuid;
    step = applyDrawStep(g, draft, { x: 200, y: 105 }, id); // near-horizontal
    g = step.graph;
    expect(step.orthoGuide).toBe("h");
    // Vertical crossing mid
    draft = null;
    step = applyDrawStep(g, draft, { x: 100, y: 0 }, id);
    g = step.graph;
    draft = step.draftFromUuid;
    step = applyDrawStep(g, draft, { x: 102, y: 200 }, id);
    g = step.graph;
    // Crossing should create a junction node
    expect(g.nodes.length).toBeGreaterThanOrEqual(3);
    expect(g.edges.length).toBeGreaterThanOrEqual(3);
  });
});
