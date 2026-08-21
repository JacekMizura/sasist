/**
 * Status list overview projection helpers / labels.
 */
import { describe, expect, it } from "vitest";

import {
  STATUS_ACTION_CHECKBOX_LABELS,
  STATUS_ACTION_LIST_LABELS,
  managedKeysForEntity,
} from "./statusActionManagedCatalog";

describe("statusActionManagedCatalog", () => {
  it("A — empty keys for ORDER without warehouse_commit", () => {
    expect(managedKeysForEntity("ORDER")).toEqual(["send_email_customer", "send_email_internal"]);
    expect(managedKeysForEntity("COMPLAINT")).toEqual(["send_email_customer", "send_email_internal"]);
  });

  it("B/C — RETURN includes warehouse_commit with business labels", () => {
    expect(managedKeysForEntity("RETURN")[0]).toBe("warehouse_commit");
    expect(STATUS_ACTION_LIST_LABELS.warehouse_commit).toBe("Przyjęcie magazynowe");
    expect(STATUS_ACTION_LIST_LABELS.send_email_customer).toBe("E-mail klientowi");
    expect(STATUS_ACTION_CHECKBOX_LABELS.warehouse_commit).toMatch(/przyjęcie/i);
  });

  it("no technical effect names in list labels", () => {
    for (const label of Object.values(STATUS_ACTION_LIST_LABELS)) {
      expect(label).not.toMatch(/warehouse_commit|send_email|STATUS_ACTION/);
    }
  });
});
