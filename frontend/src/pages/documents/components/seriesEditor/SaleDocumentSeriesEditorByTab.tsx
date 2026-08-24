import { useEffect, useMemo, useState } from "react";
import {
  previewDocumentSeriesNumbering,
  type DocumentSeriesDto,
  type DocumentSeriesSubtype,
  type DocumentSeriesType,
  type DocumentSeriesWritePayload,
  type VatSource,
} from "../../../../api/documentSeriesApi";
import type { OrderStatusOption } from "../../../../types/wmsPackingSettings";
import { orderPanelStatusSelectLabel } from "../../../../utils/orderPanelStatusUi";
import type { DocumentSeriesEditorTab } from "../../documentSeriesEditorTypes";
import { DOCUMENT_SERIES_SUBTYPE_TO_KIND } from "../../documentSeriesFormUtils";
import {
  applyNumberingPreset,
  DOCUMENT_SERIES_PRINT_TEMPLATE_PRESETS,
  documentSeriesSubtypeLabelPl,
  documentSeriesTypeLabelPl,
  numberingPresetFromDraft,
  numberingPresetLabelPl,
  VAT_CALC_OPTIONS_PL,
  type NumberingPresetUi,
} from "../../documentSeriesUiLabels";
import { DocumentTemplateSelect } from "@/pages/Settings/document-templates/components/DocumentTemplateSelect";
import {
  Checkbox,
  FormField,
  FormSection,
  FORM_FIELD_DENSITY,
  formStackClass,
  GhostButton,
  Input,
  SecondaryButton,
  Select,
  Textarea,
  typography,
} from "@/design-system";

type Props = {
  activeTab: DocumentSeriesEditorTab;
  draft: DocumentSeriesWritePayload;
  setDraft: React.Dispatch<React.SetStateAction<DocumentSeriesWritePayload>>;
  setField: <K extends keyof DocumentSeriesWritePayload>(key: K, value: DocumentSeriesWritePayload[K]) => void;
  allowedSubtypes: DocumentSeriesSubtype[];
  correctionOptions: DocumentSeriesDto[];
  warehouseSeriesOptions: DocumentSeriesDto[];
  statuses: OrderStatusOption[];
  tenantId: number;
  loadingProfile: boolean;
  loadFromTenantProfile: () => void;
};

export function SaleDocumentSeriesEditorByTab({
  activeTab,
  draft,
  setDraft,
  setField,
  allowedSubtypes,
  correctionOptions,
  warehouseSeriesOptions,
  statuses,
  tenantId,
  loadingProfile,
  loadFromTenantProfile,
}: Props) {
  const numberingPreset = useMemo(
    () => numberingPresetFromDraft(draft),
    [draft.numbering_format, draft.reset_each_period, draft.monthly_reset, draft.yearly_reset],
  );
  const [numberingPreview, setNumberingPreview] = useState("…");
  const printModeCustom = draft.print_template_id == null;

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void previewDocumentSeriesNumbering({
        prefix: draft.prefix,
        suffix: draft.suffix,
        numbering_format: draft.numbering_format,
        numbering_start: draft.numbering_start,
        padding_length: draft.padding_length,
        code: draft.code,
        reset_each_period: draft.reset_each_period,
        yearly_reset: draft.yearly_reset,
        monthly_reset: draft.monthly_reset,
      })
        .then((preview) => {
          if (!cancelled) setNumberingPreview(preview);
        })
        .catch(() => {
          if (!cancelled) setNumberingPreview("—");
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    draft.prefix,
    draft.suffix,
    draft.numbering_format,
    draft.numbering_start,
    draft.padding_length,
    draft.code,
    draft.reset_each_period,
    draft.yearly_reset,
    draft.monthly_reset,
  ]);

  const onNumberingPresetChange = (p: NumberingPresetUi) => {
    setDraft((d) => ({ ...d, ...applyNumberingPreset(p) }));
  };

  const statusSelect = (label: string, field: keyof DocumentSeriesWritePayload, value: number | null) => (
    <FormField label={label}>
      <Select
        density={FORM_FIELD_DENSITY}
        focusTone="brand"
        className="bg-white"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          setField(field, v === "" ? null : Number(v));
        }}
      >
        <option value="">— brak —</option>
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {orderPanelStatusSelectLabel(s)}
          </option>
        ))}
      </Select>
    </FormField>
  );

  if (activeTab === "basics") {
    return (
      <div className={`grid gap-4 lg:grid-cols-2 lg:items-start ${formStackClass}`}>
        <FormSection title="Podstawowe">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Nazwa serii *" className="sm:col-span-2">
              <Input
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </FormField>
            <FormField label="Prefiks">
              <Input
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                value={draft.prefix}
                onChange={(e) => setField("prefix", e.target.value)}
              />
            </FormField>
            <FormField label="Sufiks">
              <Input
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                value={draft.suffix}
                onChange={(e) => setField("suffix", e.target.value)}
              />
            </FormField>
            <FormField label="Kolor serii" className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="color"
                  aria-label="Kolor"
                  density={FORM_FIELD_DENSITY}
                  focusTone="brand"
                  className="!w-14 cursor-pointer p-0.5"
                  value={/^#[0-9A-Fa-f]{6}$/.test(draft.color) ? draft.color : "#64748b"}
                  onChange={(e) => setField("color", e.target.value)}
                />
                <Input
                  density={FORM_FIELD_DENSITY}
                  focusTone="brand"
                  className="max-w-[10rem]"
                  value={draft.color}
                  onChange={(e) => setField("color", e.target.value)}
                  placeholder="#RRGGBB"
                />
              </div>
            </FormField>
            <FormField label="Typ *">
              <Select
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="bg-white"
                value={draft.type}
                onChange={(e) => setField("type", e.target.value as DocumentSeriesType)}
              >
                <option value="SALE">{documentSeriesTypeLabelPl("SALE")}</option>
                <option value="WAREHOUSE">{documentSeriesTypeLabelPl("WAREHOUSE")}</option>
                <option value="CORRECTION">{documentSeriesTypeLabelPl("CORRECTION")}</option>
              </Select>
            </FormField>
            <FormField label="Podtyp *">
              <Select
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="bg-white"
                value={draft.subtype}
                onChange={(e) => setField("subtype", e.target.value as DocumentSeriesSubtype)}
              >
                {allowedSubtypes.map((s) => (
                  <option key={s} value={s}>
                    {documentSeriesSubtypeLabelPl(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <label className={`flex items-center gap-2 sm:col-span-2 ${typography.body}`}>
              <Checkbox checked={draft.is_active} onChange={(e) => setField("is_active", e.target.checked)} />
              Aktywna
            </label>
            <label className={`flex items-center gap-2 sm:col-span-2 ${typography.body}`}>
              <Checkbox checked={draft.is_default} onChange={(e) => setField("is_default", e.target.checked)} />
              Domyślna seria dla typu dokumentu
            </label>
          </div>
        </FormSection>

        <FormSection title="Powiązania">
          <div className="grid gap-3">
            <FormField label="Seria korekty">
              <Select
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="bg-white"
                value={draft.correction_series_id ?? ""}
                onChange={(e) => setField("correction_series_id", e.target.value || null)}
              >
                <option value="">— brak —</option>
                {correctionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {draft.type === "SALE" ? (
              <>
                <FormField label="Seria dokumentu magazynowego WZ">
                  <Select
                    density={FORM_FIELD_DENSITY}
                    focusTone="brand"
                    className="bg-white"
                    value={draft.warehouse_document_series_id ?? ""}
                    onChange={(e) => setField("warehouse_document_series_id", e.target.value || null)}
                  >
                    <option value="">Domyślna seria WZ</option>
                    {warehouseSeriesOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {draft.warehouse_document_series_id ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Po wystawieniu dokumentu sprzedażowego z tej serii może zostać użyta wskazana seria WZ w
                    odpowiednim flow.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </FormSection>
      </div>
    );
  }

  if (activeTab === "document") {
    return (
      <div className={formStackClass}>
        <FormSection title="Zachowanie dokumentu">
          <div className="grid gap-3">
            <FormField label="Szablon druku">
              <Select
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="bg-white"
                value={draft.print_template_id ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setDraft((d) => ({ ...d, print_template_id: null }));
                    return;
                  }
                  setDraft((d) => ({ ...d, print_template_id: Number(v), print_template: "" }));
                }}
              >
                <option value="">Szablon własny — ustawienia poniżej</option>
                {DOCUMENT_SERIES_PRINT_TEMPLATE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Własna ścieżka lub identyfikator szablonu">
              <Input
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                disabled={!printModeCustom}
                value={draft.print_template}
                onChange={(e) => setField("print_template", e.target.value)}
                placeholder="np. templates/invoice_v2.html"
              />
            </FormField>
            <DocumentTemplateSelect
              tenantId={tenantId}
              kindCode={DOCUMENT_SERIES_SUBTYPE_TO_KIND[draft.subtype] ?? null}
              variantCode={draft.document_template_variant_code ?? "standard"}
              value={draft.document_template_version_id ?? null}
              onChange={(versionId) => setDraft((d) => ({ ...d, document_template_version_id: versionId }))}
            />
            <label className={`flex items-center gap-2 ${typography.body}`}>
              <Checkbox
                checked={draft.email_notification_enabled}
                onChange={(e) => setField("email_notification_enabled", e.target.checked)}
              />
              Wysyłaj e-mail po wystawieniu dokumentu
            </label>
            <FormField label="Tryb usuwania dokumentu">
              <Select
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="bg-white"
                value={draft.delete_mode}
                onChange={(e) => setField("delete_mode", e.target.value as DocumentSeriesWritePayload["delete_mode"])}
              >
                <option value="ASK">Pytaj przed usunięciem</option>
                <option value="ALWAYS_DELETE">Zawsze usuwaj</option>
              </Select>
            </FormField>
          </div>
        </FormSection>
        <FormSection title="Walidacja klienta">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`flex items-center gap-2 ${typography.body}`}>
              <Checkbox
                checked={draft.disable_customer_validation}
                onChange={(e) => setField("disable_customer_validation", e.target.checked)}
              />
              Wyłącz walidację danych klienta
            </label>
            <label className={`flex items-center gap-2 ${typography.body}`}>
              <Checkbox
                checked={draft.allow_empty_customer}
                onChange={(e) => setField("allow_empty_customer", e.target.checked)}
              />
              Dopuszczaj pustego klienta
            </label>
          </div>
        </FormSection>
        <FormSection title="Szablon pól dodatkowych (JSON)">
          <FormField>
            <Textarea
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              rows={3}
              value={draft.additional_fields_template ?? ""}
              onChange={(e) => setField("additional_fields_template", e.target.value || null)}
              placeholder="Opcjonalny JSON pól dodatkowych na dokumencie"
            />
          </FormField>
        </FormSection>
        <FormSection title="Notatki wewnętrzne">
          <FormField>
            <Textarea
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              rows={3}
              value={draft.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value || null)}
            />
          </FormField>
        </FormSection>
      </div>
    );
  }

  if (activeTab === "numbering") {
    return (
      <FormSection title="Numeracja">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Sposób numeracji">
            <Select
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
              value={numberingPreset}
              onChange={(e) => onNumberingPresetChange(e.target.value as NumberingPresetUi)}
            >
              <option value="continuous">{numberingPresetLabelPl("continuous")}</option>
              <option value="monthly">{numberingPresetLabelPl("monthly")}</option>
              <option value="yearly">{numberingPresetLabelPl("yearly")}</option>
            </Select>
          </FormField>
          <FormField label="Start numeracji">
            <Input
              type="number"
              min={1}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.numbering_start}
              onChange={(e) => setField("numbering_start", Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </FormField>
          <FormField label="Długość numeru (padding)">
            <Input
              type="number"
              min={1}
              max={12}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.padding_length}
              onChange={(e) =>
                setField("padding_length", Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 6)))
              }
            />
          </FormField>
          <label className={`flex items-center gap-2 ${typography.body}`}>
            <Checkbox checked={draft.monthly_reset} onChange={(e) => setField("monthly_reset", e.target.checked)} />
            Reset miesięczny
          </label>
          <label className={`flex items-center gap-2 ${typography.body}`}>
            <Checkbox checked={draft.yearly_reset} onChange={(e) => setField("yearly_reset", e.target.checked)} />
            Reset roczny
          </label>
          <FormField label="Przykład numeru" className="sm:col-span-2">
            <span className="block rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 font-mono text-sm text-slate-800">
              {numberingPreview}
            </span>
          </FormField>
          <details className="sm:col-span-2">
            <summary className={`cursor-pointer ${typography.label}`}>Własny format numeru</summary>
            <FormField
              label="Szablon numeru"
              className="mt-2"
              helperText="W typowych przypadkach wystarczy wybrać sposób numeracji powyżej."
            >
              <Input
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                value={draft.numbering_format}
                onChange={(e) => setField("numbering_format", e.target.value)}
              />
            </FormField>
          </details>
        </div>
      </FormSection>
    );
  }

  if (activeTab === "automation") {
    return (
      <FormSection title="Integracja ze statusem zamówienia">
        <p className={`mb-3 ${typography.caption}`}>
          Te ustawienia dotyczą zachowania dokumentu względem statusów zamówienia. Nie są triggerem utworzenia
          dokumentu.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {statusSelect("Status przy utworzeniu", "status_on_create_id", draft.status_on_create_id)}
          {statusSelect("Status przy usunięciu", "status_on_delete_id", draft.status_on_delete_id)}
          {statusSelect("Status przy błędzie", "status_on_error_id", draft.status_on_error_id)}
          {statusSelect("Status przy aktualizacji", "status_on_update_id", draft.status_on_update_id)}
        </div>
      </FormSection>
    );
  }

  // company
  return (
    <div className={formStackClass}>
      <div className="mb-1 flex justify-end">
        <SecondaryButton type="button" density="compact" disabled={loadingProfile} onClick={() => void loadFromTenantProfile()}>
          {loadingProfile ? "Wczytywanie…" : "Wczytaj z profilu firmy"}
        </SecondaryButton>
      </div>
      <FormSection title="Adres i identyfikatory">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nazwa firmy" className="sm:col-span-2">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_name ?? ""}
              onChange={(e) => setField("company_name", e.target.value || null)}
            />
          </FormField>
          <FormField label="Ulica" className="sm:col-span-2">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_street ?? ""}
              onChange={(e) => setField("company_street", e.target.value || null)}
            />
          </FormField>
          <FormField label="Nr domu">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_house_number ?? ""}
              onChange={(e) => setField("company_house_number", e.target.value || null)}
            />
          </FormField>
          <FormField label="Nr lokalu">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_apartment_number ?? ""}
              onChange={(e) => setField("company_apartment_number", e.target.value || null)}
            />
          </FormField>
          <FormField label="Kod pocztowy">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_zip ?? ""}
              onChange={(e) => setField("company_zip", e.target.value || null)}
            />
          </FormField>
          <FormField label="Miasto">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_city ?? ""}
              onChange={(e) => setField("company_city", e.target.value || null)}
            />
          </FormField>
          <FormField label="Kraj" className="sm:col-span-2">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_country ?? ""}
              onChange={(e) => setField("company_country", e.target.value || null)}
            />
          </FormField>
          <FormField label="NIP">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_nip ?? ""}
              onChange={(e) => setField("company_nip", e.target.value || null)}
            />
          </FormField>
          <FormField label="REGON">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_regon ?? ""}
              onChange={(e) => setField("company_regon", e.target.value || null)}
            />
          </FormField>
          <FormField label="Dodatkowa linia adresu" className="sm:col-span-2">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_address ?? ""}
              onChange={(e) => setField("company_address", e.target.value || null)}
            />
          </FormField>
        </div>
      </FormSection>
      <FormSection title="Bank i kontakt">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nazwa banku" className="sm:col-span-2">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_bank ?? ""}
              onChange={(e) => setField("company_bank", e.target.value || null)}
            />
          </FormField>
          <FormField label="IBAN">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_iban ?? ""}
              onChange={(e) => setField("company_iban", e.target.value || null)}
            />
          </FormField>
          <FormField label="BIC / SWIFT">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_bic ?? ""}
              onChange={(e) => setField("company_bic", e.target.value || null)}
            />
          </FormField>
          <FormField label="E-mail (na dokumencie)" className="sm:col-span-2">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.company_email ?? ""}
              onChange={(e) => setField("company_email", e.target.value || null)}
            />
          </FormField>
        </div>
      </FormSection>
      <FormSection title="VAT">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Źródło VAT *">
            <Select
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
              value={draft.vat_source ?? "FROM_ORDER"}
              onChange={(e) => setField("vat_source", e.target.value as VatSource)}
            >
              <option value="FROM_ORDER">Z zamówienia</option>
              <option value="FROM_LINES">Z linii</option>
              <option value="MANUAL">Ręcznie</option>
              <option value="FIXED">Stała stawka z serii</option>
            </Select>
          </FormField>
          <FormField label="Stawka VAT domyślna">
            <div className="flex flex-wrap items-center gap-2">
              {[23, 8, 5, 0].map((pct) => (
                <GhostButton key={pct} type="button" density="compact" onClick={() => setField("vat_rate_percent", pct)}>
                  {pct}%
                </GhostButton>
              ))}
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="max-w-[6rem]"
                value={draft.vat_rate_percent ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") setField("vat_rate_percent", null);
                  else setField("vat_rate_percent", Math.min(100, Math.max(0, parseInt(v, 10) || 0)));
                }}
                placeholder="np. 23"
              />
              <span className={typography.bodyMuted}>%</span>
            </div>
          </FormField>
          <FormField label="VAT — koszt wysyłki">
            <Select
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
              value={draft.vat_calc_shipping}
              onChange={(e) =>
                setField("vat_calc_shipping", e.target.value as DocumentSeriesWritePayload["vat_calc_shipping"])
              }
            >
              {VAT_CALC_OPTIONS_PL.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="VAT — opłaty / płatność" className="sm:col-span-2">
            <Select
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
              value={draft.vat_calc_payment}
              onChange={(e) =>
                setField("vat_calc_payment", e.target.value as DocumentSeriesWritePayload["vat_calc_payment"])
              }
            >
              {VAT_CALC_OPTIONS_PL.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Źródło daty sprzedaży" className="sm:col-span-2">
            <Select
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
              value={draft.sale_date_source}
              onChange={(e) =>
                setField("sale_date_source", e.target.value as DocumentSeriesWritePayload["sale_date_source"])
              }
            >
              <option value="ORDER_DATE">Data zamówienia</option>
              <option value="DOCUMENT_DATE">Data dokumentu</option>
              <option value="DELIVERY_DATE">Data dostawy</option>
              <option value="MANUAL">Ręcznie</option>
            </Select>
          </FormField>
        </div>
      </FormSection>
      <FormSection title="Koszty wysyłki, płatność i waluta">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex items-center gap-2 ${typography.body} sm:col-span-2`}>
            <Checkbox
              checked={draft.count_shipping_cost_always}
              onChange={(e) => setField("count_shipping_cost_always", e.target.checked)}
            />
            Zawsze uwzględniaj koszt wysyłki w wartości dokumentu
          </label>
          <FormField label="Nazwa pozycji kosztu wysyłki" className="sm:col-span-2">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.shipping_cost_name}
              onChange={(e) => setField("shipping_cost_name", e.target.value)}
            />
          </FormField>
          <FormField label="Domyślny termin płatności">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.payment_term_default}
              onChange={(e) => setField("payment_term_default", e.target.value)}
            />
          </FormField>
          <FormField label="Źródło waluty">
            <Select
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
              value={draft.currency_source}
              onChange={(e) =>
                setField("currency_source", e.target.value as DocumentSeriesWritePayload["currency_source"])
              }
            >
              <option value="ORDER">Zamówienie</option>
              <option value="SERIES">Seria</option>
              <option value="MANUAL">Ręcznie</option>
            </Select>
          </FormField>
          <label className={`flex items-center gap-2 ${typography.body} sm:col-span-2`}>
            <Checkbox
              checked={draft.auto_currency_conversion}
              onChange={(e) => setField("auto_currency_conversion", e.target.checked)}
            />
            Automatyczna konwersja walut
          </label>
        </div>
      </FormSection>
    </div>
  );
}
