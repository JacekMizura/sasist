import { useEffect, useState } from "react";
import type { LayoutState, RackState } from "../../../types/warehouse";
import { layoutService } from "../../../services/layoutService";
import { layoutStateFromWarehouseApiPayload } from "../../../pages/Products/layoutStateFromWarehouseApi";
import { LocationPreviewFloorPlan } from "./LocationPreviewFloorPlan";

type Props = {
  tenantId: number;
  warehouseId: number;
  locationUuid?: string | null;
  activeRackId?: number | null;
  className?: string;
  layout?: LayoutState | null;
  layoutLoading?: boolean;
  layoutError?: string | null;
};

export function LocationPreviewLayoutMap({
  tenantId,
  warehouseId,
  locationUuid,
  activeRackId,
  className = "",
  layout: layoutProp,
  layoutLoading: layoutLoadingProp,
  layoutError: layoutErrorProp,
}: Props) {
  const [layoutLocal, setLayoutLocal] = useState<LayoutState | null>(null);
  const [loadErrorLocal, setLoadErrorLocal] = useState<string | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(layoutProp === undefined);

  const useExternal = layoutProp !== undefined;
  const layout = useExternal ? layoutProp : layoutLocal;
  const loading = useExternal ? !!layoutLoadingProp : loadingLocal;
  const loadError = useExternal ? layoutErrorProp ?? null : loadErrorLocal;

  useEffect(() => {
    if (useExternal) return;
    let cancelled = false;
    setLoadingLocal(true);
    setLoadErrorLocal(null);
    layoutService
      .getLayout({ tenant_id: tenantId, warehouse_id: warehouseId })
      .then((res) => {
        if (cancelled) return;
        const payload = res.data as { layout?: Record<string, unknown> } | undefined;
        const d = (payload?.layout ?? res.data ?? {}) as Record<string, unknown>;
        if (!d || typeof d !== "object") {
          setLoadErrorLocal("Brak danych layoutu magazynu.");
          setLayoutLocal(null);
          return;
        }
        setLayoutLocal(layoutStateFromWarehouseApiPayload(d, warehouseId));
      })
      .catch(() => {
        if (!cancelled) {
          setLoadErrorLocal("Nie udało się wczytać planu magazynu.");
          setLayoutLocal(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLocal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, warehouseId, useExternal]);

  if (loading) {
    return (
      <div
        className={`flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-600 ${className}`}
      >
        Ładowanie planu magazynu…
      </div>
    );
  }

  if (loadError || !layout) {
    return (
      <div
        className={`flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-center text-sm text-slate-600 ${className}`}
      >
        {loadError || "Brak planu magazynu."}
      </div>
    );
  }

  return (
    <LocationPreviewFloorPlan
      layout={layout}
      activeRackId={activeRackId}
      activeLocationUuid={locationUuid}
      className={`h-full overflow-hidden ${className}`}
    />
  );
}

export function findRackInLayout(
  layout: LayoutState | null,
  rackId?: number | null,
  rackName?: string | null,
): RackState | null {
  if (!layout?.racks.length) return null;
  if (rackId != null) {
    const byId = layout.racks.find((r) => r.id === rackId);
    if (byId) return byId;
  }
  const name = (rackName ?? "").trim();
  if (name) {
    const byName = layout.racks.find((r) => (r.name ?? "").trim() === name);
    if (byName) return byName;
  }
  return null;
}
