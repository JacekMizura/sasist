import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ScanBarcode, MoreVertical, Package, User } from "lucide-react";
import axios from "axios";
import { fetchUsers } from "../../api/authApi";
import { type StockDocumentItemRead, type StockDocumentRead } from "../../api/stockDocumentsApi";
import { finalizeWmsRelocationPz } from "../../api/wmsPutawayApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "../../api/warehouseGraphApi";
import { PutawayActiveCarrierBar } from "../../components/wms/putaway/PutawayActiveCarrierBar";
import { useWmsScanner } from "../../context/WmsScannerContext";
import {
  WMS_MM_UPDATED_EVENT,
  WMS_RECEIVING_UPDATED_EVENT,
  WMS_RELOCATION_FINALIZED_EVENT,
  WMS_ROUTES,
} from "./wmsRoutes";
import { wmsReceiptLineImageUrl } from "../../utils/wmsReceiptLineMedia";
import { fmtQty, formatExpiryDatePl } from "./putawayFormat";
import {
  fetchWmsRelocationHubDocument,
  isMmStockDocumentType,
  isWmsMmRelocationPath,
  MM_RELOCATION_UI,
  PZ_PUTAWAY_UI,
  wmsRelocationDocLabel,
  wmsRelocationItemRoute,
} from "./wmsMmRelocationFlow";
import {
  lineHasReceived,
  PUTAWAY_FLOAT_EPS,
  putawayDone,
  sortPutawayLines,
} from "./putawayLineUtils";
import { sumPutawayProgress } from "./putawayProgressUtils";
import { useWmsPutawayPzScan } from "./useWmsPutawayPzScan";
import { putawayLineQualityBadge } from "./putawayLineQualityBadge";
import {
  putawayCardsEnabled as computePutawayCardsEnabled,
  docAllowsWmsPutaway,
  isReturnReceiptDocumentType,
} from "./putawayDocumentGates";
import { putawayRelocationAudit } from "../../utils/putawayLineAudit";
import { mePutawayOperatorDisplayName } from "../../utils/putawayOperatorDisplay";
import { useAuth } from "../../context/AuthContext";

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";
const POLL_MS = 4000;

function PutawayLineCard({
  index,
  it,
  onOpen,
  busy,
  receivingAllowsPutaway = true,
  receivingDone = false,
  warehouseLocations,
  adminNameById,
}: {
  index: number;
  it: StockDocumentItemRead;
  onOpen: () => void;
  busy: boolean;
  scanFlash?: boolean;
  receivingAllowsPutaway?: boolean;
  receivingDone?: boolean;
  warehouseLocations: WarehouseLocationItem[];
  adminNameById: Map<number, string>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const img = wmsReceiptLineImageUrl(it);
  const ean = (it.product_ean || "").trim() || "—";
  const skuRaw = (it.product_sku || "").trim();
  const showSku = skuRaw.length > 0;

  const put = Number(it.quantity_putaway) || 0;
  const denom = receivingDone && (Number(it.ordered_quantity) || 0) > PUTAWAY_FLOAT_EPS ? Number(it.ordered_quantity) || 0 : Number(it.received_quantity) || 0;
  const carrierCode = (it.warehouse_carrier_code || "").trim();
  const tb = !!it.track_batch;
  const te = !!it.track_expiry;
  const done = putawayDone(it);
  const pct = denom > 0 ? Math.min(100, Math.round((put / denom) * 100)) : 0;
  const allocations = it.putaway_allocations ?? [];
  const relocationAudit = putawayRelocationAudit(it, adminNameById);
  const qualityBadge = putawayLineQualityBadge(it);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div
      onClick={() => { if (receivingAllowsPutaway && !done && !busy) onOpen(); }}
      className={`group relative flex flex-col h-full bg-white border rounded-[24px] overflow-hidden transition-all cursor-pointer ${
        done ? "border-emerald-200 shadow-sm" : "border-slate-200 hover:border-indigo-300 hover:shadow-md"
      } ${busy ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex-1 flex flex-col p-5">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{index}</span>
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl z-20">
                <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} className="flex w-full items-center px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg">
                  Drukuj etykietę
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="w-full h-24 mb-4 flex items-center justify-center">
          {img ? (
            <img src={img} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
          ) : (
            <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Brak foto</span>
          )}
        </div>

        <div className="mb-4">
          <h3 className={`text-sm font-bold leading-snug mb-2 line-clamp-2 min-h-[40px] ${done ? 'text-slate-500' : 'text-slate-900'}`}>
            {it.product_name || `Produkt #${it.product_id}`}
          </h3>
          
          {qualityBadge ? (
            <span
              className={`inline-flex mb-2 rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${qualityBadge.className}`}
            >
              {qualityBadge.label}
            </span>
          ) : null}

          <div className="space-y-1">
            {showSku && <p className="text-[11px] font-mono text-slate-500 truncate"><span className="text-slate-400/80 mr-1">SKU:</span>{skuRaw}</p>}
            <p className="text-[11px] font-mono text-slate-500 truncate"><span className="text-slate-400/80 mr-1">EAN:</span>{ean}</p>
            {carrierCode && (
              <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-100 inline-flex items-center gap-1 px-1.5 py-0.5 rounded mt-1">
                <Package size={10} /> NOŚNIK: {carrierCode}
              </p>
            )}
            {(tb || te) && (
              <div className="flex flex-col gap-0.5 mt-1 text-[10px] text-slate-400 font-medium">
                {tb && <span className="truncate">Partia: <strong className="text-slate-600">{(it.batch_number || "").trim() || "—"}</strong></span>}
                {te && <span className="truncate">Ważność: <strong className="text-slate-600">{formatExpiryDatePl(it.expiry_date) ?? "—"}</strong></span>}
              </div>
            )}
          </div>
        </div>

        {(relocationAudit || allocations.length > 0) && (
          <div className="mt-auto space-y-2 pt-4 border-t border-slate-100">
            {relocationAudit && (
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <User size={12} className="text-slate-400 shrink-0" />
                  <span className="truncate text-slate-500 font-medium max-w-[70px]">{relocationAudit.operatorName}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono text-indigo-600 font-bold">{relocationAudit.locationCode}</span>
                </div>
                <span className="font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                  +{fmtQty(relocationAudit.quantity)} szt.
                </span>
              </div>
            )}

            {allocations.map((a, idx) => {
              const code = (a.location_code || a.location_name || "").trim() || `#${a.location_id}`;
              const auditLoc = relocationAudit?.locationCode.trim().toLowerCase() ?? "";
              if (relocationAudit && auditLoc && auditLoc === code.toLowerCase()) return null;
              
              return (
                <div key={idx} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User size={12} className="text-slate-400 shrink-0" />
                    <span className="truncate text-slate-500 font-medium max-w-[70px]">{a.created_by_name || "Operator"}</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono text-indigo-600 font-bold">{code}</span>
                  </div>
                  <span className="font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                    +{fmtQty(a.quantity)} szt.
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`p-4 border-t ${done ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50/50 border-slate-100'}`}>
        <div className="flex items-end justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rozlokowanie PZ</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-black leading-none ${done ? 'text-emerald-600' : 'text-slate-900'}`}>{fmtQty(put)}</span>
            <span className="text-xs font-bold text-slate-400">/ {fmtQty(denom)} szt.</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function WmsPutawayPzPage() {
  const { pzId: pzIdParam } = useParams();
  const pzId = Number(pzIdParam);
  const navigate = useNavigate();
  const location = useLocation();
  const isMmFlow = isWmsMmRelocationPath(location.pathname);
  const ui = isMmFlow ? MM_RELOCATION_UI : PZ_PUTAWAY_UI;
  const hubListRoute = isMmFlow ? WMS_ROUTES.mm : WMS_ROUTES.putaway;
  const tenantFromState = (location.state as { tenantId?: number; openPutawayItemId?: number } | null)?.tenantId;
  const openItemFromState = (location.state as { openPutawayItemId?: number } | null)?.openPutawayItemId;

  const [tenantId, setTenantId] = useState(() => {
    if (tenantFromState && tenantFromState >= 1) return tenantFromState;
    const raw = localStorage.getItem(TENANT_STORAGE_KEY);
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  });

  useEffect(() => {
    if (tenantFromState && tenantFromState >= 1) setTenantId(tenantFromState);
  }, [tenantFromState]);

  const { setActiveDocument, registerScanHandler, showScannerToast, clearDevScannerInput, refocusScannerInput } = useWmsScanner();

  const [doc, setDoc] = useState<StockDocumentRead | null>(null);
  const docRef = useRef<StockDocumentRead | null>(null);
  const [locations, setLocations] = useState<WarehouseLocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [flashLineId, setFlashLineId] = useState<number | null>(null);
  const [lastTouchedAtByLineId, setLastTouchedAtByLineId] = useState<Record<number, number>>({});
  const [adminNameById, setAdminNameById] = useState<Map<number, string>>(() => new Map());
  const { user } = useAuth();
  const operatorDisplayName = useMemo(() => mePutawayOperatorDisplayName(user), [user]);
  const deepLinkConsumedRef = useRef<number | null>(null);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    void fetchUsers()
      .then((users) => {
        const m = new Map<number, string>();
        for (const u of users) {
          const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.login;
          m.set(u.id, name);
        }
        setAdminNameById(m);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!Number.isFinite(pzId) || pzId < 1) {
      setErr(ui.invalidDoc);
      setDoc(null);
      setLoading(false);
      return;
    }
    setErr(null);
    try {
      const d = await fetchWmsRelocationHubDocument(tenantId, pzId, { mmFlow: isMmFlow });
      const relDone = String(d.relocation_status ?? "").toUpperCase() === "DONE";
      const docIsMm = isMmStockDocumentType(d.document_type);
      if (isMmFlow && !docIsMm) {
        setErr("Ten adres dotyczy przesunięć magazynowych (PM), nie PZ.");
        setDoc(null);
        setLocations([]);
        return;
      }
      if (!isMmFlow && docIsMm) {
        setErr("Dokument PM/MM — użyj modułu przesunięć magazynowych.");
        setDoc(null);
        setLocations([]);
        return;
      }
      const putawayAllowed = docAllowsWmsPutaway(d.document_type, d.status);
      if (relDone) {
        setErr(ui.alreadyDone);
      } else if (!putawayAllowed) {
        setErr(ui.notAllowed);
      } else {
        setErr(null);
      }
      setDoc(d);
      if (d.warehouse_id) {
        setLocations(await getWarehouseLocations(d.warehouse_id));
      } else {
        setLocations([]);
      }
    } catch {
      setErr(ui.loadFailed);
      setDoc(null);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, pzId, isMmFlow, ui]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, location.key]);

  useEffect(() => {
    if (!Number.isFinite(pzId) || pzId < 1) return;
    const t = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load, pzId]);

  useEffect(() => {
    const onReceivingUpdated = (ev: Event) => {
      const d = (ev as CustomEvent<{ tenantId?: number; pzId?: number }>).detail;
      if (!d || d.tenantId !== tenantId || d.pzId !== pzId) return;
      void load();
    };
    const onMmUpdated = (ev: Event) => {
      const d = (ev as CustomEvent<{ tenantId?: number }>).detail;
      if (!d || d.tenantId !== tenantId) return;
      void load();
    };
    if (isMmFlow) {
      window.addEventListener(WMS_MM_UPDATED_EVENT, onMmUpdated);
      return () => window.removeEventListener(WMS_MM_UPDATED_EVENT, onMmUpdated);
    }
    window.addEventListener(WMS_RECEIVING_UPDATED_EVENT, onReceivingUpdated);
    return () => window.removeEventListener(WMS_RECEIVING_UPDATED_EVENT, onReceivingUpdated);
  }, [tenantId, pzId, load, isMmFlow]);

  const receivingDone = !!doc && String(doc.receiving_status ?? "").toUpperCase() === "DONE";
  const relocationOpen = !!doc && String(doc.relocation_status ?? "OPEN").toUpperCase() !== "DONE";
  const putawayCardsEnabled = !!doc && computePutawayCardsEnabled(doc.document_type, doc.status, doc.relocation_status);
  const isReturnReceiptDoc = !!doc && isReturnReceiptDocumentType(doc.document_type);

  const sortedPutawayLines = useMemo(() => {
    if (!doc?.items?.length) return [];
    return sortPutawayLines(doc.items.filter(lineHasReceived));
  }, [doc?.items]);

  const displayPz = doc
    ? wmsRelocationDocLabel(doc.document_type, doc.created_at, doc.id, {
        forceMm: isMmFlow,
        documentNumber: doc.document_number,
      })
    : `${ui.docKind} #${pzId}`;

  const putawayProgress = useMemo(
    () => sumPutawayProgress(doc?.items ?? [], doc?.receiving_status, doc?.total_ordered, doc?.total_received),
    [doc]
  );

  const touchLine = useCallback((lineId: number) => {
    setLastTouchedAtByLineId((prev) => ({ ...prev, [lineId]: Date.now() }));
  }, []);

  const goToItemDetail = useCallback(
    (
      it: StockDocumentItemRead,
      opts?: { detachFromCarrier?: boolean; carrierPreset?: { id: number; code: string } },
    ) => {
      if (putawayDone(it)) return;
      touchLine(it.id);
      const preset = opts?.carrierPreset;
      navigate(wmsRelocationItemRoute(doc?.document_type, pzId, it.id), {
        state: {
          tenantId,
          detachFromCarrier: opts?.detachFromCarrier === true,
          fullCarrierPutaway: !!preset && !opts?.detachFromCarrier,
          initialCarrierId: preset?.id,
          initialCarrierCode: preset?.code,
        },
      });
    },
    [navigate, pzId, tenantId, touchLine, doc?.document_type],
  );

  const onLineFlash = useCallback((lineId: number) => {
    setFlashLineId(lineId);
  }, []);

  const { activeCarrier, filteredLines, carrierStats, clearCarrier, resetSession, bulkBusy } = useWmsPutawayPzScan({
    tenantId,
    pzId,
    doc,
    setDoc,
    lines: sortedPutawayLines,
    locations,
    putawayEnabled: putawayCardsEnabled,
    busy: finalizeBusy,
    onOpenLine: goToItemDetail,
    onLineFlash,
    touchLine,
    lastTouchedAtByLineId,
    operatorDisplayName,
  });

  const displayLines = useMemo(() => sortPutawayLines(filteredLines), [filteredLines]);
  const scanOrFinalizeBusy = finalizeBusy || bulkBusy;

  useEffect(() => {
    if (openItemFromState == null || !Number.isFinite(openItemFromState) || openItemFromState < 1) {
      deepLinkConsumedRef.current = null;
      return;
    }
    if (deepLinkConsumedRef.current === openItemFromState) return;
    if (!doc?.items?.length || loading) return;
    const it = doc.items.find((x) => x.id === openItemFromState);
    deepLinkConsumedRef.current = openItemFromState;
    if (it && lineHasReceived(it) && !putawayDone(it)) {
      navigate(wmsRelocationItemRoute(doc?.document_type, pzId, it.id), { replace: true, state: { tenantId } });
    } else {
      navigate(".", { replace: true, state: { tenantId } });
    }
  }, [openItemFromState, doc?.items, loading, navigate, tenantId, pzId]);

  useEffect(() => {
    setActiveDocument({ kind: "pz", pzId, tenantId, label: displayPz });
    return () => setActiveDocument(null);
  }, [pzId, tenantId, displayPz, setActiveDocument]);

  useEffect(() => {
    if (flashLineId == null) return;
    const t = window.setTimeout(() => setFlashLineId(null), 1800);
    return () => window.clearTimeout(t);
  }, [flashLineId]);

  const canShowFinalizeButton = useMemo(() => {
    if (!doc || !putawayCardsEnabled || !relocationOpen) return false;
    if (!sortedPutawayLines.length) return false;
    return sortedPutawayLines.some((it) => (Number(it.quantity_putaway) || 0) > PUTAWAY_FLOAT_EPS);
  }, [doc, putawayCardsEnabled, relocationOpen, sortedPutawayLines]);

  const handleFinalizeRelocation = useCallback(async () => {
    if (!doc || !canShowFinalizeButton || finalizeBusy) return;
    if (doc.is_fully_putaway !== true) {
      const ok = window.confirm(
        isMmFlow
          ? "Nie wszystkie pozycje zostały przeniesione. Czy chcesz zakończyć przesunięcie?"
          : "Nie wszystkie produkty zostały rozlokowane. Czy chcesz zakończyć?",
      );
      if (!ok) return;
    }
    setFinalizeBusy(true);
    try {
      await finalizeWmsRelocationPz(tenantId, pzId);
      window.dispatchEvent(new CustomEvent(WMS_RELOCATION_FINALIZED_EVENT, { detail: { tenantId } }));
      navigate(hubListRoute, { state: { tenantId } });
    } catch (ex: unknown) {
      let msg = isMmFlow ? "Nie udało się zakończyć przesunięcia." : "Nie udało się zakończyć rozlokowania.";
      if (axios.isAxiosError(ex) && ex.response?.data && typeof ex.response.data === "object") {
        const d0 = (ex.response.data as { detail?: unknown }).detail;
        if (typeof d0 === "string" && d0.trim()) msg = d0;
      }
      window.alert(msg);
    } finally {
      setFinalizeBusy(false);
    }
  }, [doc, canShowFinalizeButton, finalizeBusy, tenantId, pzId, navigate, hubListRoute, isMmFlow]);

  if (!Number.isFinite(pzId) || pzId < 1) {
    return (
      <div className="p-6 text-center mt-20">
        <p className="text-red-600 font-bold">Nieprawidłowy adres.</p>
        <button onClick={() => navigate(hubListRoute)} className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl font-bold">
          {ui.backToHub}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-slate-50/30 font-sans text-slate-900">
      
      {/* ODCHUDZONY NAGŁÓWEK */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 sm:px-6 py-2.5 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-0 w-full">
        
        {/* Lewa: Info o dokumencie */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate(hubListRoute, { state: { tenantId } })}
            className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95"
            title="Wróć do listy"
          >
            <ArrowLeft size={20} strokeWidth={2.5} />
          </button>

          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-black leading-none tracking-tight text-slate-900 sm:text-xl">
                {displayPz}
              </h2>
              <span
                className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                  isReturnReceiptDoc ? "bg-indigo-100 text-indigo-900" : "bg-cyan-100 text-cyan-900"
                }`}
              >
                {isReturnReceiptDoc ? "Z-PZ" : ui.docKind}
              </span>
              {!isMmFlow && !receivingDone ? (
                <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-900">
                  W trakcie przyjęcia
                </span>
              ) : null}
              {(isMmFlow || receivingDone) && relocationOpen ? (
                <span className="inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-900">
                  {isMmFlow ? "Do przesunięcia" : "Gotowe do rozlokowania"}
                </span>
              ) : null}
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              {isReturnReceiptDoc ? "Rozlokowanie Z-PZ (zwrot RMZ)" : ui.flowName}
            </div>
          </div>
        </div>

        {/* Środek: ZINTEGROWANY PASEK NOŚNIKA */}
        <div className="flex-1 flex justify-start lg:justify-center overflow-x-auto no-scrollbar lg:px-4">
          {!isMmFlow && !loading && doc && putawayCardsEnabled ? (
            <PutawayActiveCarrierBar
              activeCode={activeCarrier?.code ?? null}
              skuCount={carrierStats.skuCount}
              unitCount={carrierStats.unitCount}
              onClear={clearCarrier}
              onResetSession={resetSession}
              disabled={scanOrFinalizeBusy}
            />
          ) : null}
        </div>

        {/* Prawa: Statystyki i skaner */}
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <div className="hidden border-r border-slate-200 pr-4 sm:flex sm:flex-col sm:items-end sm:pr-6">
            <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">{ui.progressDone}</p>
            <p className="text-sm font-black leading-none text-slate-900">
              <span className="text-emerald-600">{fmtQty(putawayProgress.totalPut)}</span>{" "}
              <span className="font-bold text-slate-400">/ {fmtQty(putawayProgress.target)}</span>
            </p>
            <p className="mt-0.5 text-[9px] font-bold text-slate-400">{putawayProgress.pct}%</p>
          </div>
          <div className="relative w-full sm:w-64 shrink-0">
            <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Skanuj lokalizację lub EAN..."
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-bold text-slate-600 outline-none transition-colors placeholder:text-slate-400 disabled:opacity-70"
            />
          </div>
        </div>
      </header>

      {/* GŁÓWNA SIATKA - FULL WIDTH */}
      <main className="flex-1 w-full pb-24">
        <div className="w-full flex flex-col gap-4 px-4 sm:px-6 py-6">
          {err && (
            <div className="p-4 bg-red-50 text-red-800 rounded-xl border border-red-200 text-sm font-medium w-full">
              {err}
            </div>
          )}

          {loading ? (
            <div className="text-center text-slate-500 py-10 font-medium">Wczytywanie...</div>
          ) : doc && displayLines.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7">
              {displayLines.map((it, idx) => (
                <PutawayLineCard
                  key={it.id}
                  index={idx + 1}
                  it={it}
                  busy={scanOrFinalizeBusy}
                  scanFlash={flashLineId === it.id}
                  receivingAllowsPutaway={putawayCardsEnabled}
                  receivingDone={receivingDone}
                  warehouseLocations={locations}
                  adminNameById={adminNameById}
                  onOpen={() => goToItemDetail(it)}
                />
              ))}
            </div>
          ) : doc ? (
            <div className="py-10 text-center text-slate-500">
              {activeCarrier
                ? "Brak pozycji na aktywnym nośniku."
                : ui.emptyLines}
            </div>
          ) : null}
        </div>
      </main>

      {/* ODCHUDZONA STOPKA - FULL WIDTH */}
      {canShowFinalizeButton && (
        <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
          <div className="flex w-full items-center justify-end">
            <button
              disabled={finalizeBusy}
              onClick={() => void handleFinalizeRelocation()}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-sm font-black uppercase tracking-wider text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 size={18} />
              {finalizeBusy ? "Zapisywanie..." : ui.finalize}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}