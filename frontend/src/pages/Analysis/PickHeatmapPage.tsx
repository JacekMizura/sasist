import { useEffect, useState } from "react";
import {
  getHotLocations,
  getPickDensity,
  type HotLocationItem,
} from "../../api/analysisApi";
import { AnalysisDecisionHeader } from "../../modules/analytics/AnalysisDecisionHeader";

const DEFAULT_TENANT_ID = 1;

type ViewMode = "picks" | "density";

type DensityRow = { location_id: number; location_name?: string; total_quantity: number };

/**
 * Raport lokalizacji — pobrania + gęstość zamówień + CTA do układu.
 */
export default function PickHeatmapPage() {
  const [view, setView] = useState<ViewMode>("picks");
  const [pickItems, setPickItems] = useState<HotLocationItem[]>([]);
  const [densityItems, setDensityItems] = useState<DensityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getHotLocations(DEFAULT_TENANT_ID), getPickDensity(DEFAULT_TENANT_ID)])
      .then(([picks, density]) => {
        if (cancelled) return;
        setPickItems(picks);
        setDensityItems(density);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Błąd ładowania");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-w-0">
        <AnalysisDecisionHeader
          title="Najczęściej odwiedzane lokalizacje"
          question="Które lokalizacje są przeciążone i generują korki przy kompletacji?"
          decision="Które strefy odciążyć (przesunięcie towaru) albo wzmocnić?"
          actions={[
            { label: "Zaplanuj relokację", to: "/optymalizacja/slotting", primary: true },
            { label: "Pokaż lokalizacje na mapie", to: "/analytics/warehouse-map" },
          ]}
        />
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0">
        <AnalysisDecisionHeader
          title="Najczęściej odwiedzane lokalizacje"
          question="Które lokalizacje są przeciążone i generują korki przy kompletacji?"
          decision="Które strefy odciążyć (przesunięcie towaru) albo wzmocnić?"
          actions={[
            { label: "Zaplanuj relokację", to: "/optymalizacja/slotting", primary: true },
            { label: "Pokaż lokalizacje na mapie", to: "/analytics/warehouse-map" },
          ]}
        />
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const showPicks = view === "picks";
  const rows = showPicks ? pickItems : densityItems;

  return (
    <div className="min-w-0">
      <AnalysisDecisionHeader
        title="Najczęściej odwiedzane lokalizacje"
        question="Które lokalizacje są przeciążone i generują korki przy kompletacji?"
        decision="Które strefy odciążyć (przesunięcie towaru) albo wzmocnić?"
        actions={[
          { label: "Zaplanuj relokację", to: "/optymalizacja/slotting", primary: true },
          { label: "Pokaż lokalizacje na mapie", to: "/analytics/warehouse-map" },
        ]}
      />

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setView("picks")}
          className={
            showPicks
              ? "rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
          }
        >
          Pobrania
        </button>
        <button
          type="button"
          onClick={() => setView("density")}
          className={
            !showPicks
              ? "rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white"
              : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
          }
        >
          Gęstość zamówień
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">ID</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Lokalizacja</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">
                {showPicks ? "Pobrania" : "Ilość z zamówień"}
              </th>
              {showPicks ? (
                <th className="text-right px-4 py-2 font-medium text-slate-600">Stan na magazynie</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showPicks ? 4 : 3} className="px-4 py-6 text-center text-slate-500">
                  Brak danych.
                </td>
              </tr>
            ) : showPicks ? (
              (rows as HotLocationItem[]).map((row) => (
                <tr key={row.location_id}>
                  <td className="px-4 py-2">{row.location_id}</td>
                  <td className="px-4 py-2">{row.location_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{row.total_quantity}</td>
                  <td className="px-4 py-2 text-right">{row.current_stock ?? "—"}</td>
                </tr>
              ))
            ) : (
              (rows as DensityRow[]).map((row) => (
                <tr key={row.location_id}>
                  <td className="px-4 py-2">{row.location_id}</td>
                  <td className="px-4 py-2">{row.location_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{row.total_quantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
