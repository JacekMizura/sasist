import { describe, expect, it } from "vitest";
import { resolveOmsFulfillmentCompletionBadge, resolveOmsFulfillmentLineBadge } from "./omsFulfillmentLinePresentation";

describe("resolveOmsFulfillmentLineBadge", () => {
  it("shortage overrides TO_PICK (WMS brak + OMS oczekuje)", () => {
    const b = resolveOmsFulfillmentLineBadge({
      quantity: 1,
      quantity_packed: 0,
      picked_quantity: 0,
      missing_quantity: 1,
      oms_line_status: "TO_PICK",
      replaced_from_order_item_id: null,
      replaced_from_product_name: null,
    });
    expect(b.label).toMatch(/^Brak /);
    expect(b.className).toContain("red");
  });

  it("TO_PICK without missing stays amber pending", () => {
    const b = resolveOmsFulfillmentLineBadge({
      quantity: 1,
      quantity_packed: 0,
      picked_quantity: 0,
      missing_quantity: 0,
      oms_line_status: "TO_PICK",
    });
    expect(b.label).toContain("Oczekuje");
    expect(b.className).toContain("amber");
  });

  it("REPLACED wins over missing on archived line", () => {
    const b = resolveOmsFulfillmentLineBadge({
      quantity: 0,
      missing_quantity: 0,
      oms_line_status: "REPLACED",
    });
    expect(b.label).toContain("Zamieniono");
  });

  it("REPLACED badge includes new product name when provided", () => {
    const b = resolveOmsFulfillmentLineBadge({
      quantity: 0,
      missing_quantity: 0,
      oms_line_status: "REPLACED",
      replacement_new_product_name: "Krem X",
    });
    expect(b.label).toBe("Zamieniono → Krem X");
  });

  it("substitute line shows replacement-for label before generic TO_PICK", () => {
    const b = resolveOmsFulfillmentLineBadge({
      quantity: 2,
      quantity_packed: 0,
      picked_quantity: 0,
      missing_quantity: 0,
      oms_line_status: "TO_PICK",
      replaced_from_order_item_id: 9,
      replaced_from_product_name: "Stary produkt",
    });
    expect(b.label).toContain("zamiennik za produkt Stary produkt");
  });

  it("completion badge for substitute awaiting pick shows Do pakowania (zamiennik)", () => {
    const b = resolveOmsFulfillmentCompletionBadge({
      quantity: 2,
      quantity_packed: 0,
      picked_quantity: 0,
      missing_quantity: 0,
      oms_line_status: "TO_PICK",
      replaced_from_order_item_id: 9,
      replaced_from_product_name: "Stary produkt",
    });
    expect(b.label).toBe("Do pakowania (zamiennik)");
    expect(b.label).not.toContain("Dodano jako");
  });

  it("completion badge for TO_PICK without substitute shows Oczekuje na zbieranie", () => {
    const b = resolveOmsFulfillmentCompletionBadge({
      quantity: 2,
      quantity_packed: 0,
      picked_quantity: 0,
      missing_quantity: 0,
      oms_line_status: "TO_PICK",
      replaced_from_order_item_id: null,
      replaced_from_product_name: null,
    });
    expect(b.label).toBe("Oczekuje na zbieranie");
  });
});
