import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResolvedDirectSalesSettingsProvider } from "../../../modules/directSales/settings/resolvedDirectSalesSettings";
import {
  DEFAULT_TERMINAL_DIRECT_SALES_SETTINGS,
  type ResolvedDirectSalesTerminalSettings,
} from "../../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";
import { PaymentTerminalPanel } from "./PaymentTerminalPanel";

const BASE_PROPS = {
  total: 100,
  busy: false,
  hasSession: true,
  hasLines: true,
  session: { status: "ACTIVE" } as never,
  fulfillment: { mode: "PICKUP", payment_terms_mode: "IMMEDIATE" } as never,
  customerPaymentTermsDays: null,
  paymentMethod: "CASH",
  cashReceived: 100,
  mixedCashAmount: 0,
  mixedCardAmount: 0,
  onCashReceivedChange: () => {},
  onMixedCashChange: () => {},
  onMixedCardChange: () => {},
  onPaymentMethodChange: () => {},
  onPaymentTermsChange: () => {},
  onComplete: () => {},
};

function renderWithSettings(settings: ResolvedDirectSalesTerminalSettings): string {
  return renderToString(
    createElement(
      ResolvedDirectSalesSettingsProvider,
      { value: settings },
      createElement(PaymentTerminalPanel, BASE_PROPS),
    ),
  );
}

describe("PaymentTerminalPanel F-key labels", () => {
  it("C) shows F1/F2/F3 when keyboard_shortcuts=true", () => {
    const html = renderWithSettings({
      ...DEFAULT_TERMINAL_DIRECT_SALES_SETTINGS,
      keyboard_shortcuts: true,
    });
    expect(html).toContain("F1");
    expect(html).toContain("F2");
    expect(html).toContain("F3");
  });

  it("D) hides F1/F2/F3 when keyboard_shortcuts=false", () => {
    const html = renderWithSettings({
      ...DEFAULT_TERMINAL_DIRECT_SALES_SETTINGS,
      keyboard_shortcuts: false,
    });
    expect(html).not.toContain("F1");
    expect(html).not.toContain("F2");
    expect(html).not.toContain("F3");
    expect(html).toContain("Gotówka");
    expect(html).toContain("Karta");
    expect(html).toContain("BLIK");
  });
});
