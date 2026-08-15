import { Boxes, ClipboardList, Factory, FileText, Fingerprint, LayoutTemplate, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import {
  getWmsProductionSettings,
  saveWmsProductionSettings,
  type ProductionForecastSettings,
  type ProductionReservationSettings,
  type ProductionTraceabilitySettings,
  type ProductionTerminalDisplaySettings,
  type ProductionTerminalRequiredSettings,
  type WmsProductionSettings,
} from "../../api/wmsProductionSettingsApi";
import { SettingInfoButton } from "./SettingInfoButton";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { DocumentTemplateScopeSection } from "./document-templates/components/DocumentTemplateScopeSection";
import { PRODUCTION_SCOPE_KINDS } from "./document-templates/documentTemplateScopeKinds";
import { ProductionConfiguratorPanel } from "../../modules/wmsSettings/production/ProductionConfiguratorPanel";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingControlInputClass,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "./wmsSettingsUi";

const SECTION_CONFIGURATOR = "wms-production-configurator";
const SECTION_FORECAST = "wms-production-forecast";
const SECTION_RESERVATION = "wms-production-reservation";
const SECTION_TRACEABILITY = "wms-production-traceability";
const DEFAULT_TRACEABILITY: ProductionTraceabilitySettings = {
  mode: "OFF",
  require_batch: false,
  require_serial: false,
  require_expiry: false,
};

const ALLOCATION_STRATEGIES: { key: ProductionReservationSettings["allocation_strategy"]; label: string }[] = [
  { key: "FIFO", label: "FIFO — najstarsze partie pierwsze" },
  { key: "FEFO", label: "FEFO — najkrótsza data ważności" },
  { key: "LIFO", label: "LIFO — najnowsze partie pierwsze" },
];

const FORECAST_STRATEGIES: { key: ProductionForecastSettings["strategy"]; label: string }[] = [
  { key: "PERIOD_AVERAGE", label: "Średnia z okresu" },
  { key: "WEIGHTED_AVERAGE", label: "Średnia ważona" },
  { key: "WEEKDAY_AVERAGE", label: "Średnia z tego samego dnia tygodnia" },
  { key: "MEDIAN", label: "Mediana sprzedaży" },
  { key: "MAX_DAILY", label: "Maksymalna sprzedaż dzienna" },
  { key: "AI_SMART", label: "Inteligentna (AI — w przygotowaniu)" },
];
const SECTION_DISPLAY = "wms-production-terminal-display";
const SECTION_REQUIRED = "wms-production-terminal-required";

type Props = {
  warehouseId: number | null;
};

function SectionCard({
  sectionId,
  title,
  summary,
  children,
}: {
  sectionId: string;
  title?: string;
  summary?: string;
  children: ReactNode;
}) {
  const meta = [
    { id: SECTION_CONFIGURATOR, icon: Factory, iconClassName: "bg-orange-50 text-orange-600" },
    { id: SECTION_FORECAST, icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
    { id: SECTION_RESERVATION, icon: Boxes, iconClassName: "bg-amber-50 text-amber-600" },
    { id: SECTION_TRACEABILITY, icon: Fingerprint, iconClassName: "bg-teal-50 text-teal-700" },
    { id: SECTION_REQUIRED, icon: ClipboardList, iconClassName: "bg-violet-50 text-violet-600" },
    { id: SECTION_DISPLAY, icon: LayoutTemplate, iconClassName: "bg-sky-50 text-sky-600" },
    { id: "wms-production-document-templates", icon: FileText, iconClassName: "bg-indigo-50 text-indigo-600" },
  ].find((s) => s.id === sectionId);
  return (
    <WmsSettingsSection
      id={sectionId}
      title={title}
      summary={summary}
      icon={meta?.icon}
      iconClassName={meta?.iconClassName}
    >
      {children}
    </WmsSettingsSection>
  );
}

function BoolRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return <WmsBoolSettingRow label={label} checked={checked} onChange={onChange} />;
}

const DISPLAY_FIELDS: { key: keyof ProductionTerminalDisplaySettings; label: string }[] = [
  { key: "show_product_image", label: "Zdjęcie produktu" },
  { key: "show_name", label: "Nazwa" },
  { key: "show_sku", label: "SKU" },
  { key: "show_ean", label: "EAN" },
  { key: "show_catalog_number", label: "Numer katalogowy" },
  { key: "show_source_location", label: "Lokalizacja źródłowa" },
  { key: "show_target_location", label: "Lokalizacja docelowa" },
  { key: "show_stock_level", label: "Stan magazynowy" },
  { key: "show_unit", label: "Jednostka" },
  { key: "show_barcode", label: "Kod kreskowy" },
];

const REQUIRED_FIELDS: { key: keyof ProductionTerminalRequiredSettings; label: string }[] = [
  { key: "require_operator", label: "Operator" },
  { key: "require_quality_control", label: "Kontrola jakości" },
];

export default function WmsProductionSettingsPanel({ warehouseId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<WmsProductionSettings | null>(null);
  const [draftDisplay, setDraftDisplay] = useState<ProductionTerminalDisplaySettings | null>(null);
  const [draftRequired, setDraftRequired] = useState<ProductionTerminalRequiredSettings | null>(null);
  const [draftForecast, setDraftForecast] = useState<ProductionForecastSettings | null>(null);
  const [draftReservation, setDraftReservation] = useState<ProductionReservationSettings | null>(null);
  const [draftTraceability, setDraftTraceability] = useState<ProductionTraceabilitySettings | null>(null);
  const [resolvedWh, setResolvedWh] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWmsProductionSettings({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
      });
      setSaved(data);
      setDraftDisplay(data.terminal_display);
      setDraftRequired(data.terminal_required);
      setDraftForecast(
        data.forecast ?? {
          strategy: "PERIOD_AVERAGE",
          sales_lookback_days: 30,
          auto_stock_replenishment: false,
          stock_replenishment_coverage_days: 7,
          stock_replenishment_interval: "daily",
        },
      );
      setDraftReservation(data.reservation ?? { allocation_strategy: "FEFO", allow_sales_locations: false });
      setDraftTraceability(data.traceability ?? DEFAULT_TRACEABILITY);
      setResolvedWh(data.warehouse_id);
    } catch {
      toast.error("Nie udało się wczytać ustawień produkcji WMS.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!saved || !draftDisplay || !draftRequired || !draftForecast || !draftReservation || !draftTraceability) return false;
    return (
      JSON.stringify(saved.terminal_display) !== JSON.stringify(draftDisplay) ||
      JSON.stringify(saved.terminal_required) !== JSON.stringify(draftRequired) ||
      JSON.stringify(saved.forecast) !== JSON.stringify(draftForecast) ||
      JSON.stringify(saved.reservation ?? { allocation_strategy: "FEFO", allow_sales_locations: false }) !== JSON.stringify(draftReservation) ||
      JSON.stringify(saved.traceability ?? DEFAULT_TRACEABILITY) !== JSON.stringify(draftTraceability)
    );
  }, [saved, draftDisplay, draftRequired, draftForecast, draftReservation, draftTraceability]);

  const save = async () => {
    if (!draftDisplay || !draftRequired || !draftForecast || !draftReservation || !draftTraceability || !dirty) return;
    setSaving(true);
    try {
      const data = await saveWmsProductionSettings({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId ?? resolvedWh ?? undefined,
        terminal_display: draftDisplay,
        terminal_required: draftRequired,
        forecast: draftForecast,
        reservation: draftReservation,
        traceability: draftTraceability,
      });
      setSaved(data);
      setDraftDisplay(data.terminal_display);
      setDraftRequired(data.terminal_required);
      setDraftForecast(data.forecast);
      setDraftReservation(data.reservation ?? { allocation_strategy: "FEFO", allow_sales_locations: false });
      setDraftTraceability(data.traceability ?? DEFAULT_TRACEABILITY);
      toast.success("Zapisano ustawienia produkcji.");
    } catch {
      toast.error("Zapis ustawień nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  const sections: WmsSettingsSectionConfig[] = [
    {
      id: SECTION_CONFIGURATOR,
      label: "Konfigurator produkcji",
      icon: Factory,
      iconClassName: "bg-orange-50 text-orange-600",
    },
    { id: SECTION_FORECAST, label: "Ogólne / prognoza", icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
    { id: SECTION_RESERVATION, label: "Rezerwacje", icon: Boxes, iconClassName: "bg-amber-50 text-amber-600" },
    { id: SECTION_TRACEABILITY, label: "Identyfikowalność", icon: Fingerprint, iconClassName: "bg-teal-50 text-teal-700" },
    {
      id: SECTION_REQUIRED,
      label: "Terminal / sposób pracy",
      icon: ClipboardList,
      iconClassName: "bg-violet-50 text-violet-600",
    },
    {
      id: SECTION_DISPLAY,
      label: "Wygląd terminala",
      icon: LayoutTemplate,
      iconClassName: "bg-sky-50 text-sky-600",
    },
    {
      id: "wms-production-document-templates",
      label: "Dokumenty",
      icon: FileText,
      iconClassName: "bg-indigo-50 text-indigo-600",
    },
  ];

  if (loading || !draftDisplay || !draftRequired || !draftForecast || !draftReservation || !draftTraceability) {
    return <p className="text-sm text-slate-500">Wczytywanie ustawień produkcji…</p>;
  }

  return (
    <WmsSettingsTabFrame
      title="Produkcja"
      description="Konfiguracja produkcji z zamówień, prognozowanie, rezerwacje i terminal WMS."
      sections={sections}
      asideLabel="Produkcja — nawigacja"
      dirty={dirty}
      saving={saving}
      onSave={() => void save()}
      onRestoreDefaults={() => {
        if (saved) {
          setDraftDisplay(saved.terminal_display);
          setDraftRequired(saved.terminal_required);
          setDraftForecast(saved.forecast);
          setDraftReservation(saved.reservation ?? { allocation_strategy: "FEFO", allow_sales_locations: false });
          setDraftTraceability(saved.traceability ?? DEFAULT_TRACEABILITY);
        }
      }}
      restoreDisabled={!dirty}
    >
      <SectionCard
        sectionId={SECTION_CONFIGURATOR}
        title="Konfigurator produkcji"
        summary="Statusy wejściowe, bufor produktu gotowego i sposób realizacji produkcji z zamówień."
      >
        <ProductionConfiguratorPanel warehouseId={warehouseId ?? resolvedWh} />
      </SectionCard>

      <SectionCard
        sectionId={SECTION_FORECAST}
        title="Ogólne / prognoza"
        summary="Strategia wyliczania dziennej sprzedaży i automatyczne uzupełnianie zapasu."
      >
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow label="Strategia prognozy">
            <select
              className={wmsSettingControlSelectClass}
              value={draftForecast.strategy}
              onChange={(e) =>
                setDraftForecast((prev) =>
                  prev ? { ...prev, strategy: e.target.value as ProductionForecastSettings["strategy"] } : prev,
                )
              }
            >
              {FORECAST_STRATEGIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </WmsControlSettingRow>
          <WmsControlSettingRow label="Okres historii sprzedaży (dni)">
            <input
              type="number"
              min={7}
              max={365}
              className={wmsSettingControlInputClass}
              value={draftForecast.sales_lookback_days}
              onChange={(e) =>
                setDraftForecast((prev) =>
                  prev ? { ...prev, sales_lookback_days: parseInt(e.target.value, 10) || 30 } : prev,
                )
              }
            />
          </WmsControlSettingRow>
          <WmsBoolSettingRow
            label="Automatyczne uzupełnianie zapasu"
            checked={Boolean(draftForecast.auto_stock_replenishment)}
            onChange={(v) =>
              setDraftForecast((prev) =>
                prev
                  ? {
                      ...prev,
                      auto_stock_replenishment: v,
                      stock_replenishment_coverage_days: prev.stock_replenishment_coverage_days ?? 7,
                      stock_replenishment_interval: prev.stock_replenishment_interval ?? "daily",
                    }
                  : prev,
              )
            }
          />
          {draftForecast.auto_stock_replenishment ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-slate-800">Docelowe pokrycie sprzedaży</p>
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500"
                    title="System oblicza zapas docelowy na podstawie średniej sprzedaży i wybranego okresu. Uwzględnia obecny stan oraz produkty będące już w produkcji."
                  >
                    i
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { days: 1 as const, label: "1 dzień" },
                      { days: 3 as const, label: "3 dni" },
                      { days: 7 as const, label: "7 dni" },
                      { days: 14 as const, label: "14 dni" },
                    ] as const
                  ).map((opt) => {
                    const active = (draftForecast.stock_replenishment_coverage_days ?? 7) === opt.days;
                    return (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() =>
                          setDraftForecast((prev) =>
                            prev ? { ...prev, stock_replenishment_coverage_days: opt.days } : prev,
                          )
                        }
                        className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                          active
                            ? "bg-orange-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-slate-800">Automatyczne przeliczanie</p>
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500"
                    title="System okresowo analizuje sprzedaż, aktualny stan oraz produkcję w toku i automatycznie tworzy zlecenia uzupełniające. Produkcja wynikająca z zamówień klientów ma zawsze pierwszeństwo."
                  >
                    i
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: "hourly" as const, label: "Co godzinę" },
                      { value: "every_3_hours" as const, label: "Co 3 godziny" },
                      { value: "every_6_hours" as const, label: "Co 6 godzin" },
                      { value: "daily" as const, label: "Raz dziennie" },
                    ] as const
                  ).map((opt) => {
                    const active = (draftForecast.stock_replenishment_interval ?? "daily") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setDraftForecast((prev) =>
                            prev ? { ...prev, stock_replenishment_interval: opt.value } : prev,
                          )
                        }
                        className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                          active
                            ? "bg-orange-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  System okresowo analizuje sprzedaż, aktualny stan oraz produkcję w toku i automatycznie
                  tworzy zlecenia uzupełniające. Produkcja wynikająca z zamówień klientów ma zawsze
                  pierwszeństwo.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        sectionId={SECTION_TRACEABILITY}
        title="Identyfikowalność"
        summary="Niezależne wymagania identyfikacji materiałów i wyrobów w procesie produkcji."
      >
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow label="Tryb identyfikowalności">
            <div className="flex flex-wrap items-center gap-5">
              {([
                ["OFF", "Wyłączona"],
                ["CONFIGURED", "Włączona"],
              ] as const).map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="radio"
                    name="production-traceability-mode"
                    checked={draftTraceability.mode === value}
                    onChange={() => setDraftTraceability((prev) => prev ? { ...prev, mode: value } : prev)}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  {label}
                </label>
              ))}
              <SettingInfoButton
                title="Identyfikowalność produkcji"
                description="Te wymagania dotyczą wyłącznie produkcji i są niezależne od ustawień Przyjęcia. Partia (dokument) ≠ Numer partii (LOT)."
              />
            </div>
          </WmsControlSettingRow>
          {draftTraceability.mode === "CONFIGURED" ? (
            <>
              <WmsBoolSettingRow
                label="Numer partii (LOT)"
                checked={draftTraceability.require_batch}
                onChange={(v) => setDraftTraceability((prev) => prev ? { ...prev, require_batch: v } : prev)}
              />
              <WmsBoolSettingRow
                label="Numer seryjny (SN)"
                checked={draftTraceability.require_serial}
                onChange={(v) => setDraftTraceability((prev) => prev ? { ...prev, require_serial: v } : prev)}
              />
              <WmsBoolSettingRow
                label="Data ważności"
                checked={draftTraceability.require_expiry}
                onChange={(v) => setDraftTraceability((prev) => prev ? { ...prev, require_expiry: v } : prev)}
              />
            </>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        sectionId={SECTION_RESERVATION}
        title="Rezerwacje"
        summary="Strategia automatycznej alokacji lokalizacji przy rezerwacji surowców produkcji."
      >
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow label="Strategia alokacji">
            <select
              className={wmsSettingControlSelectClass}
              value={draftReservation.allocation_strategy}
              onChange={(e) =>
                setDraftReservation((prev) =>
                  prev
                    ? {
                        ...prev,
                        allocation_strategy: e.target.value as ProductionReservationSettings["allocation_strategy"],
                      }
                    : prev,
                )
              }
            >
              {ALLOCATION_STRATEGIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </WmsControlSettingRow>
          <WmsBoolSettingRow
            label="Dopuszczaj lokalizacje sprzedażowe (sklep, ekspozycja, POS) przy rezerwacji materiałów."
            checked={draftReservation.allow_sales_locations}
            onChange={(v) =>
              setDraftReservation((prev) => (prev ? { ...prev, allow_sales_locations: v } : prev))
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        sectionId={SECTION_DISPLAY}
        title="Wygląd terminala"
        summary="Elementy widoczne operatorowi w terminalu produkcyjnym WMS."
      >
        <div className={wmsSettingsRowsStackClass}>
          {DISPLAY_FIELDS.map(({ key, label }) => (
            <BoolRow
              key={key}
              label={label}
              checked={draftDisplay[key]}
              onChange={(v) => setDraftDisplay((prev) => (prev ? { ...prev, [key]: v } : prev))}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        sectionId={SECTION_REQUIRED}
        title="Terminal / sposób pracy"
        summary="Walidacja i pola wymagane przy zakończeniu produkcji w terminalu WMS."
      >
        <div className={wmsSettingsRowsStackClass}>
          {REQUIRED_FIELDS.map(({ key, label }) => (
            <BoolRow
              key={key}
              label={label}
              checked={draftRequired[key]}
              onChange={(v) => setDraftRequired((prev) => (prev ? { ...prev, [key]: v } : prev))}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        sectionId="wms-production-document-templates"
        title="Dokumenty"
        summary="Szablony wydruków powiązane z produkcją."
      >
        <DocumentTemplateScopeSection
          tenantId={DAMAGE_TENANT_ID}
          scopeType="PRODUCTION"
          scopeId={warehouseId ?? DAMAGE_TENANT_ID}
          title="Szablony wydruków produkcji"
          kinds={PRODUCTION_SCOPE_KINDS}
        />
      </SectionCard>
    </WmsSettingsTabFrame>
  );
}
