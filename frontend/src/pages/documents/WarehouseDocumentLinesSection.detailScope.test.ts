/**
 * Regression: LineRow must not reference unbound `detail` (ReferenceError in production).
 * Introduced in e5b078b5 when dockLocationCode was inlined inside LineRow without a prop.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StockDocumentItemRead, StockDocumentRead } from "../../api/stockDocumentsApi";
import { WarehouseDocumentLinesSection } from "./WarehouseDocumentLinesSection";

function makeItem(partial: Partial<StockDocumentItemRead> = {}): StockDocumentItemRead {
  return {
    id: 101,
    product_id: 7,
    product_name: "Sznurówadła CAT 100 cm",
    product_ean: "5900000000001",
    product_sku: "ST-001",
    ordered_quantity: 18,
    received_quantity: 18,
    quantity: 18,
    difference: 0,
    value_net: null,
    vat_rate: 23,
    quantity_putaway: 13,
    putaway_remaining: 5,
    putaway_allocations: [
      { location_id: 11, location_code: "A11-C-1", location_type: "PICK", quantity: 5 },
      { location_id: 12, location_code: "A23-A-2", location_type: "PICK", quantity: 8 },
    ],
    ...partial,
  } as StockDocumentItemRead;
}

function makeDetail(partial: Partial<StockDocumentRead> = {}): StockDocumentRead {
  return {
    id: 34,
    tenant_id: 1,
    document_type: "PZ",
    document_number: "PZ-2026/07/000034",
    supplier_id: 1,
    status: "draft",
    location_name: "DOCK-IN",
    currency: "PLN",
    items: [makeItem()],
    ...partial,
  } as StockDocumentRead;
}

describe("WarehouseDocumentLinesSection — detail scope regression", () => {
  it("BEFORE FIX pattern: unbound detail in LineRow scope throws ReferenceError", () => {
    // Exact bug shape from e5b078b5 LineRow body (detail not in function params/closure).
    const buggyDockCode = new Function(
      "return (function LineRow() { return (detail.location_name || '').trim() || 'DOCK-IN'; })()",
    ) as () => string;
    expect(() => buggyDockCode()).toThrow(/detail is not defined/);
  });

  it("AFTER FIX: section table renders without crash and uses document location_name", () => {
    const detail = makeDetail({
      location_name: "DOCK-IN",
      items: [
        makeItem({
          quantity_putaway: 0,
          putaway_remaining: 18,
          putaway_allocations: [],
        }),
      ],
    });
    const html = renderToString(
      createElement(WarehouseDocumentLinesSection, {
        detail,
        tenantId: 1,
        isWzDetail: false,
        lineEditEnabled: false,
        inputClass: "",
        receivedByLineId: {},
        suggestedCarrierBarcodeByLineId: {},
        onReceivedChange: () => {},
        onSuggestedCarrierChange: () => {},
        onAssignCarrier: () => {},
        onCreateCarrier: () => {},
        onClearCarrier: () => {},
        lineSummary: null,
      }),
    );

    expect(html).toContain("<table");
    expect(html).toContain("<tbody");
    expect(html).toContain("Sznurówadła CAT 100 cm");
    // Single placement row = dock remainder from document.location_name (prop into LineRow).
    expect(html).toContain("DOCK-IN");
    expect(html).toContain("18");
  });

  it("AFTER FIX: uses detail.location_name for dock remainder label (not a hardcoded only path)", () => {
    const detail = makeDetail({
      location_name: "Rampa-1",
      items: [
        makeItem({
          quantity_putaway: 0,
          putaway_remaining: 5,
          putaway_allocations: [],
        }),
      ],
    });
    const html = renderToString(
      createElement(WarehouseDocumentLinesSection, {
        detail,
        tenantId: 1,
        isWzDetail: false,
        lineEditEnabled: false,
        inputClass: "",
        receivedByLineId: {},
        suggestedCarrierBarcodeByLineId: {},
        onReceivedChange: () => {},
        onSuggestedCarrierChange: () => {},
        onAssignCarrier: () => {},
        onCreateCarrier: () => {},
        onClearCarrier: () => {},
        lineSummary: null,
      }),
    );
    expect(html).toContain("Rampa-1");
    expect(html).toContain("Sznurówadła CAT 100 cm");
  });

  it("AFTER FIX: multi-location compact cell still renders (no unbound detail crash)", () => {
    expect(() =>
      renderToString(
        createElement(WarehouseDocumentLinesSection, {
          detail: makeDetail(),
          tenantId: 1,
          isWzDetail: false,
          lineEditEnabled: false,
          inputClass: "",
          receivedByLineId: {},
          suggestedCarrierBarcodeByLineId: {},
          onReceivedChange: () => {},
          onSuggestedCarrierChange: () => {},
          onAssignCarrier: () => {},
          onCreateCarrier: () => {},
          onClearCarrier: () => {},
          lineSummary: null,
        }),
      ),
    ).not.toThrow();
    const html = renderToString(
      createElement(WarehouseDocumentLinesSection, {
        detail: makeDetail(),
        tenantId: 1,
        isWzDetail: false,
        lineEditEnabled: false,
        inputClass: "",
        receivedByLineId: {},
        suggestedCarrierBarcodeByLineId: {},
        onReceivedChange: () => {},
        onSuggestedCarrierChange: () => {},
        onAssignCarrier: () => {},
        onCreateCarrier: () => {},
        onClearCarrier: () => {},
        lineSummary: null,
      }),
    );
    expect(html).toContain("A23-A-2");
    expect(html).toContain("lokalizacje");
  });
});
