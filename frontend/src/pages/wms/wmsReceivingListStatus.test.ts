import { describe, expect, it } from "vitest";

import {
  resolveWmsReceivingListStatus,
  wmsReceivingListStatusLabelPl,
} from "./wmsReceivingListStatus";

describe("resolveWmsReceivingListStatus", () => {
  it("maps NEW → Otwarte", () => {
    expect(resolveWmsReceivingListStatus({ receiving_status: "NEW" })).toBe("OPEN");
    expect(wmsReceivingListStatusLabelPl("OPEN")).toBe("Otwarte");
  });

  it("maps IN_PROGRESS → W trakcie even if putaway completed elsewhere", () => {
    expect(
      resolveWmsReceivingListStatus({
        receiving_status: "IN_PROGRESS",
        status: "draft",
      }),
    ).toBe("IN_PROGRESS");
    expect(wmsReceivingListStatusLabelPl("IN_PROGRESS")).toBe("W trakcie");
  });

  it("maps receiving DONE → Zakończone", () => {
    expect(resolveWmsReceivingListStatus({ receiving_status: "DONE" })).toBe("DONE");
    expect(wmsReceivingListStatusLabelPl("DONE")).toBe("Zakończone");
  });

  it("ignores warehouse/putaway fields (not in resolver input)", () => {
    // Document still open for receiving while stock is already put away in parallel.
    expect(resolveWmsReceivingListStatus({ receiving_status: "IN_PROGRESS" })).toBe("IN_PROGRESS");
  });
});
