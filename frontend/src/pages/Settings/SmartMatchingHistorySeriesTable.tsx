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

function StatusBadges({ series }: { series: WmsSmartMatchingHistorySeriesItemApi }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {!series.has_active_rule ? (
        <span className="inline-flex rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800">
          W trakcie
        </span>
      ) : (
        <span className="inline-flex rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
          Reguła aktywna
        </span>
      )}
      {series.has_overrides ? (
        <span className="inline-flex rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
          Nadpisanie
        </span>
      ) : null}
    </div>
  );
}

function SeriesCell({ series }: { series: WmsSmartMatchingHistorySeriesItemApi }) {
  if (series.has_active_rule) {
    return (
      <span className="tabular-nums text-slate-900" title={`${series.hit_count} trafień w serii`}>
        {series.hit_count} trafień
      </span>
    );
  }
  return (
    <span
      className="tabular-nums font-medium text-slate-900"
      title={`Postęp do progu ${series.threshold}`}
    >
      {series.hit_count} / {series.threshold}
    </span>
  );
}

function CompositionCell({ series }: { series: WmsSmartMatchingHistorySeriesItemApi }) {
  const [open, setOpen] = useState(false);
  const items = series.composition_items;
  const hasExtras = series.composition_extra_count > 0 || items.length > 1;

  return (
    <div className="relative min-w-0 max-w-[16rem]">
      <div className="truncate text-[13px] font-medium leading-tight text-slate-900">
        {series.composition_preview}
      </div>
      {hasExtras ? (
        <button
          type="button"
          className="mt-0.5 text-[11px] font-medium text-orange-700 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          +{series.composition_extra_count || Math.max(0, items.length - 1)} innych produktów
        </button>
      ) : null}
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Pełny skład</p>
          {items.length > 0 ? (
            <ul className="max-h-40 space-y-0.5 overflow-auto text-[12px] text-slate-800">
              {items.map((it) => (
                <li key={`${it.product_id}-${it.quantity}`}>
                  {it.product_name} ×{it.quantity}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-600">{series.composition_label_fallback || "—"}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function HitCard({ hit }: { hit: WmsSmartMatchingSeriesHitApi }) {
  const orderLabel = hit.order_number || `#${hit.order_id}`;
  return (
    <div
      className={`flex gap-2 rounded-md border px-2 py-1.5 ${
        hit.is_decisive
          ? "border-emerald-300 bg-emerald-50/80"
          : hit.is_override
            ? "border-amber-200 bg-amber-50/70"
            : "border-slate-200 bg-slate-50/80"
      }`}
    >
      <div className="flex w-8 shrink-0 flex-col items-center justify-center border-r border-slate-200/80 pr-1">
        <span className="text-base font-bold leading-none text-slate-900">{hit.hit_index}</span>
        <span className="text-[9px] uppercase text-slate-400">szt.</span>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            to={`/orders/${hit.order_id}`}
            className="text-[12px] font-semibold text-sky-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {orderLabel.startsWith("#") ? orderLabel : `#${orderLabel}`}
          </Link>
          {hit.is_decisive ? (
            <span className="rounded bg-emerald-600 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Decydujący
            </span>
          ) : null}
          {hit.is_override ? (
            <span className="rounded border border-amber-300 bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-950">
              Nadpisanie
            </span>
          ) : null}
        </div>
        {hit.operator ? (
          <p className="truncate text-[11px] text-slate-600">{hit.operator}</p>
        ) : null}
        <p className="text-[11px] tabular-nums text-slate-500">{formatWhen(hit.created_at)}</p>
        {hit.is_override ? (
          <p className="text-[11px] text-slate-800">
            <span className="text-slate-500">Sugerowano:</span>{" "}
            {hit.suggested_carton_name || hit.suggested_carton_id || "—"}
            <span className="mx-1 text-slate-400">→</span>
            <span className="text-slate-500">Wybrano:</span> {hit.carton_name || hit.carton_id || "—"}
          </p>
        ) : (
          <p className="truncate text-[11px] font-medium text-slate-800">
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
      : `Aktualny próg: ${series.current_threshold}`;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute right-0 top-full z-40 mt-1 w-[22rem] max-w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
        <p id={titleId} className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
          Smart Matching
        </p>
        <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">
          {trybLabel}
        </span>
      </div>
      <div className="max-h-72 space-y-1.5 overflow-auto">
        {series.hits.map((hit) => (
          <HitCard key={hit.history_id} hit={hit} />
        ))}
      </div>
      {series.has_active_rule ? (
        <div className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-700">
          <p className="font-bold uppercase tracking-wide text-slate-500">Reguła</p>
          <p className="font-semibold text-slate-900">{series.carton_name || series.carton_id}</p>
          <p className="tabular-nums text-slate-500">{series.hit_count} trafień</p>
        </div>
      ) : null}
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
    "border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-2 py-1.5 align-middle text-[13px] text-slate-800";

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className={th}>Skład</th>
                <th className={th}>Opakowanie</th>
                <th className={th}>Seria</th>
                <th className={th}>Status</th>
                <th className={th}>Operator</th>
                <th className={th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${td} text-slate-500`}>
                    Ładowanie serii…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${td} text-slate-500`}>
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
                      <td className={td}>
                        <CompositionCell series={s} />
                      </td>
                      <td className={`${td} whitespace-nowrap font-medium`}>
                        {s.carton_name || s.carton_id}
                      </td>
                      <td className={td}>
                        <SeriesCell series={s} />
                      </td>
                      <td className={td}>
                        <StatusBadges series={s} />
                      </td>
                      <td className={td}>
                        {s.last_operator ? (
                          <span className="inline-flex max-w-[9rem] truncate rounded border border-orange-200 bg-orange-50/80 px-1.5 py-0.5 text-[11px] font-medium text-orange-950">
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
            Serie {total} · strona {page}/{pageCount}
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
