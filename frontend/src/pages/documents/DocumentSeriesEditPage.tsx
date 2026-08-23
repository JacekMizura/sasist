import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layers, Loader2 } from "lucide-react";
import { fetchCompanyProfile, type CompanyProfileDto } from "../../api/companyProfileApi";
import {
  createDefaultDocumentSeriesWrite,
  createDocumentSeries,
  getDocumentSeries,
  listDocumentSeries,
  subtypesForDocumentSeriesType,
  updateDocumentSeries,
  type DocumentSeriesDto,
  type DocumentSeriesSubtype,
  type DocumentSeriesType,
  type DocumentSeriesWritePayload,
  type VatSource,
} from "../../api/documentSeriesApi";
import { listOrderStatuses } from "../../api/orderStatusesApi";
import { useWarehouse } from "../../context/WarehouseContext";
import type { OrderStatusOption } from "../../types/wmsPackingSettings";
import { orderPanelStatusSelectLabel } from "../../utils/orderPanelStatusUi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { readDocumentsSeriesListContext, rememberDocumentsSeriesListContext } from "./documentSeriesContext";
import { WarehouseDocumentSeriesForm } from "./components/WarehouseDocumentSeriesForm";
import { applyWarehouseSubtypeDefaults } from "./warehouseSeriesCapabilities";
import {
  applyNumberingPreset,
  DOCUMENT_SERIES_PRINT_TEMPLATE_PRESETS,
  documentSeriesNumberingPreview,
  documentSeriesSubtypeLabelPl,
  documentSeriesTypeLabelPl,
  numberingPresetFromDraft,
  numberingPresetLabelPl,
  VAT_CALC_OPTIONS_PL,
  type NumberingPresetUi,
} from "./documentSeriesUiLabels";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import { DocumentTemplateSelect } from "@/pages/Settings/document-templates/components/DocumentTemplateSelect";
import {
  Checkbox,
  FormActions,
  FormError,
  FormField,
  FormSection,
  FORM_FIELD_DENSITY,
  formStackClass,
  GhostButton,
  Input,
  PrimaryButton,
  SecondaryButton,
  Select,
  Textarea,
  typography,
} from "@/design-system";

const SUBTYPE_TO_KIND: Record<string, string> = {
  INVOICE: "invoice",
  RECEIPT: "receipt",
  CORRECTION: "correction",
  WZ: "wz",
  PZ: "pz",
  PW: "pw",
  RW: "rw",
  MM: "mm",
  Z_PZ: "pz",
};

/** Zgodnie z {@link CompanyProfileDto} (Ustawienia → Firma) → pola `company_*` serii dokumentów. */
function trimProfileField(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function companyProfileToSeriesCompanyBlock(p: CompanyProfileDto): Pick<
  DocumentSeriesWritePayload,
  | "company_name"
  | "company_street"
  | "company_house_number"
  | "company_apartment_number"
  | "company_address"
  | "company_city"
  | "company_zip"
  | "company_country"
  | "company_nip"
  | "company_regon"
  | "company_bank"
  | "company_iban"
  | "company_bic"
  | "company_email"
> {
  return {
    company_name: trimProfileField(p.company_name),
    company_street: trimProfileField(p.street),
    company_house_number: trimProfileField(p.building_number),
    company_apartment_number: trimProfileField(p.apartment_number),
    company_address: trimProfileField(p.address_extra_line),
    company_city: trimProfileField(p.city),
    company_zip: trimProfileField(p.postal_code),
    company_country: trimProfileField(p.country),
    company_nip: trimProfileField(p.nip),
    company_regon: trimProfileField(p.regon),
    company_bank: trimProfileField(p.bank_name),
    company_iban: trimProfileField(p.iban),
    company_bic: trimProfileField(p.bic_swift),
    company_email: trimProfileField(p.document_email),
  };
}

function dtoToWrite(d: DocumentSeriesDto): DocumentSeriesWritePayload {
  return {
    name: d.name,
    prefix: d.prefix,
    suffix: d.suffix,
    color: d.color,
    type: d.type,
    subtype: d.subtype,
    correction_series_id: d.correction_series_id,
    warehouse_document_series_id: d.warehouse_document_series_id ?? null,
    print_template: d.print_template,
    print_template_id: d.print_template_id ?? null,
    document_template_version_id: d.document_template_version_id ?? null,
    document_template_variant_code: d.document_template_variant_code ?? null,
    email_notification_enabled: d.email_notification_enabled,
    delete_mode: d.delete_mode,
    vat_source: d.vat_source ?? "FROM_ORDER",
    vat_calc_shipping: d.vat_calc_shipping ?? "DEFAULT",
    vat_calc_payment: d.vat_calc_payment ?? "DEFAULT",
    vat_rate_percent: d.vat_rate_percent ?? null,
    sale_date_source: d.sale_date_source,
    count_shipping_cost_always: d.count_shipping_cost_always,
    shipping_cost_name: d.shipping_cost_name,
    payment_term_default: d.payment_term_default,
    currency_source: d.currency_source,
    auto_currency_conversion: d.auto_currency_conversion,
    additional_fields_template: d.additional_fields_template,
    disable_customer_validation: d.disable_customer_validation,
    allow_empty_customer: d.allow_empty_customer,
    warehouse_effect: d.warehouse_effect,
    status_on_create_id: d.status_on_create_id,
    status_on_delete_id: d.status_on_delete_id,
    status_on_error_id: d.status_on_error_id,
    status_on_update_id: d.status_on_update_id,
    numbering_start: d.numbering_start,
    numbering_format: d.numbering_format,
    reset_each_period: d.reset_each_period,
    code: d.code ?? "",
    padding_length: d.padding_length ?? 6,
    yearly_reset: d.yearly_reset ?? false,
    monthly_reset: d.monthly_reset ?? false,
    is_default: d.is_default ?? false,
    is_active: d.is_active ?? true,
    notes: d.notes,
    collective_return_receipt: d.collective_return_receipt ?? false,
    company_name: d.company_name,
    company_street: d.company_street ?? null,
    company_house_number: d.company_house_number ?? null,
    company_apartment_number: d.company_apartment_number ?? null,
    company_address: d.company_address,
    company_city: d.company_city,
    company_zip: d.company_zip,
    company_country: d.company_country,
    company_nip: d.company_nip,
    company_regon: d.company_regon ?? null,
    company_bank: d.company_bank,
    company_iban: d.company_iban,
    company_bic: d.company_bic,
    company_email: d.company_email,
  };
}

export default function DocumentSeriesEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const [draft, setDraft] = useState<DocumentSeriesWritePayload>(createDefaultDocumentSeriesWrite());
  const [allSeries, setAllSeries] = useState<DocumentSeriesDto[]>([]);
  const [statuses, setStatuses] = useState<OrderStatusOption[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allowedSubtypes = useMemo(() => subtypesForDocumentSeriesType(draft.type), [draft.type]);
  const isWarehouse = draft.type === "WAREHOUSE";

  const numberingPreset = useMemo(
    () => numberingPresetFromDraft(draft),
    [draft.numbering_format, draft.reset_each_period, draft.monthly_reset, draft.yearly_reset],
  );

  useEffect(() => {
    setDraft((d) => {
      const subs = subtypesForDocumentSeriesType(d.type);
      if (!subs.includes(d.subtype)) {
        return { ...d, subtype: subs[0] };
      }
      if (d.type === "WAREHOUSE") {
        return applyWarehouseSubtypeDefaults(d, d.subtype) as DocumentSeriesWritePayload;
      }
      return d;
    });
  }, [draft.type]);

  const loadRefs = useCallback(async () => {
    if (warehouseId == null) return;
    try {
      const [series, st] = await Promise.all([
        listDocumentSeries(tenantId, warehouseId),
        listOrderStatuses(tenantId, warehouseId),
      ]);
      setAllSeries(series);
      setStatuses(st);
    } catch {
      setErr("Nie udało się wczytać list pomocniczych.");
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    if (isNew || !id || warehouseId == null) {
      if (isNew) {
        const ctx = readDocumentsSeriesListContext();
        const effectiveType = ctx.type ?? "SALE";
        const subs = subtypesForDocumentSeriesType(effectiveType);
        const sub =
          ctx.subtype && subs.includes(ctx.subtype as DocumentSeriesSubtype)
            ? ctx.subtype
            : subs[0];
        setDraft({ ...createDefaultDocumentSeriesWrite(), type: effectiveType, subtype: sub });
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    void getDocumentSeries(id, tenantId, warehouseId)
      .then((d) => {
        setDraft(dtoToWrite(d));
      })
      .catch(() => setErr("Nie znaleziono serii lub błąd wczytywania."))
      .finally(() => setLoading(false));
  }, [id, isNew, tenantId, warehouseId]);

  const correctionOptions = useMemo(
    () => allSeries.filter((s) => s.type === "CORRECTION" && s.id !== id),
    [allSeries, id],
  );

  const warehouseSeriesOptions = useMemo(
    () => allSeries.filter((s) => s.type === "WAREHOUSE" && s.subtype === "WZ" && s.id !== id),
    [allSeries, id],
  );

  const setField = <K extends keyof DocumentSeriesWritePayload>(key: K, value: DocumentSeriesWritePayload[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const loadFromTenantProfile = async () => {
    setLoadingProfile(true);
    setErr(null);
    try {
      const profile = await fetchCompanyProfile(tenantId);
      const block = companyProfileToSeriesCompanyBlock(profile);
      setDraft((d) => ({ ...d, ...block }));
    } catch {
      setErr("Nie udało się wczytać profilu firmy.");
    } finally {
      setLoadingProfile(false);
    }
  };

  const onSave = async () => {
    if (warehouseId == null) return;
    const nm = draft.name.trim();
    if (!nm) {
      setErr("Nazwa serii jest wymagana.");
      return;
    }
    if (!draft.type || !allowedSubtypes.includes(draft.subtype)) {
      setErr("Wybierz typ i dozwolony podtyp serii.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: DocumentSeriesWritePayload = {
        ...draft,
        name: nm,
        vat_source: (draft.vat_source ?? "FROM_ORDER") as VatSource | null,
      };
      if (isNew) {
        await createDocumentSeries(tenantId, warehouseId, body);
        rememberDocumentsSeriesListContext({ type: body.type, subtype: body.subtype });
        navigate("/documents/series", {
          replace: true,
          state: { documentSeriesCreatedToast: "Utworzono serię dokumentów." },
        });
      } else if (id) {
        await updateDocumentSeries(id, tenantId, warehouseId, body);
        rememberDocumentsSeriesListContext({ type: body.type, subtype: body.subtype });
        navigate("/documents/series");
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
          : "";
      setErr(msg || "Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  if (warehouseId == null) {
    return (
      <DocumentsSectionShell title="Seria dokumentów">
        <DocumentsEmptyState
          icon={Layers}
          title="Wybierz magazyn"
          description="Serie są powiązane z magazynem. Ustaw aktywny magazyn w nagłówku, aby dodać lub edytować serię."
        />
      </DocumentsSectionShell>
    );
  }

  if (loading) {
    return (
      <DocumentsSectionShell title={isNew ? "Nowa seria dokumentów" : "Edycja serii dokumentów"} subtitle="Wczytywanie danych z serwera…">
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-slate-500">
          <Loader2 className="h-9 w-9 shrink-0 animate-spin text-cyan-600" aria-hidden />
          <p className="text-sm font-medium">Ładowanie…</p>
        </div>
      </DocumentsSectionShell>
    );
  }

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

  const onNumberingPresetChange = (p: NumberingPresetUi) => {
    setDraft((d) => ({ ...d, ...applyNumberingPreset(p) }));
  };

  const printModeCustom = draft.print_template_id == null;
  const warehouseLabel = warehouse?.name?.trim() || `Magazyn #${warehouseId}`;

  if (isWarehouse) {
    return (
      <div className={`min-h-full w-full ${formStackClass} pb-28 pt-1`}>
        {err ? <FormError className="mt-0 text-sm">{err}</FormError> : null}
        <WarehouseDocumentSeriesForm
          draft={draft}
          setDraft={setDraft}
          warehouseLabel={warehouseLabel}
          tenantId={tenantId}
        />
        <FormActions sticky>
          <SecondaryButton type="button" className="hidden sm:inline-flex" onClick={() => navigate("/documents/series")}>
            Anuluj
          </SecondaryButton>
          <PrimaryButton type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Zapisywanie…" : "Zapisz"}
          </PrimaryButton>
        </FormActions>
      </div>
    );
  }

  return (
    <div className={`min-h-full w-full ${formStackClass} pb-28 pt-1`}>
      {err ? <FormError className="mt-0 text-sm">{err}</FormError> : null}

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className={formStackClass}>
          <p className={typography.h2}>Ustawienia serii</p>

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
              <FormField label="Kolor serii (panel / lista)" className="sm:col-span-2">
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
            </div>
          </FormSection>

          <FormSection title="Typ dokumentu">
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
          </FormSection>

          <FormSection title="Zachowanie dokumentu">
            <div className="grid gap-3">
              <FormField label="Seria korekty (powiązanie)">
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
                <FormField label="Seria dokumentu magazynowego (WZ)">
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
              ) : null}
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
              <div>
                <DocumentTemplateSelect
                  tenantId={tenantId}
                  kindCode={SUBTYPE_TO_KIND[draft.subtype] ?? null}
                  variantCode={draft.document_template_variant_code ?? "standard"}
                  value={draft.document_template_version_id ?? null}
                  onChange={(versionId) =>
                    setDraft((d) => ({ ...d, document_template_version_id: versionId }))
                  }
                />
              </div>
              <label className={`flex items-center gap-2 ${typography.body}`}>
                <Checkbox
                  checked={draft.warehouse_effect}
                  onChange={(e) => setField("warehouse_effect", e.target.checked)}
                  disabled={draft.type === "WAREHOUSE"}
                />
                Efekt magazynowy (ruchy stanów / WMS)
              </label>
              {draft.type === "WAREHOUSE" && draft.subtype === "Z_PZ" ? (
                <label className={`flex items-start gap-2 ${typography.body}`}>
                  <Checkbox
                    className="mt-0.5"
                    checked={draft.collective_return_receipt ?? false}
                    onChange={(e) => setField("collective_return_receipt", e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Zbiorczy dokument dla zwrotów</span>
                    <span className={`mt-0.5 block ${typography.caption}`}>
                      Opcjonalnie: dopisuj zwroty do jednego otwartego Z-PZ. Wyłączone = jeden zwrot → jeden Z-PZ
                      (zalecane do rozlokowania). Gdy zbiorczy: zamykasz dokument ręcznie po zapełnieniu nośnika.
                    </span>
                  </span>
                </label>
              ) : null}
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
                    <GhostButton
                      key={pct}
                      type="button"
                      density="compact"
                      onClick={() => setField("vat_rate_percent", pct)}
                    >
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
              <FormField label="VAT — opłaty / płatność (np. pobranie)" className="sm:col-span-2">
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

          <FormSection title="Koszty wysyłki i waluta">
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
              <FormField label="Domyślny termin płatności (tekst)">
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
                  onChange={(e) => setField("currency_source", e.target.value as DocumentSeriesWritePayload["currency_source"])}
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
              {draft.type === "WAREHOUSE" ? (
                <FormField label="Kod magazynu (opcjonalnie)">
                  <Input
                    density={FORM_FIELD_DENSITY}
                    focusTone="brand"
                    value={draft.code}
                    onChange={(e) => setField("code", e.target.value)}
                    placeholder="np. MAG1"
                  />
                </FormField>
              ) : null}
              <label className={`flex items-center gap-2 ${typography.body}`}>
                <Checkbox
                  checked={draft.is_default}
                  onChange={(e) => setField("is_default", e.target.checked)}
                />
                Domyślna seria dla typu dokumentu
              </label>
              <label className={`flex items-center gap-2 ${typography.body}`}>
                <Checkbox checked={draft.is_active} onChange={(e) => setField("is_active", e.target.checked)} />
                Aktywna
              </label>
              <label className={`flex items-center gap-2 ${typography.body}`}>
                <Checkbox
                  checked={draft.yearly_reset}
                  onChange={(e) => setField("yearly_reset", e.target.checked)}
                />
                Reset roczny licznika
              </label>
              <label className={`flex items-center gap-2 ${typography.body}`}>
                <Checkbox
                  checked={draft.monthly_reset}
                  onChange={(e) => setField("monthly_reset", e.target.checked)}
                />
                Reset miesięczny licznika
              </label>
              <FormField label="Przykład numeru" className="sm:col-span-2">
                <span className="block rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 font-mono text-sm text-slate-800">
                  {documentSeriesNumberingPreview(
                    draft.prefix || "FS",
                    numberingPreset,
                    draft.numbering_start,
                    draft.padding_length,
                  )}
                </span>
              </FormField>
              <details className="sm:col-span-2">
                <summary className={`cursor-pointer ${typography.label}`}>Rozszerzenie — własny format numeru</summary>
                <FormField
                  label="Szablon numeru"
                  className="mt-2"
                  helperText="W typowych przypadkach wystarczy wybrać sposób numeracji powyżej. Edycję szablonu zostaw wyłącznie wtedy, gdy wdrożenie tego wymaga."
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

          <FormSection
            title="Integracja ze statusem zamówienia"
            description="Powiązanie z listą statusów z panelu zamówienia — te same statusy co na liście zamówień i w module WMS."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {statusSelect("Status przy utworzeniu", "status_on_create_id", draft.status_on_create_id)}
              {statusSelect("Status przy usunięciu", "status_on_delete_id", draft.status_on_delete_id)}
              {statusSelect("Status przy błędzie", "status_on_error_id", draft.status_on_error_id)}
              {statusSelect("Status przy aktualizacji", "status_on_update_id", draft.status_on_update_id)}
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

        <div className={formStackClass}>
          <p className={typography.h2}>Dane firmy (na dokumencie)</p>

          <FormSection title="Adres i identyfikatory">
            <div className="mb-3 flex justify-end">
              <SecondaryButton
                type="button"
                density="compact"
                disabled={loadingProfile}
                onClick={() => void loadFromTenantProfile()}
              >
                {loadingProfile ? "Wczytywanie…" : "Wczytaj z profilu firmy"}
              </SecondaryButton>
            </div>
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
              <FormField label="Dodatkowa linia adresu (opcjonalnie)" className="sm:col-span-2">
                <Input
                  density={FORM_FIELD_DENSITY}
                  focusTone="brand"
                  value={draft.company_address ?? ""}
                  onChange={(e) => setField("company_address", e.target.value || null)}
                  placeholder="np. budynek B, recepcja"
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
        </div>
      </div>

      <FormActions sticky>
        <SecondaryButton
          type="button"
          className="hidden sm:inline-flex"
          onClick={() => navigate("/documents/series")}
        >
          Anuluj
        </SecondaryButton>
        <PrimaryButton type="button" disabled={saving} onClick={() => void onSave()}>
          {saving ? "Zapisywanie…" : "Zapisz"}
        </PrimaryButton>
      </FormActions>
    </div>
  );
}
