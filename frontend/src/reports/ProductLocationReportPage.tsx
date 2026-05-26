import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { layoutService } from "../services/layoutService";
import type { LayoutState, WarehouseProduct } from "../types/warehouse";
import {
  buildProductLocationReportData,
  type ProductLocationReportData,
} from "../pdf/utils/productLocationReportDataBuilder";
import { ProductLocationReportView } from "./ProductLocationReportView";

type RouteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ProductLocationReportData };

function toInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default function ProductLocationReportPage() {
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
        const [layoutRes, productsRes] = await Promise.all([
          layoutService.getLayout({ warehouse_id: warehouseId, layout_id: String(layoutId), tenant_id: tenantId }),
          api.get<{ items?: WarehouseProduct[]; total?: number } | WarehouseProduct[]>("/products/", { params: { tenant_id: tenantId } }),
        ]);
        const rawLayout =
          (layoutRes.data as { layout?: LayoutState } | LayoutState).layout ??
          (layoutRes.data as LayoutState);
        const rawProducts = Array.isArray((productsRes.data as { items?: WarehouseProduct[] })?.items)
          ? (productsRes.data as { items: WarehouseProduct[] }).items
          : Array.isArray(productsRes.data)
            ? productsRes.data
            : [];
        const productsList: WarehouseProduct[] = rawProducts.map((p) => {
          const assigned = (
            Array.isArray((p as WarehouseProduct & { assigned_locations?: unknown }).assigned_locations)
              ? (p as WarehouseProduct & { assigned_locations?: unknown[] }).assigned_locations
              : Array.isArray(p.assignedLocations)
                ? p.assignedLocations
                : []
          ) as WarehouseProduct["assignedLocations"];
          return {
            ...p,
            assignedLocations: assigned,
          };
        });
        if (productsList.length === 0) {
          console.warn("Products list is empty - check API response");
        }
        const data = buildProductLocationReportData({
          layout: rawLayout,
          products: productsList,
        });
        if (!active) return;
        setState({ status: "ready", data });
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
      <ProductLocationReportView data={state.data} />
    </main>
  );
}
