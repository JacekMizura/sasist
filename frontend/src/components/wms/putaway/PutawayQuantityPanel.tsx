import { MapPin, Minus, Plus, Package, Image as ImageIcon } from "lucide-react";
import type { RefObject } from "react";
import type { StockDocumentItemRead } from "../../../api/stockDocumentsApi";
import { fmtQty } from "../../../pages/wms/putawayFormat";
import {
  commitPutawayQtyInput,
  placeInputCaretAtEnd,
  PUTAWAY_FLOAT_EPS,
  putawayRemaining,
  putawayTotalQty,
  type PutawayQtyState,
} from "../../../pages/wms/putawayLineUtils";
import PutawayTraceabilityStrip from "./PutawayTraceabilityStrip";

type PutawayQuantityPanelProps = {
  productName: string;
  displayEan: string;
  imageUrl: string | null;
  locationLabel: string | null;
  putawayQty: PutawayQtyState;
  setPutawayQty: React.Dispatch<React.SetStateAction<PutawayQtyState>>;
  qtyDisabled: boolean;
  canSaveManual: boolean;
  busy: boolean;
  line: StockDocumentItemRead | undefined;
  modalQtyRef: RefObject<HTMLInputElement | null>;
  onSave: () => void;
  showScannerToast: (msg: string) => void;
  activeCarrierCode?: string | null;
};

export default function PutawayQuantityPanel({
  productName,
  displayEan,
  imageUrl,
  locationLabel,
  putawayQty,
  setPutawayQty,
  qtyDisabled,
  canSaveManual,
  busy,
  line,
  modalQtyRef,
  onSave,
  showScannerToast,
  activeCarrierCode
}: PutawayQuantityPanelProps) {
  const rem = line ? putawayRemaining(line) : 0;
  const pack = putawayQty.unitsPerCarton || 1;
  const hasCartons = pack > 1;

  const currentTotal = putawayTotalQty(putawayQty);
  const activeQtyTab = putawayQty.inputMode || "unit"; // "unit" | "carton"

  const setTabMode = (mode: "unit" | "carton") => {
    setPutawayQty(m => ({ ...m, inputMode: mode, draft: null }));
  };

  const handleMinus = () => {
    setPutawayQty((m0) => {
      const m = commitPutawayQtyInput(m0);
      let next: PutawayQtyState;
      if (activeQtyTab === "carton") next = { ...m, cartonsCount: Math.max(0, m.cartonsCount - 1) };
      else next = { ...m, unitsCount: Math.max(0, m.unitsCount - 1) };
      if (putawayTotalQty(next) > rem + PUTAWAY_FLOAT_EPS) return m0;
      return next;
    });
    placeInputCaretAtEnd(modalQtyRef.current);
  };

  const handlePlus = () => {
    setPutawayQty((m0) => {
      const m = commitPutawayQtyInput(m0);
      const next: PutawayQtyState =
        activeQtyTab === "carton" ? { ...m, cartonsCount: m.cartonsCount + 1 } : { ...m, unitsCount: m.unitsCount + 1 };
      if (putawayTotalQty(next) > rem + PUTAWAY_FLOAT_EPS) {
        showScannerToast("Nie możesz rozlokować więcej niż przyjęto");
        return m0;
      }
      return next;
    });
    placeInputCaretAtEnd(modalQtyRef.current);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white font-sans items-center justify-center py-6 px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-[28px] shadow-xl p-6 flex flex-col">
        
        {/* Produkt i EAN */}
        <div className="flex items-start gap-4 pb-5 border-b border-slate-100 mb-6 bg-white">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shrink-0 border border-slate-100">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
            ) : (
              <ImageIcon size={32} className="text-slate-200" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1 bg-white">
            <h3 className="text-base font-black text-slate-900 leading-tight mb-2 line-clamp-1">{productName}</h3>
            <div className="flex flex-wrap items-center gap-2 bg-white">
              <span className="inline-flex px-2.5 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-mono font-bold text-slate-500">
                EAN: {displayEan || "Brak"}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded-md text-slate-700 font-mono text-[11px] font-bold">
                <Package size={12} className="text-slate-400" />
                NOŚNIK: {activeCarrierCode || "Luzem"}
              </span>
            </div>
          </div>
        </div>

        {/* Lokalizacja Docelowa */}
        <div className="mb-6 flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lokalizacja docelowa</span>
          {locationLabel ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg font-mono text-sm font-black border border-blue-200 shadow-sm">
              <MapPin size={14} /> {locationLabel}
            </span>
          ) : (
            <span className="text-xs font-bold text-amber-700 bg-white px-3 py-1 rounded-lg border border-amber-200">Brak lokalizacji</span>
          )}
        </div>

        {/* Panel Informacyjny: DO ROZLOKOWANIA / SUMA */}
        <div className="border border-slate-200 rounded-2xl p-4 bg-white flex justify-between items-center mb-6">
          <div className="text-left bg-white">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Do rozlokowania PZ</p>
            <p className="text-sm font-semibold text-slate-500 mt-0.5">Pozostało {fmtQty(rem)} szt.</p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-right bg-white">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">SUMA</p>
            <p className="text-2xl font-black text-indigo-600 leading-none mt-0.5">
              {fmtQty(currentTotal)} <span className="text-sm font-bold text-slate-400">szt.</span>
            </p>
          </div>
        </div>

        {/* Zakładki segmentowe: SZTUKI / KARTONY */}
        {hasCartons && (
          <div className="flex bg-slate-100 p-1 rounded-xl w-full mb-6">
            <button
              type="button"
              onClick={() => setTabMode('unit')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                activeQtyTab === 'unit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sztuki
            </button>
            <button
              type="button"
              onClick={() => setTabMode('carton')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                activeQtyTab === 'carton' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Kartony
            </button>
          </div>
        )}

        {/* Główny Input Licznika */}
        <div className={`bg-white border border-slate-200 rounded-[24px] p-6 w-full text-center mb-6 transition-opacity ${qtyDisabled ? "opacity-40" : "opacity-100"}`}>
          <div className="flex items-center justify-between gap-4 bg-white">
            <button 
              type="button"
              disabled={qtyDisabled}
              onClick={handleMinus}
              className="w-14 h-14 flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-700 shadow-sm transition-colors"
            >
              <Minus size={24} strokeWidth={2.5} />
            </button>
            
            <div className="flex-1 flex items-baseline justify-center gap-1.5 bg-white">
              <input
                ref={modalQtyRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={qtyDisabled}
                value={
                  putawayQty.draft !== null
                    ? putawayQty.draft
                    : String(activeQtyTab === "carton" ? putawayQty.cartonsCount : putawayQty.unitsCount)
                }
                onChange={(e) => setPutawayQty((m) => ({ ...m, draft: e.target.value.replace(/\D/g, "") }))}
                onFocus={(e) => {
                  setPutawayQty((m) => ({
                    ...m,
                    draft: String(m.inputMode === "carton" ? m.cartonsCount : m.unitsCount),
                  }));
                  placeInputCaretAtEnd(e.currentTarget);
                }}
                onBlur={() =>
                  setPutawayQty((m) => {
                    let committed = commitPutawayQtyInput(m);
                    if (putawayTotalQty(committed) > rem + PUTAWAY_FLOAT_EPS) {
                      showScannerToast("Nie możesz rozlokować więcej niż przyjęto");
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
                    if (canSaveManual) onSave();
                  }
                }}
                className="w-24 text-center text-5xl font-black text-indigo-600 bg-transparent border-none focus:ring-0 p-0 outline-none"
              />
              <span className="text-base font-bold text-slate-400">
                {activeQtyTab === "carton" ? "kart." : "szt."}
              </span>
            </div>

            <button 
              type="button"
              disabled={qtyDisabled}
              onClick={handlePlus}
              className="w-14 h-14 flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-700 shadow-sm transition-colors"
            >
              <Plus size={24} strokeWidth={2.5} />
            </button>
          </div>
          
          <p className="text-[10px] font-bold text-slate-400 mt-5 uppercase tracking-wider">
            Enter zatwierdza • Skan EAN dodaje +1 szt.
          </p>
        </div>

        {line ? <PutawayTraceabilityStrip line={line} className="mb-6 w-full" /> : null}

        {/* Akcje Dolne */}
        <div className="flex gap-4 w-full mt-auto bg-white">
          <button
            type="button"
            disabled={busy}
            onClick={() => window.history.back()}
            className="flex-1 py-4 text-slate-700 bg-white hover:bg-slate-50 rounded-2xl text-xs font-black uppercase tracking-wider border border-slate-200 transition-colors"
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={!canSaveManual || busy}
            onClick={onSave}
            className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
          >
            {busy ? "Zapisywanie..." : "ZATWIERDŹ"}
          </button>
        </div>

      </div>
    </div>
  );
}