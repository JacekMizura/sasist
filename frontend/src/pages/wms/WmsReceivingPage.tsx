import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { Clock, Plus, RotateCcw, Truck, CheckCircle2, ScanLine, User } from "lucide-react";
import PzWorkflowStatusBadges from "../../components/wms/PzWorkflowStatusBadges";
import { WmsNewDeliveryModal } from "../../components/wms/receiving/WmsNewDeliveryModal";
import { fetchTenantsList } from "../../api/tenantsApi";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { useWmsPageScanHandler } from "../../components/wms/execution/useWmsPageScanHandler";
import { useScanFeedback } from "../../components/wms/execution/useScanFeedback";
import { listWmsReceivingPz, type WmsReceivingPzListRow } from "../../api/wmsReceivingApi";
import { WMS_ROUTES } from "./wmsRoutes";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import { formatRelativeUpdatePl, formatWmsListDate } from "./wmsListFormatters";

type Tenant = { id: number; name: string };

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function ReceivingPzCard({ row, tenantId }: { row: WmsReceivingPzListRow; tenantId: number }) {
  const idLine = row.number?.trim() || `PZ #${row.id}`;
  const activityIso = row.updated_at?.trim() ? row.updated_at : row.created_at;

  const isReturn = idLine.toUpperCase().includes("Z-PZ");
  const fromWms = (row.creation_source || "").toUpperCase() === "WMS";

  return (
    <Link
      to={WMS_ROUTES.receivingPz(row.id)}
      state={{ tenantId }}
      className="group flex flex-col justify-between h-full p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-[#5a4fcf]/40 transition-all text-left"
    >
      <div>
        <div className="flex justify-between items-start mb-4 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
              isReturn 
                ? 'bg-rose-50 border-rose-100 text-rose-500 group-hover:bg-rose-100' 
                : 'bg-indigo-50/50 border-indigo-100 text-[#5a4fcf] group-hover:bg-indigo-100'
            }`}>
              {isReturn ? <RotateCcw size={22} strokeWidth={2.5} /> : <Truck size={22} strokeWidth={2.5} />}
            </div>
            
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 truncate tracking-tight" title={idLine}>
                {idLine}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                  isReturn ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-slate-50 border-slate-200 text-slate-500"
                }`}>
                  {isReturn ? "Zwrot" : "Dostawa"}
                </span>
                {fromWms && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-amber-50 border border-amber-200 text-amber-600">
                    WMS
                  </span>
                )}
              </div>
            </div>
          </div>

          <PzWorkflowStatusBadges
            compact
            className="shrink-0 justify-end"
            documentType={row.document_type}
            warehouseWorkflowStatus={row.warehouse_workflow_status}
            purchaseWorkflowStatus={row.purchase_workflow_status}
            receiving_status={row.receiving_status}
            putaway_status={row.putaway_status}
            relocation_status={row.relocation_status}
            status={row.status}
          />
        </div>
        
        {/* Sekcja informacyjna */}
        <div className="space-y-1.5 mb-4 pl-[3.5rem]">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <User size={14} className="shrink-0 text-slate-400" strokeWidth={2.5} />
            <span className="truncate">Utworzył: <span className="font-bold text-slate-700">{documentCreatedByLabel(row.created_by)}</span></span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Clock size={14} className="shrink-0 text-slate-400" strokeWidth={2.5} />
            <span className="truncate">Utworzono: <span className="font-bold text-slate-700">{formatWmsListDate(row.created_at)}</span></span>
          </div>
          <div className="text-[10px] font-semibold text-slate-400 pl-5 truncate mt-0.5">
            Aktualizacja: {formatRelativeUpdatePl(activityIso)}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 mt-2 flex justify-between items-end">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {isReturn ? 'Zwrócono' : 'Przyjęto'}
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-black text-slate-900 tracking-tight leading-none">{fmtQty(row.total_received)}</span>
          <span className="text-xs font-bold text-slate-500">szt.</span>
        </div>
      </div>
    </Link>
  );
}

export default function WmsReceivingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const savedPzId = (location.state as { receivingSavedPzId?: number } | null)?.receivingSavedPzId;
  const [savedBanner, setSavedBanner] = useState<number | null>(savedPzId ?? null);
  const [newDeliveryOpen, setNewDeliveryOpen] = useState(false);

  const { setActiveDocument, setScannerInputPlaceholder } = useWmsScanner();
  const scanFx = useScanFeedback();

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Lista PZ" });
    setScannerInputPlaceholder("Skanuj numer PZ lub otwórz dokument");
    return () => {
      setActiveDocument(null);
      setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
    };
  }, [setActiveDocument, setScannerInputPlaceholder]);

  useWmsPageScanHandler(() => {
    scanFx.warning("Otwórz wybraną PZ, aby skanować pozycje.");
  });

  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();

  const [tenantId, setTenantId] = useState(1);
  const [rows, setRows] = useState<WmsReceivingPzListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => {
        const savedRaw = localStorage.getItem(TENANT_STORAGE_KEY);
        const saved = savedRaw != null ? Number(savedRaw) : NaN;
        const pick = list.find((t) => t.id === saved)?.id ?? list[0]?.id ?? 1;
        setTenantId(pick);
        localStorage.setItem(TENANT_STORAGE_KEY, String(pick));
      })
      .catch(() => {
        /* keep default tenantId */
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await listWmsReceivingPz(tenantId, warehouseId));
    } catch {
      setErr("Nie udało się wczytać listy PZ.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load, location.key]);

  return (
    <div className="min-h-full bg-white flex flex-col">
      <div className="p-4 sm:p-6 lg:p-8 flex flex-col flex-1">
      <div className="w-full flex-1 flex flex-col animate-in fade-in duration-500">
        
        {savedBanner != null && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5 shadow-sm w-full">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 shadow-sm border border-emerald-200/50">
                <CheckCircle2 size={20} strokeWidth={2.5} />
              </div>
              <p className="text-sm font-medium text-emerald-900">
                Pomyślnie zapisano liczenie dla dokumentu <strong className="font-black">PZ #{savedBanner}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSavedBanner(null)}
              className="shrink-0 rounded-xl bg-white px-5 py-2.5 text-xs font-black tracking-widest uppercase text-emerald-700 shadow-sm border border-emerald-200 hover:bg-emerald-50 active:scale-95 transition-all w-full sm:w-auto"
            >
              Zamknij
            </button>
          </div>
        )}

        {!hasActiveWarehouse ? (
          <ActiveWarehouseRequiredBanner className="mb-6" hint="Nowe PZ i lista przyjęć dotyczą aktywnego magazynu." />
        ) : null}

        {err && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800 shadow-sm w-full">
            {err}
          </div>
        )}

        {/* Wyszukiwarka + Nowa Dostawa */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-stretch w-full">
          <div className="bg-white rounded-xl shadow-sm border border-[#5a4fcf]/20 p-1.5 flex items-center flex-grow transition-all focus-within:border-[#5a4fcf] focus-within:ring-2 focus-within:ring-indigo-500/10">
            <ScanLine className="text-slate-400 ml-3 mr-2 shrink-0" size={20} strokeWidth={2} />
            <input 
              type="text" 
              placeholder="Zeskanuj kod dokumentu, nośnik lub wpisz dostawcę..." 
              className="w-full bg-transparent border-none focus:ring-0 text-slate-800 placeholder-slate-400 py-2 text-sm font-semibold outline-none px-2"
            />
            <button className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-black tracking-widest uppercase transition-colors shrink-0 active:scale-95">
              Szukaj
            </button>
          </div>
          
          <button 
            type="button"
            disabled={!hasActiveWarehouse}
            onClick={() => {
              if (!hasActiveWarehouse) return;
              setNewDeliveryOpen(true);
            }}
            className="bg-[#5a4fcf] hover:bg-[#4a40b2] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-500/20 shrink-0 md:w-auto w-full active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={18} strokeWidth={2.5} />
            Nowa dostawa
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 flex-1">
            <div className="h-10 w-10 animate-spin border-4 border-[#5a4fcf] border-t-transparent rounded-full mb-6" />
            <p className="font-black uppercase tracking-widest text-[11px]">Pobieranie dokumentów...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-20 text-center animate-in zoom-in-95 duration-300">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white text-slate-300 mb-8 border border-slate-200 shadow-sm">
              <Truck size={40} strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-3">Brak dokumentów PZ</h3>
            <p className="text-sm font-semibold text-slate-500 max-w-md mb-8">
              W tej chwili nie ma żadnych dokumentów oczekujących na przetworzenie w strefie przyjęć.
            </p>
            <button
              type="button"
              onClick={() => setNewDeliveryOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5a4fcf] px-6 py-3 text-xs font-black tracking-widest uppercase text-white shadow-md shadow-indigo-500/20 hover:bg-[#4a40b2] transition-all active:scale-95"
            >
              <Plus size={18} strokeWidth={2.5} />
              Nowa dostawa
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 pb-12">
            {rows.map((r) => (
              <li key={r.id} className="min-h-[220px]">
                <ReceivingPzCard row={r} tenantId={tenantId} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <WmsNewDeliveryModal
        open={newDeliveryOpen}
        tenantId={tenantId}
        warehouseId={warehouseId}
        onClose={() => setNewDeliveryOpen(false)}
        onCreated={(pzId) => {
          navigate(WMS_ROUTES.receivingPz(pzId), { state: { tenantId } });
        }}
      />
      </div>
    </div>
  );
}