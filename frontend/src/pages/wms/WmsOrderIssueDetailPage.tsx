import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  getWmsOrderIssueTask,
  resolveWmsOrderIssueTaskScan,
  type OrderIssueDetailLineApi,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { useWmsShortagesRefresh } from "../../hooks/useWmsShortagesRefresh";
import { WMS_ROUTES } from "./wmsRoutes";
import { WmsOrderIssueDetailContent } from "./WmsOrderIssueDetailContent";

// Zoptymalizowany pod Zebrę komponent renderujący sekcje produktów
export function IssueDetailSection({
  title,
  lines,
  variant,
}: {
  title: string;
  lines: OrderIssueDetailLineApi[];
  variant: "collected" | "remaining";
}) {
  if (!lines.length) return null;
  const isCollected = variant === "collected";

  const sectionTitleClass = isCollected ? "text-emerald-600" : "text-amber-600";
  const iconClass = isCollected ? "fa-check-circle" : "fa-triangle-exclamation";

  return (
    <div className={isCollected ? "mt-6 p-4 pt-0 md:mt-8 md:p-6 md:pt-0" : "mt-2 p-4 pt-0 md:p-6 md:pt-0"}>
      <h2 className={`mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest ${sectionTitleClass}`}>
        <i className={`fa-solid ${iconClass}`}></i> {title}
      </h2>

      <div className="space-y-4">
        {lines.map((line, idx) => {
          const key = `${line.order_item_id ?? idx}-${line.product_id ?? idx}`;
          const name = line.product_name || "Nieznany produkt";
          const ean = line.ean || "—";
          const sku = line.sku || "—";
          const location =
            (line.nearest_location_code || line.location_code || "").trim() || "Brak lokalizacji";
          const imgSrc =
            (line.image_url || "").trim() ||
            (isCollected
              ? "https://placehold.co/100x100/ecfdf5/059669?text=OK"
              : "https://placehold.co/100x100/fffbeb/d97706?text=Brak");

          const remainingQty =
            Number(line.remaining_qty) > 0
              ? Number(line.remaining_qty)
              : Number(line.missing_qty) || 0;
          const collectedQty = Number(line.picked_qty) || 0;
          const orderedQty = Number(line.ordered_qty) || 0;

          const lastAction = (line.pick_audit_summary || "").trim() || "—";

          if (isCollected) {
            return (
              <div
                key={key}
                className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 opacity-90 shadow-sm transition-opacity hover:opacity-100 md:p-5"
              >
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-white p-1.5 shadow-sm md:h-20 md:w-20">
                    <img
                      src={imgSrc}
                      alt="Produkt"
                      className="h-full w-full object-contain opacity-60 mix-blend-multiply"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1.5 truncate pr-2 text-sm font-bold text-slate-800 md:text-base">
                      {name}
                    </h3>
                    <div className="mb-2 text-xs text-slate-500">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">EAN</span> {ean}
                    </div>
                    <div className="mb-3 flex items-center gap-2 text-xs text-slate-600">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Lok.</span>
                      <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-bold text-slate-800 shadow-sm">
                        {location}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs md:gap-3">
                      <span className="text-slate-500">
                        Zam.: <strong className="text-slate-700">{orderedQty || collectedQty}</strong> • Zebr.:{" "}
                        <strong className="text-slate-700">{collectedQty}</strong>
                      </span>
                      <span className="rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                        Zebrano
                      </span>
                    </div>
                    <div className="mt-3 border-t border-emerald-100 pt-3 text-[11px] leading-relaxed text-slate-500">
                      <strong className="text-slate-700">Ostatnia akcja:</strong> {lastAction}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={key}
              className="relative overflow-hidden rounded-xl border-2 border-amber-300 bg-amber-50/40 p-4 shadow-md md:p-5"
            >
              <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-amber-400"></div>
              <div className="flex gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white p-1.5 shadow-sm md:h-20 md:w-20">
                  <img
                    src={imgSrc}
                    alt="Produkt"
                    className="h-full w-full object-contain opacity-80 mix-blend-multiply"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-2 text-sm font-black leading-tight text-slate-900 md:text-lg">
                    {name}
                  </h3>
                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">SKU</span> {sku}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">EAN</span> {ean}
                    </div>
                  </div>

                  <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white p-2 text-sm text-slate-800 shadow-sm md:p-3 md:text-base">
                    <i className="fa-solid fa-location-dot text-amber-500"></i>
                    <span className="mr-1 text-[10px] font-bold uppercase text-slate-400">Lok.</span>
                    <span className="font-black tracking-wider text-slate-900">{location}</span>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center gap-2 text-xs md:gap-3">
                    <span className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800">
                      Pozostało: {remainingQty} szt.
                    </span>
                    <span className="rounded-md border border-slate-300 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700 shadow-sm">
                      Do zebrania
                    </span>
                  </div>

                  <div className="mt-4 border-t border-amber-200 pt-3 text-[11px] leading-relaxed text-slate-600">
                    <strong className="text-slate-800">Ostatnia akcja:</strong> {lastAction}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Szczegóły pozycji kolejki braków — shell ładowania + skan; UI w `WmsOrderIssueDetailContent`. */
export default function WmsOrderIssueDetailPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const navigate = useNavigate();
  const {
    registerScanHandler,
    showScannerError,
    appendScanToHistory,
    setScannerInputPlaceholder,
    refocusScannerInput,
  } = useWmsScanner();

  const [task, setTask] = useState<OrderIssueTaskListItemApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (warehouseId == null || !Number.isFinite(taskId) || taskId < 1) {
      setTask(null);
      setLoading(false);
      setErr("Nieprawidłowe zadanie.");
      return;
    }
    setLoading(true);
    setErr(null);
    getWmsOrderIssueTask(DAMAGE_TENANT_ID, warehouseId, taskId)
      .then(setTask)
      .catch(() => {
        setTask(null);
        setErr("Nie znaleziono zadania.");
      })
      .finally(() => setLoading(false));
  }, [warehouseId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useWmsShortagesRefresh(() => void load(), { debounceMs: 600 });

  useEffect(() => {
    setScannerInputPlaceholder("Inne zamówienie — zeskanuj kod");
    return () => setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
  }, [setScannerInputPlaceholder]);

  const switchTaskByScan = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null) return;
      try {
        const next = await resolveWmsOrderIssueTaskScan(DAMAGE_TENANT_ID, warehouseId, scan);
        appendScanToHistory(scan);
        navigate(WMS_ROUTES.issueTask(next.id), { replace: true });
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
      void switchTaskByScan(ean);
    });
    return () => registerScanHandler(null);
  }, [registerScanHandler, switchTaskByScan]);

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center text-slate-600">
        <p>Wybierz magazyn w nagłówku.</p>
        <div className="mt-6">
          <Link to={WMS_ROUTES.braki()} className="font-semibold text-blue-600 underline">
            Wróć do kolejki braków
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <i className="fa-solid fa-circle-notch animate-spin text-4xl"></i>
        <p className="mt-4 text-sm font-medium">Ładowanie szczegółów…</p>
      </div>
    );
  }

  if (err || !task) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <div className="rounded-full bg-red-100 p-4 text-red-600">
          <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
        </div>
        <p className="text-center font-medium text-slate-700">{err ?? "Wystąpił błąd"}</p>
        <Link to={WMS_ROUTES.braki()} className="mt-2 font-semibold text-blue-600 underline">
          Wróć do kolejki braków
        </Link>
      </div>
    );
  }

  return (
    <WmsOrderIssueDetailContent
      task={task}
      warehouseId={warehouseId}
      onReload={load}
      onArchiveError={setErr}
    />
  );
}
