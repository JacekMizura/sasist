import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getThreeDMatchingHistory,
  type WmsThreeDMatchingHistoryItemApi,
} from "../../api/wmsThreeDMatchingApi";
import { getCartons, type CartonDto } from "../../api/cartonsApi";

function formatWhenShort(iso: string | null | undefined): string {
  if (!iso) return "—";
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

function strategyLabel(s: string): string {
  switch (s) {
    case "SMART_ONLY":
      return "Tylko Smart";
    case "THREE_D_ONLY":
      return "Tylko 3D";
    case "SMART_THEN_3D":
      return "Smart → 3D";
    case "THREE_D_OVERRIDE_SMART":
      return "3D nadpisuje Smart";
    default:
      return s || "—";
  }
}

function triggerLabel(t: string): string {
  switch (t) {
    case "MANUAL":
      return "ręczne pakowanie";
    case "STATUS":
      return "status inicjujący";
    case "STRATEGY_FALLBACK":
      return "fallback po Smart";
    case "STRATEGY_OVERRIDE":
      return "override Smart";
    default:
      return "system";
  }
}

function DetailPopover({
  event,
  onClose,
}: {
  event: WmsThreeDMatchingHistoryItemApi;
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

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute left-0 top-full z-40 mt-1.5 w-[26rem] max-w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-3.5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 border-b border-slate-100 pb-2">
        <h3 id={titleId} className="text-xs font-bold uppercase tracking-wide text-slate-800">
          3D Matching
        </h3>
      </div>
      <dl className="space-y-1.5 text-xs text-slate-700">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Zamówienie</dt>
          <dd className="font-medium">#{event.order_number || event.order_id}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Strategia</dt>
          <dd className="font-medium">{strategyLabel(event.strategy)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Trigger</dt>
          <dd className="font-medium">{triggerLabel(event.trigger)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Filler</dt>
          <dd className="font-medium">{Math.round(event.filler_percent_snapshot)}%</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Shipping</dt>
          <dd className="font-medium">{event.shipping_method_name || "—"}</dd>
        </div>
      </dl>

      {event.composition_items?.length ? (
        <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-700">
          {event.composition_items.map((it) => (
            <li key={`${it.product_id}-${it.quantity}`}>
              {it.product_name} ×{it.quantity}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-700">
        <p>
          Sprawdzono: <span className="font-semibold">{event.candidate_count}</span> opakowań
        </p>
        <p>
          Zgodne z wysyłką:{" "}
          <span className="font-semibold">{event.compatible_candidate_count}</span>
        </p>
        <p>
          Zaproponowano:{" "}
          <span className="font-semibold">{event.suggested_carton_name || "—"}</span>
        </p>
        <p>
          Wybrano: <span className="font-semibold">{event.selected_carton_name || "—"}</span>
        </p>
        <p>
          Wypełnienie:{" "}
          <span className="font-semibold">
            {event.fill_percent != null ? `${Math.round(event.fill_percent)}%` : "—"}
          </span>
        </p>
        <p>
          Wynik: <span className="font-semibold">{event.result_label}</span>
        </p>
        {event.error_message ? (
          <p className="text-rose-700">{event.error_message}</p>
        ) : null}
      </div>
    </div>
  );
}

export type ThreeDMatchingHistoryTableProps = {
  tenantId: number;
  warehouseId: number;
};

export function ThreeDMatchingHistoryTable({ tenantId, warehouseId }: ThreeDMatchingHistoryTableProps) {
  const [items, setItems] = useState<WmsThreeDMatchingHistoryItemApi[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [orderQ, setOrderQ] = useState("");
  const [resultStatus, setResultStatus] = useState("ALL");
  const [cartonId, setCartonId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cartons, setCartons] = useState<CartonDto[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const limit = 40;

  useEffect(() => {
    let cancel = false;
    void getCartons({ tenant_id: tenantId, warehouse_id: warehouseId, active_only: true })
      .then((rows) => {
        if (!cancel) setCartons(rows || []);
      })
      .catch(() => {
        if (!cancel) setCartons([]);
      });
    return () => {
      cancel = true;
    };
  }, [warehouseId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const pageData = await getThreeDMatchingHistory({
        tenantId,
        warehouseId,
        page,
        limit,
        orderQ: orderQ.trim() || undefined,
        resultStatus: resultStatus === "ALL" ? undefined : resultStatus,
        cartonId: cartonId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setItems(pageData.items || []);
      setTotal(pageData.total || 0);
    } catch {
      setErr("Nie udało się wczytać historii 3D Matching.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, page, orderQ, resultStatus, cartonId, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Zamówienie
          <input
            className="h-8 rounded border border-slate-200 px-2 text-sm"
            value={orderQ}
            onChange={(e) => {
              setPage(1);
              setOrderQ(e.target.value);
            }}
            placeholder="# / numer"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Wynik
          <select
            className="h-8 rounded border border-slate-200 px-2 text-sm"
            value={resultStatus}
            onChange={(e) => {
              setPage(1);
              setResultStatus(e.target.value);
            }}
          >
            <option value="ALL">Wszystkie</option>
            <option value="MATCHED">Dopasowano</option>
            <option value="NO_FIT">Brak pasującego</option>
            <option value="MISSING_PRODUCT_DATA">Brak wymiarów</option>
            <option value="NO_COMPATIBLE_CARTON">Brak zgodnego z wysyłką</option>
            <option value="ERROR">Błąd</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Opakowanie
          <select
            className="h-8 max-w-[12rem] rounded border border-slate-200 px-2 text-sm"
            value={cartonId}
            onChange={(e) => {
              setPage(1);
              setCartonId(e.target.value);
            }}
          >
            <option value="">Wszystkie</option>
            {cartons.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Od
          <input
            type="date"
            className="h-8 rounded border border-slate-200 px-2 text-sm"
            value={dateFrom}
            onChange={(e) => {
              setPage(1);
              setDateFrom(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Do
          <input
            type="date"
            className="h-8 rounded border border-slate-200 px-2 text-sm"
            value={dateTo}
            onChange={(e) => {
              setPage(1);
              setDateTo(e.target.value);
            }}
          />
        </label>
      </div>

      {err ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{err}</p>
      ) : null}

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Zamówienie</th>
              <th className="px-2 py-1.5 font-semibold">Zaproponowane</th>
              <th className="px-2 py-1.5 font-semibold">Wybrane</th>
              <th className="px-2 py-1.5 font-semibold">Wynik</th>
              <th className="px-2 py-1.5 font-semibold">Wypełnienie</th>
              <th className="px-2 py-1.5 font-semibold">Użytkownik</th>
              <th className="px-2 py-1.5 font-semibold">Data</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-slate-500">
                  Ładowanie…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-slate-500">
                  Brak prób 3D Matching.
                </td>
              </tr>
            ) : (
              items.map((ev) => (
                <tr
                  key={ev.id}
                  className="relative cursor-pointer border-t border-slate-100 hover:bg-slate-50/80"
                  onClick={() => setOpenId((cur) => (cur === ev.id ? null : ev.id))}
                >
                  <td className="px-2 py-1.5 font-medium text-slate-800">
                    <Link
                      to={`/wms/orders/${ev.order_id}`}
                      className="text-sky-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{ev.order_number || ev.order_id}
                    </Link>
                    {openId === ev.id ? <DetailPopover event={ev} onClose={() => setOpenId(null)} /> : null}
                  </td>
                  <td className="px-2 py-1.5 text-slate-700">{ev.suggested_carton_name || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-700">{ev.selected_carton_name || "—"}</td>
                  <td className="px-2 py-1.5 text-slate-800">{ev.result_label}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-700">
                    {ev.fill_percent != null ? `${Math.round(ev.fill_percent)}%` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{ev.triggered_by_display || "system"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">
                    {formatWhenShort(ev.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>
          {total} {total === 1 ? "wpis" : "wpisów"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Poprzednia
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            type="button"
            className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Następna
          </button>
        </div>
      </div>
    </div>
  );
}

export default ThreeDMatchingHistoryTable;
