import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, Minus, Plus, Package, Image as ImageIcon } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "../../api/warehouseGraphApi";
import { usePutawayExecute, type PutawayExecuteProduct } from "../../hooks/usePutawayExecute";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { wmsReceiptLineImageUrl } from "../../utils/wmsReceiptLineMedia";
import { playScanBeep } from "../../utils/playScanBeep";
import { fmtQty } from "./putawayFormat";
import {
  fetchWmsRelocationHubDocument,
  isWmsMmRelocationPath,
  wmsRelocationHubRoute,
  wmsRelocationItemRoute,
} from "./wmsMmRelocationFlow";
import { lineHasReceived, putawayDone, commitPutawayQtyInput, putawayTotalQty, placeInputCaretAtEnd, PUTAWAY_FLOAT_EPS, putawayRemaining, type PutawaySelectedLocation } from "./putawayLineUtils";
import { findPutawayDocumentLine, parsePutawayRouteIds } from "./putawayRouteUtils";
import { WMS_ROUTES } from "./wmsRoutes";
import { useAuth } from "../../context/AuthContext";
import { mePutawayOperatorDisplayName } from "../../utils/putawayOperatorDisplay";
import PutawayTraceabilityStrip from "../../components/wms/putaway/PutawayTraceabilityStrip";
import { CarrierBadge } from "../../components/warehouse/carriers/CarrierBadge";
import { carrierVisualClasses } from "../../components/warehouse/carriers/carrierConstants";

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";

type ExecuteLocationState = {
  tenantId?: number;
  selectedLocation?: PutawaySelectedLocation;
  fullCarrierPutaway?: boolean;
  initialCarrierId?: number;
  initialCarrierCode?: string;
  detachFromCarrier?: boolean;
};

export default function WmsPutawayExecutePage() {
  const { pzId: pzIdParam, itemId: itemIdParam } = useParams();
  const routeIds = parsePutawayRouteIds(pzIdParam, itemIdParam);
  const { pzId, itemId } = routeIds;
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const isMmFlow = isWmsMmRelocationPath(routeLocation.pathname);
  const routeState = routeLocation.state as ExecuteLocationState | null;

  const [tenantId, setTenantId] = useState(() => {
    if (routeState?.tenantId && routeState.tenantId >= 1) return routeState.tenantId;
    const raw = localStorage.getItem(TENANT_STORAGE_KEY);
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<StockDocumentRead | null>(null);
  const [locations, setLocations] = useState<WarehouseLocationItem[]>([]);
  const [product, setProduct] = useState<PutawayExecuteProduct | null>(null);
  const modalQtyRef = useRef<HTMLInputElement>(null);

  const selectedLocation = routeState?.selectedLocation ?? null;
  const detachFromCarrier = routeState?.detachFromCarrier === true;
  const fullCarrierPutaway =
    !detachFromCarrier &&
    Boolean(routeState?.fullCarrierPutaway && routeState?.initialCarrierId && routeState.initialCarrierId >= 1);
  const initialCarrierPreset =
    fullCarrierPutaway && routeState?.initialCarrierId
      ? { id: routeState.initialCarrierId, code: (routeState.initialCarrierCode || "").trim() }
      : null;

  const { registerScanHandler, setActiveDocument } = useWmsScanner();
  const { user } = useAuth();
  const operatorDisplayName = mePutawayOperatorDisplayName(user);

  const load = useCallback(async () => {
    if (!routeIds.valid) { setErr("Nieprawidłowy adres."); setProduct(null); setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const d = await fetchWmsRelocationHubDocument(tenantId, pzId, { mmFlow: isMmFlow });
      const it = findPutawayDocumentLine(d, itemId);
      if (!it) { setErr(`Nie znaleziono pozycji #${itemId} na dokumencie.`); setProduct(null); return; }
      if (!lineHasReceived(it)) { setErr("Pozycja nie ma przyjętej ilości."); setProduct(null); return; }
      if (putawayDone(it)) { setErr("Pozycja już w pełni rozlokowana."); }
      setDoc(d);
      setProduct({
        lineId: it.id,
        productId: Number(it.product_id) || 0,
        productName: (it.product_name || "").trim() || `Produkt #${it.product_id}`,
        displayEan: (it.product_ean || "").trim(),
        imageUrl: wmsReceiptLineImageUrl(it),
      });
      if (d.warehouse_id) {
        try { setLocations(await getWarehouseLocations(d.warehouse_id)); } catch { setLocations([]); }
      }
    } catch { setErr("Nie udało się wczytać dokumentu."); setProduct(null); } finally { setLoading(false); }
  }, [tenantId, pzId, itemId, routeIds.valid, isMmFlow]);

  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => { if (routeState?.tenantId && routeState.tenantId >= 1) setTenantId(routeState.tenantId); }, [routeState?.tenantId]);

  const onSaved = useCallback(() => {
    navigate(wmsRelocationHubRoute(isMmFlow ? "MM" : "PZ", pzId), { replace: true, state: { tenantId } });
  }, [navigate, pzId, tenantId, isMmFlow]);

  const execute = usePutawayExecute({
    tenantId,
    product: product ?? { lineId: 0, productId: 0, productName: "", displayEan: "", imageUrl: null },
    doc,
    setDoc,
    locations,
    initialLocation: selectedLocation,
    initialCarrierPreset,
    operatorDisplayName,
    onSaved,
  });

  useEffect(() => {
    if (!product) return;
    registerScanHandler((ean) => void execute.handleScan(ean));
    return () => registerScanHandler(null);
  }, [registerScanHandler, execute.handleScan, product]);

  useEffect(() => {
    if (!Number.isFinite(pzId) || pzId < 1) return;
    setActiveDocument({ kind: "pz", pzId, tenantId });
    return () => setActiveDocument(null);
  }, [pzId, tenantId, setActiveDocument]);

  const backToDetail = () => {
    navigate(wmsRelocationItemRoute(isMmFlow ? "MM" : "PZ", pzId, itemId), { state: { tenantId } });
  };

  if (!routeIds.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/20 backdrop-blur-sm p-6 font-sans">
        <div className="bg-white p-8 rounded-[2rem] shadow-2xl text-center max-w-sm w-full">
          <p className="font-black text-red-600 tracking-wide text-lg mb-6">Nieprawidłowy adres.</p>
          <button type="button" onClick={() => navigate(WMS_ROUTES.putaway)} className="w-full rounded-2xl bg-[#5a4fcf] px-6 py-4 text-sm font-bold uppercase text-white shadow-lg active:scale-95 transition">Wróć</button>
        </div>
      </div>
    );
  }

  if (!selectedLocation && !fullCarrierPutaway && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/20 backdrop-blur-sm p-6 font-sans">
        <div className="bg-white p-8 rounded-[2rem] shadow-2xl text-center max-w-sm w-full">
          <p className="font-bold text-amber-600 tracking-wide text-lg mb-6">Wybierz lokalizację na poprzednim kroku.</p>
          <button type="button" onClick={backToDetail} className="w-full rounded-2xl bg-[#5a4fcf] px-6 py-4 text-sm font-bold uppercase text-white shadow-lg active:scale-95 transition">Wróć do wyboru</button>
        </div>
      </div>
    );
  }

  const rem = execute.line ? putawayRemaining(execute.line) : 0;
  const pack = execute.putawayQty.unitsPerCarton || 1;
  const hasCartons = pack > 1; // Wyświetli przyciski Sztuki/Kartony, gdy na backendzie określono więcej niż 1 szt/karton
  const currentTotal = putawayTotalQty(execute.putawayQty);
  
  const activeQtyTab = execute.putawayQty.inputMode || "unit"; 
  const currentCarrierCode = execute.scannedCarrier?.code || 
    (execute.line?.warehouse_carrier_code || "").trim() || 
    (execute.line?.warehouse_carrier_id ? `#${execute.line.warehouse_carrier_id}` : null);

  const handleMinus = () => {
    execute.setPutawayQty((m0) => {
      const m = commitPutawayQtyInput(m0);
      let next;
      if (activeQtyTab === "carton") next = { ...m, cartonsCount: Math.max(0, m.cartonsCount - 1) };
      else next = { ...m, unitsCount: Math.max(0, m.unitsCount - 1) };
      if (putawayTotalQty(next) > rem + PUTAWAY_FLOAT_EPS) return m0;
      return next;
    });
    placeInputCaretAtEnd(modalQtyRef.current);
  };

  const handlePlus = () => {
    execute.setPutawayQty((m0) => {
      const m = commitPutawayQtyInput(m0);
      const next =
        activeQtyTab === "carton" ? { ...m, cartonsCount: m.cartonsCount + 1 } : { ...m, unitsCount: m.unitsCount + 1 };
      if (putawayTotalQty(next) > rem + PUTAWAY_FLOAT_EPS) {
        execute.showScannerToast("Nie możesz rozlokować więcej niż przyjęto");
        return m0;
      }
      return next;
    });
    placeInputCaretAtEnd(modalQtyRef.current);
  };

  const sku = (execute.line as any)?.product_sku || "—";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 sm:p-6 font-sans text-slate-900 overflow-y-auto">
      
      <div className="relative w-full max-w-[580px] rounded-[2.5rem] bg-white p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100 my-auto">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="h-10 w-10 animate-spin border-4 border-[#5a4fcf] border-t-transparent rounded-full mb-4" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Wczytywanie...</span>
          </div>
        ) : err && !product ? (
          <div className="py-12 text-center">
            <p className="font-bold text-red-600 mb-6 text-lg">{err}</p>
            <button type="button" onClick={backToDetail} className="font-bold text-[#5a4fcf] hover:text-[#4a40b2] uppercase tracking-widest text-sm">Wróć</button>
          </div>
        ) : product ? (
          <>
            {/* GÓRNA CZĘŚĆ: Zdjęcie (lewo) + Informacje (prawo) */}
            <div className="mb-8 flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="w-36 h-36 flex items-center justify-center shrink-0">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" className="max-w-full max-h-full object-contain mix-blend-multiply" />
                ) : (
                  <ImageIcon size={48} className="text-slate-200" strokeWidth={1.5} />
                )}
              </div>
              
              <div className="flex-1 flex flex-col justify-center text-center sm:text-left">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug mb-4">
                  {product.productName}
                </h2>
                
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <span className="text-xs font-semibold text-slate-600 border border-slate-200 px-3.5 py-1.5 rounded-xl uppercase">
                    SKU: {sku}
                  </span>
                  <span className="text-xs font-semibold text-slate-600 border border-slate-200 px-3.5 py-1.5 rounded-xl uppercase">
                    EAN: {product.displayEan || "BRAK"}
                  </span>
                  {(currentCarrierCode || "").trim() ? (
                    <CarrierBadge code={currentCarrierCode!} />
                  ) : (
                    <span className={carrierVisualClasses.monoChip}>
                      <Package className="h-3.5 w-3.5 text-violet-500" />
                      Luzem
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              
              {/* LOKALIZACJA DOCELOWA */}
              <div className="bg-white border border-slate-100 rounded-[1.5rem] p-5 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Lokalizacja docelowa
                </span>
                <div className="bg-blue-50/60 border border-blue-100 text-[#3b82f6] px-4 py-2 rounded-xl flex items-center space-x-2 text-sm font-bold">
                  <MapPin className="w-4 h-4" />
                  <span>{execute.modalLocationLabel}</span>
                </div>
              </div>

              {/* POSTĘP I SUMA */}
              <div className="bg-white border border-slate-100 rounded-[1.5rem] p-6 flex items-center shadow-sm">
                <div className="flex-1">
                  <p className="text-lg font-bold text-slate-700">
                    Pozostało {fmtQty(rem)} szt.
                  </p>
                </div>
                
                <div className="w-px h-12 bg-slate-100 mx-4"></div>
                
                <div className="flex-1 text-right flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-widest mb-0.5">
                    Suma
                  </span>
                  <div className="flex items-baseline justify-end gap-1 font-sans tabular-nums">
                    <span className="text-4xl font-bold text-[#5a4fcf]">{fmtQty(currentTotal)}</span>
                    <span className="text-sm font-bold text-slate-400">szt.</span>
                  </div>
                </div>
              </div>

              {/* GŁÓWNY KONTROLER ILOŚCI */}
              <div className={`bg-white border border-slate-100 rounded-[2rem] p-6 sm:p-8 flex flex-col items-center shadow-sm transition-opacity ${execute.qtyDisabled ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
                
                {/* PRZEŁĄCZNIK KARTONY / SZTUKI (Wzorowany na image_db85f1.png) */}
                {hasCartons && (
                  <div className="flex bg-slate-50 p-1 rounded-xl w-full max-w-[340px] mb-6">
                    <button
                      type="button"
                      onClick={() => execute.setPutawayQty(m => ({ ...m, inputMode: 'unit', draft: null }))}
                      className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                        activeQtyTab === 'unit' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Sztuki
                    </button>
                    <button
                      type="button"
                      onClick={() => execute.setPutawayQty(m => ({ ...m, inputMode: 'carton', draft: null }))}
                      className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                        activeQtyTab === 'carton' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Kartony
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between w-full max-w-[340px]">
                  
                  {/* Minus */}
                  <button
                    type="button"
                    disabled={execute.qtyDisabled}
                    onClick={handleMinus}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors shrink-0 disabled:opacity-50"
                  >
                    <Minus className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
                  </button>
                  
                  {/* Input ilości w ramce */}
                  <div className="flex-1 h-14 sm:h-16 mx-4 border border-slate-200 rounded-2xl flex items-center justify-center gap-1.5">
                    <input
                      ref={modalQtyRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={execute.qtyDisabled}
                      value={
                        execute.putawayQty.draft !== null
                          ? execute.putawayQty.draft
                          : String(activeQtyTab === "carton" ? execute.putawayQty.cartonsCount : execute.putawayQty.unitsCount)
                      }
                      onChange={(e) => execute.setPutawayQty((m) => ({ ...m, draft: e.target.value.replace(/\D/g, "") }))}
                      onFocus={(e) => {
                        execute.setPutawayQty((m) => ({
                          ...m,
                          draft: String(m.inputMode === "carton" ? m.cartonsCount : m.unitsCount),
                        }));
                        placeInputCaretAtEnd(e.currentTarget);
                      }}
                      onBlur={() =>
                        execute.setPutawayQty((m) => {
                          let committed = commitPutawayQtyInput(m);
                          if (putawayTotalQty(committed) > rem + PUTAWAY_FLOAT_EPS) {
                            execute.showScannerToast("Nie możesz rozlokować więcej niż przyjęto");
                            let c = committed.cartonsCount;
                            const p = Math.max(1, committed.unitsPerCarton);
                            while (c > 0 && c * p > rem) c -= 1;
                            const u = Math.max(0, Math.min(committed.unitsCount, Math.floor(rem - c * p)));
                            committed = { ...committed, cartonsCount: c, unitsCount: u, draft: null };
                          }
                          return committed;
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (execute.canSaveManual) void execute.applyPutawaySave();
                        }
                      }}
                      className="w-20 sm:w-24 text-center text-4xl sm:text-5xl font-bold leading-none bg-transparent border-none focus:ring-0 p-0 outline-none text-[#5a4fcf] font-sans tabular-nums"
                    />
                    <span className="text-sm font-bold text-slate-400 pt-1.5">
                      {activeQtyTab === "carton" ? "kart." : "szt."}
                    </span>
                  </div>

                  {/* Plus */}
                  <button
                    type="button"
                    disabled={execute.qtyDisabled}
                    onClick={handlePlus}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors shrink-0 disabled:opacity-50"
                  >
                    <Plus className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
                  </button>
                </div>

                <div className="mt-6 text-center">
                  <span className="text-[11px] sm:text-xs font-semibold text-slate-400">
                    <span className="bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded mr-1.5 font-bold uppercase tracking-wider text-[9px]">Enter</span>
                    zatwierdza • Skan EAN dodaje +1 szt.
                  </span>
                </div>
              </div>

            </div>

            {execute.line ? <PutawayTraceabilityStrip line={execute.line} className="mt-6 w-full" /> : null}

            {/* PRZYCISKI AKCJI */}
            <div className="grid grid-cols-2 gap-4 mt-8">
              <button
                type="button"
                disabled={execute.busy}
                onClick={backToDetail}
                className="bg-white border border-slate-200 text-slate-800 font-bold py-4 rounded-2xl text-sm tracking-widest uppercase transition active:scale-95 shadow-sm disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={!execute.canSaveManual || execute.busy}
                onClick={() => void execute.applyPutawaySave()}
                className="bg-[#5a4fcf] hover:bg-[#4a40b2] text-white font-bold py-4 rounded-2xl text-sm tracking-widest uppercase transition active:scale-95 shadow-lg shadow-indigo-500/20 disabled:opacity-100 disabled:bg-[#c7d2fe] disabled:text-white disabled:shadow-none"
              >
                {execute.busy ? "Zapisywanie..." : "Zatwierdź"}
              </button>
            </div>
          </>
        ) : null}

      </div>
    </div>
  );
}