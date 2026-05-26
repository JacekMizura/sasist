import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  listWmsOrderIssueTasks,
  resolveWmsOrderIssueTaskScan,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { WMS_ROUTES, WMS_SHORTAGES_UPDATED_EVENT } from "./wmsRoutes";

type BrakiBucketId = "awaiting_oms" | "recovery_ready" | "waiting_customer";

function normalizeBrakiBucket(t: OrderIssueTaskListItemApi): BrakiBucketId {
  const b = (t.braki_queue_bucket ?? "").trim();
  if (b === "recovery_ready" || b === "waiting_customer" || b === "awaiting_oms") return b;
  return "awaiting_oms";
}

const BRAKI_BUCKET_SECTION: Record<BrakiBucketId, string> = {
  awaiting_oms: "Oczekuje na decyzję OMS",
  recovery_ready: "Gotowe do dogrywki zbierki",
  waiting_customer: "Oczekuje na klienta",
};
import { normalizeScanEan } from "../../utils/wmsScanNormalize";

function displayOrderNumber(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "—";
  return s.startsWith("#") ? s : `#${s}`;
}

function plProduktyWord(n: number): string {
  const abs = Math.abs(Math.floor(n));
  if (abs === 1) return "produkt";
  const mod100 = abs % 100;
  if (mod100 >= 12 && mod100 <= 14) return "produktów";
  const mod10 = abs % 10;
  if (mod10 >= 2 && mod10 <= 4) return "produkty";
  return "produktów";
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function formatShortageClock(iso: string | undefined): string {
  const s = (iso ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function shortageLinesForCard(t: OrderIssueTaskListItemApi) {
  return (t.shortage_lines ?? []).filter((l) => l.missing_qty > 1e-9);
}

function openIssueTask(navigate: ReturnType<typeof useNavigate>, t: OrderIssueTaskListItemApi) {
  navigate(WMS_ROUTES.issueTask(t.id));
}

/**
 * Kolejka braków / decyzji — zamówienie widoczne do czasu zebrania zamiennika; skan globalny.
 */
export default function WmsOrderIssuesHub() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get("order_id");
  const {
    registerScanHandler,
    showScannerError,
    appendScanToHistory,
    setScannerInputPlaceholder,
    refocusScannerInput,
  } = useWmsScanner();

  const [tasks, setTasks] = useState<OrderIssueTaskListItemApi[]>([]);
  const [skippedTasks, setSkippedTasks] = useState<{ task_id: number; order_id: number; order_number: string; error_message: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deeplinkMiss, setDeeplinkMiss] = useState<string | null>(null);

  const taskGroups = useMemo(() => {
    const order: BrakiBucketId[] = ["awaiting_oms", "recovery_ready", "waiting_customer"];
    const m = new Map<BrakiBucketId, OrderIssueTaskListItemApi[]>();
    for (const id of order) m.set(id, []);
    for (const t of tasks) {
      const b = normalizeBrakiBucket(t);
      m.get(b)!.push(t);
    }
    return order.map((id) => ({ id, label: BRAKI_BUCKET_SECTION[id], items: m.get(id) ?? [] })).filter((g) => g.items.length > 0);
  }, [tasks]);

  const load = useCallback(() => {
    if (warehouseId == null) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    listWmsOrderIssueTasks(DAMAGE_TENANT_ID, warehouseId)
      .then((res) => {
        setTasks(res.tasks);
        setSkippedTasks(res.skipped_tasks ?? []);
      })
      .catch(() => {
        setErr("Nie udało się wczytać kolejki.");
        setSkippedTasks([]);
      })
      .finally(() => setLoading(false));
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpd = () => void load();
    window.addEventListener(WMS_SHORTAGES_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(WMS_SHORTAGES_UPDATED_EVENT, onUpd);
  }, [load]);

  useEffect(() => {
    if (!orderIdFromUrl || loading || tasks.length === 0) {
      setDeeplinkMiss(null);
      return;
    }
    const oid = Number(orderIdFromUrl);
    if (!Number.isFinite(oid) || oid < 1) {
      setDeeplinkMiss(null);
      return;
    }
    const hit = tasks.find((x) => x.order_id === oid);
    if (hit) {
      setDeeplinkMiss(null);
      navigate(WMS_ROUTES.issueTask(hit.id), { replace: true });
    } else {
      setDeeplinkMiss(
        `Brak otwartego zgłoszenia dla zamówienia #${oid} w kolejce (sprawdź magazyn lub odśwież).`,
      );
    }
  }, [orderIdFromUrl, loading, tasks, navigate]);

  useEffect(() => {
    setScannerInputPlaceholder("Zeskanuj zamówienie (numer / kod)");
    return () => setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
  }, [setScannerInputPlaceholder]);

  const resolveScan = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null) return;
      try {
        const task = await resolveWmsOrderIssueTaskScan(DAMAGE_TENANT_ID, warehouseId, scan);
        appendScanToHistory(scan);
        openIssueTask(navigate, task);
        refocusScannerInput();
      } catch {
        showScannerError("Brak zamówienia lub brak otwartego zgłoszenia braków.");
        refocusScannerInput();
      }
    },
    [appendScanToHistory, navigate, refocusScannerInput, showScannerError, warehouseId],
  );

  useEffect(() => {
    registerScanHandler((ean) => {
      void resolveScan(ean);
    });
    return () => registerScanHandler(null);
  }, [registerScanHandler, resolveScan]);

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-center text-slate-600">
        Wybierz magazyn w nagłówku.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6">
      <div className="w-full min-w-0 space-y-4">
        {err ? <p className="text-center text-sm font-medium text-amber-800">{err}</p> : null}
        {deeplinkMiss ? <p className="text-center text-sm font-medium text-amber-900">{deeplinkMiss}</p> : null}

        {!loading && skippedTasks.length > 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">
              {skippedTasks.length} zadanie/zadań w kolejce nie mogło zostać wczytane (błąd serializacji).
            </p>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs">
              {skippedTasks.slice(0, 5).map((s) => (
                <li key={s.task_id}>
                  {displayOrderNumber(s.order_number)} — {s.error_message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {loading ? (
          <p className="py-12 text-center text-slate-500">Ładowanie kolejki…</p>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-800">
              {skippedTasks.length > 0 ? "Brak widocznych kart w kolejce" : "Kolejka jest pusta"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {skippedTasks.length > 0
                ? "Zadania OPEN istnieją w bazie, ale nie udało się je wyświetlić — odśwież po poprawce backendu lub sprawdź logi."
                : "Po zgłoszeniu braku przy zbieraniu zamówienie pojawi się tutaj."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {taskGroups.map((g) => (
              <section key={g.id} aria-label={g.label}>
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{g.label}</h2>
                <ul className="mt-2 space-y-3">
                  {g.items.map((t) => {
                    const sl = shortageLinesForCard(t);
                    const lineCount = sl.length;
                    const totalMissing = sl.reduce((s, l) => s + (Number(l.missing_qty) || 0), 0);
                    const r = t.replacement_pick_pending_count ?? 0;
                    const names = sl.map((l) => (l.product_name ?? "").trim()).filter(Boolean);
                    const preview = names.slice(0, 2).join(", ");
                    const more = names.length > 2 ? names.length - 2 : 0;
                    const cust = (t.customer_name ?? "").trim() || "—";
                    const num = displayOrderNumber(t.order_number);
                    const when = formatShortageClock(t.last_shortage_at || t.created_at);

                    let qtyLine = "";
                    if (lineCount > 0) {
                      qtyLine = `${lineCount} ${plProduktyWord(lineCount)} · ${fmtQty(totalMissing)} szt. braków`;
                    } else if (r > 0) {
                      const sub = (t.substitute_product_name ?? "").trim();
                      qtyLine = sub
                        ? `${r} ${plProduktyWord(r)} do zebrania po zamianie (${sub})`
                        : `${r} ${plProduktyWord(r)} do zebrania po zamianie`;
                    } else {
                      qtyLine = (t.issue_queue_summary_line ?? "").trim() || "Wymaga uwagi";
                    }

                    let previewLine = "";
                    if (preview) {
                      previewLine = more > 0 ? `${preview} · +${more} więcej` : preview;
                    } else if ((t.substitute_product_name ?? "").trim() && lineCount === 0 && r > 0) {
                      previewLine = (t.substitute_product_name ?? "").trim();
                    }

                    return (
                      <li key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-sm font-semibold text-slate-900">
                          <span className="font-mono">Zamówienie {num}</span>
                          <span className="text-slate-400"> · </span>
                          <span>{cust}</span>
                        </p>
                        <p className="mt-1.5 text-sm font-medium text-slate-800">{qtyLine}</p>
                        {previewLine ? <p className="mt-1 text-sm leading-snug text-slate-700">{previewLine}</p> : null}
                        <p className="mt-2 font-mono text-xs text-slate-500">{when}</p>
                        <button
                          type="button"
                          onClick={() => openIssueTask(navigate, t)}
                          className="mt-4 w-full rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99]"
                        >
                          Otwórz
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void load()}
          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-950"
        >
          Odśwież kolejkę
        </button>
      </div>
    </div>
  );
}
