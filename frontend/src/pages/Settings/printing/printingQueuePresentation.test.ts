import { describe, expect, it } from "vitest";

import {
  agentHealthClass,
  agentHealthLabel,
  canCancelJob,
  canRetryJob,
  formatDurationSeconds,
  printJobStatusClass,
  printJobStatusLabel,
} from "./printingQueuePresentation";

describe("printingQueuePresentation", () => {
  it("maps job status labels and colors", () => {
    expect(printJobStatusLabel("pending")).toBe("Oczekuje");
    expect(printJobStatusClass("failed")).toContain("red");
    expect(printJobStatusClass("printed")).toContain("green");
  });

  it("gates retry and cancel actions", () => {
    expect(canRetryJob("failed")).toBe(true);
    expect(canRetryJob("pending")).toBe(false);
    expect(canCancelJob("processing")).toBe(true);
    expect(canCancelJob("printed")).toBe(false);
  });

  it("formats duration", () => {
    expect(formatDurationSeconds(null)).toBe("—");
    expect(formatDurationSeconds(45)).toBe("45s");
    expect(formatDurationSeconds(125)).toBe("2m 5s");
  });

  it("maps agent health", () => {
    expect(agentHealthLabel("online")).toBe("Połączony");
    expect(agentHealthLabel("offline")).toBe("Rozłączony");
    expect(agentHealthLabel("stale")).toBe("Opóźniony");
    expect(agentHealthClass("online")).toContain("green");
    expect(agentHealthClass("offline")).toContain("red");
  });
});
