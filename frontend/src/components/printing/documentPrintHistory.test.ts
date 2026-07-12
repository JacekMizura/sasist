import { describe, expect, it } from "vitest";

import { canRetryJob } from "../../pages/Settings/printing/printingQueuePresentation";

describe("DocumentPrintHistory actions", () => {
  it("allows retry for failed printed jobs", () => {
    expect(canRetryJob("printed")).toBe(true);
    expect(canRetryJob("failed")).toBe(true);
  });
});
