/**
 * StatusActionsPanel — compact Sellasist projection; STATUS_ACTION SSOT.
 * List UX lives in StatusActionsMatrix (inline checkboxes).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { overviewRowFromRule, rowStateFromOverviewMap } from "../../utils/statusActionOverviewMap";
import { buildManagedEffectsPayload, patchRowEffect } from "../../utils/statusActionMatrixPayload";
import { decisionReturnsToStock } from "../../pages/Settings/returnsStatusesConfigurator/businessLabels";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "StatusActionsPanel.tsx"), "utf8");
const MATRIX = readFileSync(path.join(HERE, "statusActionsMatrix/StatusActionsMatrix.tsx"), "utf8");
const CELL = readFileSync(path.join(HERE, "statusActionsMatrix/StatusActionCell.tsx"), "utf8");
const CATALOG = readFileSync(path.join(HERE, "../../utils/statusActionManagedCatalog.ts"), "utf8");
const API = readFileSync(path.join(HERE, "../../api/automationsApi.ts"), "utf8");
const LIST = readFileSync(
  path.join(HERE, "../../pages/Settings/returnsStatusesConfigurator/ListLabelsSection.tsx"),
  "utf8",
);
const DECISIONS = readFileSync(
  path.join(HERE, "../../pages/Settings/returnsStatusesConfigurator/ProductDecisionsCardsSection.tsx"),
  "utf8",
);
const HOOK = readFileSync(
  path.join(HERE, "../../pages/Settings/returnsStatusesConfigurator/useReturnPanelStatusesConfig.ts"),
  "utf8",
);
const EFFECT_CATALOG = readFileSync(path.join(HERE, "../../utils/orderAutomationCatalog.ts"), "utf8");

describe("Status actions matrix UX", () => {
  it("L — no under-name action text / Brak automatycznych akcji on list", () => {
    expect(LIST).not.toContain("Brak automatycznych akcji");
    expect(LIST).not.toContain("StatusActionListHints");
    expect(LIST).toContain("StatusActionsMatrix");
  });

  it("group headers have +; no Dodaj etykietę under tables", () => {
    expect(LIST).toContain("LIST_LABEL_CARD_TITLE[mainGroup]");
    expect(LIST).toContain('aria-label={`Dodaj status — ${LIST_LABEL_CARD_TITLE[mainGroup]}`}');
    expect(LIST).not.toContain("Dodaj etykietę");
    expect(LIST).toContain("<Plus");
  });

  it("matrix has action columns + PUT reconcile + overview", () => {
    expect(MATRIX).toContain("STATUS_ACTION_COLUMN_HEADERS");
    expect(MATRIX).toContain("upsertStatusActions");
    expect(MATRIX).toContain("onActionsPatched");
    expect(MATRIX).toContain("overviewRowFromRule");
    expect(MATRIX).toContain("Edytuj status");
    expect(MATRIX).not.toMatch(/>\s*Edytuj\s*</);
    expect(MATRIX).toContain("IconButton");
    expect(MATRIX).toContain("Tooltip");
    expect(CATALOG).toContain('warehouse_commit: "Magazyn"');
    expect(CATALOG).toContain('generate_sale_correction: "Korekta"');
    expect(CATALOG).toContain("dokument Z-PZ");
    expect(CATALOG).toContain("korektę faktury");
  });

  it("counter stays in Status cell (no anonymous count column)", () => {
    expect(MATRIX).toContain("status.count");
    expect(MATRIX).not.toContain(">Licznik<");
  });

  it("F/G — email uses popover; Magazyn/Korekta are direct toggles; OFF keeps config", () => {
    expect(CELL).toContain("StatusEmailActionPopover");
    expect(CELL).toContain("onToggleSimple");
    expect(CELL).toContain("STATUS_ACTION_SIMPLE_TOGGLE_KEYS");
    expect(CELL).toContain("onSaveEmail");
    expect(CELL).toContain("hasEmailConfig");
    expect(CELL).toContain("onDisableEmail");
  });

  it("batch overview API + hook does not wipe on error", () => {
    expect(API).toContain("status-actions/overview");
    expect(API).toContain("listStatusActionsOverview");
    expect(HOOK).toContain("patchActionsForStatus");
    expect(HOOK).toContain("Do not wipe existing projection");
  });

  it("modal panel remains compact secondary editor", () => {
    expect(SRC).toContain("Automatyczne akcje po wejściu w status");
    expect(SRC).not.toContain("Zmień status");
    expect(SRC).not.toContain("ChevronUp");
  });

  it("H — ORDER/COMPLAINT keys emails only; RETURN includes correction", () => {
    expect(CATALOG).toContain('"generate_sale_correction"');
    expect(CATALOG).toContain("Wystaw korektę faktury");
    expect(CATALOG).toContain('return ["send_email_customer", "send_email_internal"]');
  });

  it("main Automation Editor supports change_status + sale correction", () => {
    expect(EFFECT_CATALOG).toContain('kind: "change_status"');
    expect(EFFECT_CATALOG).toContain('kind: "generate_sale_correction"');
    expect(EFFECT_CATALOG).toContain("Wystaw korektę faktury");
  });

  it("modal exposes nested include_shipping_cost under correction", () => {
    expect(SRC).toContain("Uwzględnij koszt dostawy");
    expect(SRC).toContain("includeShippingCost");
    expect(SRC).toContain("include_shipping_cost");
  });

  it("main editor exposes include_shipping_cost checkbox", () => {
    const editor = readFileSync(
      path.join(HERE, "../../components/orders/automation/effects/orderAutomationEffectEditorRenderers.tsx"),
      "utf8",
    );
    expect(editor).toContain("Uwzględnij koszt dostawy");
    expect(editor).toContain("include_shipping_cost");
  });
});

describe("STATUS_ACTION list↔modal sync helpers", () => {
  it("PUT rule → overview row → matrix state stays ON", () => {
    const row = overviewRowFromRule({
      enabled: true,
      effects: [
        { position: 0, effect_type: "warehouse_commit", enabled: true, config: {} },
        { position: 1, effect_type: "generate_sale_correction", enabled: true, config: {} },
        {
          position: 2,
          effect_type: "send_email",
          enabled: false,
          config: { recipient_type: "CUSTOMER", template_id: 9 },
        },
      ],
    });
    expect(row.warehouse_commit?.enabled).toBe(true);
    expect(row.generate_sale_correction?.enabled).toBe(true);
    expect(row.send_email_customer?.enabled).toBe(false);
    expect(row.send_email_customer?.template_id).toBe(9);
    const state = rowStateFromOverviewMap(row);
    expect(state.warehouse_commit?.enabled).toBe(true);
    expect(state.generate_sale_correction?.enabled).toBe(true);
  });

  it("correction include_shipping_cost round-trips overview → payload", () => {
    const row = overviewRowFromRule({
      enabled: true,
      effects: [
        {
          position: 0,
          effect_type: "generate_sale_correction",
          enabled: false,
          config: { include_shipping_cost: true },
        },
      ],
    });
    expect(row.generate_sale_correction?.enabled).toBe(false);
    expect(row.generate_sale_correction?.include_shipping_cost).toBe(true);
    const state = rowStateFromOverviewMap(row);
    expect(state.generate_sale_correction?.include_shipping_cost).toBe(true);
    const effects = buildManagedEffectsPayload("RETURN", state);
    const corr = effects.find((e) => e.effect_type === "generate_sale_correction");
    expect(corr?.enabled).toBe(false);
    expect(corr?.config.include_shipping_cost).toBe(true);
  });

  it("email OFF preserves template_id in payload", () => {
    const off = patchRowEffect(
      { send_email_customer: { enabled: true, template_id: 12 } },
      "send_email_customer",
      { enabled: false },
    );
    const effects = buildManagedEffectsPayload("RETURN", off);
    const cust = effects.find((e) => e.config.recipient_type === "CUSTOMER");
    expect(cust?.enabled).toBe(false);
    expect(cust?.config.template_id).toBe(12);
  });
});

describe("Product decisions matrix UX", () => {
  it("Przyjęcia/Odrzucenia matrices with inline Aktywna + Powrót", () => {
    expect(DECISIONS).toContain("Przyjęcia");
    expect(DECISIONS).toContain("Odrzucenia");
    expect(DECISIONS).toContain("Powrót na magazyn");
    expect(DECISIONS).toContain("decisionReturnsToStock");
    expect(DECISIONS).toContain("creates_stock_document");
    expect(DECISIONS).toContain('title={`Dodaj decyzję — ${title}`}');
    expect(DECISIONS).not.toMatch(/Dodaj decyzję<\/button>/);
    expect(DECISIONS).not.toContain("Produkt wraca na magazyn</p>");
  });

  it("decisionReturnsToStock uses creates_stock_document SSOT", () => {
    expect(
      decisionReturnsToStock({
        category: "ACCEPTED",
        code: "ok",
        label: "Zaakceptowany",
        visible_wms: true,
        sort_order: 1,
        is_active: true,
      }),
    ).toBe(true);
    expect(
      decisionReturnsToStock({
        category: "ACCEPTED",
        code: "refund",
        label: "Zwrot środków",
        visible_wms: true,
        sort_order: 1,
        is_active: true,
      }),
    ).toBe(false);
    expect(
      decisionReturnsToStock({
        category: "REJECTED",
        code: "dmg",
        label: "Uszkodzony",
        visible_wms: true,
        sort_order: 1,
        is_active: true,
        creates_stock_document: true,
      }),
    ).toBe(true);
  });
});
