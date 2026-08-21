/**
 * Status list matrix catalog + payload helpers.
 */
import { describe, expect, it } from "vitest";

import { STATUS_ACTION_COLUMN_HEADERS, managedKeysForEntity } from "./statusActionManagedCatalog";
import { buildManagedEffectsPayload, patchRowEffect } from "./statusActionMatrixPayload";

describe("statusActionManagedCatalog", () => {
  it("RETURN columns include warehouse + correction; ORDER/COMPLAINT emails only", () => {
    expect(managedKeysForEntity("RETURN")).toEqual([
      "warehouse_commit",
      "generate_sale_correction",
      "send_email_customer",
      "send_email_internal",
    ]);
    expect(managedKeysForEntity("ORDER")).toEqual(["send_email_customer", "send_email_internal"]);
    expect(STATUS_ACTION_COLUMN_HEADERS.warehouse_commit).toBe("Magazyn");
    expect(STATUS_ACTION_COLUMN_HEADERS.generate_sale_correction).toBe("Korekta");
    expect(STATUS_ACTION_COLUMN_HEADERS.send_email_customer).toBe("E-mail klient");
  });

  it("no technical names in column headers", () => {
    for (const label of Object.values(STATUS_ACTION_COLUMN_HEADERS)) {
      expect(label).not.toMatch(/warehouse_commit|generate_sale_correction|send_email|STATUS_ACTION/);
    }
  });
});

describe("statusActionMatrixPayload", () => {
  it("A/B warehouse toggle payload", () => {
    const effects = buildManagedEffectsPayload("RETURN", {
      warehouse_commit: { enabled: true },
      generate_sale_correction: { enabled: false },
      send_email_customer: { enabled: false },
      send_email_internal: { enabled: false },
    });
    expect(effects.find((e) => e.effect_type === "warehouse_commit")?.enabled).toBe(true);
  });

  it("Q/R correction toggle payload", () => {
    const on = buildManagedEffectsPayload("RETURN", {
      generate_sale_correction: { enabled: true },
    });
    expect(on.find((e) => e.effect_type === "generate_sale_correction")?.enabled).toBe(true);
    const ordered = on.map((e) => e.effect_type);
    expect(ordered.indexOf("warehouse_commit")).toBeLessThan(ordered.indexOf("generate_sale_correction"));
  });

  it("C/D email config in payload", () => {
    const on = buildManagedEffectsPayload("RETURN", {
      send_email_customer: { enabled: true, template_id: 12 },
    });
    const cust = on.find((e) => e.effect_type === "send_email" && e.config.recipient_type === "CUSTOMER");
    expect(cust?.enabled).toBe(true);
    expect(cust?.config.template_id).toBe(12);

    const off = patchRowEffect({ send_email_customer: { enabled: true, template_id: 12 } }, "send_email_customer", {
      enabled: false,
    });
    expect(off.send_email_customer?.enabled).toBe(false);
    expect(off.send_email_customer?.template_id).toBe(12);
  });

  it("G internal email includes user_id", () => {
    const effects = buildManagedEffectsPayload("RETURN", {
      send_email_internal: { enabled: true, template_id: 3, user_id: 9 },
    });
    const row = effects.find((e) => e.config.recipient_type === "INTERNAL");
    expect(row?.config.user_id).toBe(9);
    expect(row?.config.template_id).toBe(3);
  });
});
