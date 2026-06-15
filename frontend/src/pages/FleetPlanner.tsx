import { useState } from "react";
import { useTranslation } from "../locales";
import { useWarehouse } from "../context/WarehouseContext";
import { useCartsRefresh } from "../context/CartsRefreshContext";
import api from "../api/axios";
import PageLayout from "../components/layout/PageLayout";
import { PageHeader } from "../components/layout/PageHeader";

type AnalyzeResult = {
  orders_to_serve: number;
  assigned_in_simulation: number;
  remaining_orders: number;
  suggested_sectional_carts: number;
  suggested_bulk_carts: number;
  total_capacity_dm3: number;
  used_capacity_dm3: number;
  remaining_capacity_percent: number;
  status: string;
};

const TENANT_ID = 1;

export default function FleetPlanner() {
  const t = useTranslation();
  const { warehouse } = useWarehouse();
  const refreshCarts = useCartsRefresh()?.refreshCarts;
  const warehouseId = warehouse?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!warehouseId) {
      setError("Wybierz magazyn.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.get<AnalyzeResult>("/optimizer/analyze/", {
        params: { tenant_id: TENANT_ID, warehouse_id: warehouseId },
      });
      setResult(res.data);
      refreshCarts?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Błąd analizy");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!warehouseId) {
      setError("Wybierz magazyn.");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await api.post<AnalyzeResult>("/optimizer/apply/", null, {
        params: { tenant_id: TENANT_ID, warehouse_id: warehouseId },
      });
      setResult(res.data);
      refreshCarts?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Błąd zapisu przypisań");
    } finally {
      setApplying(false);
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.optimizer_fleet_planner ?? "Planer floty"}
        actions={
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading || !warehouseId}
            className="rounded-lg bg-violet-600 px-6 py-3 text-sm font-bold uppercase text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t.loading : (t.optimizer_analyze_button ?? "Oblicz zapotrzebowanie na wózki")}
          </button>
        }
      />
      <p className="text-sm text-slate-500">
        {t.optimizer_analyze_subtitle ?? "Oblicz minimalne zapotrzebowanie na wózki dla zamówień NEW."}
      </p>
      {!warehouseId ? (
        <p className="mt-2 text-sm font-medium text-amber-800">Wybierz magazyn.</p>
      ) : null}

      {/* Dashboard stub cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
              {t.optimizer_new_orders_stub ?? "Total NEW Orders"}
            </div>
            <div className="text-2xl font-black text-slate-800">
              {result != null ? result.orders_to_serve : "—"}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
              {t.optimizer_fleet_capacity_stub ?? "Available Fleet Capacity"}
            </div>
            <div className="text-2xl font-black text-slate-800">
              {result != null ? `${result.total_capacity_dm3.toFixed(0)} dm³` : "—"}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
              {t.optimizer_suggested_mix ?? "Suggested Cart Mix"}
            </div>
            <div className="text-sm font-semibold text-slate-700">
              {result != null
                ? `${t.sectionalCarts ?? "Sectional"}: ${result.suggested_sectional_carts}, ${t.bulkCarts ?? "Bulk"}: ${result.suggested_bulk_carts}`
                : (t.optimizer_suggested_mix_placeholder ?? "Recommended: N Sectional, M Bulk")}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-white rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">
                {t.optimizer_summary ?? "Podsumowanie"}
              </h2>
              <button
                type="button"
                onClick={handleApply}
                disabled={applying}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-bold uppercase text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {applying ? t.loading : "Zatwierdź i przypisz do wózków"}
              </button>
            </div>
            <ul className="space-y-2 text-slate-700">
              <li>
                <span className="font-semibold">{t.optimizer_orders_to_serve ?? "Zamówienia do obsłużenia"}:</span>{" "}
                {result.orders_to_serve}
              </li>
              <li>
                <span className="font-semibold">{t.optimizer_assigned ?? "Przypisane w symulacji"}:</span>{" "}
                {result.assigned_in_simulation}
              </li>
              <li>
                <span className="font-semibold">{t.optimizer_remaining_orders ?? "Pozostałe zamówienia"}:</span>{" "}
                {result.remaining_orders}
              </li>
              <li>
                <span className="font-semibold">{t.optimizer_suggested_mix ?? "Sugerowana mieszanka"}:</span>{" "}
                {result.suggested_sectional_carts} wózków sekcyjnych, {result.suggested_bulk_carts} wózków standardowych
              </li>
              <li>
                <span className="font-semibold">{t.optimizer_remaining_capacity ?? "Pozostałe miejsce"}:</span>{" "}
                {result.remaining_capacity_percent.toFixed(1)}%
              </li>
              <li className="text-slate-500 text-sm">
                Pojemność: {result.used_capacity_dm3.toFixed(1)} / {result.total_capacity_dm3.toFixed(1)} dm³
              </li>
            </ul>
          </div>
        )}
    </PageLayout>
  );
}
