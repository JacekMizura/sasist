import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import api from "../../api/axios";
import { getWmsPackingSettings, saveWmsPackingSettings } from "../../api/wmsPackingSettingsApi";
import {
  filterSaleSeriesForPacking,
  listDocumentSeries,
  type DocumentSeriesDto,
} from "../../api/documentSeriesApi";
import { listOrderStatuses } from "../../api/orderStatusesApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { orderPanelStatusSelectLabel } from "../../utils/orderPanelStatusUi";
import type {
  OrderStatusOption,
  WmsPackingAfterFinishAction,
  WmsPackingAutoActions,
  WmsPackingInterfaceDisplay,
  WmsPackingSettingsRead,
} from "../../types/wmsPackingSettings";
import {
  createDefaultWmsPackingSettingsRead,
  DEFAULT_WMS_PACKING_INTERFACE_DISPLAY,
  loadCachedWmsPackingSettingsRead,
  normalizeWmsPackingSettingsRead,
  saveCachedWmsPackingSettingsRead,
} from "../../types/wmsPackingSettings";
import type { PackingExecutionMode, WmsPackingExtendedUiSettings } from "../../types/wmsPackingExtendedUi";
import {
  DEFAULT_WMS_PACKING_EXTENDED_UI,
  loadWmsPackingExtendedUi,
  saveWmsPackingExtendedUi,
} from "../../types/wmsPackingExtendedUi";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import { WmsSettingCard } from "./WmsSettingCard";
import { WMS_PACKING_SETTINGS_NAV_SECTIONS } from "./wmsPackingSettingsNavSections";
import { wmsSettingsTokens } from "./wmsSettingsTokens";
import { WmsSettingField } from "./settingsSearch";
import { WMS_SETTING_DATA_ATTR } from "./settingsSearch/navigateToSetting";
import {
  PackingCapabilityBadge,
  PackingFieldLabel,
  type PackingSettingCapability,
} from "./packingSettingCapability";
import { SettingInfoButton } from "./SettingInfoButton";

type LabelTemplateOption = { id: number; name: string };

const selectClass = wmsSettingsTokens.select;
const numberInputClass = wmsSettingsTokens.input.replace("max-w-md", "max-w-xs") + " tabular-nums";
const textInputClass = wmsSettingsTokens.input;
const checkboxClass = wmsSettingsTokens.checkbox;

const CAP_NONE: PackingSettingCapability = "none";
const CAP_PARTIAL: PackingSettingCapability = "partial";

function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return JSON.stringify(v);
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

function packingDraftFingerprint(d: WmsPackingSettingsRead): string {
  return stableStringify({
    start_status_id: d.start_status_id,
    packed_status_id: d.packed_status_id,
    missing_status_id: d.missing_status_id,
    packing_after_finish_action: d.packing_after_finish_action,
    auto_actions: d.auto_actions,
    document_settings: d.document_settings,
    fallback_label: d.fallback_label,
    interface_display: d.interface_display,
  });
}

function SectionCard({
  id,
  title,
  summary,
  children,
  defaultCollapsed,
}: {
  id: string;
  title: string;
  summary?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const meta = WMS_PACKING_SETTINGS_NAV_SECTIONS.find((s) => s.id === id);
  return (
    <WmsSettingsSection
      id={id}
      title={title}
      summary={summary}
      icon={meta?.icon}
      iconClassName={meta?.iconClassName}
      defaultCollapsed={defaultCollapsed}
    >
      {children}
    </WmsSettingsSection>
  );
}

function Help({ children }: { children: ReactNode }) {
  return <p className={wmsSettingsTokens.help}>{children}</p>;
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className={wmsSettingsTokens.fieldGrid}>{children}</div>;
}

function Subsection({
  title,
  description,
  settingId,
  children,
}: {
  title: string;
  description?: string;
  settingId?: string;
  children: ReactNode;
}) {
  return (
    <div {...(settingId ? { [WMS_SETTING_DATA_ATTR]: settingId } : {})} className="wms-setting-field rounded-lg">
      <WmsSettingCard title={title} description={description}>
        {children}
      </WmsSettingCard>
    </div>
  );
}

function BoolRow({
  label,
  checked,
  onChange,
  help,
  title,
  disabled,
  settingId,
  capability,
  capabilityNote,
  infoDescription,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
  title?: string;
  disabled?: boolean;
  settingId?: string;
  capability?: PackingSettingCapability;
  capabilityNote?: string;
  /** Opis do modala ⓘ — sekcja „Jak działa ta opcja:”. */
  infoDescription?: ReactNode;
}) {
  return (
    <div
      {...(settingId ? { [WMS_SETTING_DATA_ATTR]: settingId } : {})}
      className={`wms-setting-field flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 ${disabled ? "opacity-60" : "hover:bg-slate-50/80"}`}
      title={title}
    >
      <label className={`flex min-w-0 flex-1 items-start gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          className={checkboxClass}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800">{label}</span>
          {capability ? (
            <span className="mt-1 block">
              <PackingCapabilityBadge kind={capability} note={capabilityNote} />
            </span>
          ) : null}
          {help ? <Help>{help}</Help> : null}
        </span>
      </label>
      {infoDescription ? <SettingInfoButton title={label} description={infoDescription} /> : null}
    </div>
  );
}

export type WmsPackingSettingsPanelHandle = {
  saveAll: () => Promise<void>;
  discardUnsaved: () => Promise<void>;
};

const WmsPackingSettingsPanel = forwardRef<
  WmsPackingSettingsPanelHandle,
  {
    warehouseId: number | null;
    onDirtyChange?: (dirty: boolean) => void;
    /** False when this panel sits in a hidden tab — pauses subsection scrollspy. */
    sectionNavObserve?: boolean;
  }
>(function WmsPackingSettingsPanel({ warehouseId, onDirtyChange, sectionNavObserve = true }, ref) {
  const [statusOptions, setStatusOptions] = useState<OrderStatusOption[]>([]);
  const [saleSeries, setSaleSeries] = useState<DocumentSeriesDto[]>([]);
  const [templates, setTemplates] = useState<LabelTemplateOption[]>([]);
  const [draft, setDraft] = useState<WmsPackingSettingsRead | null>(null);
  const [extended, setExtended] = useState<WmsPackingExtendedUiSettings>(() => ({ ...DEFAULT_WMS_PACKING_EXTENDED_UI }));
  const [baselineDraft, setBaselineDraft] = useState<string | null>(null);
  const [baselineExtended, setBaselineExtended] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const resolveFallbackDraft = useCallback((): WmsPackingSettingsRead => {
    return (
      loadCachedWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId!) ??
      createDefaultWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId!)
    );
  }, [warehouseId]);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setStatusOptions([]);
      setSaleSeries([]);
      setTemplates([]);
      setDraft(null);
      setExtended({ ...DEFAULT_WMS_PACKING_EXTENDED_UI });
      setBaselineDraft(null);
      setBaselineExtended(null);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    setOkMsg(null);
    const fallbackDraft = resolveFallbackDraft();
    setDraft((prev) => prev ?? fallbackDraft);

    const [stRes, cfgRes, tRes, serRes] = await Promise.allSettled([
      listOrderStatuses(DAMAGE_TENANT_ID, warehouseId),
      getWmsPackingSettings(DAMAGE_TENANT_ID, warehouseId),
      api.get<LabelTemplateOption[]>("/label-templates/", { params: { tenant_id: DAMAGE_TENANT_ID } }),
      listDocumentSeries(DAMAGE_TENANT_ID, warehouseId),
    ]);

    let settingsSource: "api" | "local" | "default" = "default";
    let nextDraft: WmsPackingSettingsRead;

    if (cfgRes.status === "fulfilled") {
      const cfg = cfgRes.value;
      nextDraft = normalizeWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId, {
        ...cfg,
        packing_after_finish_action: cfg.packing_after_finish_action ?? "STAY",
        interface_display: {
          ...DEFAULT_WMS_PACKING_INTERFACE_DISPLAY,
          ...(cfg.interface_display ?? {}),
        },
      });
      saveCachedWmsPackingSettingsRead(warehouseId, nextDraft);
      settingsSource = "api";
    } else {
      console.warn("Packing settings API failed, using fallback", cfgRes.reason);
      nextDraft = fallbackDraft;
      settingsSource = loadCachedWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId) ? "local" : "default";
      setErr("Nie udało się wczytać ustawień pakowania.");
    }

    if (stRes.status === "rejected") {
      console.warn("Packing settings: order statuses request failed", stRes.reason);
    }
    if (tRes.status === "rejected") {
      console.warn("Packing settings: label templates request failed", tRes.reason);
    }
    if (serRes.status === "rejected") {
      console.warn("Packing settings: document series request failed", serRes.reason);
    }

    setStatusOptions(stRes.status === "fulfilled" ? stRes.value : []);
    setSaleSeries(serRes.status === "fulfilled" ? filterSaleSeriesForPacking(serRes.value) : []);
    if (tRes.status === "fulfilled") {
      const rows = Array.isArray(tRes.value.data) ? tRes.value.data : [];
      setTemplates(rows.map((r) => ({ id: r.id, name: r.name || `Szablon #${r.id}` })));
    } else {
      setTemplates([]);
    }

    setDraft((prev) => (cfgRes.status === "fulfilled" ? nextDraft : prev ?? fallbackDraft));

    const ext = { ...loadWmsPackingExtendedUi(warehouseId) };
    setExtended(ext);
    const finalDraft = cfgRes.status === "fulfilled" ? nextDraft : fallbackDraft;
    setBaselineDraft(packingDraftFingerprint(finalDraft));
    setBaselineExtended(stableStringify(ext));
    console.log("Packing settings source:", settingsSource);
    setLoading(false);
  }, [warehouseId, resolveFallbackDraft]);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveDraft = useMemo((): WmsPackingSettingsRead | null => {
    if (warehouseId == null) return null;
    if (draft != null) return normalizeWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId, draft);
    return resolveFallbackDraft();
  }, [warehouseId, draft, resolveFallbackDraft]);

  const dirty = useMemo(() => {
    if (warehouseId == null || effectiveDraft == null || baselineDraft == null || baselineExtended == null) return false;
    return packingDraftFingerprint(effectiveDraft) !== baselineDraft || stableStringify(extended) !== baselineExtended;
  }, [warehouseId, effectiveDraft, extended, baselineDraft, baselineExtended]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const setStatus = (key: "start_status_id" | "packed_status_id" | "missing_status_id", raw: string) => {
    setDraft((d) => {
      if (warehouseId == null) return d;
      const base = d ?? resolveFallbackDraft();
      const v = raw.trim();
      const next = v === "" ? null : Number(v);
      return { ...base, [key]: next != null && Number.isFinite(next) && next > 0 ? next : null };
    });
  };

  const toggleAction = (key: keyof WmsPackingAutoActions) => {
    setDraft((d) => {
      if (warehouseId == null) return d;
      const base = d ?? resolveFallbackDraft();
      return {
        ...base,
        auto_actions: { ...base.auto_actions, [key]: !Boolean(base.auto_actions[key]) },
      };
    });
  };

  const toggleInterfaceField = (key: keyof WmsPackingInterfaceDisplay) => {
    setDraft((d) => {
      if (warehouseId == null) return d;
      const base = d ?? resolveFallbackDraft();
      const prev = Boolean(base.interface_display[key]);
      return {
        ...base,
        interface_display: { ...base.interface_display, [key]: !prev },
      };
    });
  };

  const patchExtended = <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => {
    setExtended((e) => ({ ...e, [key]: value }));
  };

  const toggleAllowedStart = (id: number) => {
    setExtended((e) => {
      const set = new Set(e.allowedStartStatusIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...e, allowedStartStatusIds: Array.from(set).sort((a, b) => a - b) };
    });
  };

  const saveAll = async () => {
    if (warehouseId == null || effectiveDraft == null) return;
    const normalized = normalizeWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId, effectiveDraft);
    setOkMsg(null);
    setSaving(true);
    try {
      const docSettings = {
        ...normalized.document_settings,
        series_id: null,
        invoice_series_id: normalized.document_settings.invoice_series_id?.trim() || null,
        receipt_series_id: normalized.document_settings.receipt_series_id?.trim() || null,
      };
      const packingAfter: WmsPackingAfterFinishAction =
        extended.afterActionsBehavior === "return_to_list" ? "GO_TO_LIST" : "STAY";
      const saved = await saveWmsPackingSettings({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        start_status_id: normalized.start_status_id,
        packed_status_id: normalized.packed_status_id,
        missing_status_id: normalized.missing_status_id,
        packing_after_finish_action: packingAfter,
        auto_actions: normalized.auto_actions,
        document_settings: docSettings,
        fallback_label: normalized.fallback_label,
        interface_display: normalized.interface_display,
      });
      setDraft(saved);
      saveCachedWmsPackingSettingsRead(warehouseId, saved);
      saveWmsPackingExtendedUi(warehouseId, extended);
      setBaselineDraft(packingDraftFingerprint(saved));
      setBaselineExtended(stableStringify(extended));
      setErr(null);
      try {
        const refreshed = await listDocumentSeries(DAMAGE_TENANT_ID, warehouseId);
        setSaleSeries(filterSaleSeriesForPacking(refreshed));
      } catch (seriesErr) {
        console.warn("Packing settings: could not refresh document series after save", seriesErr);
      }
      setOkMsg("Zapisano ustawienia pakowania.");
    } catch (e: unknown) {
      console.warn("Packing settings save API failed; persisting local cache only", e);
      saveCachedWmsPackingSettingsRead(warehouseId, normalized);
      setDraft(normalized);
      saveWmsPackingExtendedUi(warehouseId, extended);
      setBaselineDraft(packingDraftFingerprint(normalized));
      setBaselineExtended(stableStringify(extended));
      setErr(null);
      setOkMsg("Zapisano lokalnie — serwer był niedostępny. Ponów zapis z paska na dole, gdy połączenie wróci.");
    } finally {
      setSaving(false);
    }
  };

  const saveAllRef = useRef(saveAll);
  saveAllRef.current = saveAll;

  useImperativeHandle(
    ref,
    () => ({
      saveAll: async () => {
        await saveAllRef.current();
      },
      discardUnsaved: async () => {
        await load();
      },
    }),
    [load],
  );

  if (warehouseId == null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Wybierz magazyn w górnym pasku, aby konfigurować pakowanie.
      </p>
    );
  }

  return (
    <WmsSettingsTabFrame
      title="Pakowanie"
      description="Konfiguracja procesu pakowania i wyglądu ekranu pakowania."
      sections={WMS_PACKING_SETTINGS_NAV_SECTIONS}
      asideLabel="Sekcje ustawień pakowania"
      observeSections={sectionNavObserve && Boolean(effectiveDraft)}
      observeRevision={loading}
      dirty={dirty}
      saving={saving}
      onSave={() => void saveAll()}
      onRestoreDefaults={() => {
        if (warehouseId == null) return;
        const defaults = createDefaultWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId);
        setDraft(defaults);
        setExtended({ ...DEFAULT_WMS_PACKING_EXTENDED_UI });
        setOkMsg(null);
      }}
    >
      {loading && <p className="text-sm text-slate-500">Ładowanie…</p>}
      {err ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-medium">Ostrzeżenie: </span>
          {err} Edycja jest możliwa; zapis wykonasz z paska na dole strony lub przycisku „Zapisz zmiany”.
        </p>
      ) : null}
      {okMsg && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{okMsg}</p>}

      {effectiveDraft != null ? (
        <div className="space-y-4">
          <SectionCard
            id="wms-pack-appearance"
            title="Widok"
            summary="Układ interfejsu, panel klienta i dokumentów, widok produktów przy pakowaniu oraz lista zamówień."
          >
            <div className="space-y-5">
              <Subsection
                settingId="packing.group.layout_general"
                title="A. Ogólny układ"
                description="Szerokość obszaru roboczego, lista produktów i pozycja przycisków automatyzacji."
              >
                <FieldGrid>
                  <WmsSettingField settingId="packing.layout_mode" className="block text-sm font-medium text-slate-700">
                    <PackingFieldLabel capability={CAP_NONE}>Tryb układu</PackingFieldLabel>
                    <select
                      className={selectClass}
                      value={extended.layoutMode}
                      onChange={(e) => patchExtended("layoutMode", e.target.value as WmsPackingExtendedUiSettings["layoutMode"])}
                    >
                      <option value="full_width">Pełna szerokość</option>
                      <option value="centered">Wyśrodkowany</option>
                    </select>
                  </WmsSettingField>
                  <WmsSettingField
                    settingId="packing.automation_buttons_position"
                    className="block text-sm font-medium text-slate-700"
                  >
                    <PackingFieldLabel capability={CAP_NONE}>Pozycja przycisków automatyzacji</PackingFieldLabel>
                    <select
                      className={selectClass}
                      value={extended.automationButtonsPosition}
                      onChange={(e) =>
                        patchExtended(
                          "automationButtonsPosition",
                          e.target.value as WmsPackingExtendedUiSettings["automationButtonsPosition"],
                        )
                      }
                    >
                      <option value="bottom">Dół</option>
                      <option value="right">Prawa kolumna</option>
                      <option value="floating">Pływające</option>
                    </select>
                  </WmsSettingField>
                  <WmsSettingField
                    settingId="packing.product_display_mode"
                    className="block text-sm font-medium text-slate-700 sm:col-span-2"
                  >
                    <PackingFieldLabel capability={CAP_NONE}>Lista produktów (widok siatki / listy)</PackingFieldLabel>
                    <select
                      className={selectClass}
                      value={extended.productDisplayMode}
                      onChange={(e) =>
                        patchExtended("productDisplayMode", e.target.value as WmsPackingExtendedUiSettings["productDisplayMode"])
                      }
                    >
                      <option value="list">Lista</option>
                      <option value="grid">Siatka</option>
                    </select>
                  </WmsSettingField>
                </FieldGrid>
              </Subsection>

              <Subsection
                settingId="packing.group.customer_panel"
                title="B. Panel klienta i dokumentów"
                description="Komentarz klienta, podgląd dokumentu sprzedaży, dodatkowa lista spakowanych."
              >
                <FieldGrid>
                  <WmsSettingField settingId="packing.customer_comment_style" className="block text-sm font-medium text-slate-700">
                    <PackingFieldLabel capability={CAP_NONE}>Komentarz klienta</PackingFieldLabel>
                    <select
                      className={selectClass}
                      value={extended.customerCommentStyle}
                      onChange={(e) =>
                        patchExtended("customerCommentStyle", e.target.value as WmsPackingExtendedUiSettings["customerCommentStyle"])
                      }
                    >
                      <option value="highlighted">Wyróżniony</option>
                      <option value="normal">Zwykły</option>
                    </select>
                  </WmsSettingField>
                  <WmsSettingField settingId="packing.sales_document_preview" className="block text-sm font-medium text-slate-700">
                    <PackingFieldLabel capability={CAP_NONE}>Podgląd dokumentu sprzedaży</PackingFieldLabel>
                    <select
                      className={selectClass}
                      value={extended.salesDocumentPreview}
                      onChange={(e) =>
                        patchExtended("salesDocumentPreview", e.target.value as WmsPackingExtendedUiSettings["salesDocumentPreview"])
                      }
                    >
                      <option value="simplified">Uproszczony</option>
                      <option value="full">Pełny</option>
                    </select>
                  </WmsSettingField>
                </FieldGrid>
                <div className="mt-4 border-t border-slate-200/80 pt-4">
                  <BoolRow
                    settingId="packing.packed_products_extra_list"
                    label="Dodatkowa lista spakowanych produktów"
                    checked={extended.packedProductsExtraList}
                    onChange={(v) => patchExtended("packedProductsExtraList", v)}
                    capability={CAP_NONE}
                    help="Opcja przygotowana na późniejsze wdrożenie."
                  />
                </div>
              </Subsection>

              <Subsection
                settingId="packing.group.products_view"
                title="C. Widok produktów podczas pakowania"
                description="Miniaturka, lokalizacja, kolumny danych oraz opcje listy linii. Cztery pierwsze przełączniki danych zapisują się w API."
              >
                <FieldGrid>
                  <WmsSettingField
                    settingId="packing.location_badge_position"
                    className="block text-sm font-medium text-slate-700"
                  >
                    <PackingFieldLabel capability={CAP_NONE}>Pozycja plakietki lokalizacji</PackingFieldLabel>
                    <select
                      className={selectClass}
                      value={extended.locationBadgePosition}
                      onChange={(e) =>
                        patchExtended(
                          "locationBadgePosition",
                          e.target.value as WmsPackingExtendedUiSettings["locationBadgePosition"],
                        )
                      }
                    >
                      <option value="top_right">Góra prawo</option>
                      <option value="top_left">Góra lewo</option>
                      <option value="bottom_right">Dół prawo</option>
                      <option value="bottom_left">Dół lewo</option>
                    </select>
                  </WmsSettingField>
                </FieldGrid>
                <div className="mt-4 space-y-3 border-t border-slate-200/80 pt-4">
                  <BoolRow
                    settingId="packing.show_product_image"
                    label="Pokazuj zdjęcie produktu"
                    checked={extended.showProductImage}
                    onChange={(v) => patchExtended("showProductImage", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    settingId="packing.show_product_location"
                    label="Pokazuj lokalizację produktu"
                    checked={extended.showProductLocation}
                    onChange={(v) => patchExtended("showProductLocation", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    settingId="packing.move_packed_to_bottom"
                    label="Przenieś spakowane na dół listy"
                    checked={extended.movePackedToBottom}
                    onChange={(v) => patchExtended("movePackedToBottom", v)}
                    capability={CAP_NONE}
                  />
                </div>
                <p className="mb-3 mt-4 text-xs text-slate-500">
                  Pola stanu, EAN, SKU i numeru katalogowego zapisują się na serwerze i sterują widocznością na ekranie pakowania.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["show_stock", "Stan magazynowy", "packing.show_stock"],
                      ["show_ean", "EAN", "packing.show_ean"],
                      ["show_symbol", "SKU / symbol", "packing.show_symbol"],
                      ["show_catalog_number", "Numer katalogowy", "packing.show_catalog_number"],
                    ] as const
                  ).map(([k, label, settingId]) => (
                    <BoolRow
                      key={k}
                      settingId={settingId}
                      label={label}
                      checked={Boolean(effectiveDraft.interface_display[k])}
                      onChange={() => toggleInterfaceField(k)}
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-3 border-t border-slate-200/80 pt-4">
                  <BoolRow
                    label="Pokaż podpis / uwagi na linii"
                    checked={extended.showSignature}
                    onChange={(v) => patchExtended("showSignature", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Pokaż cenę"
                    checked={extended.showPrice}
                    onChange={(v) => patchExtended("showPrice", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Informacja o zestawie"
                    checked={extended.showBundleInfo}
                    onChange={(v) => patchExtended("showBundleInfo", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Nazwa produktu podczas pakowania"
                    checked={extended.showProductNameDuringPacking}
                    onChange={(v) => patchExtended("showProductNameDuringPacking", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Skracaj bardzo długie nazwy"
                    checked={extended.truncateLongNames}
                    onChange={(v) => patchExtended("truncateLongNames", v)}
                    capability={CAP_NONE}
                  />
                </div>
              </Subsection>

              <Subsection title="D. Widok listy zamówień" description="Układ listy, liczba rekordów i kolumny podglądu zamówienia.">
                <FieldGrid>
                  <WmsSettingField settingId="packing.orders_list_layout" className="block text-sm font-medium text-slate-700">
                    <PackingFieldLabel capability={CAP_NONE}>Układ listy zamówień</PackingFieldLabel>
                    <select
                      className={selectClass}
                      value={extended.ordersListLayout}
                      onChange={(e) =>
                        patchExtended("ordersListLayout", e.target.value as WmsPackingExtendedUiSettings["ordersListLayout"])
                      }
                    >
                      <option value="expanded_vertical">Rozwinięty (pionowo)</option>
                      <option value="compact">Kompaktowy</option>
                      <option value="cards">Karty</option>
                    </select>
                  </WmsSettingField>
                  <label className="block text-sm font-medium text-slate-700">
                    <PackingFieldLabel capability={CAP_NONE}>Początkowa liczba zamówień</PackingFieldLabel>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      className={numberInputClass}
                      value={extended.initialOrdersCount}
                      onChange={(e) => patchExtended("initialOrdersCount", Math.max(5, Math.min(200, Number(e.target.value) || 25)))}
                    />
                  </label>
                </FieldGrid>
                <div className="mt-4 space-y-3 border-t border-slate-200/80 pt-4">
                  <BoolRow
                    label="Miniaturka produktu na liście zamówień"
                    checked={extended.showProductImageInOrders}
                    onChange={(v) => patchExtended("showProductImageInOrders", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="SKU na liście zamówień"
                    checked={extended.showSKUInOrders}
                    onChange={(v) => patchExtended("showSKUInOrders", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="EAN na liście zamówień"
                    checked={extended.showEANInOrders}
                    onChange={(v) => patchExtended("showEANInOrders", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Numer katalogowy na liście zamówień"
                    checked={extended.showCatalogNumberInOrders}
                    onChange={(v) => patchExtended("showCatalogNumberInOrders", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Skracaj długie nazwy (lista zamówień)"
                    checked={extended.truncateNamesInOrders}
                    onChange={(v) => patchExtended("truncateNamesInOrders", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Pokazuj już spakowane"
                    checked={extended.showPackedOrders}
                    onChange={(v) => patchExtended("showPackedOrders", v)}
                    capability={CAP_NONE}
                  />
                </div>
              </Subsection>
            </div>
          </SectionCard>

          <SectionCard id="wms-pack-workflow" title="Statusy procesu" summary="Powiązanie statusów panelu z procesem pakowania.">
            <FieldGrid>
              <WmsSettingField settingId="packing.start_status_id" className="block text-sm font-medium text-slate-700">
                <PackingFieldLabel
                  capability={CAP_PARTIAL}
                  capabilityNote="używane po zbieraniu / domknięciu braków, nie jako filtr startu pakowania."
                >
                  Status na początku pakowania
                </PackingFieldLabel>
                <select
                  className={selectClass}
                  value={effectiveDraft.start_status_id ?? ""}
                  onChange={(e) => setStatus("start_status_id", e.target.value)}
                >
                  <option value="">— brak —</option>
                  {statusOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {orderPanelStatusSelectLabel(o)}
                    </option>
                  ))}
                </select>
              </WmsSettingField>
              <WmsSettingField settingId="packing.packed_status_id" className="block text-sm font-medium text-slate-700">
                Status po spakowaniu
                <select
                  className={selectClass}
                  value={effectiveDraft.packed_status_id ?? ""}
                  onChange={(e) => setStatus("packed_status_id", e.target.value)}
                >
                  <option value="">— brak —</option>
                  {statusOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {orderPanelStatusSelectLabel(o)}
                    </option>
                  ))}
                </select>
              </WmsSettingField>
              <WmsSettingField settingId="packing.missing_status_id" className="block text-sm font-medium text-slate-700 sm:col-span-2">
                <PackingFieldLabel capability={CAP_NONE}>Status przy brakach</PackingFieldLabel>
                <select
                  className={selectClass}
                  value={effectiveDraft.missing_status_id ?? ""}
                  onChange={(e) => setStatus("missing_status_id", e.target.value)}
                >
                  <option value="">— brak —</option>
                  {statusOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {orderPanelStatusSelectLabel(o)}
                    </option>
                  ))}
                </select>
              </WmsSettingField>
            </FieldGrid>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-800">Dozwolone statusy startu (wielokrotny wybór)</p>
              <div className="mt-1">
                <PackingCapabilityBadge kind={CAP_NONE} />
              </div>
              <Help>Zapis lokalny na tej stacji — walidacja startu pakowania będzie w kolejnym wdrożeniu.</Help>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200/90 bg-slate-50/50 p-2">
                {statusOptions.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      checked={(extended.allowedStartStatusIds ?? []).includes(o.id)}
                      onChange={() => toggleAllowedStart(o.id)}
                    />
                    {orderPanelStatusSelectLabel(o)}
                  </label>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="wms-pack-automation"
            title="Automatyzacja"
            summary="Czynności po pakowaniu, tryb wykonania oraz zachowanie operatora — bez mieszania ustawień technicznych z trybem testowym."
          >
            <div className="space-y-5">
              <Subsection
                title="Czynności po zakończeniu pakowania"
                description="Określa, które akcje są dostępne po poprawnym spakowaniu zamówienia (co system może wykonać po pakowaniu)."
              >
                <div className="flex flex-col gap-3">
                  {(
                    [
                      [
                        "generate_shipment",
                        "Generuj przesyłkę",
                        CAP_PARTIAL,
                        "krok jest uruchamiany, ale bez realnego połączenia z kurierem.",
                      ],
                      ["create_document", "Utwórz dokument sprzedaży", undefined, undefined],
                      [
                        "print_label",
                        "Drukuj etykietę",
                        CAP_PARTIAL,
                        "sprawdza szablon i opóźnienie; druk etykiety jest jeszcze w trybie zastępczym.",
                      ],
                      [
                        "print_document",
                        "Drukuj dokument",
                        CAP_PARTIAL,
                        "krok jest oznaczany, ale druk nie jest wykonywany po stronie serwera.",
                      ],
                      [
                        "change_order_status",
                        "Zmień status zamówienia",
                        CAP_PARTIAL,
                        "przy wyłączeniu status i tak może zostać ustawiony heurystycznie.",
                      ],
                    ] as const
                  ).map(([k, label, capability, capabilityNote]) => (
                    <BoolRow
                      key={k}
                      label={label}
                      checked={Boolean(effectiveDraft.auto_actions[k])}
                      onChange={() => toggleAction(k)}
                      capability={capability}
                      capabilityNote={capabilityNote}
                    />
                  ))}
                </div>
              </Subsection>

              <Subsection
                title="Sposób wykonania"
                description="Decyduje, czy wybrane czynności mają uruchamiać się od razu, czy tylko czekać na operatora, albo użyć trybu testowego przesyłki."
              >
                <div className="mb-2">
                  <PackingCapabilityBadge kind={CAP_NONE} />
                </div>
                <Help>
                  Te przełączniki zapisują się lokalnie. Produkcyjny przebieg po pakowaniu sterują opcje „Czynności po zakończeniu pakowania” powyżej (zapis na serwerze).
                </Help>
                <div className="mt-2 flex flex-col gap-2">
                  {(
                    [
                      ["automatic", "Wykonuj automatycznie", "Po pakowaniu uruchamiane są zaznaczone poniżej zachowania szczegółowe (druk, dokument itd.)."],
                      [
                        "prepare_only",
                        "Tylko przygotuj",
                        "Czynności są przygotowywane — operator sam je uruchamia z ekranu pakowania. Szczegółowe przełączniki automatycznego uruchamiania są wyłączone.",
                      ],
                      [
                        "simulation",
                        "Tryb symulacji / testowy",
                        "Do testów przesyłki bez pełnej integracji — np. generowanie przesyłki w symulacji zamiast produkcyjnego łańcucha.",
                      ],
                    ] as const
                  ).map(([value, title, desc]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer flex-col gap-1 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-sm text-slate-800 hover:bg-slate-50/90"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="packing-execution-mode"
                          className="h-4 w-4 shrink-0 border-slate-300 text-blue-600"
                          checked={extended.executionMode === value}
                          onChange={() => patchExtended("executionMode", value as PackingExecutionMode)}
                        />
                        <span className="font-medium">{title}</span>
                      </span>
                      <span className="pl-7 text-xs leading-relaxed text-slate-500">{desc}</span>
                    </label>
                  ))}
                </div>
              </Subsection>

              {extended.executionMode === "prepare_only" ? (
                <p className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-xs text-sky-950">
                  Tryb „Tylko przygotuj”: automatyczne uruchamianie czynności jest wyłączone — operator potwierdza każdy krok ręcznie.
                </p>
              ) : null}

              {extended.executionMode !== "prepare_only" ? (
                <Subsection
                  title={
                    extended.executionMode === "simulation"
                      ? "Szczegóły — automatyczne uruchamianie (tryb testowy)"
                      : "Szczegóły — automatyczne uruchamianie"
                  }
                  description={
                    extended.executionMode === "simulation"
                      ? "W trybie testowym szczególnie przydatna jest symulowana przesyłka — bez pełnego łańcucha produkcyjnego."
                      : "Te opcje działają w połączeniu z trybem „Wykonuj automatycznie”. W trybie symulacji dotyczą także ścieżki testowej."
                  }
                >
                  <div className="space-y-2">
                    <BoolRow
                      label={
                        extended.executionMode === "simulation"
                          ? "Automatycznie generuj przesyłkę (symulacja)"
                          : "Automatycznie generuj przesyłkę"
                      }
                      checked={extended.autoGenerateShipment}
                      onChange={(v) => patchExtended("autoGenerateShipment", v)}
                      capability={CAP_NONE}
                      help={
                        extended.executionMode === "simulation"
                          ? "Preferencja lokalna — nie zastępuje produkcyjnego utworzenia przesyłki."
                          : "Preferencja lokalna. Produkcyjną przesyłkę steruje opcja „Generuj przesyłkę” powyżej."
                      }
                    />
                    <BoolRow
                      label="Automatycznie utwórz dokument sprzedaży"
                      checked={extended.autoCreateSalesDocument}
                      onChange={(v) => patchExtended("autoCreateSalesDocument", v)}
                      capability={CAP_NONE}
                    />
                    <BoolRow
                      label="Automatycznie zmień status zamówienia"
                      checked={extended.autoChangeOrderStatus}
                      onChange={(v) => patchExtended("autoChangeOrderStatus", v)}
                      capability={CAP_NONE}
                    />
                    <BoolRow
                      label="Automatyczny druk przesyłki (etykieta kurierska)"
                      checked={extended.autoPrintShipment}
                      onChange={(v) => patchExtended("autoPrintShipment", v)}
                      capability={CAP_NONE}
                    />
                    <BoolRow
                      label="Automatyczny druk dokumentu sprzedaży"
                      checked={extended.autoPrintSalesDocument}
                      onChange={(v) => patchExtended("autoPrintSalesDocument", v)}
                      capability={CAP_NONE}
                    />
                  </div>
                </Subsection>
              ) : null}

              <Subsection
                title="Zachowanie operatora"
                description="Nawigacja po zakończeniu czynności oraz druk — ustawienia interfejsu pakowania (część zapisywana po stronie serwera tylko dla opcji powrotu na listę)."
              >
                <BoolRow
                  label="Otwieraj okna druku automatycznie (etykieta przesyłki i dokument sprzedaży)"
                  checked={Boolean(extended.autoPrintShipment && extended.autoPrintSalesDocument)}
                  disabled={extended.executionMode === "prepare_only"}
                  onChange={(v) => {
                    patchExtended("autoPrintShipment", v);
                    patchExtended("autoPrintSalesDocument", v);
                  }}
                  capability={CAP_NONE}
                  help={
                    extended.executionMode === "prepare_only"
                      ? "Niedostępne w trybie „Tylko przygotuj” — druk uruchamia operator ręcznie."
                      : "Ustawia jednocześnie lokalne opcje druku etykiety i dokumentu. Aby ustawić każdą osobno, użyj szczegółów powyżej."
                  }
                />
                <p className="mt-4 text-sm font-medium text-slate-800">Po zakończeniu czynności</p>
                <Help>
                  „Wróć na listę” zapisuje się na serwerze. „Następne zamówienie” jest na razie tylko preferencją lokalną.
                </Help>
                <div className="mt-2 flex flex-col gap-2">
                  {(
                    [
                      ["stay_here", "Zostań przy bieżącym zamówieniu", undefined, undefined],
                      ["return_to_list", "Wróć na listę zamówień", undefined, undefined],
                      ["next_order", "Przejdź do następnego zamówienia", CAP_NONE, undefined],
                    ] as const
                  ).map(([value, label, capability]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer flex-col gap-1 rounded-lg border border-slate-200/80 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-800 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="after-actions-behavior"
                          className="h-4 w-4 border-slate-300 text-blue-600"
                          checked={extended.afterActionsBehavior === value}
                          onChange={() => patchExtended("afterActionsBehavior", value)}
                        />
                        <span className="font-medium">{label}</span>
                      </span>
                      {capability ? (
                        <span className="pl-7">
                          <PackingCapabilityBadge kind={capability} />
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </Subsection>
            </div>
          </SectionCard>

          <SectionCard id="wms-pack-documents" title="Integracje" summary="Typ dokumentu (lokalnie) + serie zapisane na serwerze.">
            <FieldGrid>
              <label className="block text-sm font-medium text-slate-700">
                <PackingFieldLabel capability={CAP_NONE}>Typ dokumentu (preferencja lokalna)</PackingFieldLabel>
                <select
                  className={selectClass}
                  value={extended.salesDocumentType}
                  onChange={(e) =>
                    patchExtended("salesDocumentType", e.target.value as WmsPackingExtendedUiSettings["salesDocumentType"])
                  }
                >
                  <option value="invoice">Faktura</option>
                  <option value="receipt">Paragon</option>
                  <option value="none">Brak</option>
                </select>
              </label>
            </FieldGrid>
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <BoolRow
                title="Pomijaj A4 przy drukarce fiskalnej"
                label="Pomiń A4 dla paragonu przy drukarce fiskalnej"
                checked={extended.skipA4ReceiptWhenFiscalPrinter}
                onChange={(v) => patchExtended("skipA4ReceiptWhenFiscalPrinter", v)}
                capability={CAP_NONE}
              />
              <BoolRow
                label="Drukuj kopię dokumentu sprzedaży"
                checked={extended.printCopyOfSalesDoc}
                onChange={(v) => patchExtended("printCopyOfSalesDoc", v)}
                capability={CAP_NONE}
              />
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-800">Serie dokumentów</p>
              <Help>Ta sama lista co w Dokumenty → Serie.</Help>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Seria faktur
                  <select
                    className={selectClass}
                    value={effectiveDraft.document_settings.invoice_series_id ?? ""}
                    onChange={(e) =>
                      setDraft((d) => {
                        if (warehouseId == null) return d;
                        const base = d ?? resolveFallbackDraft();
                        return {
                          ...base,
                          document_settings: {
                            ...base.document_settings,
                            invoice_series_id: e.target.value.trim() || null,
                          },
                        };
                      })
                    }
                  >
                    <option value="">— brak —</option>
                    {saleSeries
                      .filter((s) => s.subtype === "INVOICE")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.prefix?.trim() ? ` (${s.prefix.trim()})` : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Seria paragonów
                  <select
                    className={selectClass}
                    value={effectiveDraft.document_settings.receipt_series_id ?? ""}
                    onChange={(e) =>
                      setDraft((d) => {
                        if (warehouseId == null) return d;
                        const base = d ?? resolveFallbackDraft();
                        return {
                          ...base,
                          document_settings: {
                            ...base.document_settings,
                            receipt_series_id: e.target.value.trim() || null,
                          },
                        };
                      })
                    }
                  >
                    <option value="">— brak —</option>
                    {saleSeries
                      .filter((s) => s.subtype === "RECEIPT")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.prefix?.trim() ? ` (${s.prefix.trim()})` : ""}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="wms-pack-labels"
            title="Drukowanie"
            summary="Przesyłki, limity paczek oraz lokalne preferencje etykiety zastępczej."
          >
            <div className="space-y-5">
              <Subsection title="Przesyłka i paczki" description="Walidacja, wiele paczek, limity etykiet.">
                <div className="space-y-3">
                  <BoolRow
                    label="Wymuś skan szablonu przesyłki"
                    checked={extended.forceScanShipmentTemplate}
                    onChange={(v) => patchExtended("forceScanShipmentTemplate", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Wymagaj potwierdzenia przed utworzeniem przesyłki"
                    checked={extended.requireConfirmBeforeShipment}
                    onChange={(v) => patchExtended("requireConfirmBeforeShipment", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Wiele paczek"
                    checked={extended.enableMultiParcel}
                    onChange={(v) => patchExtended("enableMultiParcel", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Wyłącz automatyczne pobieranie liczby paczek"
                    checked={extended.autoFetchParcelCountDisabled}
                    onChange={(v) => patchExtended("autoFetchParcelCountDisabled", v)}
                    capability={CAP_NONE}
                  />
                  <BoolRow
                    label="Limituj etykiety przesyłki do ilości"
                    checked={extended.limitShipmentLabelsToQty}
                    onChange={(v) => patchExtended("limitShipmentLabelsToQty", v)}
                    capability={CAP_NONE}
                  />
                  <label className="block text-sm font-medium text-slate-700" title="Próg paczek bez potwierdzenia kierownika">
                    <PackingFieldLabel capability={CAP_NONE}>Limit paczek bez potwierdzenia kierownika</PackingFieldLabel>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      className={numberInputClass}
                      value={extended.parcelLimitWithoutManagerConfirm}
                      onChange={(e) =>
                        patchExtended(
                          "parcelLimitWithoutManagerConfirm",
                          Math.max(0, Math.min(99, Math.floor(Number(e.target.value) || 0))),
                        )
                      }
                    />
                  </label>
                </div>
              </Subsection>
              <Subsection
                title="Etykieta zastępcza (preferencje lokalne)"
                description="Szablon i opóźnienie na tej stacji — osobno od etykiety zastępczej zapisanej na serwerze w sekcji Automatyzacja."
              >
                <FieldGrid>
                  <label className="block text-sm font-medium text-slate-700" title="Identyfikator lub nazwa szablonu zastępczego">
                    <PackingFieldLabel capability={CAP_NONE}>Szablon etykiety zastępczej</PackingFieldLabel>
                    <input
                      type="text"
                      className={textInputClass}
                      placeholder="np. nazwa lub ID szablonu"
                      value={extended.replacementLabelTemplate ?? ""}
                      onChange={(e) => patchExtended("replacementLabelTemplate", e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700" title="Opóźnienie przed akcją etykiety zastępczej">
                    <PackingFieldLabel capability={CAP_NONE}>Opóźnienie (s)</PackingFieldLabel>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      className={numberInputClass}
                      value={extended.replacementLabelDelaySec ?? 0}
                      onChange={(e) =>
                        patchExtended(
                          "replacementLabelDelaySec",
                          Math.max(0, Math.min(120, Math.floor(Number(e.target.value) || 0))),
                        )
                      }
                    />
                  </label>
                </FieldGrid>
              </Subsection>
            </div>
          </SectionCard>

          <SectionCard id="wms-pack-permissions" title="Ogólne" summary="Reguły dla pakującego i magazynu.">
            <div className="space-y-3">
              <BoolRow
                settingId="packing.packer_is_not_picker"
                label="Pakujący ≠ kompletujący"
                checked={extended.packerIsNotPicker}
                onChange={(v) => patchExtended("packerIsNotPicker", v)}
                capability={CAP_NONE}
                help="Rozdział ról — przygotowane do późniejszego wdrożenia."
              />
              <BoolRow
                settingId="packing.require_notes_popup"
                label="Otwieraj notatki jako popup"
                checked={extended.requireNotesPopup}
                onChange={(v) => patchExtended("requireNotesPopup", v)}
                infoDescription={
                  <>
                    <p>
                      Jeśli zamówienie posiada notatkę, w trybie pakowania zostanie ona automatycznie wyświetlona w
                      wyskakującym oknie (popup), które należy zamknąć, aby kontynuować pakowanie.
                    </p>
                    <p>
                      W przypadku zamówienia jednoelementowego zawierającego 1 sztukę produktu, pakowanie standardowo
                      pomija widok zamówienia i przechodzi od razu do akcji automatycznych.
                    </p>
                    <p>
                      Jeżeli takie zamówienie posiada notatkę, proces zostaje przerwany przez popup z notatką, a po jego
                      zamknięciu konieczne jest ponowne zeskanowanie lub spakowanie produktu, aby uruchomić dalsze akcje.
                    </p>
                  </>
                }
              />
              <BoolRow
                settingId="packing.show_all_notes"
                label="Pokaż wszystkie notatki"
                checked={extended.showAllNotes}
                onChange={(v) => patchExtended("showAllNotes", v)}
                infoDescription={
                  <>
                    <ul className="list-disc space-y-1.5 pl-5">
                      <li>Określa, które notatki są wyświetlane w trybie pakowania.</li>
                      <li>
                        Po włączeniu tej opcji w pakowaniu pokazywane są wszystkie notatki przypisane do zamówienia,
                        niezależnie od ustawionej widoczności.
                      </li>
                      <li>
                        Po wyłączeniu tej opcji wyświetlane są tylko notatki z włączoną widocznością „WMS – pakowanie”.
                      </li>
                    </ul>
                    <p className="font-semibold text-slate-800">Ważne:</p>
                    <ul className="list-disc space-y-1.5 pl-5">
                      <li>Widoczność notatek jest ustawiana na karcie zamówienia lub przez akcje automatyczne.</li>
                    </ul>
                  </>
                }
              />
              <BoolRow
                label="Tylko stan z magazynu pakowania"
                checked={extended.onlyPackagingWarehouseStock}
                onChange={(v) => patchExtended("onlyPackagingWarehouseStock", v)}
                capability={CAP_NONE}
              />
              <BoolRow
                label="Ogranicz szablony do konta zamówienia"
                checked={extended.restrictTemplatesToOrderAccount}
                onChange={(v) => patchExtended("restrictTemplatesToOrderAccount", v)}
                capability={CAP_NONE}
              />
            </div>
          </SectionCard>

          <SectionCard
            id="wms-pack-assistant"
            title="Automatyzacja"
            summary="Przyciski na ekranie pakowania oraz etykieta zastępcza zapisana w ustawieniach magazynu."
          >
            <div className="space-y-3">
              <BoolRow
                label="Pokazuj przyciski automatyzacji"
                checked={extended.showAutomationButtons}
                onChange={(v) => patchExtended("showAutomationButtons", v)}
                capability={CAP_NONE}
              />
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-800">Etykieta zastępcza (serwer)</p>
              <Help>
                Używana przy czynności „Drukuj etykietę”. Druk jest częściowo wdrożony — szablon i opóźnienie są respektowane, render etykiety jeszcze zastępczy.
              </Help>
              <label className="mt-2 block text-sm font-medium text-slate-700">
                <PackingFieldLabel
                  capability={CAP_PARTIAL}
                  capabilityNote="szablon jest sprawdzany; pełny druk etykiety jeszcze nie."
                >
                  Szablon etykiety
                </PackingFieldLabel>
                <select
                  className={selectClass}
                  value={effectiveDraft.fallback_label.template_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => {
                      if (warehouseId == null) return d;
                      const base = d ?? resolveFallbackDraft();
                      return {
                        ...base,
                        fallback_label: {
                          ...base.fallback_label,
                          template_id: v === "" ? null : Number(v),
                        },
                      };
                    });
                  }}
                >
                  <option value="">— brak —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Opóźnienie przed drukiem etykiety (s)
                <input
                  type="number"
                  min={0}
                  max={120}
                  className={numberInputClass}
                  value={effectiveDraft.fallback_label.delay_seconds ?? 0}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(120, Math.floor(Number(e.target.value) || 0)));
                    setDraft((d) => {
                      if (warehouseId == null) return d;
                      const base = d ?? resolveFallbackDraft();
                      return { ...base, fallback_label: { ...base.fallback_label, delay_seconds: n } };
                    });
                  }}
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard
            id="wms-pack-advanced"
            title="Zaawansowane"
            summary="Magazyn domyślny, stare szablony, strategia jedno-/wielopozycyjna."
          >
            <FieldGrid>
              <label className="block text-sm font-medium text-slate-700" title="Identyfikator lub nazwa magazynu">
                <PackingFieldLabel capability={CAP_NONE}>Główny magazyn pakowania</PackingFieldLabel>
                <input
                  type="text"
                  className={textInputClass}
                  placeholder="np. ID magazynu lub nazwa"
                  value={extended.mainPackingWarehouse}
                  onChange={(e) => patchExtended("mainPackingWarehouse", e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                <PackingFieldLabel capability={CAP_NONE}>Strategia jedno / wielopozycyjne</PackingFieldLabel>
                <select
                  className={selectClass}
                  value={extended.packingSingleOrMultiItemStrategy}
                  onChange={(e) =>
                    patchExtended(
                      "packingSingleOrMultiItemStrategy",
                      e.target.value as WmsPackingExtendedUiSettings["packingSingleOrMultiItemStrategy"],
                    )
                  }
                >
                  <option value="auto">Automatycznie</option>
                  <option value="single_first">Najpierw jednopozycyjne</option>
                  <option value="multi_first">Najpierw wielopozycyjne</option>
                </select>
              </label>
            </FieldGrid>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <BoolRow
                label="Awaryjne użycie starych szablonów"
                checked={extended.fallbackLegacyTemplates}
                onChange={(v) => patchExtended("fallbackLegacyTemplates", v)}
                capability={CAP_NONE}
                title="Przy braku nowego szablonu użyj starych definicji"
              />
            </div>
          </SectionCard>
        </div>
      ) : null}
    </WmsSettingsTabFrame>
  );
});

export default WmsPackingSettingsPanel;
