import { Boxes, Factory, FileText, Fingerprint, LayoutTemplate, Settings2 } from "lucide-react";
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
  AllocationStrategySelect,
  ForecastStrategySelect,
} from "../../modules/wmsSettings/production/HelpfulStrategySelect";
import { productionSettingsHelp } from "../../modules/wmsSettings/production/productionSettingsHelp";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingControlInputClass,
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

const SECTION_DISPLAY = "wms-production-terminal-display";

type Props = {
  warehouseId: number | null;
};

function SectionCard({
  sectionId,
  title,
  children,
}: {
  sectionId: string;
  title?: string;
  children: ReactNode;
}) {
  const meta = [
    { id: SECTION_CONFIGURATOR, icon: Factory, iconClassName: "bg-orange-50 text-orange-600" },
    { id: SECTION_FORECAST, icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
    { id: SECTION_RESERVATION, icon: Boxes, iconClassName: "bg-amber-50 text-amber-600" },
    { id: SECTION_TRACEABILITY, icon: Fingerprint, iconClassName: "bg-teal-50 text-teal-700" },
    { id: SECTION_DISPLAY, icon: LayoutTemplate, iconClassName: "bg-sky-50 text-sky-600" },
    { id: "wms-production-document-templates", icon: FileText, iconClassName: "bg-indigo-50 text-indigo-600" },
  ].find((s) => s.id === sectionId);
  return (
    <WmsSettingsSection id={sectionId} title={title} icon={meta?.icon} iconClassName={meta?.iconClassName}>
      {children}
    </WmsSettingsSection>
  );
}

const DISPLAY_FIELDS: {
  key: keyof ProductionTerminalDisplaySettings;
  label: string;
  helpKey: keyof typeof productionSettingsHelp;
}[] = [
  { key: "show_product_image", label: "Zdjęcie", helpKey: "show_product_image" },
  { key: "show_name", label: "Nazwa", helpKey: "show_name" },
  { key: "show_sku", label: "SKU", helpKey: "show_sku" },
  { key: "show_ean", label: "EAN", helpKey: "show_ean" },
  { key: "show_catalog_number", label: "Numer katalogowy", helpKey: "show_catalog_number" },
  { key: "show_source_location", label: "Lokalizacja źródłowa", helpKey: "show_source_location" },
  { key: "show_target_location", label: "Lokalizacja docelowa", helpKey: "show_target_location" },
  { key: "show_stock_level", label: "Stan magazynowy", helpKey: "show_stock_level" },
  { key: "show_unit", label: "Jednostka", helpKey: "show_unit" },
  { key: "show_barcode", label: "Kod kreskowy", helpKey: "show_barcode" },
];

const PRODUCTION_DOCUMENT_KINDS = PRODUCTION_SCOPE_KINDS.map((k) => ({
  ...k,
  info:
    k.kindCode === "production_card"
      ? productionSettingsHelp.productionCardTemplate
      : productionSettingsHelp.materialPickListTemplate,
}));

function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              active ? "bg-orange-500 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

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
    if (!saved || !draftDisplay || !draftRequired || !draftForecast || !draftReservation || !draftTraceability) {
      return false;
    }
    return (
      JSON.stringify(saved.terminal_display) !== JSON.stringify(draftDisplay) ||
      JSON.stringify(saved.terminal_required) !== JSON.stringify(draftRequired) ||
      JSON.stringify(saved.forecast) !== JSON.stringify(draftForecast) ||
      JSON.stringify(saved.reservation ?? { allocation_strategy: "FEFO", allow_sales_locations: false }) !==
        JSON.stringify(draftReservation) ||
      JSON.stringify(saved.traceability ?? DEFAULT_TRACEABILITY) !== JSON.stringify(draftTraceability)
    );
  }, [saved, draftDisplay, draftRequired, draftForecast, draftReservation, draftTraceability]);

  const save = async () => {
    if (!draftDisplay || !draftRequired || !draftForecast || !draftReservation || !draftTraceability || !dirty) {
      return;
    }
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
    { id: SECTION_FORECAST, label: "Prognozowanie i zapas", icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
    { id: SECTION_RESERVATION, label: "Rezerwacje", icon: Boxes, iconClassName: "bg-amber-50 text-amber-600" },
    { id: SECTION_TRACEABILITY, label: "Identyfikowalność", icon: Fingerprint, iconClassName: "bg-teal-50 text-teal-700" },
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
      <SectionCard sectionId={SECTION_CONFIGURATOR} title="Konfigurator produkcji">
        <ProductionConfiguratorPanel warehouseId={warehouseId ?? resolvedWh} />
      </SectionCard>

      <SectionCard sectionId={SECTION_FORECAST} title="Prognozowanie i zapas">
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow
            label="Strategia prognozy"
            hint={productionSettingsHelp.forecastStrategy.description}
            infoTitle={productionSettingsHelp.forecastStrategy.title}
          >
            <ForecastStrategySelect
              value={draftForecast.strategy}
              onChange={(strategy) => setDraftForecast((prev) => (prev ? { ...prev, strategy } : prev))}
            />
          </WmsControlSettingRow>
          <WmsControlSettingRow
            label="Okres historii sprzedaży"
            hint={productionSettingsHelp.salesLookbackDays.description}
            infoTitle={productionSettingsHelp.salesLookbackDays.title}
          >
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
            hint={productionSettingsHelp.autoStockReplenishment.description}
            info={
              <SettingInfoButton
                title={productionSettingsHelp.autoStockReplenishment.title}
                description={productionSettingsHelp.autoStockReplenishment.description}
                tip={productionSettingsHelp.autoStockReplenishment.tip}
              />
            }
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
            <>
              <WmsControlSettingRow
                label="Docelowe pokrycie"
                hint={productionSettingsHelp.coverageDays.description}
                infoTitle={productionSettingsHelp.coverageDays.title}
              >
                <ChipGroup
                  value={(draftForecast.stock_replenishment_coverage_days ?? 7) as 1 | 3 | 7 | 14}
                  onChange={(days) =>
                    setDraftForecast((prev) =>
                      prev ? { ...prev, stock_replenishment_coverage_days: days } : prev,
                    )
                  }
                  options={[
                    { value: 1 as const, label: "1 dzień" },
                    { value: 3 as const, label: "3 dni" },
                    { value: 7 as const, label: "7 dni" },
                    { value: 14 as const, label: "14 dni" },
                  ]}
                />
              </WmsControlSettingRow>
              <WmsControlSettingRow
                label="Automatyczne przeliczanie"
                hint={productionSettingsHelp.replenishmentInterval.description}
                infoTitle={productionSettingsHelp.replenishmentInterval.title}
              >
                <ChipGroup
                  value={(draftForecast.stock_replenishment_interval ?? "daily") as NonNullable<
                    ProductionForecastSettings["stock_replenishment_interval"]
                  >}
                  onChange={(interval) =>
                    setDraftForecast((prev) =>
                      prev ? { ...prev, stock_replenishment_interval: interval } : prev,
                    )
                  }
                  options={[
                    { value: "hourly" as const, label: "Co godzinę" },
                    { value: "every_3_hours" as const, label: "Co 3 godziny" },
                    { value: "every_6_hours" as const, label: "Co 6 godzin" },
                    { value: "daily" as const, label: "Raz dziennie" },
                  ]}
                />
              </WmsControlSettingRow>
            </>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard sectionId={SECTION_TRACEABILITY} title="Identyfikowalność">
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow
            label="Identyfikowalność"
            info={
              <SettingInfoButton
                title={productionSettingsHelp.traceabilityMode.title}
                description={productionSettingsHelp.traceabilityMode.description}
                tip={productionSettingsHelp.traceabilityMode.tip}
              />
            }
          >
            <div className="flex flex-wrap items-center gap-5">
              {(
                [
                  ["OFF", "Wyłączona"],
                  ["CONFIGURED", "Włączona"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="radio"
                    name="production-traceability-mode"
                    checked={draftTraceability.mode === value}
                    onChange={() => setDraftTraceability((prev) => (prev ? { ...prev, mode: value } : prev))}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </WmsControlSettingRow>
          {draftTraceability.mode === "CONFIGURED" ? (
            <>
              <WmsBoolSettingRow
                label="Numer partii (LOT)"
                checked={draftTraceability.require_batch}
                hint={productionSettingsHelp.requireBatch.description}
                infoTitle={productionSettingsHelp.requireBatch.title}
                onChange={(v) => setDraftTraceability((prev) => (prev ? { ...prev, require_batch: v } : prev))}
              />
              <WmsBoolSettingRow
                label="Numer seryjny (SN)"
                checked={draftTraceability.require_serial}
                hint={productionSettingsHelp.requireSerial.description}
                infoTitle={productionSettingsHelp.requireSerial.title}
                onChange={(v) => setDraftTraceability((prev) => (prev ? { ...prev, require_serial: v } : prev))}
              />
              <WmsBoolSettingRow
                label="Data ważności"
                checked={draftTraceability.require_expiry}
                hint={productionSettingsHelp.requireExpiry.description}
                infoTitle={productionSettingsHelp.requireExpiry.title}
                onChange={(v) => setDraftTraceability((prev) => (prev ? { ...prev, require_expiry: v } : prev))}
              />
            </>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard sectionId={SECTION_RESERVATION} title="Rezerwacje">
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow
            label="Strategia alokacji"
            hint={productionSettingsHelp.allocationStrategy.description}
            infoTitle={productionSettingsHelp.allocationStrategy.title}
          >
            <AllocationStrategySelect
              value={draftReservation.allocation_strategy}
              onChange={(allocation_strategy) =>
                setDraftReservation((prev) => (prev ? { ...prev, allocation_strategy } : prev))
              }
            />
          </WmsControlSettingRow>
          <WmsBoolSettingRow
            label="Uwzględniaj lokalizacje sprzedażowe"
            checked={draftReservation.allow_sales_locations}
            hint={productionSettingsHelp.allowSalesLocations.description}
            infoTitle={productionSettingsHelp.allowSalesLocations.title}
            onChange={(v) =>
              setDraftReservation((prev) => (prev ? { ...prev, allow_sales_locations: v } : prev))
            }
          />
        </div>
      </SectionCard>

      <SectionCard sectionId={SECTION_DISPLAY} title="Wygląd terminala">
        <div className={wmsSettingsRowsStackClass}>
          {DISPLAY_FIELDS.map(({ key, label, helpKey }) => {
            const help = productionSettingsHelp[helpKey] as {
              title: string;
              description: ReactNode;
            };
            return (
              <WmsBoolSettingRow
                key={key}
                label={label}
                checked={draftDisplay[key]}
                hint={help.description}
                infoTitle={help.title}
                onChange={(v) => setDraftDisplay((prev) => (prev ? { ...prev, [key]: v } : prev))}
              />
            );
          })}
        </div>
      </SectionCard>

      <SectionCard sectionId="wms-production-document-templates" title="Dokumenty">
        <DocumentTemplateScopeSection
          tenantId={DAMAGE_TENANT_ID}
          scopeType="PRODUCTION"
          scopeId={warehouseId ?? DAMAGE_TENANT_ID}
          title=""
          description={null}
          kinds={PRODUCTION_DOCUMENT_KINDS}
        />
      </SectionCard>
    </WmsSettingsTabFrame>
  );
}
