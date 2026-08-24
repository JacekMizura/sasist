import { describe, expect, it } from "vitest";
import type { DocumentSeriesDto } from "../api/documentSeriesApi";
import {
  GENERATE_DOCUMENT_SUPPORTED_SUBTYPES,
  buildGenerateDocumentSeriesOptions,
  filterSeriesForGenerateDocument,
  formatGenerateDocumentSeriesOption,
  generateDocumentSubtypeHelp,
  isGenerateDocumentSupportedSubtype,
  resolveGenerateDocumentSeriesId,
} from "./orderAutomationGenerateDocumentSeries";
import { feRuleToCreateBody } from "./orderAutomationBackendMap";
import type { OrderAutomationRule } from "../types/orderAutomation";
import { defaultExecution } from "./orderAutomationExecution";
import { defaultManualTrigger } from "./orderAutomationManualTrigger";

function series(partial: Partial<DocumentSeriesDto> & Pick<DocumentSeriesDto, "id" | "subtype">): DocumentSeriesDto {
  return {
    tenant_id: 1,
    warehouse_id: 1,
    name: partial.name ?? "Seria",
    prefix: "",
    suffix: "",
    color: "#64748b",
    type: "WAREHOUSE",
    correction_series_id: null,
    warehouse_document_series_id: null,
    print_template: "",
    print_template_id: null,
    email_notification_enabled: false,
    delete_mode: "ASK",
    vat_source: null,
    vat_calc_shipping: "DEFAULT",
    vat_calc_payment: "DEFAULT",
    sale_date_source: "ORDER_DATE",
    count_shipping_cost_always: false,
    shipping_cost_name: "Koszt wysyłki",
    payment_term_default: "",
    currency_source: "ORDER",
    auto_currency_conversion: false,
    additional_fields_template: null,
    disable_customer_validation: false,
    allow_empty_customer: false,
    warehouse_effect: true,
    status_on_create_id: null,
    status_on_delete_id: null,
    status_on_error_id: null,
    status_on_update_id: null,
    numbering_start: 1,
    numbering_format: "{PREFIX}/{NUMBER}",
    reset_each_period: false,
    code: "",
    padding_length: 0,
    yearly_reset: false,
    monthly_reset: false,
    is_default: false,
    is_active: true,
    notes: null,
    company_name: null,
    company_street: null,
    company_house_number: null,
    company_apartment_number: null,
    company_address: null,
    company_city: null,
    company_zip: null,
    company_country: null,
    company_nip: null,
    company_regon: null,
    company_bank: null,
    company_iban: null,
    company_bic: null,
    company_email: null,
    ...partial,
  } as DocumentSeriesDto;
}

describe("orderAutomationGenerateDocumentSeries", () => {
  it("supports only WZ and RESERVATION", () => {
    expect(GENERATE_DOCUMENT_SUPPORTED_SUBTYPES).toEqual(["WZ", "RESERVATION"]);
    expect(isGenerateDocumentSupportedSubtype("WZ")).toBe(true);
    expect(isGenerateDocumentSupportedSubtype("RESERVATION")).toBe(true);
    expect(isGenerateDocumentSupportedSubtype("PZ")).toBe(false);
    expect(isGenerateDocumentSupportedSubtype("INVOICE")).toBe(false);
  });

  it("filters to active warehouse WZ/RZ and drops SALE/PZ", () => {
    const rows = [
      series({ id: "wz-1", subtype: "WZ", name: "WZ Allegro", warehouse_id: 1 }),
      series({ id: "rz-1", subtype: "RESERVATION", name: "RZ standard", warehouse_id: 1 }),
      series({ id: "pz-1", subtype: "PZ", name: "PZ", warehouse_id: 1 }),
      series({
        id: "fv-1",
        subtype: "INVOICE",
        name: "FV",
        type: "SALE",
        warehouse_id: 1,
      }),
      series({ id: "wz-2", subtype: "WZ", name: "WZ other WH", warehouse_id: 2 }),
      series({ id: "wz-off", subtype: "WZ", name: "off", warehouse_id: 1, is_active: false }),
    ];
    const filtered = filterSeriesForGenerateDocument(rows, { warehouseId: 1 });
    expect(filtered.map((s) => s.id)).toEqual(["rz-1", "wz-1"]);
  });

  it("formats option with custom name + subtype label", () => {
    const opt = formatGenerateDocumentSeriesOption(
      series({ id: "wz-1", subtype: "WZ", name: "WZ Allegro" }),
    );
    expect(opt?.seriesId).toBe("wz-1");
    expect(opt?.primaryLabel).toBe("WZ Allegro");
    expect(opt?.subtypeLabel).toContain("WZ");
    expect(opt?.optionLabel).toContain("WZ Allegro");
    expect(opt?.optionLabel).toContain("Wydanie zewnętrzne");
  });

  it("appends warehouse name when showWarehouse", () => {
    const opt = formatGenerateDocumentSeriesOption(
      series({ id: "wz-1", subtype: "WZ", name: "WZ Allegro", warehouse_id: 5 }),
      { showWarehouse: true, warehouseNameById: { 5: "Magazyn główny" } },
    );
    expect(opt?.optionLabel).toContain("Magazyn główny");
  });

  it("empty filter yields empty options (empty state)", () => {
    expect(buildGenerateDocumentSeriesOptions([], { warehouseId: 1 })).toEqual([]);
  });

  it("resolves series_id from payload for edit/readback", () => {
    expect(resolveGenerateDocumentSeriesId({ series_id: "abc" })).toBe("abc");
    expect(resolveGenerateDocumentSeriesId({ doc_series: "legacy" })).toBe("legacy");
    expect(resolveGenerateDocumentSeriesId({})).toBe("");
  });

  it("help texts for WZ and RZ", () => {
    expect(generateDocumentSubtypeHelp("WZ")).toMatch(/nie powoduje ponownego rozchodu/i);
    expect(generateDocumentSubtypeHelp("RESERVATION")).toMatch(/nie tworzy rezerwacji/i);
    expect(generateDocumentSubtypeHelp("PZ")).toBeNull();
  });

  it("feRuleToCreateBody persists series_id only for generate_document", () => {
    const rule: OrderAutomationRule = {
      id: "rule-1",
      publicId: 1,
      name: "Test",
      group: "Ogólne",
      enabled: true,
      manualTrigger: defaultManualTrigger(),
      conditions: [],
      effects: [
        {
          uid: "e1",
          kind: "generate_document",
          payload: {
            series_id: "series-uuid-wz",
            doc_series: "series-uuid-wz",
            doc_type: "wz",
          },
        },
      ],
      execution: defaultExecution(),
      delayMinutes: 0,
      stats: { lastRunAt: null, runCount: 0 },
      source: "USER_AUTOMATION",
      entityType: "ORDER",
      triggerStatusId: null,
    };
    const body = feRuleToCreateBody(rule, { tenantId: 1, warehouseId: 1 });
    expect(body.effects?.[0]?.effect_type).toBe("generate_document");
    expect(body.effects?.[0]?.config).toEqual({ series_id: "series-uuid-wz" });
  });
});
