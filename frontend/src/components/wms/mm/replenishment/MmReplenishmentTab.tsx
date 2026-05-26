import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchWmsReplenishmentTasks,
  type WmsReplenishmentTaskRead,
  type WmsReplenishmentTaskView,
} from "../../../../api/wmsReplenishmentApi";
import { MmReplenishmentCard } from "./MmReplenishmentCard";

function groupHeadingFromSort(ls: [string, string, string, string] | undefined): string {
  if (!ls || ls.length < 4) return "Magazyn";
  const [z, aisle, rack, code] = ls;
  const parts: string[] = [];
  if ((z || "").trim()) parts.push(`Strefa ${z}`);
  if ((aisle || "").trim()) parts.push(`Aleja ${aisle}`);
  if ((rack || "").trim()) parts.push(`Regał ${rack}`);
  const head = parts.join(" · ").trim();
  return head !== "" ? head : ((code || "").trim() ? `Lok. ${code}` : "Magazyn");
}

function groupKey(t: WmsReplenishmentTaskRead): string {
  const ls = t.location_sort;
  if (Array.isArray(ls) && ls.length >= 3) {
    return `${ls[0]}\u0000${ls[1]}\u0000${ls[2]}`;
  }
  return (t.target_location_code || "").trim() || `id:${t.id}`;
}

type Props = {
  tenantId: number;
  warehouseId: number;
  refreshKey: number;
  onSelectTask: (task: WmsReplenishmentTaskRead) => void;
  /** Gdy ustawione — lista wg tego widoku, bez przełącznika wewnętrznego. */
  forcedView?: WmsReplenishmentTaskView;
};

export function MmReplenishmentTab({ tenantId, warehouseId, refreshKey, onSelectTask, forcedView }: Props) {
  const [internalView, setInternalView] = useState<WmsReplenishmentTaskView>("location");
  const view = forcedView ?? internalView;
  const [rows, setRows] = useState<WmsReplenishmentTaskRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await fetchWmsReplenishmentTasks(tenantId, warehouseId, view));
    } catch {
      setErr("Nie udało się wczytać zadań uzupełnień.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, view]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks, refreshKey]);

  useEffect(() => {
    const t = window.setInterval(() => {
      void loadTasks();
    }, 12_000);
    return () => window.clearInterval(t);
  }, [loadTasks]);

  const grouped = useMemo(() => {
    if (view !== "location") return null;
    const map = new Map<string, WmsReplenishmentTaskRead[]>();
    for (const row of rows) {
      const k = groupKey(row);
      const list = map.get(k) ?? [];
      list.push(row);
      map.set(k, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "pl", { sensitivity: "base" }));
  }, [rows, view]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {forcedView == null ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setInternalView("location")}
              className={[
                "rounded-xl px-4 py-2 text-xs font-bold transition-colors",
                view === "location" ? "bg-orange-500 text-white shadow-sm" : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              Wg lokalizacji
            </button>
            <button
              type="button"
              onClick={() => setInternalView("priority")}
              className={[
                "rounded-xl px-4 py-2 text-xs font-bold transition-colors",
                view === "priority" ? "bg-orange-500 text-white shadow-sm" : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              Wg priorytetów
            </button>
          </div>
        </div>
      ) : null}

      {err ? <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p> : null}

      {loading && rows.length === 0 ? (
        <p className="text-center text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-600">
          Brak otwartych zadań. Gdy stan na PICK spadnie poniżej minimum i jest zapas w rezerwie, zadanie pojawi się
          automatycznie.
        </div>
      ) : view === "priority" ? (
        <ul className="flex list-none flex-col gap-3 p-0">
          {rows.map((t) => (
            <li key={t.id}>
              <MmReplenishmentCard task={t} onOpen={onSelectTask} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-8 overflow-y-auto pb-4">
          {(grouped ?? []).map(([key, list]) => {
            const first = list[0];
            const title = groupHeadingFromSort(first?.location_sort);
            return (
              <section key={key} className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">{title}</h2>
                <ul className="flex list-none flex-col gap-3 p-0">
                  {list.map((t) => (
                    <li key={t.id}>
                      <MmReplenishmentCard task={t} onOpen={onSelectTask} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
