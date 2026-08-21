/**
 * Regression: bare identifier `refund` crashed ReturnsReturnDetailPage render
 * (ReferenceError) after refactor left sectionCtx/openRefundModal using undefined `refund`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WmsReturnRead } from "../../types/wmsReturn";
import {
  renderRmzDetailSection,
  type RmzDetailSectionRenderCtx,
} from "./ReturnsReturnDetailSections";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function baseReturn(overrides: Partial<WmsReturnRead> = {}): WmsReturnRead {
  return {
    id: 1,
    rmz_number: "RMZ-1",
    status: {
      id: 1,
      code: "start",
      name: "Nowe",
      type: "OPEN",
      transition_key: "start",
    },
    order_id: 10,
    tenant_id: 1,
    warehouse_id: 1,
    lines: [],
    refund_processing: "disabled",
    refund: null,
    ...overrides,
  };
}

function baseCtx(data: WmsReturnRead): RmzDetailSectionRenderCtx {
  return {
    data,
    rid: data.id,
    terminal: false,
    cust: "Jan",
    customerAddress: null,
    salesDocRaw: "",
    fi: { total: 0, products: 0, shipping: 0, adjustments: null },
    bankRecipient: "Jan",
    bankTransfer: {},
    panelCorrectionFileRaw: null,
    panelSummary: null,
    panelSubgroups: null,
    patchingUi: false,
    setPatchingUi: () => {},
    setData: () => {},
    setErr: () => {},
    setPanelSummary: () => {},
    wmsSettings: null,
    refundProcessing: data.refund_processing ?? "disabled",
    customerInsights: null,
    openRefundModal: () => {},
    refund: data.refund ?? null,
    notesDraft: "",
    setNotesDraft: () => {},
    notesSavedAt: null,
    setNotesSavedAt: () => {},
    commDraft: "",
    setCommDraft: () => {},
    commEntries: [],
    setCommEntries: () => {},
    panelRmzNotesKey: (id) => `n-${id}`,
    panelRmzCommKey: (id) => `c-${id}`,
    formatWhen: () => "—",
    formatMoneyPln: (v) => String(v ?? 0),
    refundTypeLabelPl: (t) => String(t ?? "—"),
    triggerTextDownload: () => {},
    linesSection: null,
  };
}

describe("ReturnsReturnDetailPage refund binding", () => {
  it("binds const refund from data.refund (no bare undefined identifier)", () => {
    const src = readFileSync(path.join(HERE, "ReturnsReturnDetailPage.tsx"), "utf8");
    expect(src).toMatch(/const refund = data\.refund/);
    expect(src).toContain("openRefundModal");
    expect(src).toMatch(/refund,\s*$/m);
  });
});

describe("RMZ refund section render — refund_processing modes", () => {
  it.each([
    ["disabled", baseReturn({ refund_processing: "disabled" })],
    ["warehouse", baseReturn({ refund_processing: "warehouse" })],
    ["office", baseReturn({ refund_processing: "office" })],
    [
      "office_pending",
      baseReturn({
        refund_processing: "office",
        status: {
          id: 2,
          code: "office_pending",
          name: "Biuro",
          type: "OPEN",
          transition_key: "office_pending",
        },
        refund: {
          refund_type: "PARTIAL",
          refund_amount: 12.5,
          refund_shipping: false,
          refund_shipping_amount: null,
        },
      }),
    ],
  ] as const)("renders refund section for %s without throw", (_label, data) => {
    expect(() => {
      const node = renderRmzDetailSection("refund", baseCtx(data));
      renderToStaticMarkup(createElement("div", null, node));
    }).not.toThrow();
  });
});
