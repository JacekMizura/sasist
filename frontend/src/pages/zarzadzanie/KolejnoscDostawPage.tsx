/**
 * Kolejność dostaw — ekran roboczy SASIST (lista, statusy, filtry, akcje).
 * Dane z istniejącego planu zmiany — bez zmian API / silnika.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ListOrdered, RefreshCw, Search } from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { AppEmptyState } from "../../components/app-shell";
import { SecondaryButton, StatusBadge, typography } from "@/design-system";
import { brandOutlineButtonClass } from "../../design-system/brandUi";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";
import {
  markLeavingForWork,
  type UrgencyBand,
} from "../wms/supply-flow/utils/shiftBoard";

type PriorityFilter = "all" | UrgencyBand;

type QueueRow = {
  id: string | number;
  title: string;
  supplier: string | null;
  documentLabel: string | null;
  phaseLabel: string;
  urgencyLabel: string;
  urgencyBand: UrgencyBand;
  effectLine: string | null;
  ctaLabel: string;
  ctaHref: string;
  primary: boolean;
};

const PRIORITY_FILTERS: Array<{ id: PriorityFilter; label: string }> = [
  { id: "all", label: "Wszystkie" },
  { id: "urgent", label: "Pilne" },
  { id: "first", label: "Najpierw" },
  { id: "next", label: "Następne" },
  { id: "later", label: "Do wykonania" },
];

function urgencyTone(band: UrgencyBand): "danger" | "warning" | "info" | "neutral" {
  switch (band) {
    case "urgent":
      return "danger";
    case "first":
      return "warning";
    case "next":
      return "info";
    default:
      return "neutral";
  }
}

export default function KolejnoscDostawPage() {
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const { board, loading, refreshing, error, refresh } = useSupplyFlowPlan(
    hasActiveWarehouse ? warehouseId : null,
  );
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<PriorityFilter>("all");

  const rows: QueueRow[] = useMemo(() => {
    const focus: QueueRow[] = board.attention
      ? [
          {
            id: board.attention.deliveryId ?? "focus",
            title: board.attention.title,
            supplier: null,
            documentLabel: null,
            phaseLabel: "Teraz",
            urgencyLabel: "Decyzja",
            urgencyBand: "urgent",
            effectLine: board.attention.whyBullets[0] || null,
            ctaLabel: board.attention.ctaLabel,
            ctaHref: board.attention.ctaHref,
            primary: true,
          },
        ]
      : [];

    const queue: QueueRow[] = board.queue.map((q) => ({
      id: q.deliveryId,
      title: q.title,
      supplier: q.supplier || null,
      documentLabel: q.documentLabel || null,
      phaseLabel: q.phaseLabel,
      urgencyLabel: q.urgencyLabel,
      urgencyBand: q.urgencyBand,
      effectLine: q.effectLine || null,
      ctaLabel: q.ctaLabel,
      ctaHref: q.ctaHref,
      primary: false,
    }));

    return [...focus, ...queue];
  }, [board.attention, board.queue]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (priority !== "all" && !row.primary && row.urgencyBand !== priority) return false;
      if (priority !== "all" && row.primary && priority !== "urgent") return false;
      if (!q) return true;
      const hay = `${row.title} ${row.supplier ?? ""} ${row.documentLabel ?? ""} ${row.phaseLabel}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, priority]);

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Kolejność dostaw"
        subtitle="W jakiej kolejności prowadzić pracę przy dostawach na tej zmianie."
        breadcrumbs={[
          { label: "Magazyn", to: "/zarzadzanie-magazynem/pulpit" },
          { label: "Kolejność dostaw" },
        ]}
        actions={
          <SecondaryButton
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading || !hasActiveWarehouse}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Odśwież
          </SecondaryButton>
        }
      />

      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Wybierz aktywny magazyn, aby zobaczyć kolejność dostaw." />
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {hasActiveWarehouse ? (
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block min-w-0 flex-1 sm:max-w-sm">
            <span className={`mb-0.5 block ${typography.label}`}>Szukaj</span>
            <span className="relative block">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Dostawa, dostawca, dokument…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtr priorytetu">
            {PRIORITY_FILTERS.map((f) => {
              const active = priority === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPriority(f.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className={typography.bodyMuted}>Ładowanie kolejki…</p>
      ) : null}

      {!loading && hasActiveWarehouse && filtered.length === 0 ? (
        <AppEmptyState
          icon={ListOrdered}
          title="Brak dostaw w kolejce"
          description={
            rows.length === 0
              ? "Na tej zmianie nie ma dostaw wymagających kolejności."
              : "Żadna pozycja nie pasuje do filtrów."
          }
        />
      ) : null}

      {filtered.length > 0 ? (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={`px-3 py-3 ${typography.tableHead}`}>#</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Dostawa</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Faza</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Priorytet</th>
                <th className={`px-3 py-3 ${typography.tableHead}`}>Efekt / status</th>
                <th className={`px-3 py-3 text-right ${typography.tableHead}`}>Akcja</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr
                  key={String(row.id)}
                  className={`border-b border-slate-50 hover:bg-slate-50/50 ${
                    row.primary ? "bg-orange-50/40" : ""
                  }`}
                >
                  <td className={`px-3 py-3 tabular-nums ${typography.caption}`}>{idx + 1}</td>
                  <td className="px-3 py-3">
                    <p className={typography.bodyStrong}>{row.title}</p>
                    {(row.supplier || row.documentLabel) && (
                      <p className={`mt-0.5 ${typography.caption}`}>
                        {[row.supplier, row.documentLabel].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className={`px-3 py-3 ${typography.body}`}>{row.phaseLabel}</td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={urgencyTone(row.urgencyBand)} density="compact">
                      {row.urgencyLabel}
                    </StatusBadge>
                  </td>
                  <td className={`max-w-xs px-3 py-3 ${typography.bodyMuted}`}>
                    {row.effectLine || "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      to={row.ctaHref}
                      onClick={() =>
                        markLeavingForWork({
                          leftAt: Date.now(),
                          title: row.title,
                          deliveryId: typeof row.id === "number" ? row.id : null,
                        })
                      }
                      className={`${brandOutlineButtonClass} gap-1 px-3 py-1.5 text-xs`}
                    >
                      {row.ctaLabel}
                      <ArrowRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
