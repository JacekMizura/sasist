import { useCallback, useEffect, useMemo, useState } from "react";

import { listOrderStatuses } from "../../../../api/orderStatusesApi";
import type { OrderStatusOption } from "../../../../types/wmsPackingSettings";
import { writeCachedDirectSalesSettings } from "../../../directSales/settings/directSalesSettingsCache";
import { getDirectSalesSettings, saveDirectSalesSettings } from "../api/directSalesSettingsApi";
import type { DirectSalesSettingsConfig, EditScope } from "../schemas/directSalesSettingsSchema";
import { normalizeDirectSalesSettings } from "../schemas/directSalesSettingsSchema";

function fingerprint(c: DirectSalesSettingsConfig): string {
  return JSON.stringify(c);
}

export function useDirectSalesSettings(tenantId: number, warehouseId: number | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<EditScope>("warehouse");
  const [draft, setDraft] = useState<DirectSalesSettingsConfig | null>(null);
  const [savedScopeSnapshot, setSavedScopeSnapshot] = useState("");
  const [hasWarehouseOverride, setHasWarehouseOverride] = useState(false);
  const [statusOptions, setStatusOptions] = useState<OrderStatusOption[]>([]);

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    setError(null);
    try {
      const [data, statuses] = await Promise.all([
        getDirectSalesSettings({ tenantId, warehouseId }),
        listOrderStatuses(tenantId, warehouseId).catch(() => [] as OrderStatusOption[]),
      ]);
      setStatusOptions(statuses);
      setHasWarehouseOverride(data.has_warehouse_override);
      const base = scope === "tenant" ? data.tenant_defaults : data.resolved;
      const normalized = normalizeDirectSalesSettings(base, statuses);
      setDraft(normalized);
      setSavedScopeSnapshot(fingerprint(normalized));
    } catch {
      setError("Nie udało się wczytać ustawień sprzedaży bezpośredniej.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return fingerprint(draft) !== savedScopeSnapshot;
  }, [draft, savedScopeSnapshot]);

  const patch = useCallback((p: Partial<DirectSalesSettingsConfig>) => {
    setDraft((prev) => (prev ? { ...prev, ...p, payment_methods: { ...prev.payment_methods, ...(p.payment_methods ?? {}) } } : prev));
  }, []);

  const save = useCallback(async () => {
    if (!draft || warehouseId == null) return;
    const saveWh = scope === "tenant" ? 0 : warehouseId;
    const data = await saveDirectSalesSettings({
      tenant_id: tenantId,
      warehouse_id: saveWh,
      settings: draft,
    });
    const normalized = normalizeDirectSalesSettings(
      scope === "tenant" ? data.tenant_defaults : data.resolved,
      statusOptions,
    );
    setDraft(normalized);
    setSavedScopeSnapshot(fingerprint(normalized));
    setHasWarehouseOverride(data.has_warehouse_override);
    if (warehouseId != null && scope === "warehouse") {
      writeCachedDirectSalesSettings(data);
    }
  }, [draft, tenantId, warehouseId, scope, statusOptions]);

  const discard = useCallback(() => {
    void load();
  }, [load]);

  const switchScope = useCallback((next: EditScope) => {
    setScope(next);
  }, []);

  return {
    loading,
    error,
    scope,
    switchScope,
    draft,
    patch,
    dirty,
    save,
    discard,
    hasWarehouseOverride,
    statusOptions,
    reload: load,
  };
}
