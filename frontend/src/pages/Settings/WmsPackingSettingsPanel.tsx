import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import api from "../../api/axios";
import { getWmsPackingSettings, saveWmsPackingSettings } from "../../api/wmsPackingSettingsApi";
import {
  filterSaleSeriesForPacking,
  listDocumentSeries,
  type DocumentSeriesDto,
} from "../../api/documentSeriesApi";
import { listOrderStatuses } from "../../api/orderStatusesApi";
import { getShippingMethods, type ShippingMethodDto } from "../../api/shippingMethodsApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
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
import type { WmsPackingExtendedUiSettings } from "../../types/wmsPackingExtendedUi";
import {
  DEFAULT_WMS_PACKING_EXTENDED_UI,
  loadWmsPackingExtendedUi,
  saveWmsPackingExtendedUi,
} from "../../types/wmsPackingExtendedUi";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WMS_PACKING_SETTINGS_NAV_SECTIONS } from "./wmsPackingSettingsNavSections";
import { PackingGeneralSection } from "./packingSettings/PackingGeneralSection";
import { PackingViewSection } from "./packingSettings/PackingViewSection";
import { PackingProcessSection } from "./packingSettings/PackingProcessSection";
import { PackingAutomationSection } from "./packingSettings/PackingAutomationSection";
import { PackingShipmentsDocsSection } from "./packingSettings/PackingShipmentsDocsSection";

type LabelTemplateOption = { id: number; name: string };

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

export type WmsPackingSettingsPanelHandle = {
  saveAll: () => Promise<void>;
  discardUnsaved: () => Promise<void>;
};

const WmsPackingSettingsPanel = forwardRef<
  WmsPackingSettingsPanelHandle,
  {
    warehouseId: number | null;
    onDirtyChange?: (dirty: boolean) => void;
    sectionNavObserve?: boolean;
  }
>(function WmsPackingSettingsPanel({ warehouseId, onDirtyChange, sectionNavObserve = true }, ref) {
  const [statusOptions, setStatusOptions] = useState<OrderStatusOption[]>([]);
  const [saleSeries, setSaleSeries] = useState<DocumentSeriesDto[]>([]);
  const [templates, setTemplates] = useState<LabelTemplateOption[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodDto[]>([]);
  const [draft, setDraft] = useState<WmsPackingSettingsRead | null>(null);
  const [extended, setExtended] = useState<WmsPackingExtendedUiSettings>(() => ({
    ...DEFAULT_WMS_PACKING_EXTENDED_UI,
  }));
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
      setShippingMethods([]);
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

    const [stRes, cfgRes, tRes, serRes, shipRes] = await Promise.allSettled([
      listOrderStatuses(DAMAGE_TENANT_ID, warehouseId),
      getWmsPackingSettings(DAMAGE_TENANT_ID, warehouseId),
      api.get<LabelTemplateOption[]>("/label-templates/", { params: { tenant_id: DAMAGE_TENANT_ID } }),
      listDocumentSeries(DAMAGE_TENANT_ID, warehouseId),
      getShippingMethods({ tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId, active_only: true }),
    ]);

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
    } else {
      console.warn("Packing settings API failed, using fallback", cfgRes.reason);
      nextDraft = fallbackDraft;
      setErr("Nie udało się wczytać ustawień pakowania.");
    }

    setStatusOptions(stRes.status === "fulfilled" ? stRes.value : []);
    setSaleSeries(serRes.status === "fulfilled" ? filterSaleSeriesForPacking(serRes.value) : []);
    setShippingMethods(shipRes.status === "fulfilled" ? shipRes.value : []);
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
      description="Konfiguracja procesu pakowania i wyglądu ekranu pakowania (lista kanoniczna Sellasist)."
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
      {err ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      ) : null}
      {okMsg ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {okMsg}
        </p>
      ) : null}
      {loading && !effectiveDraft ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : effectiveDraft ? (
        <div className="space-y-4">
          <PackingGeneralSection extended={extended} patchExtended={patchExtended} />
          <PackingViewSection
            extended={extended}
            draft={effectiveDraft}
            patchExtended={patchExtended}
            toggleInterfaceField={toggleInterfaceField}
          />
          <PackingProcessSection
            extended={extended}
            draft={effectiveDraft}
            statusOptions={statusOptions}
            patchExtended={patchExtended}
            setStatus={setStatus}
            toggleAllowedStart={toggleAllowedStart}
          />
          <PackingAutomationSection
            extended={extended}
            draft={effectiveDraft}
            patchExtended={patchExtended}
            toggleAction={toggleAction}
          />
          <PackingShipmentsDocsSection
            extended={extended}
            draft={effectiveDraft}
            saleSeries={saleSeries}
            templates={templates}
            shippingMethods={shippingMethods}
            patchExtended={patchExtended}
            setDraft={setDraft}
            resolveFallbackDraft={resolveFallbackDraft}
          />
        </div>
      ) : null}
    </WmsSettingsTabFrame>
  );
});

export default WmsPackingSettingsPanel;
