import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { layoutService } from "../services/layoutService";
import type { CustomRackTemplate, LayoutState } from "../types/warehouse";
import { buildWarehouseStructurePdfPayload } from "../pdf/utils/structureReportPayload";
import { WarehouseStructureReportView } from "./WarehouseStructureReportView";

type RouteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: ReturnType<typeof buildWarehouseStructurePdfPayload> };

function toInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default function WarehouseStructureReportPage() {
  const [search] = useSearchParams();
  const warehouseId = useMemo(() => toInt(search.get("warehouse_id")), [search]);
  const layoutId = useMemo(() => toInt(search.get("layout_id")), [search]);
  const tenantId = useMemo(() => toInt(search.get("tenant_id")) ?? 1, [search]);
  const [state, setState] = useState<RouteState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    async function load() {
      if (warehouseId == null || layoutId == null) {
        setState({ status: "error", message: "Brak wymaganych parametrów: warehouse_id oraz layout_id." });
        return;
      }
      setState({ status: "loading" });
      try {
        const [layoutRes, templatesRes] = await Promise.all([
          layoutService.getLayout({ warehouse_id: warehouseId, layout_id: String(layoutId), tenant_id: tenantId }),
          api.get<CustomRackTemplate[]>("/warehouse/templates", { params: { tenant_id: tenantId } }),
        ]);
        const rawLayout = (layoutRes.data as { layout?: LayoutState } | LayoutState).layout ?? (layoutRes.data as LayoutState);
        const payload = buildWarehouseStructurePdfPayload(rawLayout, Array.isArray(templatesRes.data) ? templatesRes.data : []);
        if (!active) return;
        setState({ status: "ready", payload });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Nie udało się załadować danych raportu.";
        if (!active) return;
        setState({ status: "error", message: msg });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [warehouseId, layoutId, tenantId]);

  if (state.status === "loading") {
    return (
      <main className="w-full px-6 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">Ładowanie raportu...</div>
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className="w-full px-6 py-10">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{state.message}</div>
      </main>
    );
  }

  return (
    <main data-report-ready="true" className="bg-white">
      <WarehouseStructureReportView payload={state.payload} />
    </main>
  );
}
