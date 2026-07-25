import { describe, expect, it, vi } from "vitest";
import {
  commandDeleteNode,
  commandDragNode,
  createCommandBus,
} from "./index";

describe("command bus", () => {
  it("records executed commands for future undo", () => {
    const bus = createCommandBus();
    const apply = vi.fn();
    const revert = vi.fn();
    const result = bus.execute(commandDragNode(apply, revert));
    expect(result.ok).toBe(true);
    expect(apply).toHaveBeenCalledOnce();
    expect(bus.history).toHaveLength(1);
    expect(bus.history[0].id).toBe("dragNode");
    bus.history[0].undo?.();
    expect(revert).toHaveBeenCalledOnce();
  });

  it("supports deleteNode command shape", () => {
    const bus = createCommandBus();
    bus.execute(
      commandDeleteNode(
        () => undefined,
        () => undefined
      )
    );
    expect(bus.history[0].id).toBe("deleteNode");
  });
});
