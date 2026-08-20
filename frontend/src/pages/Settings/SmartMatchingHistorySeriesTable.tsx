import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  WmsSmartMatchingHistorySeriesItemApi,
  WmsSmartMatchingSeriesHitApi,
} from "../../api/wmsSmartMatchingApi";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function CompositionCell({ series }: { series: WmsSmartMatchingHistorySeriesItemApi }) {
  const [open, setOpen] = useState(false);
  const items = series.composition_items;
  const extraCount = series.composition_extra_count || Math.max(0, items.length - 1);
  const hasExtras = extraCount > 0;

  return (
    <div className="relative min-w-0 max-w-[18rem]">
      <div className="truncate text-[13px] font-medium leading-snug text-slate-900">
        {series.composition_preview}
      </div>
      {hasExtras ? (
        <button
          type="button"
          className="mt-0.5 text-[11px] font-medium leading-none text-orange-700 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          +{extraCount} innych produktów
        </button>
      ) : null}
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2.5 shadow-lg">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Pełny skład</p>
          {items.length > 0 ? (
            <ul className="max-h-44 space-y-1 overflow-auto text-[12px] leading-snug text-slate-800">
              {items.map((it) => (
                <li key={`${it.product_id}-${it.quantity}`}>
                  {it.product_name} ×{it.quantity}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-600">{series.composition_label_fallback || "Brak szczegółów składu"}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function HitCard({ hit }: { hit: WmsSmartMatchingSeriesHitApi }) {
  const orderLabel = hit.order_number || `#${hit.order_id}`;
  const displayOrder = orderLabel.startsWith("#") ? orderLabel : `#${orderLabel}`;

  return (
    <div
      className={`flex gap-3 rounded-md border px-3 py-2.5 ${
        hit.is_decisive
          ? "border-emerald-300/90 bg-emerald-50/70"
          : hit.is_override
            ? "border-amber-200 bg-amber-50/60"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex w-10 shrink-0 flex-col items-center justify-center rounded bg-slate-50 py-1">
        <span className="text-lg font-bold leading-none tabular-nums text-slate-900">{hit.hit_index}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to={`/orders/${hit.order_id}`}
            className="text-[13px] font-semibold text-sky-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {displayOrder}
          </Link>
          {hit.is_decisive ? (
            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Decydujący
            </span>
          ) : null}
          {hit.is_override ? (
            <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
              Nadpisanie
            </span>
          ) : null}
        </div>
        {hit.operator ? <p className="truncate text-[12px] text-slate-600">{hit.operator}</p> : null}
        <p className="text-[12px] tabular-nums text-slate-500">{formatWhen(hit.created_at)}</p>
        {hit.is_override ? (
          <div className="space-y-0.5 pt-0.5 text-[12px] leading-snug text-slate-800">
            <p>
              <span className="text-slate-500">Sugerowano:</span>{" "}
              {hit.suggested_carton_name || hit.suggested_carton_id || "—"}
            </p>
            <p>
              <span className="text-slate-500">Wybrano:</span> {hit.carton_name || hit.carton_id || "—"}
            </p>
          </div>
        ) : (
          <p className="truncate text-[12px] font-medium text-slate-800">
            {hit.carton_name || hit.carton_id || "—"}
          </p>
        )}
      </div>
    </div>
  );
}

function SeriesPopover({
  series,
  onClose,
}: {
  series: WmsSmartMatchingHistorySeriesItemApi;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const trybLabel =
    series.created_threshold != null
      ? `TRYB: ${series.created_threshold}`
      : `AKTUALNY PRÓG: ${series.current_threshold}`;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute right-0 top-full z-40 mt-1.5 w-[28rem] max-w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-3.5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <p id={titleId} className="text-[12px] font-bold uppercase tracking-wide text-slate-900">
          Smart Matching
        </p>
        <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-800">
          {trybLabel}
        </span>
      </div>
      <div className="max-h-[22rem] space-y-2 overflow-auto pr-0.5">
        {series.hits.length === 0 ? (
          <p className="text-[13px] text-slate-500">Brak decyzji w tej serii.</p>
        ) : (
          series.hits.map((hit) => <HitCard key={hit.history_id} hit={hit} />)
        )}
      </div>
    </div>
  );
}

type Props = {
  items: WmsSmartMatchingHistorySeriesItemApi[];
  total: number;
  page: number;
  limit: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

/** Compact Sellasist-inspired history table — presentation only; uses history-series payload. */
export function SmartMatchingHistorySeriesTable({
  items,
  total,
  page,
  limit,
  loading,
  onPageChange,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, limit)));

  const th =
    "border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-2.5 py-1.5 align-middle text-[13px] leading-snug text-slate-800";

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className={th}>Opakowanie</th>
                <th className={th}>Produkt / zestaw</th>
                <th className={`${th} text-right`}>Ilość doborów</th>
                <th className={th}>Ostatni operator</th>
                <th className={th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`${td} text-slate-500`}>
                    Ładowanie historii…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`${td} text-slate-500`}>
                    Brak historii — pojawi się po spakowaniu zamówień z wybranym opakowaniem.
                  </td>
                </tr>
              ) : (
                items.map((s) => {
                  const rowKey = `${s.composition_key}:${s.carton_id}`;
                  const active = openKey === rowKey;
                  return (
                    <tr
                      key={rowKey}
                      className={`relative cursor-pointer hover:bg-orange-50/50 ${active ? "bg-orange-50/70" : ""}`}
                      onClick={() => setOpenKey((k) => (k === rowKey ? null : rowKey))}
                    >
                      <td className={`${td} whitespace-nowrap font-medium text-slate-900`}>
                        {s.carton_name || s.carton_id}
                      </td>
                      <td className={td}>
                        <CompositionCell series={s} />
                      </td>
                      <td className={`${td} text-right tabular-nums font-semibold text-slate-900`}>
                        {s.hit_count}
                      </td>
                      <td className={td}>
                        {s.last_operator ? (
                          <span className="inline-flex max-w-[10rem] truncate rounded border border-orange-200 bg-orange-50/80 px-1.5 py-0.5 text-[11px] font-medium text-orange-950">
                            {s.last_operator}
                          </span>
                        ) : (
                          <span className="text-slate-300">·</span>
                        )}
                      </td>
                      <td className={`${td} relative whitespace-nowrap text-[12px] tabular-nums text-slate-600`}>
                        {formatWhen(s.last_at)}
                        {active ? (
                          <SeriesPopover series={s} onClose={() => setOpenKey(null)} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {total > limit ? (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Wpisy {total} · strona {page}/{pageCount}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Poprzednia
            </button>
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              Następna
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
