import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import {
  normalizeListViewPayload,
  payloadForAutosave,
  payloadForPreset,
  resolveHydratedPayload,
  writeLegacyColumnLayout,
  writeLegacyFilterFieldOrder,
} from "./listViewCodec";
import {
  createListViewPreset,
  deleteListViewAutosave,
  deleteListViewPresetApi,
  fetchListViewScreen,
  patchListViewPreset,
  putListViewAutosave,
  setDefaultListViewPreset,
} from "./listViewStateApi";
import type {
  ListViewAdapterConfig,
  ListViewPresetRecord,
  ListViewScreenBundle,
  ListViewStatePayload,
  SavePresetInput,
} from "./listViewStateTypes";
import { clearListViewCache, readListViewCache, writeListViewCache } from "./listViewStorage";

const AUTOSAVE_DEBOUNCE_MS = 450;

function payloadFromState<TFilters>(
  appliedFilters: TFilters,
  config: ListViewAdapterConfig<TFilters>,
  sortBy: string,
  sortDir: "asc" | "desc",
  page: number,
  pageSize: number,
  columnOrder: string[],
  filterFieldOrder: string[],
  filtersExpanded: boolean,
  extensions: Record<string, unknown>,
): ListViewStatePayload {
  return {
    filters: config.serializeFilters(appliedFilters),
    sort: { key: sortBy, dir: sortDir },
    pagination: { pageSize, page },
    columns: { order: columnOrder },
    filterFields: { visibleOrder: filterFieldOrder },
    ui: { filtersExpanded, extensions },
  };
}

function applyPayloadToReactState<TFilters>(
  payload: ListViewStatePayload,
  config: ListViewAdapterConfig<TFilters>,
): {
  applied: TFilters;
  draft: TFilters;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
  columnOrder: string[];
  filterFieldOrder: string[];
  filtersExpanded: boolean;
  extensions: Record<string, unknown>;
} {
  const normalized = normalizeListViewPayload(
    payload,
    config.createFactoryDefault(),
    config.columnCatalog,
    config.filterFieldCatalog,
  );
  const applied = config.deserializeFilters(normalized.filters, config.filterDefaults);
  return {
    applied,
    draft: applied,
    sortBy: normalized.sort?.key ?? config.createFactoryDefault().sort?.key ?? "id",
    sortDir: normalized.sort?.dir ?? config.createFactoryDefault().sort?.dir ?? "asc",
    page: normalized.pagination.page ?? 1,
    pageSize: normalized.pagination.pageSize,
    columnOrder: normalized.columns.order,
    filterFieldOrder: normalized.filterFields.visibleOrder,
    filtersExpanded: normalized.ui?.filtersExpanded ?? false,
    extensions: normalized.ui?.extensions ?? {},
  };
}

export function useListViewState<TFilters>(config: ListViewAdapterConfig<TFilters>) {
  const { user, sessionReady } = useAuth();
  const userId = user?.id ?? null;
  const enabled = (config.enabled ?? true) && sessionReady && userId != null;

  const factoryDefault = useMemo(() => config.createFactoryDefault(), [config]);
  const [isHydrated, setIsHydrated] = useState(!enabled);
  const [bundle, setBundle] = useState<ListViewScreenBundle | null>(null);
  const [draftFilters, setDraftFilters] = useState<TFilters>(config.filterDefaults);
  const [appliedFilters, setAppliedFilters] = useState<TFilters>(config.filterDefaults);
  const [sortBy, setSortBy] = useState(factoryDefault.sort?.key ?? "id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(factoryDefault.sort?.dir ?? "asc");
  const [page, setPage] = useState(factoryDefault.pagination.page ?? 1);
  const [pageSize, setPageSize] = useState(factoryDefault.pagination.pageSize);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [...factoryDefault.columns.order]);
  const [filterFieldOrder, setFilterFieldOrder] = useState<string[]>(() => [...factoryDefault.filterFields.visibleOrder]);
  const [filtersExpanded, setFiltersExpanded] = useState(factoryDefault.ui?.filtersExpanded ?? false);
  const [extensions, setExtensionsState] = useState<Record<string, unknown>>(factoryDefault.ui?.extensions ?? {});

  const hydratingRef = useRef(true);
  const autosaveTimerRef = useRef<number | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const appliedFiltersKey = useMemo(() => JSON.stringify(config.serializeFilters(appliedFilters)), [appliedFilters, config]);

  const currentPayload = useMemo(
    () =>
      payloadFromState(
        appliedFilters,
        config,
        sortBy,
        sortDir,
        page,
        pageSize,
        columnOrder,
        filterFieldOrder,
        filtersExpanded,
        extensions,
      ),
    [appliedFilters, config, sortBy, sortDir, page, pageSize, columnOrder, filterFieldOrder, filtersExpanded, extensions],
  );

  const hydrateFromPayload = useCallback((payload: ListViewStatePayload) => {
    hydratingRef.current = true;
    const next = applyPayloadToReactState(payload, configRef.current);
    setDraftFilters(next.draft);
    setAppliedFilters(next.applied);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
    setPage(next.page);
    setPageSize(next.pageSize);
    setColumnOrder(next.columnOrder);
    setFilterFieldOrder(next.filterFieldOrder);
    setFiltersExpanded(next.filtersExpanded);
    setExtensionsState(next.extensions);
    window.setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    if (!enabled || userId == null) {
      setIsHydrated(true);
      hydratingRef.current = false;
      return;
    }

    let cancelled = false;
    hydratingRef.current = true;

    const run = async () => {
      const legacy = configRef.current.legacyLocalStorage?.() ?? null;
      const cached = readListViewCache(configRef.current.tenantId, userId, configRef.current.screenId);
      const factory = configRef.current.createFactoryDefault();

      if (cached.bundle) {
        setBundle(cached.bundle);
      }

      try {
        const remote = await fetchListViewScreen(configRef.current.tenantId, configRef.current.screenId);
        if (cancelled) return;
        setBundle(remote);
        writeListViewCache(configRef.current.tenantId, userId, configRef.current.screenId, remote);
        const resolved = resolveHydratedPayload(
          factory,
          remote,
          legacy,
          configRef.current.columnCatalog,
          configRef.current.filterFieldCatalog,
        );
        hydrateFromPayload(resolved);
      } catch {
        if (cancelled) return;
        const resolved = resolveHydratedPayload(
          factory,
          cached.bundle,
          legacy ?? (cached.autosave ? { ...cached.autosave } : null),
          configRef.current.columnCatalog,
          configRef.current.filterFieldCatalog,
        );
        hydrateFromPayload(resolved);
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
          window.setTimeout(() => {
            hydratingRef.current = false;
          }, 0);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, config.screenId, config.tenantId, hydrateFromPayload]);

  const scheduleAutosave = useCallback(
    (payload: ListViewStatePayload) => {
      if (!enabled || userId == null || hydratingRef.current) return;
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = window.setTimeout(() => {
        autosaveTimerRef.current = null;
        const body = payloadForAutosave(payload);
        void putListViewAutosave(configRef.current.tenantId, configRef.current.screenId, body)
          .then((autosave) => {
            setBundle((prev) => {
              const next: ListViewScreenBundle = {
                screen_key: configRef.current.screenId,
                autosave: {
                  id: autosave.id,
                  payload: body,
                  schema_version: autosave.schema_version,
                  updated_at: autosave.updated_at,
                },
                presets: prev?.presets ?? [],
              };
              writeListViewCache(configRef.current.tenantId, userId, configRef.current.screenId, next);
              return next;
            });
          })
          .catch(() => {
            /* offline — local cache only */
            setBundle((prev) => {
              const next: ListViewScreenBundle = {
                screen_key: configRef.current.screenId,
                autosave: {
                  id: prev?.autosave?.id ?? -1,
                  payload: body,
                  schema_version: 1,
                  updated_at: new Date().toISOString(),
                },
                presets: prev?.presets ?? [],
              };
              writeListViewCache(configRef.current.tenantId, userId, configRef.current.screenId, next);
              return next;
            });
          });
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [enabled, userId],
  );

  useEffect(() => {
    if (!isHydrated) return;
    scheduleAutosave(currentPayload);
  }, [currentPayload, isHydrated, scheduleAutosave]);

  const persistColumnOrder = useCallback(
    (next: string[]) => {
      const normalized = normalizeListViewPayload(
        { columns: { order: next } },
        configRef.current.createFactoryDefault(),
        configRef.current.columnCatalog,
        configRef.current.filterFieldCatalog,
      ).columns.order;
      setColumnOrder(normalized);
    },
    [],
  );

  const setFilterFieldOrderFromModal = useCallback((next: string[]) => {
    const normalized = normalizeListViewPayload(
      { filterFields: { visibleOrder: next } },
      configRef.current.createFactoryDefault(),
      configRef.current.columnCatalog,
      configRef.current.filterFieldCatalog,
    ).filterFields.visibleOrder;
    setFilterFieldOrder(normalized);
  }, []);

  const applyFilters = useCallback(() => {
    setAppliedFilters(draftFilters);
    setPage(1);
  }, [draftFilters]);

  const clearFilters = useCallback(() => {
    const defaults = configRef.current.filterDefaults;
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPage(1);
  }, []);

  const toggleSort = useCallback((key: string) => {
    setSortBy((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir("asc");
      return key;
    });
    setPage(1);
  }, []);

  const setExtension = useCallback((key: string, value: unknown) => {
    setExtensionsState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const refreshPresets = useCallback(async () => {
    if (!enabled || userId == null) return;
    const remote = await fetchListViewScreen(configRef.current.tenantId, configRef.current.screenId);
    setBundle(remote);
    writeListViewCache(configRef.current.tenantId, userId, configRef.current.screenId, remote);
  }, [enabled, userId]);

  const applyPreset = useCallback(
    (preset: ListViewPresetRecord) => {
      hydrateFromPayload(
        normalizeListViewPayload(
          preset.payload,
          configRef.current.createFactoryDefault(),
          configRef.current.columnCatalog,
          configRef.current.filterFieldCatalog,
        ),
      );
      setPage(1);
    },
    [hydrateFromPayload],
  );

  const saveCurrentAsPreset = useCallback(
    async (input: SavePresetInput) => {
      if (!enabled || userId == null) return;
      const presetPayload = payloadForPreset(currentPayload);
      if (input.overwritePresetId != null) {
        await patchListViewPreset(config.tenantId, config.screenId, input.overwritePresetId, {
          name: input.name,
          payload: presetPayload,
          isDefault: input.isDefault,
        });
      } else {
        await createListViewPreset(config.tenantId, config.screenId, {
          name: input.name,
          payload: presetPayload,
          isPublic: input.isPublic,
          isDefault: input.isDefault,
        });
      }
      await refreshPresets();
    },
    [config.screenId, config.tenantId, currentPayload, enabled, refreshPresets, userId],
  );

  const deletePreset = useCallback(
    async (presetId: number) => {
      if (!enabled) return;
      await deleteListViewPresetApi(config.tenantId, config.screenId, presetId);
      await refreshPresets();
    },
    [config.screenId, config.tenantId, enabled, refreshPresets],
  );

  const setDefaultPreset = useCallback(
    async (presetId: number) => {
      if (!enabled) return;
      await setDefaultListViewPreset(config.tenantId, config.screenId, presetId);
      await refreshPresets();
    },
    [config.screenId, config.tenantId, enabled, refreshPresets],
  );

  const resetView = useCallback(async () => {
    if (enabled && userId != null) {
      try {
        await deleteListViewAutosave(config.tenantId, config.screenId);
      } catch {
        /* ignore */
      }
      clearListViewCache(config.tenantId, userId, config.screenId);
    }
    hydrateFromPayload(configRef.current.createFactoryDefault());
    setPage(1);
    await refreshPresets();
  }, [config.screenId, config.tenantId, enabled, hydrateFromPayload, refreshPresets, userId]);

  const toggleFiltersPanel = useCallback(() => {
    setFiltersExpanded((prev) => {
      const next = !prev;
      if (next) setDraftFilters(appliedFilters);
      return next;
    });
  }, [appliedFilters]);

  return {
    isHydrated,
    bundle,
    presets: bundle?.presets ?? [],
    draftFilters,
    setDraftFilters,
    appliedFilters,
    setAppliedFilters,
    appliedFiltersKey,
    applyFilters,
    clearFilters,
    sortBy,
    sortDir,
    setSortBy,
    setSortDir,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    columnOrder,
    persistColumnOrder,
    filterFieldOrder,
    setFilterFieldOrder: setFilterFieldOrderFromModal,
    filtersExpanded,
    setFiltersExpanded,
    toggleFiltersPanel,
    extensions,
    setExtension,
    setExtensionsState,
    applyPreset,
    saveCurrentAsPreset,
    deletePreset,
    setDefaultPreset,
    resetView,
    refreshPresets,
    currentPayload,
  };
}
