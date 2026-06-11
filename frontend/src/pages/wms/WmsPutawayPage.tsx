import { useCallback, useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Clock, MapPin, Package, User, ScanLine } from "lucide-react";
import api from "../../api/axios";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { useWmsPageScanHandler } from "../../components/wms/execution/useWmsPageScanHandler";
import { useScanFeedback } from "../../components/wms/execution/useScanFeedback";
import { listWmsPutawayPz, type WmsReceivingPzListRow } from "../../api/wmsReceivingApi";
import { WMS_RECEIVING_UPDATED_EVENT, WMS_RELOCATION_FINALIZED_EVENT, WMS_ROUTES } from "./wmsRoutes";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import { formatRelativeUpdatePl, formatWmsListDate } from "./wmsListFormatters";
import { isReturnReceiptDocumentType } from "./putawayDocumentGates";

type Tenant = { id: number; name: string };

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function PutawayPzCard({ row, tenantId }: { row: WmsReceivingPzListRow; tenantId: number }) {
  const isReturnReceipt = row.is_return_receipt === true || isReturnReceiptDocumentType(row.document_type);
  const hasRmz = row.has_rmz_source === true;
  const hasComplaint = row.has_complaint_source === true;
  const sourceBadge = hasComplaint && !hasRmz
    ? "Z-PZ · Reklamacja"
    : hasRmz && !hasComplaint
      ? "Z-PZ · Zwrot"
      : hasRmz && hasComplaint
        ? "Z-PZ · Zwrot + Reklamacja"
        : isReturnReceipt
          ? "Z-PZ · zwrot RMZ"
          : null;
  const docNumber = displayWarehouseDocumentNumber(row.number) || row.number?.trim() || (isReturnReceipt ? `Z-PZ #${row.id}` : `PZ #${row.id}`);
  const activityIso = row.updated_at?.trim() ? row.updated_at : row.created_at;

  const receivingInProgress = String(row.receiving_status ?? "").toUpperCase() !== "DONE";
  const carrierCount = row.carrier_count ?? 0;
  const totalPut = row.total_putaway ?? 0;
  const putTarget =
    row.putaway_target_quantity ??
    (receivingInProgress ? row.total_received : row.total_ordered);
  const progressPct =
    putTarget > 0 ? Math.min(100, Math.round((totalPut / putTarget) * 100)) : 0;

  return (
    <Link
      to={WMS_ROUTES.putawayPz(row.id)}
      state={{ tenantId }}
      className="text-left bg-white border border-slate-200 rounded-[24px] p-5 shadow-sm hover:shadow-md hover:border-[#5a4fcf]/40 transition-all flex flex-col group h-full"
    >
      {/* Top: Icon & Title & Badges */}
      <div className="flex items-start gap-4 mb-5">
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center border group-hover:scale-105 transition-transform ${
            isReturnReceipt
              ? "bg-indigo-50 text-indigo-700 border-indigo-100"
              : "bg-emerald-50 text-emerald-600 border-emerald-100"
          }`}
        >
          <MapPin size={24} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col items-start pt-0.5 gap-2 min-w-0">
          <h3 className="text-lg font-black text-slate-900 leading-none truncate w-full" title={docNumber}>
            {docNumber}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {isReturnReceipt && sourceBadge ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border bg-indigo-50 text-indigo-800 border-indigo-200/60">
                {sourceBadge}
              </span>
            ) : null}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                isReturnReceipt
                  ? "bg-indigo-50/80 text-indigo-700 border-indigo-200/60"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200/60"
              }`}
            >
              {isReturnReceipt ? "Do rozlokowania Z-PZ" : "Do rozlokowania PZ"}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
              receivingInProgress ? 'bg-amber-50 text-amber-700 border-amber-200/60' : 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
            }`}>
              {receivingInProgress ? "W trakcie przyjęcia" : "Gotowe do rozlokowania"}
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Details */}
      <div className="space-y-2 mb-6 ml-1">
        {row.supplier_name?.trim() ? (
          <div className="flex items-center gap-2.5 text-xs text-slate-500">
            <User size={14} className="text-slate-400" />
            <span className="truncate">Dostawca: <strong className="text-slate-700 font-semibold" title={row.supplier_name}>{row.supplier_name}</strong></span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-xs text-slate-500">
            <User size={14} className="text-slate-400" />
            <span className="truncate">Utworzył: <strong className="text-slate-700 font-semibold">{documentCreatedByLabel(row.created_by)}</strong></span>
          </div>
        )}

        <div className="flex items-start gap-2.5 text-xs text-slate-500">
          <Clock size={14} className="text-slate-400 mt-0.5" />
          <div className="flex flex-col">
            <span>Utworzono: <strong className="text-slate-700 font-semibold">{formatWmsListDate(row.created_at)}</strong></span>
            <span className="text-[11px] text-slate-400 mt-0.5">Zaktualizowano: {formatRelativeUpdatePl(activityIso)}</span>
          </div>
        </div>

        {carrierCount > 0 && (
          <div className="flex items-center gap-2.5 text-xs text-slate-500 pt-1">
            <Package size={14} className="text-slate-400" />
            <span>Nośniki: <strong className="text-slate-700 font-semibold">{carrierCount}</strong></span>
          </div>
        )}
      </div>

      {/* Bottom: Progress */}
      <div className="mt-auto pt-4 border-t border-slate-100">
        <div className="flex items-end justify-between mb-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Rozlokowano
          </span>
          <div className="text-right leading-none">
            <span className="text-xl font-black text-slate-900">{fmtQty(totalPut)}</span>
            <span className="text-sm font-semibold text-slate-400"> / {fmtQty(putTarget)}</span>
          </div>
        </div>
        
        <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out bg-emerald-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="text-right mt-1.5">
          <span className="text-[10px] font-bold text-slate-400">{progressPct}%</span>
        </div>
      </div>
    </Link>
  );
}

export default function WmsPutawayPage() {
  const location = useLocation();
  const { setActiveDocument, setScannerInputPlaceholder } = useWmsScanner();
  const scanFx = useScanFeedback();

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Lista PZ — rozlokowanie PZ" });
    setScannerInputPlaceholder("Skanuj PZ lub EAN produktu");
    return () => {
      setActiveDocument(null);
      setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
    };
  }, [setActiveDocument, setScannerInputPlaceholder]);

  useWmsPageScanHandler(() => {
    scanFx.warning("Wybierz PZ z listy, potem skanuj na ekranie rozlokowania.");
  });

  const [tenantId, setTenantId] = useState(1);
  const [rows, setRows] = useState<WmsReceivingPzListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  
  // Stan dla nowej wyszukiwarki
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        const savedRaw = localStorage.getItem(TENANT_STORAGE_KEY);
        const saved = savedRaw != null ? Number(savedRaw) : NaN;
        const pick = list.find((t) => t.id === saved)?.id ?? list[0]?.id ?? 1;
        setTenantId(pick);
        localStorage.setItem(TENANT_STORAGE_KEY, String(pick));
      })
      .catch(() => {
        /* keep default */
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await listWmsPutawayPz(tenantId));
    } catch {
      setErr("Nie udało się wczytać listy PZ.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load, location.key]);

  useEffect(() => {
    const onRelocationFinalized = (ev: Event) => {
      const d = (ev as CustomEvent<{ tenantId?: number }>).detail;
      if (!d || d.tenantId !== tenantId) return;
      void load();
    };
    window.addEventListener(WMS_RELOCATION_FINALIZED_EVENT, onRelocationFinalized);
    return () => window.removeEventListener(WMS_RELOCATION_FINALIZED_EVENT, onRelocationFinalized);
  }, [tenantId, load]);

  useEffect(() => {
    const onReceivingUpdated = (ev: Event) => {
      const d = (ev as CustomEvent<{ tenantId?: number; pzId?: number }>).detail;
      if (!d || d.tenantId !== tenantId) return;
      void load();
    };
    window.addEventListener(WMS_RECEIVING_UPDATED_EVENT, onReceivingUpdated);
    return () => window.removeEventListener(WMS_RECEIVING_UPDATED_EVENT, onReceivingUpdated);
  }, [tenantId, load]);

  // Filtrowanie listy na podstawie paska wyszukiwania
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const q = searchTerm.toLowerCase().trim();
    return rows.filter((r) => {
      const docNumber = (r.number || `PZ #${r.id}`).toLowerCase();
      const supplier = (r.supplier_name || "").toLowerCase();
      return docNumber.includes(q) || supplier.includes(q);
    });
  }, [rows, searchTerm]);

  return (
    <div className="min-h-full bg-white flex flex-col">
      <div className="p-4 sm:p-6 lg:p-8 flex flex-col flex-1">
      <div className="w-full flex-1 flex flex-col animate-in fade-in duration-500">
        
        {/* Pasek wyszukiwania / skaner - sklonowany z Przyjęć */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-stretch w-full">
          <div className="bg-white rounded-xl shadow-sm border border-[#5a4fcf]/20 p-1.5 flex items-center flex-grow transition-all focus-within:border-[#5a4fcf] focus-within:ring-2 focus-within:ring-indigo-500/10">
            <ScanLine className="text-slate-400 ml-3 mr-2 shrink-0" size={20} strokeWidth={2} />
            <input 
              type="text" 
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Zeskanuj kod dokumentu, nośnik lub wpisz dostawcę..." 
              className="w-full bg-transparent border-none focus:ring-0 text-slate-800 placeholder-slate-400 py-2 text-sm font-semibold outline-none px-2"
            />
            <button className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-black tracking-widest uppercase transition-colors shrink-0 active:scale-95">
              Szukaj
            </button>
          </div>
        </div>

        {err && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800 shadow-sm w-full">
            {err}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 flex-1">
            <div className="h-10 w-10 animate-spin border-4 border-[#5a4fcf] border-t-transparent rounded-full mb-6" />
            <p className="font-black uppercase tracking-widest text-[11px]">Pobieranie dokumentów...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-20 text-center animate-in zoom-in-95 duration-300">
            <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-slate-50 text-slate-300 mb-6 border border-slate-100 shadow-sm">
              <MapPin size={48} strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Brak dokumentów do rozlokowania</h3>
            <p className="text-base font-medium text-slate-500 max-w-md">
              W tej chwili nie ma żadnych dokumentów oczekujących na przypisanie półek.
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-4 border border-slate-100">
              <ScanLine size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-1">Nic nie znaleziono</h3>
            <p className="text-sm text-slate-500">Brak wyników dla: "{searchTerm}"</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 pb-12">
            {filteredRows.map((r) => (
              <li key={r.id}>
                <PutawayPzCard row={r} tenantId={tenantId} />
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}