import { Grid3X3, List, Minus, Plus, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { LabelRecord } from "../../../types/labelSystem";
import { LabelPreviewCard, type LabelPreviewCardTemplate } from "../LabelPreviewCard";

export type PreviewLayoutMode = "grid" | "list" | "single";

const PAGE_SIZE = 24;

type Props = {
  template: LabelPreviewCardTemplate | null;
  records: Array<LabelRecord | Record<string, unknown>>;
  loading?: boolean;
  emptyMessage?: string;
};

function recordCaption(record: LabelRecord | Record<string, unknown>): string {
  const r = record as Record<string, unknown>;
  return String(r.loc_name ?? r.location_name ?? r.location_code ?? r.barcode_data ?? r.prod_name ?? r.sku ?? "—");
}

/**
 * Paginated label preview — grid / list / single + zoom.
 * Never mounts the full dataset at once (PAGE_SIZE window).
 */
export default function PrintQueueLabelPreviewPane({
  template,
  records,
  loading,
  emptyMessage = "Brak etykiet do podglądu — wgraj dane i wybierz szablon.",
}: Props) {
  const [layoutMode, setLayoutMode] = useState<PreviewLayoutMode>("grid");
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(0);

  const total = records.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [total, layoutMode]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const pageRecords = useMemo(() => {
    if (layoutMode === "single") {
      const idx = Math.min(page, Math.max(0, total - 1));
      return total > 0 ? [records[idx]] : [];
    }
    const start = page * PAGE_SIZE;
    return records.slice(start, start + PAGE_SIZE);
  }, [layoutMode, page, records, total]);

  const scale = zoom / 100;
  const cardWidth = Math.round(180 * scale);

  const layoutBtn = (mode: PreviewLayoutMode, label: string, Icon: typeof Grid3X3) => {
    const active = layoutMode === mode;
    return (
      <button
        type="button"
        onClick={() => setLayoutMode(mode)}
        className={[
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
          active
            ? "border-blue-600 bg-blue-50 text-blue-700"
            : "border-gray-200 bg-white text-slate-600 hover:shadow-sm",
        ].join(" ")}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        {label}
      </button>
    );
  };

  return (
    <section className="flex min-h-[480px] flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Podgląd etykiet{" "}
          <span className="font-semibold text-slate-500">({total})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {layoutBtn("grid", "Siatka", Grid3X3)}
            {layoutBtn("list", "Lista", List)}
            {layoutBtn("single", "Pojedyncza", Square)}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm">
            <button
              type="button"
              aria-label="Pomniejsz"
              onClick={() => setZoom((z) => Math.max(60, z - 10))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              min={60}
              max={160}
              step={10}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-blue-600"
              aria-label="Zoom podglądu"
            />
            <button
              type="button"
              aria-label="Powiększ"
              onClick={() => setZoom((z) => Math.min(160, z + 10))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-600">{zoom}%</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 py-5">
        {loading ? (
          <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
        ) : !template ? (
          <p className="text-sm text-slate-500">Wybierz szablon etykiety, aby zobaczyć podgląd.</p>
        ) : total === 0 ? (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        ) : layoutMode === "list" ? (
          <ul className="space-y-3">
            {pageRecords.map((record, i) => (
              <li
                key={`${page}-${i}`}
                className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div style={{ width: cardWidth }} className="shrink-0">
                  <div className="origin-left" style={{ transform: `scale(${scale})`, transformOrigin: "left center" }}>
                    <LabelPreviewCard template={template} record={record} />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{recordCaption(record)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Etykieta {layoutMode === "list" ? page * PAGE_SIZE + i + 1 : i + 1} z {total}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : layoutMode === "single" ? (
          <div className="flex flex-col items-center justify-center gap-4 py-6">
            <div
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ transform: `scale(${scale})` }}
            >
              <LabelPreviewCard template={template} record={pageRecords[0]} />
            </div>
            <p className="font-mono text-sm text-slate-600">{recordCaption(pageRecords[0])}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-[1600px]:grid-cols-4 min-[1920px]:grid-cols-5">
            {pageRecords.map((record, i) => (
              <div
                key={`${page}-${i}`}
                className="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
                  <LabelPreviewCard template={template} record={record} />
                </div>
                <span className="mt-2 max-w-full truncate font-mono text-[11px] text-slate-500">
                  {recordCaption(record)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Poprzednia
          </button>
          <p className="text-sm font-medium tabular-nums text-slate-600">
            {layoutMode === "single" ? (
              <>
                {Math.min(page + 1, total)} z {total}
              </>
            ) : (
              <>
                {page + 1} z {pageCount}
              </>
            )}
          </p>
          <button
            type="button"
            disabled={layoutMode === "single" ? page >= total - 1 : page >= pageCount - 1}
            onClick={() =>
              setPage((p) =>
                layoutMode === "single" ? Math.min(total - 1, p + 1) : Math.min(pageCount - 1, p + 1),
              )
            }
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
          >
            Następna →
          </button>
        </div>
      ) : null}
    </section>
  );
}
