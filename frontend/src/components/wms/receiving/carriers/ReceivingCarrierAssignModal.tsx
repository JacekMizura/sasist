import axios from "axios";
import { Search, X, Check, Layers, ArrowRight, PlusCircle, Info, Package } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listWmsCarrierGroups,
  listWmsCarriers,
  type WarehouseCarrierGroupRead,
  type WarehouseCarrierRead,
} from "../../../../api/wmsCarrierApi";
import { postReceivingPzCarriers } from "../../../../api/wmsReceivingApi";
import { useWmsScanner } from "../../../../context/WmsScannerContext";
import { ReceivingCarrierBadge } from "./ReceivingCarrierBadge";

type AllowedPrefix = "PAL" | "BOX" | "BIN" | "CRT" | "MIX";

function apiErrMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: unknown } | undefined;
    if (d?.detail != null) return typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
    return e.message || "Błąd sieci";
  }
  return "Nieznany błąd";
}

const BULK_PREFIX_ORDER: AllowedPrefix[] = ["MIX", "PAL", "BOX", "BIN", "CRT"];

/** Z pola „PAL-” / „mix” wyciąga token rozpoznawany przez API (PAL, BOX, …). */
function parseBulkPrefixToken(raw: string): AllowedPrefix | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  const head = (s.split(/[^A-Z0-9]/)[0] || s.replace(/-/g, "")).slice(0, 12);
  for (const pref of BULK_PREFIX_ORDER) {
    if (head === pref || head.startsWith(pref)) return pref;
  }
  return null;
}

type Props = {
  tenantId: number;
  pzId: number;
  open: boolean;
  onClose: () => void;
  onAttached: () => void;
};

/**
 * Przypisanie nośników do PZ z ekranu przyjęcia — istniejące lub hurtowe (np. 100× PAL-000001).
 */
export function ReceivingCarrierAssignModal({ tenantId, pzId, open, onClose, onAttached }: Props) {
  const { showScannerToast } = useWmsScanner();
  const [activeTab, setActiveTab] = useState<"existing" | "create">("existing");
  
  const [groups, setGroups] = useState<WarehouseCarrierGroupRead[]>([]);
  const [allCarriers, setAllCarriers] = useState<WarehouseCarrierRead[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedExistingId, setSelectedExistingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [createGroupId, setCreateGroupId] = useState(0);
  const [createPrefixRaw, setCreatePrefixRaw] = useState("PAL-");
  const [createQty, setCreateQty] = useState(1);

  const loadLists = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([listWmsCarrierGroups(tenantId), listWmsCarriers(tenantId, false)]);
      setGroups(g);
      setAllCarriers(c.filter((x) => String(x.status || "").toUpperCase() === "ACTIVE"));
    } catch {
      showScannerToast("Nie udało się wczytać nośników");
    }
  }, [tenantId, showScannerToast]);

  useEffect(() => {
    if (!open) return;
    void loadLists();
    setErr(null);
    setFilter("");
    setSelectedExistingId(null);
    setActiveTab("existing");
  }, [open, loadLists]);

  useEffect(() => {
    if (!open || groups.length === 0) return;
    setCreateGroupId((prev) => (prev >= 1 ? prev : groups[0].id));
  }, [open, groups]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allCarriers.slice(0, 80);
    return allCarriers
      .filter((c) => {
        const code = (c.code || "").toLowerCase();
        const bc = (c.barcode || "").toLowerCase();
        return code.includes(q) || bc.includes(q);
      })
      .slice(0, 80);
  }, [allCarriers, filter]);

  const previewTags = useMemo(() => {
    const tags: string[] = [];
    const q = Math.max(1, Math.min(createQty || 1, 10000));
    const safePrefix = createPrefixRaw || "";
    
    if (q <= 5) {
      for (let i = 1; i <= q; i++) {
        tags.push(`${safePrefix}${String(i).padStart(6, "0")}`);
      }
    } else {
      tags.push(`${safePrefix}000001`);
      tags.push(`${safePrefix}000002`);
      tags.push(`${safePrefix}000003`);
      tags.push("...");
      tags.push(`${safePrefix}${String(q).padStart(6, "0")}`);
    }
    return tags;
  }, [createPrefixRaw, createQty]);

  const attachExisting = async () => {
    if (selectedExistingId == null || selectedExistingId < 1) {
      setErr("Wybierz nośnik z listy.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await postReceivingPzCarriers(tenantId, pzId, { warehouse_carrier_id: selectedExistingId });
      onAttached();
      onClose();
    } catch (e) {
      setErr(apiErrMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const createAndAttach = async () => {
    const gid = createGroupId;
    if (gid < 1) {
      setErr("Wybierz grupę / typ nośnika (PAL, BOX, BIN…).");
      return;
    }
    const token = parseBulkPrefixToken(createPrefixRaw);
    if (!token) {
      setErr(`Prefiks musi zaczynać się od: ${BULK_PREFIX_ORDER.join(", ")} (np. PAL-).`);
      return;
    }
    const q = Math.max(1, Math.min(10_000, Math.floor(createQty)));
    setBusy(true);
    setErr(null);
    try {
      await postReceivingPzCarriers(tenantId, pzId, {
        bulk_create: { group_id: gid, prefix: token, quantity: q },
      });
      onAttached();
      onClose();
    } catch (e) {
      setErr(apiErrMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1700] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm font-sans text-slate-800">
      <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        
        {/* Header */}
        <div className="border-b border-slate-100 px-6 py-5 flex justify-between items-start bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Dodaj nośnik do PZ</h2>
            <p className="mt-1 text-sm text-slate-500">
              Wybierz istniejący nośnik albo utwórz serię na potrzeby przyjęcia.
            </p>
          </div>
          <button 
            onClick={onClose}
            disabled={busy}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b border-slate-200 bg-white z-10">
          <button
            className={`flex-1 pb-3 pt-4 text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-2 ${
              activeTab === "existing" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
            onClick={() => setActiveTab("existing")}
            disabled={busy}
          >
            <Search size={16} />
            Wybierz z listy
          </button>
          <button
            className={`flex-1 pb-3 pt-4 text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-2 ${
              activeTab === "create" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
            onClick={() => setActiveTab("create")}
            disabled={busy}
          >
            <Layers size={16} />
            Hurtowe tworzenie
          </button>
        </div>

        {/* Content Area - Przewijana strefa z szarym tłem */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6">
          {err && (
            <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 border border-rose-100">
              {err}
            </p>
          )}

          {activeTab === "existing" ? (
            <div className="flex flex-col gap-4 h-full">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Szukaj po kodzie…"
                  disabled={busy}
                  className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-sm shadow-sm"
                />
              </div>

              {/* Czysta lista elementów (bez pudełka w pudełku) */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm max-h-[320px]">
                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    Brak wyników dla podanego filtru.
                  </div>
                ) : (
                  filtered.map((c) => {
                    const label = (c.code || "").trim() || (c.barcode || "").trim() || `#${c.id}`;
                    const sel = selectedExistingId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelectedExistingId(c.id);
                          setFilter(label);
                        }}
                        className={`w-full flex items-center justify-between p-3.5 border-b border-slate-100 last:border-0 text-left transition-colors ${
                          sel 
                            ? "bg-violet-50/80" 
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <ReceivingCarrierBadge code={label} className="text-[12px] px-2.5 py-1" />
                        </div>
                        {sel && (
                          <div className="text-violet-700 bg-white rounded-full p-0.5 shadow-sm border border-violet-200 mr-1">
                            <Check size={16} strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Formularz - białe tła i cienie wybijają się z szarego modala */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Typ / Grupa
                  </label>
                  <select
                    value={createGroupId}
                    onChange={(e) => setCreateGroupId(Number(e.target.value))}
                    disabled={busy || groups.length === 0}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700 text-sm shadow-sm"
                  >
                    {groups.length === 0 ? (
                      <option value={0}>Brak konfiguracji grup nośników</option>
                    ) : null}
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      Prefiks
                      <span className="text-[10px] text-slate-400 font-normal lowercase sm:pl-1">(np. pal, box)</span>
                    </label>
                    <input
                      type="text"
                      value={createPrefixRaw}
                      onChange={(e) => setCreatePrefixRaw(e.target.value.toUpperCase())}
                      disabled={busy}
                      placeholder="PAL-"
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700 font-mono text-sm uppercase shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Ilość
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={createQty}
                      onChange={(e) => setCreateQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      disabled={busy}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700 font-mono text-sm shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamiczny podgląd z niebieskim tłem */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mt-2 shadow-inner">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={16} className="text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-900">Podgląd generowanych kodów</span>
                </div>
                
                <div className="flex flex-wrap gap-2 items-center">
                  {previewTags.map((tag, idx) => (
                    tag === "..." ? (
                      <div key={`dots-${idx}`} className="flex items-center px-1 text-indigo-400">
                        <ArrowRight size={16} />
                      </div>
                    ) : (
                      <ReceivingCarrierBadge key={tag} code={tag} className="text-[11px]" />
                    )
                  ))}
                </div>
                <p className="text-[11px] text-indigo-600 mt-4 leading-relaxed font-medium">
                  System wygeneruje {createQty || 0} {createQty === 1 ? 'nowy nośnik' : (createQty > 1 && createQty < 5) ? 'nowe nośniki' : 'nowych nośników'} wg bieżącej numeracji w bazie.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pinned Footer (Przyklejony dolny panel z przyciskami) */}
        <div className="border-t border-slate-200 p-4 bg-white z-10 flex flex-col gap-2.5">
          {activeTab === "existing" ? (
            <button
              type="button"
              disabled={busy || !selectedExistingId}
              onClick={() => void attachExisting()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              Przypisz wybrany nośnik
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || groups.length === 0}
              onClick={() => void createAndAttach()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              <PlusCircle size={18} />
              Utwórz {createQty > 1 ? `${createQty} nośników` : 'nośnik'} i przypisz
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full py-3 text-slate-600 bg-white border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
          >
            Zamknij
          </button>
        </div>

      </div>
    </div>
  );
}