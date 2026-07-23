import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Box, Check, Loader2, MapPin, Package, ScanLine } from "lucide-react";
import {
  acquireWmsRelocationSession,
  assignWmsRelocationAllocation,
  bulkAssignWmsRelocation,
  fetchWmsRelocationAllocationsPage,
  getWmsOperationalTaskDetail,
  type RelocationSessionLockedDetail,
  type WmsOperationalRelocationAllocationApi,
  type WmsOperationalTaskDetailApi,
} from "../../api/wmsOperationalTasksApi";
import { scanWmsCarrierByBarcode, type WarehouseCarrierRead } from "../../api/wmsCarrierApi";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { WMS_ROUTES } from "./wmsRoutes";
import { dispatchWmsShortagesUpdated } from "../../utils/wmsRefresh";
import { CrossdockFlowBanner } from "../../components/wms/operational/CrossdockFlowBanner";
import { OperationalWorkflowTimeline } from "../../components/wms/operational/OperationalWorkflowTimeline";
import { nextOperationalAction } from "../../components/wms/operational/operationalWorkflow";
import {
  ScanStepHero,
  ExecutionTouchButton,
  formatOperationalError,
  useWmsPageScanHandler,
  useScanFeedback,
} from "../../components/wms/execution";
import {
  WmsOperationalPageBody,
  WmsOperationalPageHeader,
  WmsOperationalPageShell,
} from "../../components/wms/execution/WmsOperationalPageShell";
import { WMS_Z } from "../../components/wms/execution/wmsLayoutTokens";
import { CarrierBadge } from "../../components/warehouse/carriers/CarrierBadge";
function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function allocCardClass(status: string, active: boolean): string {
  if (status === "done") {
    return "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200";
  }
  if (active || status === "partial") {
    return "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200";
  }
  return "border-slate-200 bg-white hover:border-slate-300";
}

function statusLabel(status: string): string {
  if (status === "done") return "Gotowe";
  if (status === "partial") return "Częściowo";
  return "Oczekuje";
}

function parseSessionLock(e: unknown): RelocationSessionLockedDetail | null {
  const ax = e as { response?: { status?: number; data?: { detail?: RelocationSessionLockedDetail } } };
  if (ax.response?.status === 409 && ax.response.data?.detail) {
    return ax.response.data.detail;
  }
  return null;
}

export default function WmsRelocationDetailPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const { showScannerToast, setScannerInputPlaceholder, setActiveDocument, refocusScannerInput } =
    useWmsScanner();
  const scanFx = useScanFeedback();

  const [detail, setDetail] = useState<WmsOperationalTaskDetailApi | null>(null);
  const [activeCarrier, setActiveCarrier] = useState<WarehouseCarrierRead | null>(null);
  const [activeAllocKey, setActiveAllocKey] = useState<string | null>(null);
  const [pendingAssign, setPendingAssign] = useState<WmsOperationalRelocationAllocationApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sessionLock, setSessionLock] = useState<RelocationSessionLockedDetail | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [allocOffset, setAllocOffset] = useState(0);

  const canEdit = Boolean(detail?.can_edit_relocation) && !readOnly && detail?.status !== "done";

  const applyDetail = useCallback((d: WmsOperationalTaskDetailApi) => {
    setDetail(d);
    const sess = d.relocation_session;
    if (sess?.active_carrier_label && !activeCarrier) {
      setActiveCarrier({
        id: sess.active_carrier_id ?? 0,
        barcode: sess.active_carrier_label,
        code: sess.active_carrier_label,
        name: null,
      } as WarehouseCarrierRead);
    }
  }, [activeCarrier]);

  const loadAllocationsPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!Number.isFinite(taskId) || taskId < 1) return;
      const page = await fetchWmsRelocationAllocationsPage(DAMAGE_TENANT_ID, taskId, {
        offset,
        limit: 40,
      });
      setDetail((prev) => {
        if (!prev) return prev;
        const merged = append
          ? [...(prev.relocation_allocations ?? []), ...page.items]
          : page.items;
        return {
          ...prev,
          relocation_allocations: merged,
          relocation_allocations_total: page.total,
        };
      });
      setAllocOffset(offset + page.items.length);
    },
    [taskId],
  );

  const openSession = useCallback(
    async (takeover: boolean) => {
      if (!Number.isFinite(taskId) || taskId < 1) return;
      setSessionLock(null);
      setReadOnly(false);
      try {
        const d = await acquireWmsRelocationSession(DAMAGE_TENANT_ID, taskId, { takeover });
        applyDetail(d);
        if (d.relocation_allocations_total && (d.relocation_allocations?.length ?? 0) < d.relocation_allocations_total) {
          await loadAllocationsPage(0, false);
        }
      } catch (e: unknown) {
        const lock = parseSessionLock(e);
        if (lock) {
          setSessionLock(lock);
          setReadOnly(true);
          const preview = await getWmsOperationalTaskDetail(DAMAGE_TENANT_ID, taskId);
          applyDetail(preview);
        } else {
          setErr(formatOperationalError(e, "Nie udało się przejąć sesji rozlokowania."));
        }
      }
    },
    [applyDetail, loadAllocationsPage, taskId],
  );

  const shouldAcquireSessionOnLoad = useMemo(() => {
    const fromState = Boolean(
      (routerLocation.state as { startRelocationSession?: boolean } | null)?.startRelocationSession,
    );
    const fromQuery = searchParams.get("autostart") === "1";
    return fromState || fromQuery;
  }, [routerLocation.state, searchParams]);

  const load = useCallback(async () => {
    if (!Number.isFinite(taskId) || taskId < 1) return;
    setLoading(true);
    setErr(null);
    setSessionLock(null);
    setReadOnly(false);
    try {
      const preview = await getWmsOperationalTaskDetail(DAMAGE_TENANT_ID, taskId);
      applyDetail(preview);
      if (preview.relocation_allocations_total && (preview.relocation_allocations?.length ?? 0) < preview.relocation_allocations_total) {
        await loadAllocationsPage(0, false);
      }
      if (shouldAcquireSessionOnLoad) {
        await openSession(false);
      } else if (!preview.can_edit_relocation && preview.relocation_session?.locked_by_operator_id) {
        setReadOnly(true);
      }
    } catch {
      setDetail(null);
      setErr("Nie udało się wczytać zadania rozlokowania.");
    } finally {
      setLoading(false);
    }
  }, [applyDetail, loadAllocationsPage, openSession, shouldAcquireSessionOnLoad, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Rozlokowanie produktów — cel rozlokowania" });
    setScannerInputPlaceholder("Skanuj nośnik logistyczny (PAL, BOX, skrzynia…) lub lokację");
    return () => setActiveDocument(null);
  }, [setActiveDocument, setScannerInputPlaceholder]);

  const allocs = detail?.relocation_allocations ?? [];
  const totalQty = detail?.relocation_total_qty ?? detail?.quantity_required ?? 0;
  const relocatedQty = useMemo(
    () => allocs.reduce((s, a) => s + (a.relocated_qty ?? 0), 0),
    [allocs],
  );
  const pendingAllocs = useMemo(
    () => allocs.filter((a) => a.status !== "done"),
    [allocs],
  );
  const allDone = pendingAllocs.length === 0 && allocs.length > 0;
  const lockVersion = detail?.lock_version ?? 0;
  const allocationsTotal = detail?.relocation_allocations_total ?? allocs.length;
  const hasMoreAllocs = allocs.length < allocationsTotal;

  const assignAlloc = useCallback(
    async (a: WmsOperationalRelocationAllocationApi) => {
      if (!activeCarrier || !canEdit) return;
      setActing(true);
      setErr(null);
      try {
        const updated = await assignWmsRelocationAllocation(DAMAGE_TENANT_ID, taskId, {
          order_id: a.order_id,
          order_item_id: a.order_item_id,
          carrier_id: activeCarrier.id,
          qty: a.remaining_qty > 0 ? a.remaining_qty : undefined,
          lock_version: lockVersion,
        });
        applyDetail(updated);
        setPendingAssign(null);
        if (updated.status === "done") {
          scanFx.success("Rozlokowanie produktów zakończone");
          dispatchWmsShortagesUpdated();
          navigate(WMS_ROUTES.operatorHome);
          return;
        }
        scanFx.success(`Odłożono do ${activeCarrier.barcode || activeCarrier.code}`);
      } catch (e: unknown) {
        setErr(formatOperationalError(e, "Nie udało się przypisać do nośnika."));
        scanFx.error(formatOperationalError(e, "Nie udało się przypisać do nośnika."));
      } finally {
        setActing(false);
      }
    },
    [activeCarrier, applyDetail, canEdit, lockVersion, navigate, scanFx, taskId],
  );

  const onBulkAssign = async () => {
    if (!activeCarrier || !detail || !canEdit) return;
    setBulkConfirmOpen(false);
    setActing(true);
    setErr(null);
    try {
      const updated = await bulkAssignWmsRelocation(DAMAGE_TENANT_ID, taskId, {
        carrier_id: activeCarrier.id,
        lock_version: lockVersion,
      });
      applyDetail(updated);
      if (updated.status === "done") {
        scanFx.success("Wszystko rozłożone — zadanie zamknięte");
        dispatchWmsShortagesUpdated();
        navigate(WMS_ROUTES.operatorHome);
        return;
      }
      scanFx.success(`Przypisano do ${activeCarrier.barcode || activeCarrier.code}`);
    } catch (e: unknown) {
      const msg = formatOperationalError(e, "Nie udało się wykonać zbiorczego przypisania.");
      setErr(msg);
      scanFx.error(msg);
    } finally {
      setActing(false);
    }
  };

  const handleCarrierScan = useCallback(
    async (raw: string) => {
      const code = normalizeScanEan(raw);
      if (!code) return;
      try {
        const hit = await scanWmsCarrierByBarcode(DAMAGE_TENANT_ID, code);
        if (!hit.found || !hit.carrier) {
          scanFx.error("Nie rozpoznano nośnika magazynowego");
          return;
        }
        setActiveCarrier(hit.carrier);
        setActiveAllocKey(null);
        setPendingAssign(null);
        scanFx.success(`Aktywny nośnik: ${hit.carrier.barcode || hit.carrier.code}`, code);
      } catch (e: unknown) {
        scanFx.error(formatOperationalError(e, "Błąd skanowania nośnika"));
      }
    },
    [scanFx],
  );

  useWmsPageScanHandler(
    (code) => {
      void handleCarrierScan(code);
    },
    canEdit,
  );

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-600">
        Wybierz magazyn w nagłówku.
      </div>
    );
  }

  const progressPct = totalQty > 0 ? Math.min(100, (relocatedQty / totalQty) * 100) : 0;
  const carrierStats = detail?.active_carrier_stats;
  const carrierLabel =
    activeCarrier?.barcode || activeCarrier?.code || detail?.relocation_session?.active_carrier_label;

  return (
    <WmsOperationalPageShell className="bg-slate-100">
      <WmsOperationalPageHeader>
        <div className="flex min-h-[52px] items-center gap-3 py-2">
          <Link
            to={WMS_ROUTES.operatorHome}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Braki
          </Link>
          <h1 className="text-lg font-black text-slate-900">Rozlokowanie produktów</h1>
        </div>
      </WmsOperationalPageHeader>

      {sessionLock ? (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4"
          style={{ zIndex: WMS_Z.modal }}
        >
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <p className="text-sm font-bold text-slate-600">Zadanie w użyciu</p>
            <p className="mt-2 text-base text-slate-900">
              Task aktualnie obsługiwany przez{" "}
              <span className="font-black">{sessionLock.holder_name ?? "innego operatora"}</span>
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {sessionLock.can_takeover !== false ? (
                <button
                  type="button"
                  className="rounded-xl bg-indigo-600 py-3 text-sm font-black text-white"
                  onClick={() => void openSession(true)}
                >
                  Przejmij task
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700"
                onClick={() => {
                  setSessionLock(null);
                  setReadOnly(true);
                }}
              >
                Tylko podgląd
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkConfirmOpen ? (
        <div
          className="fixed inset-0 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          style={{ zIndex: WMS_Z.modal }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-black text-slate-900">Rozłożyć wszystko?</p>
            <p className="mt-2 text-sm text-slate-600">
              {pendingAllocs.length} alokacji trafi do nośnika{" "}
              <span className="font-bold">{carrierLabel}</span>. Tej operacji nie cofniesz jednym kliknięciem.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border py-3 text-sm font-bold"
                onClick={() => setBulkConfirmOpen(false)}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-black text-white"
                onClick={() => void onBulkAssign()}
              >
                Potwierdź
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <WmsOperationalPageBody className="space-y-4">
        {pendingAssign && activeCarrier ? (
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-center text-sm font-bold text-indigo-950">
              Odłóż {fmtQty(pendingAssign.remaining_qty)} szt. do{" "}
              <span className="font-black">{carrierLabel}</span>
            </p>
            <p className="mt-1 text-center text-xs text-indigo-800">
              {pendingAssign.order_number ?? `Zamówienie #${pendingAssign.order_id}`}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold"
                onClick={() => setPendingAssign(null)}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={acting}
                className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-black text-white"
                onClick={() => void assignAlloc(pendingAssign)}
              >
                Potwierdź odkładanie
              </button>
            </div>
          </section>
        ) : null}
        {detail ? <CrossdockFlowBanner detail={detail} /> : null}
        {!loading && detail && !canEdit && !readOnly && !sessionLock && detail.status !== "done" ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <p className="text-sm font-medium text-indigo-950">
              To zadanie jest w trybie podglądu. Rozpocznij sesję, aby skanować nośniki i rozkładać produkty.
            </p>
            <button
              type="button"
              className="mt-3 w-full rounded-xl bg-indigo-600 py-3 text-sm font-black text-white sm:w-auto sm:px-6"
              onClick={() => void openSession(false)}
            >
              Rozpocznij rozlokowanie produktów
            </button>
          </div>
        ) : null}
        {readOnly && !sessionLock ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
            Tryb podglądu — edycja wyłączona
            {detail?.relocation_session?.operator_name
              ? ` (sesja: ${detail.relocation_session.operator_name})`
              : null}
          </p>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        ) : err && !detail ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{err}</p>
        ) : detail ? (
          <>
            <OperationalWorkflowTimeline detail={detail} compact />
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                  {detail.image_url ? (
                    <img src={detail.image_url} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Package className="text-slate-400" size={28} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-slate-900">{detail.product_name}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-600">
                    {detail.product_sku ? `SKU ${detail.product_sku}` : null}
                    {detail.product_sku && detail.product_ean ? " · " : null}
                    {detail.product_ean ? `EAN ${detail.product_ean}` : null}
                  </p>
                  {detail.picked_from_location ? (
                    <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                      <MapPin size={14} />
                      Batch ze: {detail.picked_from_location}
                    </p>
                  ) : null}
                  {user?.login ? (
                    <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                      Operator:{" "}
                      {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.login}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
                  <span>Rozłożono</span>
                  <span>
                    {fmtQty(relocatedQty)} / {fmtQty(totalQty)} szt.
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </section>

            <section
              className={`rounded-2xl border p-4 ${
                activeCarrier
                  ? "border-violet-300 bg-violet-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <ScanLine className={`mt-0.5 shrink-0 ${activeCarrier ? "text-violet-700" : "text-slate-500"}`} size={22} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-600">Aktywny nośnik</p>
                  {carrierLabel ? (
                    <>
                      <div className="mt-1.5">
                        <CarrierBadge code={carrierLabel} className="!text-[13px]" />
                      </div>
                      {carrierStats ? (
                        <p className="mt-1 text-xs font-semibold text-violet-800">
                          Na nośniku: {carrierStats.product_count} prod. · {fmtQty(carrierStats.total_qty)} szt.
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[10px] font-bold text-violet-700">
                        Do tego kosza aktualnie odkładasz towar
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      Zeskanuj koszyk, tote lub wózek — potem przypisz alokacje.
                    </p>
                  )}
                </div>
              </div>
              {activeCarrier && pendingAllocs.length > 0 && canEdit ? (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setBulkConfirmOpen(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Box size={16} />
                  Rozłóż wszystko do tego nośnika ({pendingAllocs.length})
                </button>
              ) : null}
            </section>

            <section className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                Do rozłożenia ({pendingAllocs.length}
                {allocationsTotal > allocs.length ? ` / ${allocationsTotal}` : ""})
              </h2>
              {allocs.length === 0 ? (
                <p className="text-sm text-slate-600">Brak alokacji.</p>
              ) : (
                allocs.map((a) => {
                  const key = `${a.order_id}:${a.order_item_id}`;
                  const isActive = activeAllocKey === key;
                  const canAssign = Boolean(activeCarrier) && a.status !== "done" && !acting && canEdit;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!canAssign && a.status !== "done"}
                      onClick={() => {
                        if (a.status === "done" || !canEdit) return;
                        setActiveAllocKey(key);
                        if (activeCarrier) setPendingAssign(a);
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition ${allocCardClass(
                        a.status,
                        isActive,
                      )} disabled:cursor-default`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900">
                            {a.order_number ?? `Zamówienie #${a.order_id}`}
                          </p>
                          {a.target_zone ? (
                            <p className="text-xs text-indigo-800">Strefa: {a.target_zone}</p>
                          ) : null}
                          {a.carrier_label ? (
                            <p className="mt-1 text-xs font-semibold text-emerald-800">→ {a.carrier_label}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                              a.status === "done"
                                ? "bg-emerald-200 text-emerald-900"
                                : a.status === "partial"
                                  ? "bg-indigo-200 text-indigo-900"
                                  : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {statusLabel(a.status)}
                          </span>
                          <p className="mt-1 text-lg font-black tabular-nums text-slate-900">
                            {fmtQty(a.relocated_qty)} / {fmtQty(a.qty)}
                          </p>
                          {a.remaining_qty > 0 ? (
                            <p className="text-[10px] font-bold text-slate-500">
                              zostało {fmtQty(a.remaining_qty)}
                            </p>
                          ) : (
                            <Check className="ml-auto mt-1 text-emerald-600" size={18} />
                          )}
                        </div>
                      </div>
                      {canAssign ? (
                        <p className="mt-2 text-[10px] font-bold uppercase text-indigo-700">
                          Kliknij — odłóż do {carrierLabel}
                        </p>
                      ) : null}
                    </button>
                  );
                })
              )}
              {hasMoreAllocs ? (
                <button
                  type="button"
                  className="w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700"
                  onClick={() => void loadAllocationsPage(allocOffset, true)}
                >
                  Załaduj więcej ({allocs.length} / {allocationsTotal})
                </button>
              ) : null}
            </section>

            {err ? <p className="text-sm font-semibold text-rose-600">{err}</p> : null}

            {allDone || detail.status === "done" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="font-bold text-emerald-900">Rozlokowanie produktów zakończone</p>
                <Link
                  to={WMS_ROUTES.operatorHome}
                  className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline"
                >
                  Wróć do Braki
                </Link>
              </div>
            ) : null}
          </>
        ) : null}
      </WmsOperationalPageBody>
    </WmsOperationalPageShell>
  );
}
