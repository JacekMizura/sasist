import { describe, expect, it } from "vitest";

import { canViewReceivingDocumentControl } from "./receivingDocumentControlAccess";

describe("canViewReceivingDocumentControl", () => {
  it("super role always allowed", () => {
    expect(canViewReceivingDocumentControl(() => false, "super_admin")).toBe(true);
  });

  it("permission grants control view", () => {
    expect(
      canViewReceivingDocumentControl((k) => k === "warehouse.receipts.control", "user"),
    ).toBe(true);
  });

  it("warehouse operator without control permission is blind", () => {
    expect(
      canViewReceivingDocumentControl((k) => k === "warehouse.receipts", "user"),
    ).toBe(false);
  });
});
