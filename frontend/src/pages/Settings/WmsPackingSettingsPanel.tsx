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
import {
  fetchFulfillmentConfiguration,
  patchFulfillmentConfiguration,
} from "../../api/fulfillmentConfigurationApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { getWmsPackingSettings, saveWmsPackingSettings } from "../../api/wmsPackingSettingsApi";
import {
  filterSaleSeriesForPacking,
  listDocumentSeries,
  type DocumentSeriesDto,
} from "../../api/documentSeriesApi";
import { getShippingMethods, type ShippingMethodDto } from "../../api/shippingMethodsApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { warehouseService } from "../../services/warehouseService";
import type {
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
} from "../../types/orderUiStatus";
import type {
  WmsPackingAutoActions,
  WmsPackingInterfaceDisplay,
  WmsPackingSettingsRead,
} from "../../types/wmsPackingSettings";
import {
  createDefaultWmsPackingSettingsRead,
  DEFAULT_WMS_PACKING_INTERFACE_DISPLAY,
  loadCachedWmsPackingSettingsRead,
  normalizeWmsPackingSettingsRead,
  packingAfterFinishActionToUi,
  packingAfterFinishUiToAction,
  saveCachedWmsPackingSettingsRead,
} from "../../types/wmsPackingSettings";
import type { WmsPackingExtendedUiSettings } from "../../types/wmsPackingExtendedUi";
import {
  DEFAULT_WMS_PACKING_EXTENDED_UI,
  loadWmsPackingExtendedUi,
  normalizePackingPostDocumentAction,
  normalizePackingSalesDocumentType,
  saveWmsPackingExtendedUi,
} from "../../types/wmsPackingExtendedUi";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WMS_PACKING_SETTINGS_NAV_SECTIONS } from "./wmsPackingSettingsNavSections";
import { PackingGeneralSection, type PackingWarehouseOption } from "./packingSettings/PackingGeneralSection";
import { PackingViewSection } from "./packingSettings/PackingViewSection";
import { PackingProcessSection } from "./packingSettings/PackingProcessSection";
import { PackingAutomationSection } from "./packingSettings/PackingAutomationSection";
import { PackingShipmentsDocsSection } from "./packingSettings/PackingShipmentsDocsSection";
import { wmsSettingsFormMaxWidthClass } from "./wmsSettingRow";

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

/**
 * Canonical fingerprint for dirty detection — always normalize first so
 * load/save/migrate do not falsely mark the form dirty.
 */
function packingDraftFingerprint(
  tenantId: number,
  warehouseId: number,
  raw: WmsPackingSettingsRead | Partial<WmsPackingSettingsRead>,
): string {
  const d = normalizeWmsPackingSettingsRead(tenantId, warehouseId, raw);
  return stableStringify({
    start_status_id: d.start_status_id ?? null,
    packed_status_id: d.packed_status_id ?? null,
    missing_status_id: d.missing_status_id ?? null,
    allowed_start_status_ids: d.allowed_start_status_ids,
    packing_after_finish_action: d.packing_after_finish_action,
    auto_actions: {
      create_document: Boolean(d.auto_actions.create_document),
      generate_shipment: Boolean(d.auto_actions.generate_shipment),
      print_document: Boolean(d.auto_actions.print_document),
      print_label: Boolean(d.auto_actions.print_label),
      change_order_status: Boolean(d.auto_actions.change_order_status),
    },
    document_settings: {
      invoice_series_id: d.document_settings.invoice_series_id ?? null,
      receipt_series_id: d.document_settings.receipt_series_id ?? null,
      preferred_document_type: d.document_settings.preferred_document_type ?? "FROM_ORDER",
    },
    fallback_label: {
      template_id: d.fallback_label.template_id ?? null,
      delay_seconds: Number(d.fallback_label.delay_seconds) || 0,
    },
    interface_display: {
      show_stock: Boolean(d.interface_display.show_stock),
      show_ean: Boolean(d.interface_display.show_ean),
      show_symbol: Boolean(d.interface_display.show_symbol),
      show_catalog_number: Boolean(d.interface_display.show_catalog_number),
    },
  });
}

/** Fingerprint of extended UI — merge defaults + normalize enums (ignore key-order / legacy noise). */
function packingExtendedFingerprint(ext: WmsPackingExtendedUiSettings): string {
  const e: WmsPackingExtendedUiSettings = {
    ...DEFAULT_WMS_PACKING_EXTENDED_UI,
    ...ext,
    salesDocumentType: normalizePackingSalesDocumentType(ext.salesDocumentType),
    afterSalesDocumentAction: normalizePackingPostDocumentAction(ext.afterSalesDocumentAction),
    afterWaybillAction: normalizePackingPostDocumentAction(ext.afterWaybillAction),
    allowedStartStatusIds: Array.isArray(ext.allowedStartStatusIds)
      ? ext.allowedStartStatusIds.map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
      : DEFAULT_WMS_PACKING_EXTENDED_UI.allowedStartStatusIds,
    forceScanShipmentTemplateMethodIds: Array.isArray(ext.forceScanShipmentTemplateMethodIds)
      ? ext.forceScanShipmentTemplateMethodIds.map(String)
      : DEFAULT_WMS_PACKING_EXTENDED_UI.forceScanShipmentTemplateMethodIds,
    blockExtraParcelsMethodIds: Array.isArray(ext.blockExtraParcelsMethodIds)
      ? ext.blockExtraParcelsMethodIds.map(String)
      : DEFAULT_WMS_PACKING_EXTENDED_UI.blockExtraParcelsMethodIds,
  };
  return stableStringify(e);
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
  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [saleSeries, setSaleSeries] = useState<DocumentSeriesDto[]>([]);
  const [templates, setTemplates] = useState<LabelTemplateOption[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodDto[]>([]);
  const [packingWarehouses, setPackingWarehouses] = useState<PackingWarehouseOption[]>([]);
  const [mainPackingWarehouseId, setMainPackingWarehouseId] = useState<number | null>(null);
  const [baselineMainPackingWarehouseId, setBaselineMainPackingWarehouseId] = useState<number | null>(null);
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
      setPanelSummary(null);
      setPanelSubgroups([]);
      setSaleSeries([]);
      setTemplates([]);
      setShippingMethods([]);
      setPackingWarehouses([]);
      setMainPackingWarehouseId(null);
      setBaselineMainPackingWarehouseId(null);
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
    // Clear baselines while loading so interim draft/fallback cannot look "dirty".
    setBaselineDraft(null);
    setBaselineExtended(null);
    const fallbackDraft = resolveFallbackDraft();
    setDraft((prev) => prev ?? fallbackDraft);

    const [summaryRes, subgroupsRes, cfgRes, tRes, serRes, shipRes, whRes, asgRes, fcRes] =
      await Promise.allSettled([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId, { includeInactive: true }),
        getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId),
        getWmsPackingSettings(DAMAGE_TENANT_ID, warehouseId),
        api.get<LabelTemplateOption[]>("/label-templates/", {
          params: { tenant_id: DAMAGE_TENANT_ID, template_type: "order_replacement" },
        }),
        listDocumentSeries(DAMAGE_TENANT_ID, warehouseId),
        getShippingMethods({ tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId, active_only: true }),
        warehouseService.getWarehouses(DAMAGE_TENANT_ID),
        warehouseService.getAssignments({ tenant_id: DAMAGE_TENANT_ID }),
        fetchFulfillmentConfiguration(DAMAGE_TENANT_ID),
      ]);

    const legacyExtended = loadWmsPackingExtendedUi(warehouseId);

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
      // One-time migrate legacy localStorage multi-start statuses into the working draft.
      // Baseline uses the same post-migrate draft — do not mark dirty for migrate alone.
      if (
        nextDraft.allowed_start_status_ids.length === 0 &&
        Array.isArray(legacyExtended.allowedStartStatusIds) &&
        legacyExtended.allowedStartStatusIds.length > 0
      ) {
        nextDraft = {
          ...nextDraft,
          allowed_start_status_ids: [...legacyExtended.allowedStartStatusIds]
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b),
        };
      }
      saveCachedWmsPackingSettingsRead(warehouseId, nextDraft);
    } else {
      console.warn("Packing settings API failed, using fallback", cfgRes.reason);
      nextDraft = fallbackDraft;
      setErr("Nie udało się wczytać ustawień pakowania.");
    }

    setPanelSummary(summaryRes.status === "fulfilled" ? summaryRes.value : null);
    setPanelSubgroups(subgroupsRes.status === "fulfilled" ? subgroupsRes.value : []);
    setSaleSeries(serRes.status === "fulfilled" ? filterSaleSeriesForPacking(serRes.value) : []);
    setShippingMethods(shipRes.status === "fulfilled" ? shipRes.value : []);
    if (tRes.status === "fulfilled") {
      const rows = Array.isArray(tRes.value.data) ? tRes.value.data : [];
      setTemplates(rows.map((r) => ({ id: r.id, name: r.name || `Szablon #${r.id}` })));
    } else {
      setTemplates([]);
    }

    const warehousesRaw = whRes.status === "fulfilled" && Array.isArray(whRes.value.data) ? whRes.value.data : [];
    const assignmentsRaw =
      asgRes.status === "fulfilled" && Array.isArray(asgRes.value.data) ? asgRes.value.data : [];
    const eligibleIds = new Set(
      assignmentsRaw
        .filter((a) => a.fulfillment_eligible !== false)
        .map((a) => Number(a.warehouse_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
    // Prefer fulfillment-eligible; if assignments missing, fall back to all tenant warehouses.
    const eligibleWarehouses =
      eligibleIds.size > 0
        ? warehousesRaw.filter((w) => eligibleIds.has(Number(w.id)))
        : warehousesRaw;
    setPackingWarehouses(
      eligibleWarehouses
        .map((w) => ({ id: Number(w.id), name: String(w.name || `Magazyn #${w.id}`) }))
        .filter((w) => Number.isFinite(w.id) && w.id > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "pl")),
    );

    const cw =
      fcRes.status === "fulfilled" && fcRes.value.consolidation_warehouse_id != null
        ? Number(fcRes.value.consolidation_warehouse_id)
        : null;
    const mainWh = cw != null && Number.isFinite(cw) && cw > 0 ? cw : null;
    setMainPackingWarehouseId(mainWh);
    setBaselineMainPackingWarehouseId(mainWh);

    const finalDraft = cfgRes.status === "fulfilled" ? nextDraft : fallbackDraft;
    setDraft(finalDraft);
    const preferred = String(finalDraft.document_settings.preferred_document_type ?? "FROM_ORDER")
      .trim()
      .toUpperCase();
    const salesDocumentType = normalizePackingSalesDocumentType(
      preferred === "INVOICE" ? "invoice" : preferred === "PARAGON" ? "receipt" : "from_order",
    );
    const ext: WmsPackingExtendedUiSettings = {
      ...DEFAULT_WMS_PACKING_EXTENDED_UI,
      ...legacyExtended,
      // SSOT efektu po akcjach = API ``packing_after_finish_action`` (nie lokalny checkbox).
      afterActionsBehavior: packingAfterFinishActionToUi(finalDraft.packing_after_finish_action),
      // SSOT multi-start = API; keep local mirror in sync after migrate/load.
      allowedStartStatusIds: finalDraft.allowed_start_status_ids,
      // SSOT typu dokumentu = API preferred_document_type.
      salesDocumentType,
      // SSOT wielopaczkowość + limit paczek = API ``multi_parcel`` (gdy dostępne).
      enableMultiParcel: Boolean(finalDraft.multi_parcel?.enable_multi_parcel),
      parcelLimitWithoutManagerConfirm: Math.min(
        99,
        Math.max(0, Math.floor(Number(finalDraft.multi_parcel?.parcel_limit_without_manager_confirm) || 5)),
      ),
    };
    setExtended(ext);
    // Baseline = exactly what is shown — section switches / remounts must not look dirty.
    setBaselineDraft(packingDraftFingerprint(DAMAGE_TENANT_ID, warehouseId, finalDraft));
    setBaselineExtended(packingExtendedFingerprint(ext));
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
    if (warehouseId == null || effectiveDraft == null || baselineDraft == null || baselineExtended == null) {
      return false;
    }
    const mainWhDirty = mainPackingWarehouseId !== baselineMainPackingWarehouseId;
    return (
      packingDraftFingerprint(DAMAGE_TENANT_ID, warehouseId, effectiveDraft) !== baselineDraft ||
      packingExtendedFingerprint(extended) !== baselineExtended ||
      mainWhDirty
    );
  }, [
    warehouseId,
    effectiveDraft,
    extended,
    baselineDraft,
    baselineExtended,
    mainPackingWarehouseId,
    baselineMainPackingWarehouseId,
  ]);

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

  const setAllowedStartStatusIds = (ids: number[]) => {
    const nextIds = [...ids].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    const sameIds = (prev: number[] | undefined) =>
      Array.isArray(prev) &&
      prev.length === nextIds.length &&
      prev.every((v, i) => v === nextIds[i]);
    setDraft((d) => {
      if (warehouseId == null) return d;
      const base = d ?? resolveFallbackDraft();
      if (sameIds(base.allowed_start_status_ids)) return d;
      return { ...base, allowed_start_status_ids: nextIds };
    });
    setExtended((e) => (sameIds(e.allowedStartStatusIds) ? e : { ...e, allowedStartStatusIds: nextIds }));
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

  const saveAll = async () => {
    if (warehouseId == null || effectiveDraft == null) return;
    const packingAfter = packingAfterFinishUiToAction(extended.afterActionsBehavior);
    const preferredFromUi =
      extended.salesDocumentType === "invoice"
        ? "INVOICE"
        : extended.salesDocumentType === "receipt"
          ? "PARAGON"
          : "FROM_ORDER";
    const normalized = normalizeWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId, {
      ...effectiveDraft,
      packing_after_finish_action: packingAfter,
      document_settings: {
        ...effectiveDraft.document_settings,
        preferred_document_type: preferredFromUi as "FROM_ORDER" | "INVOICE" | "PARAGON",
      },
    });
    setOkMsg(null);
    setSaving(true);
    try {
      const docSettings = {
        ...normalized.document_settings,
        series_id: null,
        invoice_series_id: normalized.document_settings.invoice_series_id?.trim() || null,
        receipt_series_id: normalized.document_settings.receipt_series_id?.trim() || null,
        preferred_document_type: preferredFromUi as "FROM_ORDER" | "INVOICE" | "PARAGON",
      };
      const saved = await saveWmsPackingSettings({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        start_status_id: normalized.start_status_id,
        packed_status_id: normalized.packed_status_id,
        missing_status_id: normalized.missing_status_id,
        allowed_start_status_ids: normalized.allowed_start_status_ids,
        packing_after_finish_action: packingAfter,
        auto_actions: normalized.auto_actions,
        document_settings: docSettings,
        fallback_label: normalized.fallback_label,
        interface_display: normalized.interface_display,
        multi_parcel: {
          enable_multi_parcel: Boolean(extended.enableMultiParcel),
          parcel_limit_without_manager_confirm: Math.min(
            99,
            Math.max(0, Math.floor(Number(extended.parcelLimitWithoutManagerConfirm) || 0)),
          ),
        },
      });
      await patchFulfillmentConfiguration(DAMAGE_TENANT_ID, {
        consolidation_warehouse_id: mainPackingWarehouseId,
      });
      const savedNormalized = normalizeWmsPackingSettingsRead(DAMAGE_TENANT_ID, warehouseId, {
        ...saved,
        document_settings: {
          ...saved.document_settings,
          preferred_document_type: preferredFromUi,
        },
      });
      setDraft(savedNormalized);
      saveCachedWmsPackingSettingsRead(warehouseId, savedNormalized);
      const extAfterSave: WmsPackingExtendedUiSettings = {
        ...extended,
        afterActionsBehavior: packingAfterFinishActionToUi(savedNormalized.packing_after_finish_action),
        allowedStartStatusIds: savedNormalized.allowed_start_status_ids,
        salesDocumentType: normalizePackingSalesDocumentType(
          preferredFromUi === "INVOICE" ? "invoice" : preferredFromUi === "PARAGON" ? "receipt" : "from_order",
        ),
        enableMultiParcel: Boolean(savedNormalized.multi_parcel?.enable_multi_parcel ?? extended.enableMultiParcel),
        parcelLimitWithoutManagerConfirm: Math.min(
          99,
          Math.max(
            0,
            Math.floor(
              Number(
                savedNormalized.multi_parcel?.parcel_limit_without_manager_confirm ??
                  extended.parcelLimitWithoutManagerConfirm,
              ) || 0,
            ),
          ),
        ),
      };
      setExtended(extAfterSave);
      saveWmsPackingExtendedUi(warehouseId, extAfterSave);
      setBaselineDraft(packingDraftFingerprint(DAMAGE_TENANT_ID, warehouseId, savedNormalized));
      setBaselineExtended(packingExtendedFingerprint(extAfterSave));
      setBaselineMainPackingWarehouseId(mainPackingWarehouseId);
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
      const extLocal: WmsPackingExtendedUiSettings = {
        ...extended,
        allowedStartStatusIds: normalized.allowed_start_status_ids,
        salesDocumentType: normalizePackingSalesDocumentType(
          preferredFromUi === "INVOICE" ? "invoice" : preferredFromUi === "PARAGON" ? "receipt" : "from_order",
        ),
      };
      setExtended(extLocal);
      saveWmsPackingExtendedUi(warehouseId, extLocal);
      setBaselineDraft(packingDraftFingerprint(DAMAGE_TENANT_ID, warehouseId, normalized));
      setBaselineExtended(packingExtendedFingerprint(extLocal));
      setErr(
        "Nie udało się zapisać ustawień (w tym głównego magazynu pakowania) na serwerze. Sprawdź połączenie i spróbuj ponownie.",
      );
      setOkMsg(null);
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
        setMainPackingWarehouseId(null);
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
        <div className={`${wmsSettingsFormMaxWidthClass} space-y-4`}>
          <PackingGeneralSection
            extended={extended}
            patchExtended={patchExtended}
            mainPackingWarehouseId={mainPackingWarehouseId}
            onMainPackingWarehouseChange={setMainPackingWarehouseId}
            warehouses={packingWarehouses}
            warehousesLoading={loading}
          />
          <PackingViewSection
            extended={extended}
            draft={effectiveDraft}
            patchExtended={patchExtended}
            toggleInterfaceField={toggleInterfaceField}
          />
          <PackingProcessSection
            extended={extended}
            draft={effectiveDraft}
            panelSummary={panelSummary}
            panelSubgroups={panelSubgroups}
            patchExtended={patchExtended}
            setStatus={setStatus}
            setAllowedStartStatusIds={setAllowedStartStatusIds}
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
