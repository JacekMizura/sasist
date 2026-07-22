import { describe, expect, it } from "vitest";

import { formatDirectSalesAggregateTotal } from "../../../modules/directSales/settings/formatDirectSalesPrice";
import {
  DS_PAYMENT_METHODS_V2_KEY,
  normalizeDirectSalesSettings,
} from "../../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";
import { normalizeDirectSaleFulfillment } from "../../../utils/normalizeDirectSales";

describe("direct sales UX helpers", () => {
  it("formats aggregate total with Polish money (comma), not 6.15", () => {
    const label = formatDirectSalesAggregateTotal(6.15, "gross");
    expect(label).toContain("6,15");
    expect(label).not.toMatch(/\d\.\d{2}\s*zł/);
  });

  it("defaults fulfillment to pickup", () => {
    const f = normalizeDirectSaleFulfillment(null);
    expect(f.mode).toBe("PICKUP");
    expect(f.payment_terms_mode).toBe("IMMEDIATE");
  });

  it("parses delivery fulfillment payload", () => {
    const f = normalizeDirectSaleFulfillment({
      mode: "DELIVERY",
      shipping_method_id: "abc",
      payment_terms_mode: "DEFERRED",
      payment_terms_days: 14,
      shipping_address: {
        first_name: "Jan",
        last_name: "Kowalski",
        street: "Test",
        house_number: "1",
        postal_code: "00-001",
        city: "Warszawa",
        country_code: "PL",
      },
    });
    expect(f.mode).toBe("DELIVERY");
    expect(f.shipping_method_id).toBe("abc");
    expect(f.payment_terms_days).toBe(14);
    expect(f.shipping_address?.city).toBe("Warszawa");
  });

  it("migrates legacy payment_methods.transfer=false to true", () => {
    const cfg = normalizeDirectSalesSettings({
      payment_methods: { cash: true, card: true, blik: true, transfer: false, mixed: false },
    });
    expect(cfg.payment_methods.transfer).toBe(true);
  });

  it("keeps intentional transfer=false after payment_methods_v2", () => {
    const cfg = normalizeDirectSalesSettings({
      payment_methods: { cash: true, card: true, blik: true, transfer: false, mixed: false },
      extensions: { [DS_PAYMENT_METHODS_V2_KEY]: true },
    });
    expect(cfg.payment_methods.transfer).toBe(false);
  });
});
