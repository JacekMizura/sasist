import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Clock, ScanLine, User, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { fetchWmsActiveInventoryDocuments, type WmsActiveInventoryDocumentRead } from "@/api/inventoryWmsApi";
import { useWmsPageScanHandler } from "@/components/wms/execution/useWmsPageScanHandler";
import { useScanFeedback } from "@/components/wms/execution/useScanFeedback";
import { useWmsScanner } from "@/context/WmsScannerContext";
import { useWarehouse } from "@/context/WarehouseContext";
import {
  inventoryDocumentStatusBadgeClass,
  inventoryDocumentStatusLabel,
  inventoryTypeLabel,
} from "@/modules/inventoryCount/inventoryCountUiLabels";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { setActiveInventoryDocumentId } from "@/modules/inventoryCount/wmsActiveDocumentStorage";
import { formatRelativeUpdatePl, formatWmsListDate } from "@/pages/wms/wmsListFormatters";

const TENANT_ID = 1;

function fmtPct(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(n);
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n);
}

function InventoryCountDocCard({
  doc,
  onOpen,
}: {
  doc: WmsActiveInventoryDocumentRead;
  onOpen: (doc: WmsActiveInventoryDocumentRead) => void;
}) {
  const canCount = doc.can_count;
  const activityIso = doc.last_activity_at?.trim() ? doc.last_activity_at : doc.updated_at;
  const coverage = Math.min(100, Math.max(0, Number(doc.coverage_percent) || 0));
  const progressPct = Math.round(coverage);
  const statusLabel = inventoryDocumentStatusLabel(doc.status);
  const statusBadgeClass = inventoryDocumentStatusBadgeClass(doc.status);
  const hasConflicts = (doc.conflict_count ?? 0) > 0;

  return (
    <button
      type="button"
      disabled={!canCount}
      onClick={() => onOpen(doc)}
      className="group flex h-full w-full flex-col rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-[#5a4fcf]/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55"
    >
      <div className="mb-5 flex items-start gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-600 transition-transform group-hover:scale-105 group-disabled:scale-100">
            <ClipboardList size={24} strokeWidth={2.5} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3
                className="truncate text-lg font-black leading-none text-slate-900"
                title={doc.number}
              >
                {doc.number}
              </h3>
              <span
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${statusBadgeClass}`}
              >
                {statusLabel}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                {inventoryTypeLabel(doc.inventory_type)}
              </span>
              {!canCount ? (
                <span className="inline-flex items-center rounded-md border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
                  Do zatwierdzenia
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2.5 text-xs text-slate-500">
                <User size={14} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                <span>
                  Operatorzy:{" "}
                  <strong className="font-semibold text-slate-700">{fmtInt(doc.operator_count ?? 0)}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-500">
                <AlertTriangle
                  size={14}
                  className={`shrink-0 ${hasConflicts ? "text-amber-500" : "text-slate-400"}`}
                  strokeWidth={2.5}
                />
                <span>
                  Konflikty:{" "}
                  <strong className={`font-semibold ${hasConflicts ? "text-amber-700" : "text-slate-700"}`}>
                    {fmtInt(doc.conflict_count ?? 0)}
                  </strong>
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-500">
                <Clock size={14} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={2.5} />
                <div className="flex flex-col">
                  <span>
                    Aktywność:{" "}
                    <strong className="font-semibold text-slate-700">{formatWmsListDate(activityIso)}</strong>
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-400">
                    {formatRelativeUpdatePl(activityIso)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-3 border-l border-slate-100 pl-4 sm:flex">
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pokrycie</p>
            <p className="text-2xl font-black leading-none text-indigo-600">{fmtPct(coverage)}%</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Policzone</p>
            <p className="text-sm font-black text-slate-900">
              {fmtInt(doc.counted_lines ?? 0)}
              <span className="text-xs font-bold text-slate-400"> / {fmtInt(doc.total_lines ?? 0)}</span>
            </p>
          </div>
          {hasConflicts ? (
            <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
              {fmtInt(doc.conflict_count ?? 0)} konfl.
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-auto border-t border-slate-100 pt-4">
        <div className="mb-2 flex items-end justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Postęp liczenia
          </span>
          <div className="flex items-baseline gap-2 sm:hidden">
            <span className="text-sm font-black text-indigo-600">{fmtPct(coverage)}%</span>
            <span className="text-xs font-bold text-slate-400">
              {fmtInt(doc.counted_lines ?? 0)} / {fmtInt(doc.total_lines ?? 0)}
            </span>
          </div>
          <div className="hidden items-baseline gap-1 sm:flex">
            <span className="text-xl font-black leading-none text-slate-900">{fmtInt(doc.counted_lines ?? 0)}</span>
            <span className="text-sm font-semibold text-slate-400">/ {fmtInt(doc.total_lines ?? 0)} lokaliz.</span>
          </div>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-indigo-600 transition-all duration-1000 ease-out group-disabled:bg-slate-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-1.5 hidden text-right sm:block">
          <span className="text-[10px] font-bold text-slate-400">{progressPct}% pokrycia</span>
        </div>
      </div>
    </button>
  );
}

/** WMS inventory document queue — same layout language as Przyjęcie / Rozlokowanie PZ. */
export default function WmsInventoryDocumentList() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id;
  const tenantId = TENANT_ID;

  const { setActiveDocument, setScannerInputPlaceholder } = useWmsScanner();
  const scanFx = useScanFeedback();

  const [docs, setDocs] = useState<WmsActiveInventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Lista inwentaryzacji" });
    setScannerInputPlaceholder("Zeskanuj kod dokumentu lub lokalizację...");
    return () => {
      setActiveDocument(null);
      setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
    };
  }, [setActiveDocument, setScannerInputPlaceholder]);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    setErr(null);
    try {
      setDocs(await fetchWmsActiveInventoryDocuments(tenantId, warehouseId));
    } catch {
      setErr("Nie udało się wczytać listy inwentaryzacji.");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDocument = useCallback(
    (doc: WmsActiveInventoryDocumentRead) => {
      if (!warehouseId || !doc.can_count) return;
      setActiveInventoryDocumentId(warehouseId, doc.id);
      navigate(wmsInventoryCountPaths.document(doc.id));
    },
    [navigate, warehouseId],
  );

  const tryOpenByCode = useCallback(
    (raw: string) => {
      const q = raw.trim().toLowerCase();
      if (!q) return;
      const match = docs.find((d) => {
        const num = (d.number || "").toLowerCase();
        return num.includes(q) || num === q || String(d.id) === q;
      });
      if (match?.can_count) {
        openDocument(match);
        return;
      }
      if (match && !match.can_count) {
        scanFx.warning("Ten dokument nie jest dostępny do liczenia.");
        return;
      }
      scanFx.warning("Nie znaleziono dokumentu na liście.");
    },
    [docs, openDocument, scanFx],
  );

  useWmsPageScanHandler(
    useCallback(
      (code: string) => {
        setSearchTerm(code);
        tryOpenByCode(code);
      },
      [tryOpenByCode],
    ),
  );

  const filteredDocs = useMemo(() => {
    if (!searchTerm.trim()) return docs;
    const q = searchTerm.toLowerCase().trim();
    return docs.filter((d) => {
      const num = (d.number || "").toLowerCase();
      const title = (d.title || "").toLowerCase();
      const scope = (d.scope_summary || "").toLowerCase();
      return num.includes(q) || title.includes(q) || scope.includes(q) || String(d.id) === q;
    });
  }, [docs, searchTerm]);

  if (!warehouseId) {
    return (
      <div className="flex min-h-full flex-col bg-white">
        <div className="flex flex-1 flex-col p-4 sm:p-6 lg:p-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-medium text-amber-900">
            Wybierz magazyn w menu WMS, aby wyświetlić dokumenty inwentaryzacji.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="flex flex-1 flex-col p-4 sm:p-6 lg:p-8">
        <div className="flex w-full flex-1 flex-col">
          <div className="mb-8 flex w-full flex-col items-stretch gap-4 md:flex-row">
            <div className="flex flex-grow items-center rounded-xl border border-[#5a4fcf]/20 bg-white p-1.5 shadow-sm transition-all focus-within:border-[#5a4fcf] focus-within:ring-2 focus-within:ring-indigo-500/10">
              <ScanLine className="ml-3 mr-2 shrink-0 text-slate-400" size={20} strokeWidth={2} />
              <input
                type="text"
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") tryOpenByCode(searchTerm);
                }}
                placeholder="Zeskanuj kod dokumentu lub lokalizację..."
                className="w-full border-none bg-transparent px-2 py-2 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
              />
              <button
                type="button"
                onClick={() => tryOpenByCode(searchTerm)}
                className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-100 active:scale-95"
              >
                Szukaj
              </button>
            </div>
          </div>

          {err ? (
            <div className="mb-6 w-full rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800 shadow-sm">
              {err}
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center py-32 text-slate-400">
              <div className="mb-6 h-10 w-10 animate-spin rounded-full border-4 border-[#5a4fcf] border-t-transparent" />
              <p className="text-[11px] font-black uppercase tracking-widest">Pobieranie dokumentów...</p>
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-slate-100 bg-slate-50 text-slate-300 shadow-sm">
                <ClipboardList size={48} strokeWidth={1.5} />
              </div>
              <h3 className="mb-2 text-2xl font-black text-slate-900">Brak aktywnych inwentaryzacji</h3>
              <p className="max-w-md text-base font-medium text-slate-500">
                W tym magazynie nie ma dokumentów dostępnych do liczenia.
              </p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-100 bg-slate-50 text-slate-400">
                <ScanLine size={32} />
              </div>
              <h3 className="mb-1 text-xl font-bold text-slate-900">Nic nie znaleziono</h3>
              <p className="text-sm text-slate-500">Brak wyników dla: &quot;{searchTerm}&quot;</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-5 pb-12 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredDocs.map((doc) => (
                <li key={doc.id} className="min-h-[260px]">
                  <InventoryCountDocCard doc={doc} onOpen={openDocument} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
