import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  getSmartMatchingHistoryEvents,
  getSmartMatchingLearningSeries,
  type WmsSmartMatchingHistoryEventApi,
  type WmsSmartMatchingLearningSeriesApi,
} from "../../api/wmsSmartMatchingApi";
import { getCartons, type CartonDto } from "../../api/cartonsApi";

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

function formatWhenShort(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function MatchBadge({ event }: { event: WmsSmartMatchingHistoryEventApi }) {
  const rule = event.linked_rule;
  if (event.is_rule_broken) {
    return (
      <span className="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-900">
        Reguła przerwana
      </span>
    );
  }
  if (event.is_rule_created) {
    return (
      <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
        Reguła utworzona
      </span>
    );
  }
  if (event.is_override) {
    return (
      <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
        Nadpisanie
      </span>
    );
  }
  if (rule?.status === "AMBIGUOUS") {
    return (
      <span className="rounded border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
        Konflikt
      </span>
    );
  }
  if (rule?.source === "MANUAL") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-900">
        {rule.is_locked ? <Lock className="h-3 w-3" aria-hidden /> : null}
        Ręczna
      </span>
    );
  }
  return <span className="text-slate-300">—</span>;
}

function LearningPopover({
  series,
  onClose,
}: {
  series: WmsSmartMatchingLearningSeriesApi;
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

  const tryb =
    series.created_threshold != null
      ? `TRYB: ${series.created_threshold}`
      : "TRYB: —";

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
        <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-orange-900">
          {tryb}
        </span>
      </div>
      <div className="max-h-[22rem] space-y-2 overflow-auto pr-0.5">
        {series.hits.length === 0 ? (
          <p className="text-[13px] text-slate-500">Brak decyzji w tej serii.</p>
        ) : (
          series.hits.map((hit) => {
            const orderLabel = hit.order_number || `#${hit.order_id}`;
            const display = orderLabel.startsWith("#") ? orderLabel : `#${orderLabel}`;
            return (
              <div
                key={hit.observation_id}
                className={`flex gap-3 rounded-md border px-3 py-2.5 ${
                  hit.is_decisive
                    ? "border-emerald-300/90 bg-emerald-50/70"
                    : hit.is_rule_broken
                      ? "border-rose-300/90 bg-rose-50/70"
                      : hit.is_override
                        ? "border-amber-200 bg-amber-50/60"
                        : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex w-10 shrink-0 flex-col items-center justify-center rounded bg-slate-50 py-1">
                  <span className="text-lg font-bold leading-none tabular-nums text-slate-900">
                    {hit.hit_index}
                  </span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      to={`/orders/${hit.order_id}`}
                      className="text-[13px] font-semibold text-sky-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {display}
                    </Link>
                    {hit.is_decisive ? (
                      <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Decydujący
                      </span>
                    ) : null}
                    {hit.is_rule_broken ? (
                      <span className="rounded bg-rose-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Przerwał regułę
                      </span>
                    ) : null}
                    {hit.is_override ? (
                      <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                        Nadpisanie
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-slate-700">
                    Ilość: <span className="font-semibold tabular-nums">{hit.quantity} szt.</span>
                  </p>
                  {hit.operator ? <p className="truncate text-[12px] text-slate-600">{hit.operator}</p> : null}
                  <p className="text-[12px] tabular-nums text-slate-500">{formatWhen(hit.created_at)}</p>
                  <p className="truncate text-[12px] font-medium text-slate-800">
                    {hit.carton_name || hit.carton_id || "—"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      {series.rule ? (
        <div className="mt-3 border-t border-slate-100 pt-2.5 text-[12px] leading-snug text-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reguła</p>
          {series.pattern_type === "COMPOSITION" && (series.composition_items?.length ?? 0) > 0 ? (
            <ul className="mt-0.5 space-y-0.5">
              {series.composition_items!.map((ci) => (
                <li key={ci.product_id}>
                  {ci.name} ×{ci.quantity}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 font-medium">{series.rule.product_name}</p>
          )}
          <p className="text-slate-700">{series.rule.label}</p>
        </div>
      ) : null}
    </div>
  );
}

export type SmartMatchingHistoryEventsTableProps = {
  tenantId: number;
  warehouseId: number;
};

const PAGE_SIZE = 50;

export function SmartMatchingHistoryEventsTable({
  tenantId,
  warehouseId,
}: SmartMatchingHistoryEventsTableProps) {
  const [items, setItems] = useState<WmsSmartMatchingHistoryEventApi[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cartonFilter, setCartonFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [eventType, setEventType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cartons, setCartons] = useState<CartonDto[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [series, setSeries] = useState<WmsSmartMatchingLearningSeriesApi | null>(null);
  const [seriesBusy, setSeriesBusy] = useState(false);

  const reload = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const data = await getSmartMatchingHistoryEvents(tenantId, warehouseId, {
          page: p,
          limit: PAGE_SIZE,
          carton_id: cartonFilter || undefined,
          product_id: productFilter ? Number(productFilter) : undefined,
          user_id: operatorFilter ? Number(operatorFilter) : undefined,
          event_type: eventType,
          from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
          to: dateTo ? `${dateTo}T23:59:59` : undefined,
        });
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
      } catch {
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [tenantId, warehouseId, cartonFilter, productFilter, operatorFilter, eventType, dateFrom, dateTo],
  );

  useEffect(() => {
    void reload(1);
  }, [reload]);

  useEffect(() => {
    let cancel = false;
    void getCartons({ tenant_id: tenantId, warehouse_id: warehouseId, active_only: true })
      .then((rows) => {
        if (!cancel) setCartons(rows);
      })
      .catch(() => {
        if (!cancel) setCartons([]);
      });
    return () => {
      cancel = true;
    };
  }, [tenantId, warehouseId]);

  const openSeries = async (ev: WmsSmartMatchingHistoryEventApi) => {
    const cid = ev.carton?.id;
    if (!cid) return;
    if (openId === ev.observation_id) {
      setOpenId(null);
      setSeries(null);
      return;
    }
    setOpenId(ev.observation_id);
    setSeriesBusy(true);
    try {
      const s = await getSmartMatchingLearningSeries(tenantId, warehouseId, {
        cartonId: cid,
        productId: ev.pattern_type === "COMPOSITION" ? undefined : ev.product.id,
        compositionIdentityHash:
          ev.pattern_type === "COMPOSITION" ? ev.composition_identity_hash : undefined,
      });
      setSeries(s);
    } catch {
      setSeries(null);
    } finally {
      setSeriesBusy(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const th =
    "border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-2.5 py-1.5 align-middle text-[13px] leading-snug text-slate-800";

  const productOptions = Array.from(
    new Map(items.map((e) => [e.product.id, e.product.name])).entries(),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Produkt
          <input
            className="mt-0.5 block w-36 rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px]"
            placeholder="ID produktu"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Opakowanie
          <select
            className="mt-0.5 block w-44 rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px]"
            value={cartonFilter}
            onChange={(e) => setCartonFilter(e.target.value)}
          >
            <option value="">Wszystkie</option>
            {cartons.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Operator
          <input
            className="mt-0.5 block w-28 rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px]"
            placeholder="ID user"
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Typ
          <select
            className="mt-0.5 block w-40 rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px]"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            <option value="all">Wszystkie</option>
            <option value="rule_created">Utworzenie reguły</option>
            <option value="override">Nadpisanie</option>
            <option value="rule_broken">Przerwanie reguły</option>
            <option value="manual">Ręczne</option>
            <option value="conflict">Konflikt</option>
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Od
          <input
            type="date"
            className="mt-0.5 block rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Do
          <input
            type="date"
            className="mt-0.5 block rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        {productOptions.length > 0 ? (
          <p className="pb-1 text-[10px] text-slate-400">
            Na stronie: {productOptions.map(([, n]) => n).slice(0, 3).join(", ")}
            {productOptions.length > 3 ? "…" : ""}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className={th}>Opakowanie</th>
                <th className={th}>Produkt / zestaw</th>
                <th className={`${th} text-right`}>Ilość</th>
                <th className={th}>Operator</th>
                <th className={th}>Dopasowanie</th>
                <th className={th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${td} text-slate-500`}>
                    Ładowanie historii…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${td} text-slate-500`}>
                    Brak decyzji Smart Matching v2.
                  </td>
                </tr>
              ) : (
                items.map((ev) => {
                  const active = openId === ev.observation_id;
                  return (
                    <tr
                      key={ev.observation_id}
                      className={`relative cursor-pointer hover:bg-orange-50/50 ${active ? "bg-orange-50/70" : ""}`}
                      onClick={() => void openSeries(ev)}
                    >
                      <td className={`${td} whitespace-nowrap font-medium text-slate-900`}>
                        {ev.carton?.name || ev.carton?.id || "—"}
                      </td>
                      <td className={`${td} max-w-[16rem]`}>
                        {ev.pattern_type === "COMPOSITION" && (ev.composition_items?.length ?? 0) > 0 ? (
                          <div className="leading-tight">
                            <div className="truncate font-medium text-slate-900">
                              {ev.composition_items![0].name} ×{ev.composition_items![0].quantity}
                            </div>
                            {(ev.composition_items?.length ?? 0) > 1 ? (
                              <div className="text-[11px] text-slate-500">
                                +{(ev.composition_items!.length - 1)}{" "}
                                {ev.composition_items!.length - 1 === 1
                                  ? "inny produkt"
                                  : "inne produkty"}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="truncate">{ev.product.name}</span>
                        )}
                      </td>
                      <td className={`${td} text-right tabular-nums font-semibold text-slate-900`}>
                        {ev.pattern_type === "COMPOSITION"
                          ? `${ev.quantity} szt.`
                          : `${ev.quantity} szt.`}
                      </td>
                      <td className={td}>
                        {ev.operator.display_name ? (
                          <span className="inline-flex max-w-[10rem] truncate rounded border border-orange-200 bg-orange-50/80 px-1.5 py-0.5 text-[11px] font-medium text-orange-950">
                            {ev.operator.display_name}
                          </span>
                        ) : (
                          <span className="text-slate-300">·</span>
                        )}
                      </td>
                      <td className={td}>
                        <MatchBadge event={ev} />
                      </td>
                      <td className={`${td} relative whitespace-nowrap text-[12px] tabular-nums text-slate-600`}>
                        {formatWhenShort(ev.created_at)}
                        {active && series && !seriesBusy ? (
                          <LearningPopover series={series} onClose={() => setOpenId(null)} />
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

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Decyzje {total} · strona {page}/{pageCount}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => void reload(page - 1)}
            >
              Poprzednia
            </button>
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              disabled={page >= pageCount}
              onClick={() => void reload(page + 1)}
            >
              Następna
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SmartMatchingHistoryEventsTable;
