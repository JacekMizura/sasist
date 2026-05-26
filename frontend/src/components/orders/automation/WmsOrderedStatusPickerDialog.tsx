import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../../api/orderUiStatusApi";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { getStatusClass } from "../orderList/OrderListPanelStatusBadge";
import { buildWmsOrderedStatusPickerRows, filterWmsStatusPickerRows } from "../../../utils/wmsOrderStatusPickerRows";

type Props = {
  open: boolean;
  tenantId: number;
  warehouseId: number;
  selectedId: number | null;
  onClose: () => void;
  onSelect: (statusId: number) => void;
};

export function WmsOrderedStatusPickerDialog({
  open,
  tenantId,
  warehouseId,
  selectedId,
  onClose,
  onSelect,
}: Props) {
  const [q, setQ] = useState("");
  const [summary, setSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [subgroups, setSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sg] = await Promise.all([
        getOrderUiStatusSummary(tenantId, warehouseId, { includeInactive: true }),
        getOrderPanelSubgroups(tenantId, warehouseId),
      ]);
      setSummary(s);
      setSubgroups(sg);
    } catch {
      setSummary(null);
      setSubgroups([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    if (!open) {
      setQ("");
      return;
    }
    void load();
  }, [open, load]);

  const rows = useMemo(() => buildWmsOrderedStatusPickerRows(summary, subgroups), [summary, subgroups]);
  const filtered = useMemo(() => filterWmsStatusPickerRows(rows, q), [rows, q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/40 p-4 pt-[min(8vh,5rem)] backdrop-blur-[2px]">
      <div className="flex max-h-[min(78vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/10">
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj statusu…"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Statusy w kolejności panelu WMS
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">Ładowanie statusów…</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">Brak statusów (sprawdź magazyn).</p>
          ) : (
            filtered.map((r) => {
              if (r.kind === "main") {
                return (
                  <div key={r.key} className="mt-3 first:mt-0">
                    <div className="rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/90 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-900 shadow-sm">
                      {r.label}
                    </div>
                  </div>
                );
              }
              if (r.kind === "sep") {
                return (
                  <div
                    key={r.key}
                    className="my-2 border-y border-dashed border-slate-200 bg-slate-50/80 px-2 py-1 text-center text-[11px] font-semibold text-slate-600"
                  >
                    {r.label}
                  </div>
                );
              }
              const active = selectedId === r.status.id;
              const colorClass = getStatusClass(r.status.name ?? "");
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    onSelect(r.status.id);
                    onClose();
                  }}
                  className={`mb-1 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    active ? "border-cyan-400 bg-cyan-50/80 ring-1 ring-cyan-300/60" : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`inline-flex min-w-0 flex-1 items-center gap-2 rounded-sm border-l-4 px-2 py-0.5 text-xs font-semibold ${colorClass}`}
                  >
                    {r.status.image_url ? (
                      <img src={r.status.image_url} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                    ) : null}
                    <span className="min-w-0 truncate">{r.status.name}</span>
                  </span>
                  {r.subgroup ? (
                    <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">{r.subgroup}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
