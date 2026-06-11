import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
    collective_return_receipt: d.collective_return_receipt ?? (d.subtype === "Z_PZ" ? true : false),
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

const inpSm = "mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900";
const lab = "block text-xs font-medium text-slate-600";
const card = "rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5";
const hSection = "text-xs font-bold uppercase tracking-wide text-slate-500";
const colTitle = "text-sm font-bold text-slate-900";

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

  const numberingPreset = useMemo(() => numberingPresetFromDraft(draft), [draft.numbering_format, draft.reset_each_period]);

  useEffect(() => {
    setDraft((d) => {
      const subs = subtypesForDocumentSeriesType(d.type);
      return subs.includes(d.subtype) ? d : { ...d, subtype: subs[0] };
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
      <DocumentsSectionShell title="Seria dokumentów" subtitle="Konfiguracja prefiksów, VAT i szablonów druku dla wybranego magazynu.">
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
    <label className={lab}>
      {label}
      <select
        className={inpSm}
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
      </select>
    </label>
  );

  const onNumberingPresetChange = (p: NumberingPresetUi) => {
    setDraft((d) => ({ ...d, ...applyNumberingPreset(p) }));
  };

  const printModeCustom = draft.print_template_id == null;

  return (
    <div className="min-h-full w-full space-y-4 pb-28 pt-1">
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="space-y-5">
          <p className={colTitle}>Ustawienia serii</p>

          <div className={card}>
            <h3 className={hSection}>Podstawowe</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={`${lab} sm:col-span-2`}>
                Nazwa serii *
                <input className={inpSm} value={draft.name} onChange={(e) => setField("name", e.target.value)} />
              </label>
              <label className={lab}>
                Prefiks
                <input className={inpSm} value={draft.prefix} onChange={(e) => setField("prefix", e.target.value)} />
              </label>
              <label className={lab}>
                Sufiks
                <input className={inpSm} value={draft.suffix} onChange={(e) => setField("suffix", e.target.value)} />
              </label>
              <label className={`${lab} sm:col-span-2`}>
                Kolor serii (panel / lista)
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    aria-label="Kolor"
                    className="h-9 w-14 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                    value={/^#[0-9A-Fa-f]{6}$/.test(draft.color) ? draft.color : "#64748b"}
                    onChange={(e) => setField("color", e.target.value)}
                  />
                  <input
                    className={`${inpSm} max-w-[10rem]`}
                    value={draft.color}
                    onChange={(e) => setField("color", e.target.value)}
                    placeholder="#RRGGBB"
                  />
                </div>
              </label>
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>Typ dokumentu</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={lab}>
                Typ *
                <select
                  className={inpSm}
                  value={draft.type}
                  onChange={(e) => setField("type", e.target.value as DocumentSeriesType)}
                >
                  <option value="SALE">{documentSeriesTypeLabelPl("SALE")}</option>
                  <option value="WAREHOUSE">{documentSeriesTypeLabelPl("WAREHOUSE")}</option>
                  <option value="CORRECTION">{documentSeriesTypeLabelPl("CORRECTION")}</option>
                </select>
              </label>
              <label className={lab}>
                Podtyp *
                <select
                  className={inpSm}
                  value={draft.subtype}
                  onChange={(e) => setField("subtype", e.target.value as DocumentSeriesSubtype)}
                >
                  {allowedSubtypes.map((s) => (
                    <option key={s} value={s}>
                      {documentSeriesSubtypeLabelPl(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>Zachowanie dokumentu</h3>
            <div className="mt-3 grid gap-3">
              <label className={lab}>
                Seria korekty (powiązanie)
                <select
                  className={inpSm}
                  value={draft.correction_series_id ?? ""}
                  onChange={(e) => setField("correction_series_id", e.target.value || null)}
                >
                  <option value="">— brak —</option>
                  {correctionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {draft.type === "SALE" ? (
                <label className={lab}>
                  Seria dokumentu magazynowego (WZ)
                  <select
                    className={inpSm}
                    value={draft.warehouse_document_series_id ?? ""}
                    onChange={(e) => setField("warehouse_document_series_id", e.target.value || null)}
                  >
                    <option value="">Domyślna seria WZ</option>
                    {warehouseSeriesOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={lab}>
                Szablon druku
                <select
                  className={inpSm}
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
                </select>
              </label>
              <label className={lab}>
                Własna ścieżka lub identyfikator szablonu
                <input
                  className={inpSm}
                  disabled={!printModeCustom}
                  value={draft.print_template}
                  onChange={(e) => setField("print_template", e.target.value)}
                  placeholder="np. templates/invoice_v2.html"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.warehouse_effect}
                  onChange={(e) => setField("warehouse_effect", e.target.checked)}
                />
                Efekt magazynowy (ruchy stanów / WMS)
              </label>
              {draft.type === "WAREHOUSE" && draft.subtype === "Z_PZ" ? (
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={draft.collective_return_receipt ?? true}
                    onChange={(e) => setField("collective_return_receipt", e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Zbiorczy dokument dla zwrotów</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Wszystkie produkty przyjęte ze zwrotów trafiają do jednego Z-PZ na dzień zamiast osobnego
                      dokumentu dla każdego RMZ.
                    </span>
                  </span>
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.email_notification_enabled}
                  onChange={(e) => setField("email_notification_enabled", e.target.checked)}
                />
                Wysyłaj e-mail po wystawieniu dokumentu
              </label>
              <label className={lab}>
                Tryb usuwania dokumentu
                <select
                  className={inpSm}
                  value={draft.delete_mode}
                  onChange={(e) => setField("delete_mode", e.target.value as DocumentSeriesWritePayload["delete_mode"])}
                >
                  <option value="ASK">Pytaj przed usunięciem</option>
                  <option value="ALWAYS_DELETE">Zawsze usuwaj</option>
                </select>
              </label>
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>VAT</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={lab}>
                Źródło VAT *
                <select
                  className={inpSm}
                  value={draft.vat_source ?? "FROM_ORDER"}
                  onChange={(e) => setField("vat_source", e.target.value as VatSource)}
                >
                  <option value="FROM_ORDER">Z zamówienia</option>
                  <option value="FROM_LINES">Z linii</option>
                  <option value="MANUAL">Ręcznie</option>
                  <option value="FIXED">Stała stawka z serii</option>
                </select>
              </label>
              <label className={lab}>
                Stawka VAT domyślna
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {[23, 8, 5, 0].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      onClick={() => setField("vat_rate_percent", pct)}
                    >
                      {pct}%
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    className={`${inpSm} max-w-[6rem]`}
                    value={draft.vat_rate_percent ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") setField("vat_rate_percent", null);
                      else setField("vat_rate_percent", Math.min(100, Math.max(0, parseInt(v, 10) || 0)));
                    }}
                    placeholder="np. 23"
                  />
                  <span className="text-sm text-slate-600">%</span>
                </div>
              </label>
              <label className={lab}>
                VAT — koszt wysyłki
                <select
                  className={inpSm}
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
                </select>
              </label>
              <label className={`${lab} sm:col-span-2`}>
                VAT — opłaty / płatność (np. pobranie)
                <select
                  className={inpSm}
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
                </select>
              </label>
              <label className={`${lab} sm:col-span-2`}>
                Źródło daty sprzedaży
                <select
                  className={inpSm}
                  value={draft.sale_date_source}
                  onChange={(e) =>
                    setField("sale_date_source", e.target.value as DocumentSeriesWritePayload["sale_date_source"])
                  }
                >
                  <option value="ORDER_DATE">Data zamówienia</option>
                  <option value="DOCUMENT_DATE">Data dokumentu</option>
                  <option value="DELIVERY_DATE">Data dostawy</option>
                  <option value="MANUAL">Ręcznie</option>
                </select>
              </label>
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>Koszty wysyłki i waluta</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.count_shipping_cost_always}
                  onChange={(e) => setField("count_shipping_cost_always", e.target.checked)}
                />
                Zawsze uwzględniaj koszt wysyłki w wartości dokumentu
              </label>
              <label className={`${lab} sm:col-span-2`}>
                Nazwa pozycji kosztu wysyłki
                <input className={inpSm} value={draft.shipping_cost_name} onChange={(e) => setField("shipping_cost_name", e.target.value)} />
              </label>
              <label className={lab}>
                Domyślny termin płatności (tekst)
                <input className={inpSm} value={draft.payment_term_default} onChange={(e) => setField("payment_term_default", e.target.value)} />
              </label>
              <label className={lab}>
                Źródło waluty
                <select
                  className={inpSm}
                  value={draft.currency_source}
                  onChange={(e) => setField("currency_source", e.target.value as DocumentSeriesWritePayload["currency_source"])}
                >
                  <option value="ORDER">Zamówienie</option>
                  <option value="SERIES">Seria</option>
                  <option value="MANUAL">Ręcznie</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.auto_currency_conversion}
                  onChange={(e) => setField("auto_currency_conversion", e.target.checked)}
                />
                Automatyczna konwersja walut
              </label>
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>Numeracja</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={lab}>
                Sposób numeracji
                <select
                  className={inpSm}
                  value={numberingPreset}
                  onChange={(e) => onNumberingPresetChange(e.target.value as NumberingPresetUi)}
                >
                  <option value="continuous">{numberingPresetLabelPl("continuous")}</option>
                  <option value="monthly">{numberingPresetLabelPl("monthly")}</option>
                  <option value="yearly">{numberingPresetLabelPl("yearly")}</option>
                </select>
              </label>
              <label className={lab}>
                Start numeracji
                <input
                  type="number"
                  min={1}
                  className={inpSm}
                  value={draft.numbering_start}
                  onChange={(e) => setField("numbering_start", Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </label>
              <label className={lab}>
                Długość numeru (padding)
                <input
                  type="number"
                  min={1}
                  max={12}
                  className={inpSm}
                  value={draft.padding_length}
                  onChange={(e) =>
                    setField("padding_length", Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 6)))
                  }
                />
              </label>
              {draft.type === "WAREHOUSE" ? (
                <label className={lab}>
                  Kod magazynu (opcjonalnie)
                  <input
                    className={inpSm}
                    value={draft.code}
                    onChange={(e) => setField("code", e.target.value)}
                    placeholder="np. MAG1"
                  />
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.is_default}
                  onChange={(e) => setField("is_default", e.target.checked)}
                />
                Domyślna seria dla typu dokumentu
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setField("is_active", e.target.checked)}
                />
                Aktywna
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.yearly_reset}
                  onChange={(e) => setField("yearly_reset", e.target.checked)}
                />
                Reset roczny licznika
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.monthly_reset}
                  onChange={(e) => setField("monthly_reset", e.target.checked)}
                />
                Reset miesięczny licznika
              </label>
              <p className={`${lab} sm:col-span-2`}>
                Przykład numeru
                <span className="mt-1 block rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 font-mono text-sm text-slate-800">
                  {documentSeriesNumberingPreview(
                    draft.prefix || "FS",
                    numberingPreset,
                    draft.numbering_start,
                    draft.padding_length,
                  )}
                </span>
              </p>
              <details className="sm:col-span-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-600">Rozszerzenie — własny format numeru</summary>
                <label className={`${lab} mt-2`}>
                  Szablon numeru
                  <input className={inpSm} value={draft.numbering_format} onChange={(e) => setField("numbering_format", e.target.value)} />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  W typowych przypadkach wystarczy wybrać sposób numeracji powyżej. Edycję szablonu zostaw wyłącznie wtedy, gdy wdrożenie tego wymaga.
                </p>
              </details>
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>Integracja ze statusem zamówienia</h3>
            <p className="mb-2 text-xs text-slate-500">
              Powiązanie z listą statusów z panelu zamówienia — te same statusy co na liście zamówień i w module WMS.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {statusSelect("Status przy utworzeniu", "status_on_create_id", draft.status_on_create_id)}
              {statusSelect("Status przy usunięciu", "status_on_delete_id", draft.status_on_delete_id)}
              {statusSelect("Status przy błędzie", "status_on_error_id", draft.status_on_error_id)}
              {statusSelect("Status przy aktualizacji", "status_on_update_id", draft.status_on_update_id)}
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>Walidacja klienta</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.disable_customer_validation}
                  onChange={(e) => setField("disable_customer_validation", e.target.checked)}
                />
                Wyłącz walidację danych klienta
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.allow_empty_customer}
                  onChange={(e) => setField("allow_empty_customer", e.target.checked)}
                />
                Dopuszczaj pustego klienta
              </label>
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>Szablon pól dodatkowych (JSON)</h3>
            <textarea
              className={inpSm}
              rows={3}
              value={draft.additional_fields_template ?? ""}
              onChange={(e) => setField("additional_fields_template", e.target.value || null)}
              placeholder="Opcjonalny JSON pól dodatkowych na dokumencie"
            />
          </div>

          <div className={card}>
            <h3 className={hSection}>Notatki wewnętrzne</h3>
            <textarea className={inpSm} rows={3} value={draft.notes ?? ""} onChange={(e) => setField("notes", e.target.value || null)} />
          </div>
        </div>

        <div className="space-y-5">
          <p className={colTitle}>Dane firmy (na dokumencie)</p>

          <div className={card}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className={hSection}>Adres i identyfikatory</h3>
              <button
                type="button"
                disabled={loadingProfile}
                onClick={() => void loadFromTenantProfile()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingProfile ? "Wczytywanie…" : "Wczytaj z profilu firmy"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${lab} sm:col-span-2`}>
                Nazwa firmy
                <input className={inpSm} value={draft.company_name ?? ""} onChange={(e) => setField("company_name", e.target.value || null)} />
              </label>
              <label className={`${lab} sm:col-span-2`}>
                Ulica
                <input className={inpSm} value={draft.company_street ?? ""} onChange={(e) => setField("company_street", e.target.value || null)} />
              </label>
              <label className={lab}>
                Nr domu
                <input
                  className={inpSm}
                  value={draft.company_house_number ?? ""}
                  onChange={(e) => setField("company_house_number", e.target.value || null)}
                />
              </label>
              <label className={lab}>
                Nr lokalu
                <input
                  className={inpSm}
                  value={draft.company_apartment_number ?? ""}
                  onChange={(e) => setField("company_apartment_number", e.target.value || null)}
                />
              </label>
              <label className={lab}>
                Kod pocztowy
                <input className={inpSm} value={draft.company_zip ?? ""} onChange={(e) => setField("company_zip", e.target.value || null)} />
              </label>
              <label className={lab}>
                Miasto
                <input className={inpSm} value={draft.company_city ?? ""} onChange={(e) => setField("company_city", e.target.value || null)} />
              </label>
              <label className={`${lab} sm:col-span-2`}>
                Kraj
                <input className={inpSm} value={draft.company_country ?? ""} onChange={(e) => setField("company_country", e.target.value || null)} />
              </label>
              <label className={lab}>
                NIP
                <input className={inpSm} value={draft.company_nip ?? ""} onChange={(e) => setField("company_nip", e.target.value || null)} />
              </label>
              <label className={lab}>
                REGON
                <input className={inpSm} value={draft.company_regon ?? ""} onChange={(e) => setField("company_regon", e.target.value || null)} />
              </label>
              <label className={`${lab} sm:col-span-2`}>
                Dodatkowa linia adresu (opcjonalnie)
                <input
                  className={inpSm}
                  value={draft.company_address ?? ""}
                  onChange={(e) => setField("company_address", e.target.value || null)}
                  placeholder="np. budynek B, recepcja"
                />
              </label>
            </div>
          </div>

          <div className={card}>
            <h3 className={hSection}>Bank i kontakt</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={`${lab} sm:col-span-2`}>
                Nazwa banku
                <input className={inpSm} value={draft.company_bank ?? ""} onChange={(e) => setField("company_bank", e.target.value || null)} />
              </label>
              <label className={lab}>
                IBAN
                <input className={inpSm} value={draft.company_iban ?? ""} onChange={(e) => setField("company_iban", e.target.value || null)} />
              </label>
              <label className={lab}>
                BIC / SWIFT
                <input className={inpSm} value={draft.company_bic ?? ""} onChange={(e) => setField("company_bic", e.target.value || null)} />
              </label>
              <label className={`${lab} sm:col-span-2`}>
                E-mail (na dokumencie)
                <input className={inpSm} value={draft.company_email ?? ""} onChange={(e) => setField("company_email", e.target.value || null)} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-end p-4 sm:p-6">
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:gap-3 sm:p-3">
          <Link
            to="/documents/series"
            className="hidden rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:inline-block"
          >
            Anuluj
          </Link>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
