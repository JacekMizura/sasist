import { describe, expect, it } from "vitest";
import { FitToContainer } from "./FitToContainer";

/** Sanity: module exports the fit wrapper used by InternalLayoutModal. */
describe("FitToContainer", () => {
  it("is a function component", () => {
    expect(typeof FitToContainer).toBe("function");
  });
});
