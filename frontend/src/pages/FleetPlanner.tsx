import { useMemo, useState } from "react";
import { Box, Calculator, CheckCircle2, ClipboardList, Layers, Package, ShoppingCart, Truck } from "lucide-react";

import { useTranslation } from "../locales";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../hooks/useActiveWarehouseContext";
import { useCartsRefresh } from "../context/CartsRefreshContext";
import api from "../api/axios";
import {
  cartsOrangeCtaClass,
  cartsOutlineCtaClass,
  cartsPageShellClass,
  cartsSectionClass,
} from "../modules/carts/cartsModuleTokens";
import {
  PurchasingAnalysisSection,
  PurchasingKpiCard,
  PurchasingKpiGrid,
} from "../modules/purchasing/ui";

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

function capacityBarTone(percent: number): string {
  if (percent >= 96) return "bg-red-500";
  if (percent >= 81) return "bg-amber-500";
  return "bg-emerald-600";
}

function CapacityUsageBar({
  used,
  total,
  freePercent,
}: {
  used: number;
  total: number;
  freePercent: number;
}) {
  const usedPercent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const freeDm3 = Math.max(0, total - used);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-slate-700">Zajętość floty</span>
        <span className="font-semibold tabular-nums text-slate-900">{usedPercent.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${capacityBarTone(usedPercent)}`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-2">
          <p className="font-medium text-slate-500">Wykorzystane</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{used.toFixed(1)} dm³</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-2">
          <p className="font-medium text-slate-500">Wolne</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{freeDm3.toFixed(1)} dm³</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-2">
          <p className="font-medium text-slate-500">Wolne %</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{freePercent.toFixed(1)}%</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Łączna pojemność: <span className="font-medium tabular-nums text-slate-700">{total.toFixed(1)} dm³</span>
      </p>
    </div>
  );
}

export default function FleetPlanner() {
  const t = useTranslation();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const refreshCarts = useCartsRefresh()?.refreshCarts;

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const coveragePercent = useMemo(() => {
    if (!result || result.orders_to_serve <= 0) return 0;
    return (result.assigned_in_simulation / result.orders_to_serve) * 100;
  }, [result]);

  const handleAnalyze = async () => {
    if (!warehouseId) {
      setError(ACTIVE_WAREHOUSE_REQUIRED_MESSAGE);
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
    if (!warehouseId || !result) return;
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

  const dash = "—";

  return (
    <div className={`${cartsPageShellClass} space-y-5`}>
      <div className={`${cartsSectionClass} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">
            {t.optimizer_analyze_subtitle ?? "Oblicz minimalne zapotrzebowanie na wózki dla zamówień NEW."}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Krok 1: oblicz symulację · Krok 2: zatwierdź przypisania do wózków
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={loading || !hasActiveWarehouse}
            className={cartsOrangeCtaClass}
          >
            {loading ? t.loading : (t.optimizer_analyze_button ?? "Oblicz zapotrzebowanie na wózki")}
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={applying || !result || !hasActiveWarehouse}
            className={cartsOutlineCtaClass}
          >
            {applying ? t.loading : "Zatwierdź i przypisz"}
          </button>
        </div>
      </div>

      {!hasActiveWarehouse ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {ACTIVE_WAREHOUSE_REQUIRED_MESSAGE}
        </p>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <PurchasingKpiGrid columns={4}>
        <PurchasingKpiCard
          title="Zamówienia NEW do obsłużenia"
          value={result != null ? result.orders_to_serve : dash}
          subtitle="Do obsłużenia w symulacji"
          tone="blue"
          icon={<ShoppingCart aria-hidden />}
        />
        <PurchasingKpiCard
          title="Pojemność floty"
          value={result != null ? `${result.total_capacity_dm3.toFixed(0)} dm³` : dash}
          subtitle="Dostępna łącznie"
          tone="indigo"
          icon={<Box aria-hidden />}
        />
        <PurchasingKpiCard
          title="Wózki sekcyjne"
          value={result != null ? result.suggested_sectional_carts : dash}
          subtitle="Proponowana liczba"
          tone="purple"
          icon={<Layers aria-hidden />}
        />
        <PurchasingKpiCard
          title="Wózki standardowe"
          value={result != null ? result.suggested_bulk_carts : dash}
          subtitle="Proponowana liczba"
          tone="emerald"
          icon={<Package aria-hidden />}
        />
      </PurchasingKpiGrid>

      {result ? (
        <>
          <PurchasingKpiGrid columns={4}>
            <PurchasingKpiCard
              title={t.optimizer_orders_to_serve ?? "Do obsłużenia"}
              value={result.orders_to_serve}
              tone="default"
              icon={<ClipboardList aria-hidden />}
            />
            <PurchasingKpiCard
              title={t.optimizer_assigned ?? "Przypisane"}
              value={result.assigned_in_simulation}
              tone="emerald"
              icon={<CheckCircle2 aria-hidden />}
            />
            <PurchasingKpiCard
              title={t.optimizer_remaining_orders ?? "Pozostałe"}
              value={result.remaining_orders}
              tone="amber"
              icon={<Calculator aria-hidden />}
            />
            <PurchasingKpiCard
              title={t.optimizer_remaining_capacity ?? "Wolna pojemność"}
              value={`${result.remaining_capacity_percent.toFixed(1)}%`}
              tone="blue"
              icon={<Truck aria-hidden />}
            />
          </PurchasingKpiGrid>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PurchasingAnalysisSection title="Proponowana flota" subtitle="Wynik symulacji przypisań">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Sekcyjne</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{result.suggested_sectional_carts}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Standardowe</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{result.suggested_bulk_carts}</p>
                </div>
              </div>
            </PurchasingAnalysisSection>

            <PurchasingAnalysisSection title="Wykorzystanie pojemności" subtitle="Objętość floty wózków">
              <CapacityUsageBar
                used={result.used_capacity_dm3}
                total={result.total_capacity_dm3}
                freePercent={result.remaining_capacity_percent}
              />
            </PurchasingAnalysisSection>

            <PurchasingAnalysisSection title="Zamówienia" subtitle="Pokrycie w symulacji">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Obsłużone</span>
                  <span className="font-semibold tabular-nums text-slate-900">{result.assigned_in_simulation}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Nieobsłużone</span>
                  <span className="font-semibold tabular-nums text-slate-900">{result.remaining_orders}</span>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-600">Pokrycie</span>
                    <span className="font-semibold tabular-nums text-slate-900">{coveragePercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${Math.min(100, coveragePercent)}%` }}
                    />
                  </div>
                </div>
              </div>
            </PurchasingAnalysisSection>
          </div>
        </>
      ) : null}
    </div>
  );
}
