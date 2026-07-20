import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, MapPin, Package, Plus, X, Search, AlertTriangle } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getWmsPutawayLocationSuggestions,
  type WmsPutawayLocationSuggestions,
} from "../../api/wmsPutawayApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "../../api/warehouseGraphApi";
import PutawayLocationSuggestionCard from "../../components/wms/putaway/PutawayLocationSuggestionCard";
import PutawayTraceabilityStrip from "../../components/wms/putaway/PutawayTraceabilityStrip";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { wmsReceiptLineImageUrl } from "../../utils/wmsReceiptLineMedia";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { playScanBeep } from "../../utils/playScanBeep";
import { fmtQty } from "./putawayFormat";
import {
  fetchWmsRelocationHubDocument,
  isWmsMmRelocationPath,
  MM_RELOCATION_UI,
  PZ_PUTAWAY_UI,
  wmsRelocationDocLabel,
  wmsRelocationHubRoute,
  wmsRelocationItemExecuteRoute,
} from "./wmsMmRelocationFlow";
import {
  findLocationByScan,
  lineHasReceived,
  putawayDone,
  putawayRemaining,
  type PutawaySelectedLocation,
} from "./putawayLineUtils";
import {
  emptyPutawaySuggestions,
  findPutawayDocumentLine,
  normalizePutawaySuggestions,
  parsePutawayRouteIds,
} from "./putawayRouteUtils";
import { WMS_ROUTES } from "./wmsRoutes";

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";

type ItemDetailLocationState = {
  tenantId?: number;
};

function rowToSelected(row: {
  location_id: number;
  code: string;
  location_type: string;
  storage_type: string;
}): PutawaySelectedLocation {
  return {
    locationId: row.location_id,
    code: row.code,
    locationType: row.location_type,
    storageType: row.storage_type,
  };
}

function PutawayItemFallback({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center bg-white">
      <p className="max-w-md text-sm font-black tracking-wide text-slate-800">{message}</p>
      <button 
        type="button" 
        onClick={onBack} 
        className="rounded-2xl bg-[#5a4fcf] hover:bg-[#4a40b2] px-8 py-4 text-xs tracking-widest uppercase font-black text-white shadow-lg shadow-indigo-500/20 transition active:scale-95"
      >
        Wróć do listy
      </button>
    </div>
  );
}

export default function WmsPutawayItemDetailPage() {
  const { pzId: pzIdParam, itemId: itemIdParam } = useParams();
  const routeIds = parsePutawayRouteIds(pzIdParam, itemIdParam);
  const { pzId, itemId } = routeIds;
  const navigate = useNavigate();
  const location = useLocation();
  const isMmFlow = isWmsMmRelocationPath(location.pathname);
  const ui = isMmFlow ? MM_RELOCATION_UI : PZ_PUTAWAY_UI;
  const tenantFromState = (location.state as ItemDetailLocationState | null)?.tenantId;
  const [tenantId, setTenantId] = useState(() => {
    if (tenantFromState && tenantFromState >= 1) return tenantFromState;
    const raw = localStorage.getItem(TENANT_STORAGE_KEY);
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  });

  const { registerScanHandler, setActiveDocument, showScannerToast } = useWmsScanner();

  const [loading, setLoading] = useState(true);
  const [fatalErr, setFatalErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WmsPutawayLocationSuggestions>(() => emptyPutawaySuggestions());
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocationItem[]>([]);
  const [docLabel, setDocLabel] = useState("");
  const [docType, setDocType] = useState("PZ");
  const [line, setLine] = useState<import("../../api/stockDocumentsApi").StockDocumentItemRead | null>(null);
  const [warehouseQty, setWarehouseQty] = useState(0);

  // Modal manualnego rozlokowania
  const [isManualLocateOpen, setIsManualLocateOpen] = useState(false);
  const [manualLocationInput, setManualLocationInput] = useState('');

  const load = useCallback(async () => {
    if (!routeIds.valid) { setFatalErr("Nieprawidłowy adres."); setLine(null); setLoading(false); return; }
    setLoading(true); setFatalErr(null); setWarn(null);
    try {
      const doc = await fetchWmsRelocationHubDocument(tenantId, pzId, { mmFlow: isMmFlow });
      const it = findPutawayDocumentLine(doc, itemId);
      
      if (!it) { setFatalErr(`Nie znaleziono pozycji #${itemId}.`); setLine(null); return; }
      if (!lineHasReceived(it)) {
        setFatalErr(isMmFlow ? "Pozycja nie ma ilości do przesunięcia." : "Pozycja nie ma przyjętej ilości.");
        setLine(null);
        return;
      }

      setLine(it);
      setDocType(String(doc.document_type ?? "PZ"));
      setDocLabel(
        wmsRelocationDocLabel(doc.document_type, doc.created_at, doc.id, {
          forceMm: isMmFlow,
          documentNumber: doc.document_number,
        }),
      );
      if (putawayDone(it)) { setWarn("Ta pozycja została już w pełni rozlokowana."); }

      if (doc.warehouse_id) {
        try { setWarehouseLocations(await getWarehouseLocations(doc.warehouse_id)); } 
        catch { setWarehouseLocations([]); }
      } else { setWarehouseLocations([]); }

      try {
        const sug = normalizePutawaySuggestions(await getWmsPutawayLocationSuggestions(tenantId, itemId));
        setSuggestions(sug);
        const whSum = sug.existing_stock_locations.reduce((a, r) => a + (Number(r.current_quantity) || 0), 0);
        setWarehouseQty(whSum);
      } catch {
        setSuggestions(emptyPutawaySuggestions());
      }
    } catch { setFatalErr(ui.loadFailed); setLine(null); } finally { setLoading(false); }
  }, [tenantId, pzId, itemId, routeIds.valid, isMmFlow, ui.loadFailed]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tenantFromState && tenantFromState >= 1) setTenantId(tenantFromState); }, [tenantFromState]);

  useEffect(() => {
    if (!routeIds.valid) return;
    setActiveDocument({ kind: "pz", pzId, tenantId, label: docLabel || `${docType} #${pzId}` });
    return () => setActiveDocument(null);
  }, [pzId, tenantId, docLabel, docType, setActiveDocument, routeIds.valid]);

  const goExecute = useCallback(
    (selected: PutawaySelectedLocation) => {
      if (!line || putawayDone(line)) { showScannerToast("Brak ilości do rozlokowania"); return; }
      navigate(wmsRelocationItemExecuteRoute(isMmFlow ? "MM" : docType, pzId, itemId), {
        state: { tenantId, selectedLocation: selected },
      });
    },
    [navigate, pzId, itemId, tenantId, line, showScannerToast, isMmFlow, docType],
  );

  const resolveLocationFromScan = useCallback(
    (raw: string): PutawaySelectedLocation | null => {
      const hit = findLocationByScan(raw, warehouseLocations);
      if (hit) {
        const code = (hit.code ?? hit.name ?? "").trim() || `#${hit.id}`;
        return { locationId: hit.id, code, locationType: (hit.type || "PICK").trim() || "PICK", storageType: hit.storage_type };
      }
      const c = normalizeScanEan(raw)?.toLowerCase();
      if (!c) return null;
      const all = [...suggestions.existing_stock_locations, ...suggestions.suggested_primary_locations, ...suggestions.suggested_overflow_locations];
      for (const row of all) {
        const codeCompact = normalizeScanEan(row.code);
        if (codeCompact && codeCompact === c) return rowToSelected(row);
        if (row.code.trim().toLowerCase() === raw.trim().toLowerCase()) return rowToSelected(row);
      }
      return null;
    },
    [warehouseLocations, suggestions],
  );

  const handleScan = useCallback(
    (ean: string) => {
      if (!ean || !line || putawayDone(line)) return;
      const loc = resolveLocationFromScan(ean);
      if (loc) { playScanBeep(); goExecute(loc); return; }
      const productEan = (line.product_ean || "").trim();
      const compact = normalizeScanEan(ean);
      if (productEan && compact && normalizeScanEan(productEan) === compact) { showScannerToast("Wybierz lub zeskanuj lokalizację"); return; }
      showScannerToast("Nie rozpoznano lokalizacji");
    },
    [line, resolveLocationFromScan, goExecute, showScannerToast],
  );

  useEffect(() => { registerScanHandler(handleScan); return () => registerScanHandler(null); }, [registerScanHandler, handleScan]);

  const handleManualLocateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const locString = manualLocationInput.trim().toUpperCase();
    if (!locString) return;
    
    const loc = resolveLocationFromScan(locString);
    if (loc) {
      setIsManualLocateOpen(false);
      setManualLocationInput('');
      goExecute(loc);
    } else {
      showScannerToast(`Nie znaleziono lokalizacji: ${locString}`);
    }
  };

  // Obliczenia do paska postępu produktu
  const remaining = line ? putawayRemaining(line) : 0;
  const qtyReceived = line ? (Number(line.quantity_received) || 0) : 0;
  const itemLocated = Math.max(0, qtyReceived - remaining);
  const itemProgressPercent = qtyReceived > 0 ? Math.round((itemLocated / qtyReceived) * 100) : 0;

  const img = line ? wmsReceiptLineImageUrl(line) : null;
  const productName = (line?.product_name || "").trim() || (line ? `Produkt #${line.product_id}` : "");
  const ean = (line?.product_ean || "").trim() || "—";
  const sku = (line as any)?.product_sku || "—"; 
  const carrier = (line?.suggested_warehouse_carrier_barcode || "").trim() || "Luzem";

  const primary = suggestions.suggested_primary_locations;
  const overflow = suggestions.suggested_overflow_locations;
  const existing = suggestions.existing_stock_locations;
  const putQtyByLoc = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of suggestions.distribution_plan?.allocations ?? []) {
      const id = Number(a.location_id);
      if (!Number.isFinite(id)) continue;
      m.set(id, (m.get(id) || 0) + Number(a.allocated_quantity || 0));
    }
    return m;
  }, [suggestions.distribution_plan]);

  const backToList = () =>
    navigate(wmsRelocationHubRoute(isMmFlow ? "MM" : docType, pzId), { state: { tenantId } });

  if (!routeIds.valid) {
    return (
      <div className="flex min-h-screen flex-col bg-white p-6 text-center justify-center items-center">
        <p className="font-black tracking-wide text-red-600 text-lg">Nieprawidłowy adres dokumentu.</p>
        <button type="button" onClick={() => navigate(isMmFlow ? WMS_ROUTES.mm : WMS_ROUTES.putaway)} className="mt-6 rounded-2xl bg-[#5a4fcf] px-8 py-4 text-xs font-black tracking-widest uppercase text-white shadow-lg shadow-indigo-500/20">{ui.backToHub}</button>
      </div>
    );
  }

  let body: ReactNode;
  if (loading) { 
    body = <p className="flex-1 flex items-center justify-center text-sm font-black tracking-widest uppercase text-slate-300 bg-white">Wczytywanie danych…</p>; 
  } else if (fatalErr || !line) { 
    body = <PutawayItemFallback message={fatalErr ?? "Nie udało się wczytać pozycji."} onBack={backToList} />; 
  } else {
    body = (
      <>
        <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 overflow-y-auto bg-white">
          
          {/* LEWA KOLUMNA */}
          <section className="lg:col-span-4 space-y-6">
            
            <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
              
              {/* Zdjęcie bez żadnych ramek, blendujące się z białym tłem */}
              <div className="h-48 w-full flex items-center justify-center mb-8 bg-transparent">
                {img ? (
                  <img src={img} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Brak foto</span>
                )}
              </div>

              <h2 className="text-2xl font-black text-slate-900 leading-tight mb-4">{productName}</h2>
              
              <div className="flex flex-wrap gap-2">
                <span className="text-[10px] font-black bg-white text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-wide">
                  SKU: {sku}
                </span>
                <span className="text-[10px] font-black bg-white text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-wide">
                  EAN: {ean}
                </span>
                <span className="text-[10px] font-black bg-white text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 uppercase tracking-wide">
                  <Package className="w-3.5 h-3.5 text-slate-400" /> NOŚNIK: {carrier}
                </span>
              </div>

              {/* DO ROZLOKOWANIA / NA MAGAZYNIE */}
              <div className="mt-10 flex justify-between items-end">
                <div>
                  <span className="text-[9px] font-black text-slate-400 block uppercase tracking-widest mb-1.5">
                    Do rozlokowania
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-[#5a4fcf]">{fmtQty(remaining)}</span>
                    <span className="text-sm font-bold text-[#5a4fcf]">szt.</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black text-slate-400 block uppercase tracking-widest mb-1.5">
                    Na magazynie
                  </span>
                  <div className="flex items-baseline gap-1 justify-end">
                    <span className="text-4xl font-black text-slate-900">{fmtQty(warehouseQty)}</span>
                    <span className="text-sm font-bold text-slate-900">szt.</span>
                  </div>
                </div>
              </div>

              {/* PASEK POSTĘPU DLA TEGO PRODUKTU */}
              <div className="mt-6">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Postęp rozlokowania
                  </span>
                  <span className="text-xs font-black text-[#5a4fcf]">
                    {fmtQty(itemLocated)} / {fmtQty(qtyReceived)} szt.
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#5a4fcf] transition-all duration-500 rounded-full" 
                    style={{ width: `${itemProgressPercent}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-6">
                <PutawayTraceabilityStrip line={line} />
              </div>

              {/* Obsługa całego nośnika (ukryta w oryginalnym widoku, ale jeśli istnieje, pokazujemy lekko) */}
              {line.suggested_warehouse_carrier_id && remaining > 1e-6 && !putawayDone(line) && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => navigate(WMS_ROUTES.putawayItemExecute(pzId, itemId), {
                      state: { tenantId, fullCarrierPutaway: true, initialCarrierId: line.suggested_warehouse_carrier_id, initialCarrierCode: (line.suggested_warehouse_carrier_barcode || "").trim() },
                    })}
                    className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-4 text-center transition active:scale-95"
                  >
                    <Package className="w-6 h-6 text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-900">Rozlokuj cały nośnik</span>
                  </button>
                </div>
              )}

              {warn && <p className="mt-6 text-center text-[11px] font-bold uppercase tracking-wider text-amber-600">{warn}</p>}
            </div>

            {/* STREFA 3: ISTNIEJĄCE LOKALIZACJE */}
            {existing.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                <span className="text-[10px] font-black text-[#f97316] block uppercase tracking-widest mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" strokeWidth={2.5} /> Produkt na lokalizacjach
                </span>
                <div className="space-y-3">
                  {existing.map((row, idx) => (
                    <PutawayLocationSuggestionCard
                      key={row.location_id}
                      row={row}
                      variant="existing"
                      recommended={idx === 0}
                      disabled={putawayDone(line)}
                      putQty={putQtyByLoc.get(row.location_id) ?? (remaining <= 1 ? remaining : null)}
                      onSelect={() => goExecute(rowToSelected(row))}
                    />
                  ))}
                </div>
              </div>
            )}

          </section>

          {/* PRAWA KOLUMNA */}
          <section className="lg:col-span-8">
            <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm h-full">
              
              <h3 className="text-xl font-black text-slate-900 tracking-tight mb-4">Sugerowane lokalizacje</h3>

              {(suggestions?.suggested_primary_locations ?? []).some(
                (r) =>
                  r.capacity_numeric_trusted === false ||
                  String(r.capacity_confidence || r.confidence || "").toUpperCase() === "UNKNOWN" ||
                  r.used_defaults,
              ) ? (
                <p className="mb-4 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-2 text-xs font-semibold text-amber-900">
                  Pojemność lokalizacji nie może być dokładnie wyliczona — produkt ma niepełne dane logistyczne.
                </p>
              ) : null}

              {suggestions?.distribution_plan && suggestions.distribution_plan.allocations?.length > 0 ? (
                <div className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700 mb-3">
                    Plan rozlokowania (rekomendacja)
                  </p>
                  <p className="text-xs text-slate-600 mb-3">
                    {fmtQty(suggestions.distribution_plan.allocated_quantity)} /{" "}
                    {fmtQty(suggestions.distribution_plan.requested_quantity)} szt. · plan ≠ wykonanie — każda pozycja
                    wymaga skanu
                  </p>
                  {suggestions.distribution_plan.warnings?.some((w) =>
                    String(w).includes("UNKNOWN_GEOMETRY") || String(w).includes("UNKNOWN_CAPACITY_PROBE"),
                  ) ? (
                    <p className="mb-3 text-xs font-semibold text-amber-800">
                      Część ilości nie została zaplanowana — brak wiarygodnej pojemności geometrycznej.
                    </p>
                  ) : null}
                  <ul className="space-y-2">
                    {suggestions.distribution_plan.allocations.map((a) => (
                      <li
                        key={`${a.location_id}-${a.allocated_quantity}`}
                        className="flex items-center justify-between rounded-xl bg-white border border-indigo-100 px-4 py-3"
                      >
                        <button
                          type="button"
                          disabled={putawayDone(line)}
                          onClick={() =>
                            goExecute({
                              locationId: a.location_id,
                              code: a.location_code,
                              locationType: "PICK",
                              storageType: "unknown",
                            })
                          }
                          className="text-left disabled:opacity-50"
                        >
                          <span className="text-sm font-black text-slate-900">{a.location_code}</span>
                          <span className="ml-2 text-xs font-bold text-indigo-700">
                            {a.same_sku_present ? "Dołóż" : "Odłóż"} {fmtQty(a.allocated_quantity)} szt.
                          </span>
                        </button>
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          {String(a.confidence).toUpperCase() === "UNKNOWN"
                            ? "poj. nieokr."
                            : String(a.confidence).toUpperCase() === "ESTIMATED"
                              ? "~szacunek"
                              : "OK"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {(suggestions.distribution_plan.remaining_quantity || 0) > 0 ? (
                    <p className="mt-3 text-xs font-bold text-amber-800">
                      Pozostało bez lokalizacji: {fmtQty(suggestions.distribution_plan.remaining_quantity)} szt.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-8">
                
                {/* STREFA 1: PODSTAWOWE */}
                <div>
                  <span className="text-[10px] font-black text-[#3b82f6] block uppercase tracking-widest mb-4">
                    Rekomendowane lokalizacje
                  </span>
                  {primary.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Brak propozycji
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {primary.map((row, idx) => (
                        <PutawayLocationSuggestionCard
                          key={row.location_id}
                          row={row}
                          recommended={idx === 0}
                          disabled={putawayDone(line)}
                          putQty={putQtyByLoc.get(row.location_id) ?? (idx === 0 && remaining > 0 ? Math.min(1, remaining) : null)}
                          onSelect={() => goExecute(rowToSelected(row))}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* STREFA 2: ZAPASOWE */}
                <div>
                  <span className="text-[10px] font-black text-[#f97316] block uppercase tracking-widest mb-4">
                    Zapasowe / overflow
                  </span>
                  {overflow.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Brak propozycji
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {overflow.map((row) => (
                        <PutawayLocationSuggestionCard
                          key={row.location_id}
                          row={row}
                          variant="overflow"
                          disabled={putawayDone(line)}
                          putQty={putQtyByLoc.get(row.location_id) ?? null}
                          onSelect={() => goExecute(rowToSelected(row))}
                        />
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </section>

        </main>

        {/* DOLNY PASEK STEROWANIA */}
        <footer className="bg-white border-t border-slate-100 p-6 shrink-0 flex items-center justify-end">
          <button 
            onClick={() => setIsManualLocateOpen(true)}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-extrabold px-6 py-4 rounded-2xl text-[11px] uppercase tracking-widest transition flex items-center space-x-2 active:scale-95 shadow-sm"
          >
            <Plus className="w-4 h-4 text-slate-500" strokeWidth={3} />
            <span>Rozlokuj ręcznie</span>
          </button>
        </footer>

        {/* MODAL: RĘCZNE ROZLOKOWANIE */}
        {isManualLocateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm" onClick={() => setIsManualLocateOpen(false)}></div>
            
            <div className="bg-white rounded-[2rem] w-full max-w-[420px] p-8 relative z-10 shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-xl font-black text-slate-900 tracking-tight">Rozlokuj ręcznie</h4>
                <button onClick={() => setIsManualLocateOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-xl transition">
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>
              
              <form onSubmit={handleManualLocateSubmit} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2.5">
                    Wprowadź docelową lokalizację
                  </label>
                  <input
                    type="text"
                    required
                    value={manualLocationInput}
                    onChange={(e) => setManualLocationInput(e.target.value)}
                    placeholder="NP. A10-C-5"
                    className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-4 text-lg font-mono font-black text-slate-900 uppercase focus:outline-none focus:border-[#5a4fcf] transition shadow-sm placeholder:text-slate-300 placeholder:font-sans placeholder:font-semibold"
                  />
                </div>

                <button type="submit" className="w-full bg-[#5a4fcf] hover:bg-[#4a40b2] text-white font-black py-4.5 rounded-2xl text-[13px] tracking-widest uppercase transition active:scale-95 shadow-lg shadow-indigo-500/20">
                  Dalej
                </button>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="w-full flex min-h-screen flex-col bg-white font-sans text-slate-900">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0">
        <div className="flex items-center space-x-4">
          <button onClick={backToList} className="p-3 hover:bg-slate-50 border border-transparent rounded-full text-slate-700 transition active:scale-95">
            <ArrowLeft className="w-6 h-6" strokeWidth={2.5} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{docLabel || `${docType} #${pzId}`}</h1>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">Wybór lokalizacji</p>
          </div>
        </div>

        <div className="relative w-full max-w-[280px]">
          <input
            type="text"
            placeholder="Skanuj lokalizację lub EAN..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleScan(e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }}
            className="w-full bg-slate-50/50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5a4fcf] transition"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-[11px]" />
        </div>
      </header>

      {body}
    </div>
  );
}