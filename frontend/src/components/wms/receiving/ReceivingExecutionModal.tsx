import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Package, AlertTriangle, Settings2, Minus, Plus, Box, Layers, Image as ImageIcon } from "lucide-react";
import type { ReceivingPzCarrierRead, StockDocumentItemRead } from "../../../api/stockDocumentsApi";
import { wmsReceiptLineImageUrl } from "../../../utils/wmsReceiptLineMedia";
import { receivingSerialKey } from "../../../pages/wms/wmsReceivingLineGroups";
import {
  formatExpiryDatePl,
  formatExpiryInputWhileTyping,
  parseExpiryInputPlToIso,
} from "../../../pages/wms/putawayFormat";
import { buildReceivingAcceptedSummary } from "../../../utils/receivingAcceptedBreakdown";
import {
  documentQuantityFromLines,
  formatReceivingSignedDiff,
  receivingDifferenceToneClass,
  receivingQuantityDifference,
} from "../../../utils/receivingDocumentQtyPresentation";
import { useWmsScanner } from "../../../context/WmsScannerContext";

type QtyMode = "units" | "cartons";

const CARTON_PACK_WARNING = "Produkt nie ma skonfigurowanej ilości sztuk w kartonie";

function parseQtyInput(val: string): number {
  return Math.max(0, Math.floor(Number(String(val).replace(",", ".")) || 0));
}

export type ReceivingExecutionReceivePayload = {
  addQty: number;
  cartonsDelta: number;
  looseDelta: number;
  warehouseCarrierId: number | null;
  serialNumber?: string | null;
  expiryDate?: string | null;
  batchNumber?: string | null;
};

export type ReceivingExecutionCommercialPayload = {
  ordered_quantity?: number | null;
  purchase_price_net?: number | null;
  vat_rate?: number | null;
};

export type ReceivingExecutionModalProps = {
  line: StockDocumentItemRead;
  siblings: StockDocumentItemRead[];
  activeCarrierCode: string | null;
  carriers: ReceivingPzCarrierRead[];
  lineCarrierChoice: number | null;
  onLineCarrierChange: (id: number | null) => void | Promise<void>;
  cartonSize: number;
  busy: boolean;
  onClose: () => void;
  onReceive: (payload: ReceivingExecutionReceivePayload) => Promise<boolean>;
  onSaveCommercial?: (payload: ReceivingExecutionCommercialPayload) => Promise<boolean>;
  onMarkDamage: () => void;
  adminMode: boolean;
  onToggleAdminMode: () => void;
  onRequireAdminMode: () => void;
  /** Blind receiving: hide ordered qty / difference unless true. */
  showDocumentControl: boolean;
  /** Seed „Przyjmujesz teraz” when opening (e.g. from scan). */
  seedReceiveNowQty?: number;
  /** External EAN/carton scan while modal open → bump „Przyjmujesz teraz”. */
  receiveNowBump?: { amount: number; asCartons: boolean; token: number } | null;
};

export function ReceivingExecutionModal({
  line,
  siblings,
  activeCarrierCode,
  carriers,
  lineCarrierChoice,
  onLineCarrierChange,
  cartonSize,
  busy,
  onClose,
  onReceive,
  onSaveCommercial,
  onMarkDamage,
  adminMode,
  onToggleAdminMode,
  onRequireAdminMode,
  showDocumentControl,
  seedReceiveNowQty = 1,
  receiveNowBump = null,
}: ReceivingExecutionModalProps) {
  const { refocusScannerInput } = useWmsScanner();
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const scanSinkRef = useRef<HTMLInputElement>(null);

  const [qtyMode, setQtyMode] = useState<QtyMode>("units");
  const [inputVal, setInputVal] = useState("1");
  const [modalSerial, setModalSerial] = useState("");
  const [modalExpiry, setModalExpiry] = useState("");
  const [modalBatch, setModalBatch] = useState("");
  const [priceNetDraft, setPriceNetDraft] = useState(
    line.purchase_price_net != null ? String(line.purchase_price_net) : "",
  );
  const [vatDraft, setVatDraft] = useState(String(line.vat_rate ?? ""));
  const [orderedDraft, setOrderedDraft] = useState(
    Number(line.ordered_quantity) > 0 ? String(line.ordered_quantity) : "",
  );
  const [modalErrors, setModalErrors] = useState<{
    expiry?: string;
    batch?: string;
    serial?: string;
    qty?: string;
    commercial?: string;
  }>({});

  useEffect(() => {
    setPriceNetDraft(line.purchase_price_net != null ? String(line.purchase_price_net) : "");
    setVatDraft(String(line.vat_rate ?? ""));
    setOrderedDraft(Number(line.ordered_quantity) > 0 ? String(line.ordered_quantity) : "");
  }, [line.id, line.purchase_price_net, line.vat_rate, line.ordered_quantity]);

  const needsSerial = Boolean(line.track_serial);
  const needsExpiry = Boolean(line.track_expiry);
  const needsBatch = Boolean(line.track_batch);
  const hasLotFields = needsSerial || needsExpiry || needsBatch;
  const carriersOnPz = carriers.length > 0;

  const packPerCarton = Math.floor(Number(cartonSize) || 0);
  const cartonsConfigured = packPerCarton >= 2;
  const pack = cartonsConfigured ? packPerCarton : 1;

  const accepted = useMemo(
    () => buildReceivingAcceptedSummary(siblings, cartonSize),
    [siblings, cartonSize],
  );
  const documentQty = useMemo(() => documentQuantityFromLines(siblings), [siblings]);
  const qtyDiffNow = receivingQuantityDifference(documentQty, accepted.totalAllReceived);

  const qtyBlocked = qtyMode === "cartons" && !cartonsConfigured;
  const parsedQty = parseQtyInput(inputVal);

  const focusQtyInput = useCallback(() => {
    const el = qtyInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const bumpQty = useCallback((delta: number) => {
    setInputVal((prev) => String(Math.max(1, parseQtyInput(prev) + delta)));
    setModalErrors((p) => (p.qty === CARTON_PACK_WARNING ? p : { ...p, qty: undefined }));
  }, []);

  useEffect(() => {
    setModalSerial(receivingSerialKey(line));
    setModalExpiry(formatExpiryDatePl(line.expiry_date) ?? "");
    setModalBatch((line.batch_number ?? "").toString().trim());
    const seed = Math.max(1, Math.floor(Number(seedReceiveNowQty) || 1));
    setInputVal(String(seed));
    setQtyMode("units");
    setModalErrors({});
    const t = window.setTimeout(() => {
      if (!needsSerial) {
        focusQtyInput();
      } else {
        scanSinkRef.current?.focus();
      }
      refocusScannerInput();
    }, 80);
    return () => window.clearTimeout(t);
  }, [
    line.id,
    line.track_serial,
    line.expiry_date,
    line.batch_number,
    line.serial_numbers,
    seedReceiveNowQty,
    refocusScannerInput,
    needsSerial,
    focusQtyInput,
  ]);

  useEffect(() => {
    if (!receiveNowBump || needsSerial) return;
    if (receiveNowBump.asCartons) {
      setQtyMode("cartons");
      if (!cartonsConfigured) {
        setModalErrors((p) => ({ ...p, qty: CARTON_PACK_WARNING }));
        return;
      }
      setInputVal((prev) => String(Math.max(1, parseQtyInput(prev) + Math.max(1, receiveNowBump.amount))));
    } else {
      setQtyMode("units");
      setInputVal((prev) => String(Math.max(1, parseQtyInput(prev) + Math.max(1, receiveNowBump.amount))));
    }
    setModalErrors((p) => (p.qty === CARTON_PACK_WARNING ? p : { ...p, qty: undefined }));
    window.setTimeout(() => focusQtyInput(), 0);
  }, [receiveNowBump, needsSerial, cartonsConfigured, focusQtyInput]);

  const carrierLabel = activeCarrierCode?.trim()
    ? activeCarrierCode
    : lineCarrierChoice != null
      ? carriers.find((c) => c.carrier_id === lineCarrierChoice)?.code || "nośnik"
      : "Luzem";

  const buildPayload = useCallback(
    (addQty: number, cartonsDelta: number, looseDelta: number): ReceivingExecutionReceivePayload | null => {
      const nextErrors: typeof modalErrors = {};
      let expiryIso: string | null = null;
      if (needsExpiry) {
        if (!(modalExpiry || "").trim()) nextErrors.expiry = "Data ważności jest wymagana";
        else {
          expiryIso = parseExpiryInputPlToIso(modalExpiry);
          if (!expiryIso) nextErrors.expiry = "Wpisz poprawną datę (dd.mm.rrrr)";
        }
      }
      let batchVal: string | null = null;
      if (needsBatch) {
        batchVal = modalBatch.trim();
        if (!batchVal) nextErrors.batch = "Numer partii jest wymagany";
      }
      const serialVal = modalSerial.trim();
      if (needsSerial && !serialVal) nextErrors.serial = "Numer seryjny jest wymagany";
      const qty = needsSerial ? 1 : addQty;
      if (qty <= 0) nextErrors.qty = "Ilość musi być większa od 0";
      if (qtyMode === "cartons" && !cartonsConfigured) nextErrors.qty = CARTON_PACK_WARNING;
      if (Object.keys(nextErrors).length > 0) {
        setModalErrors(nextErrors);
        if (hasLotFields) onRequireAdminMode();
        return null;
      }
      setModalErrors({});
      const wcId: number | null = carriersOnPz ? lineCarrierChoice : null;
      return {
        addQty: qty,
        cartonsDelta,
        looseDelta: needsSerial ? 1 : looseDelta,
        warehouseCarrierId: wcId,
        serialNumber: needsSerial ? serialVal : null,
        expiryDate: needsExpiry ? expiryIso : undefined,
        batchNumber: needsBatch ? batchVal : undefined,
      };
    },
    [
      needsExpiry,
      needsBatch,
      needsSerial,
      modalExpiry,
      modalBatch,
      modalSerial,
      lineCarrierChoice,
      carriersOnPz,
      hasLotFields,
      onRequireAdminMode,
      qtyMode,
      cartonsConfigured,
    ],
  );

  const submitInput = useCallback(async () => {
    if (needsSerial) {
      const payload = buildPayload(1, 0, 1);
      if (!payload) return;
      const ok = await onReceive(payload);
      if (ok) {
        setInputVal("1");
        scanSinkRef.current?.focus();
      }
      return;
    }
    if (qtyBlocked) return;
    const n = parseQtyInput(inputVal);
    if (n <= 0) {
      setModalErrors({ qty: "Wpisz ilość > 0" });
      return;
    }
    let addQty: number;
    let cartonsDelta: number;
    let looseDelta: number;
    if (qtyMode === "cartons") {
      addQty = n * pack;
      cartonsDelta = n;
      looseDelta = 0;
    } else {
      addQty = n;
      cartonsDelta = 0;
      looseDelta = n;
    }
    const payload = buildPayload(addQty, cartonsDelta, looseDelta);
    if (!payload) return;
    const ok = await onReceive(payload);
    if (ok) {
      setInputVal("1");
      window.setTimeout(() => {
        focusQtyInput();
        refocusScannerInput();
      }, 0);
    }
  }, [
    needsSerial,
    inputVal,
    qtyMode,
    pack,
    qtyBlocked,
    buildPayload,
    onReceive,
    focusQtyInput,
    refocusScannerInput,
  ]);

  const submitDisabled = busy || qtyBlocked;

  const handleCarrierChange = useCallback(
    (id: number | null) => {
      void onLineCarrierChange(id);
    },
    [onLineCarrierChange],
  );

  const setQtyModeUnits = () => {
    setQtyMode("units");
    setModalErrors((p) => (p.qty === CARTON_PACK_WARNING ? { ...p, qty: undefined } : p));
  };

  const setQtyModeCartons = () => {
    setQtyMode("cartons");
    if (!cartonsConfigured) {
      setModalErrors((p) => ({ ...p, qty: CARTON_PACK_WARNING }));
    }
  };

  const sku = (line as any)?.product_sku || "—";
  const ean = (line.product_ean ?? "").trim() || "BRAK";
  const imgUrl = wmsReceiptLineImageUrl(line);

  // Dekodowanie accepted z backendu
  let totalUnits = 0;
  let totalCartons = 0;
  const palettes: Record<string, number> = {};

  accepted.displayRows.forEach(row => {
    if (row.key === "damaged-total") return;
    
    const matchCartons = row.display.match(/(\d+)\s*kart\./);
    const parts = row.display.split(" - ");
    const num = parseInt(parts[1] || "0", 10);

    if (row.display.includes("Luzem")) {
      totalUnits += num;
    } else if (matchCartons) {
      totalCartons += parseInt(matchCartons[1], 10);
    } else if (parts.length === 2) {
      palettes[parts[0]] = (palettes[parts[0]] || 0) + num;
    }
  });

  return (
    <div
      className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 sm:p-6 font-sans text-slate-900 overflow-y-auto"
      data-receiving-execution-modal=""
    >
      {/* Szerokość zgodna z Rozlokowaniem: max-w-[580px]
      */}
      <div
        className="relative w-full max-w-[580px] rounded-[2.5rem] bg-white p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={scanSinkRef}
          type="text"
          autoComplete="off"
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          tabIndex={-1}
          aria-hidden
          readOnly
        />

        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors active:scale-95"
          aria-label="Zamknij"
        >
          <X size={24} strokeWidth={2.5} />
        </button>

        {/* =========================================================
            1. ZDJĘCIE + INFORMACJE
            ========================================================= */}
        <div className="mb-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-2 pr-6">
          {/* Obrazek bez ramek - wtopiony za pomocą mix-blend-multiply */}
          <div className="w-32 h-32 flex items-center justify-center shrink-0">
            {imgUrl ? (
              <img
                src={imgUrl}
                alt=""
                className="max-h-full max-w-full object-contain mix-blend-multiply"
              />
            ) : (
              <ImageIcon size={48} className="text-slate-200" strokeWidth={1.5} />
            )}
          </div>
          
          <div className="flex-1 flex flex-col justify-center text-center sm:text-left pt-1">
            <h2 className="text-[22px] font-black text-slate-900 leading-tight mb-4 line-clamp-2">
              {line.product_name?.trim() || `Pozycja #${line.id}`}
            </h2>
            
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="text-xs font-black text-slate-500 border border-slate-200 px-3.5 py-1.5 rounded-xl uppercase tracking-wide">
                SKU: {sku}
              </span>
              <span className="text-xs font-black text-slate-500 border border-slate-200 px-3.5 py-1.5 rounded-xl uppercase tracking-wide">
                EAN: {ean}
              </span>
              <span className="text-xs font-black text-slate-600 border border-slate-200 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 uppercase tracking-wide">
                <Package size={14} className="text-slate-400" strokeWidth={2.5} /> 
                NOŚNIK: {carrierLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          
          {/* =========================================================
              2. DOTYCHCZAS / WADY (+ kontrola dokumentu tylko z permission)
              ========================================================= */}
          <div className="bg-white border border-slate-100 rounded-[1.5rem] p-5 sm:p-6 shadow-sm space-y-5">
            <div
              className={[
                "grid gap-4",
                showDocumentControl ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2",
              ].join(" ")}
            >
              {showDocumentControl ? (
                <div>
                  <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest mb-1">
                    Ilość z dokumentu
                  </span>
                  <p className="text-xl font-black tabular-nums text-slate-800">
                    {documentQty != null ? documentQty : "—"}
                    {documentQty != null ? (
                      <span className="ml-1 text-xs font-bold text-slate-400">szt.</span>
                    ) : null}
                  </p>
                </div>
              ) : null}
              <div>
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest mb-1">
                  Dotychczas przyjęto
                </span>
                <p className="text-xl font-black tabular-nums text-slate-900">
                  {accepted.totalAllReceived}
                  <span className="ml-1 text-xs font-bold text-slate-400">szt.</span>
                </p>
              </div>
              {showDocumentControl ? (
                <div>
                  <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest mb-1">
                    Różnica
                  </span>
                  <p className={`text-xl font-black tabular-nums ${receivingDifferenceToneClass(qtyDiffNow)}`}>
                    {formatReceivingSignedDiff(qtyDiffNow, (n) => String(n))}
                  </p>
                </div>
              ) : null}
              <div>
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest mb-1">
                  Wady
                </span>
                <p className={`text-xl font-black tabular-nums ${accepted.totalDamaged > 0 ? "text-rose-700" : "text-slate-800"}`}>
                  {accepted.totalDamaged}
                  <span className="ml-1 text-xs font-bold text-slate-400">szt.</span>
                </p>
              </div>
            </div>

            {showDocumentControl && adminMode && onSaveCommercial ? (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest">
                  Cena / VAT / ilość z dokumentu
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block text-xs font-semibold text-slate-600">
                    Cena netto
                    <input
                      type="text"
                      inputMode="decimal"
                      value={priceNetDraft}
                      onChange={(e) => setPriceNetDraft(e.target.value)}
                      placeholder="—"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    VAT %
                    <input
                      type="text"
                      inputMode="decimal"
                      value={vatDraft}
                      onChange={(e) => setVatDraft(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Ilość z dokumentu
                    <input
                      type="text"
                      inputMode="numeric"
                      value={orderedDraft}
                      onChange={(e) => setOrderedDraft(e.target.value)}
                      placeholder="—"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                </div>
                {modalErrors.commercial ? (
                  <p className="text-xs font-semibold text-rose-600">{modalErrors.commercial}</p>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const priceRaw = priceNetDraft.trim().replace(",", ".");
                    const vatRaw = vatDraft.trim().replace(",", ".");
                    const ordRaw = orderedDraft.trim().replace(",", ".");
                    const payload: ReceivingExecutionCommercialPayload = {};
                    if (priceRaw === "") payload.purchase_price_net = null;
                    else {
                      const n = Number(priceRaw);
                      if (!Number.isFinite(n) || n < 0) {
                        setModalErrors((e) => ({ ...e, commercial: "Niepoprawna cena netto." }));
                        return;
                      }
                      payload.purchase_price_net = n;
                    }
                    const vatN = Number(vatRaw);
                    if (!Number.isFinite(vatN) || vatN < 0) {
                      setModalErrors((e) => ({ ...e, commercial: "Niepoprawna stawka VAT." }));
                      return;
                    }
                    payload.vat_rate = vatN;
                    if (ordRaw === "") payload.ordered_quantity = 0;
                    else {
                      const o = Number(ordRaw);
                      if (!Number.isFinite(o) || o < 0) {
                        setModalErrors((e) => ({ ...e, commercial: "Niepoprawna ilość z dokumentu." }));
                        return;
                      }
                      payload.ordered_quantity = o;
                    }
                    setModalErrors((e) => ({ ...e, commercial: undefined }));
                    await onSaveCommercial(payload);
                  }}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Zapisz cenę / VAT
                </button>
                <p className="text-[11px] text-slate-500">
                  Cena brutto:{" "}
                  {(() => {
                    const n = Number(String(priceNetDraft).replace(",", "."));
                    const v = Number(String(vatDraft).replace(",", "."));
                    if (!Number.isFinite(n) || !Number.isFinite(v)) return "—";
                    return new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                      n * (1 + v / 100),
                    );
                  })()}
                </p>
              </div>
            ) : showDocumentControl ? (
              <div className="border-t border-slate-100 pt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cena netto</span>
                  <p className="font-mono font-bold text-slate-800">
                    {line.purchase_price_net != null
                      ? new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                          line.purchase_price_net,
                        )
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">VAT</span>
                  <p className="font-mono font-bold text-slate-800">{line.vat_rate != null ? `${line.vat_rate}%` : "—"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cena brutto</span>
                  <p className="font-mono font-bold text-slate-800">
                    {line.unit_price_gross != null
                      ? new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                          line.unit_price_gross,
                        )
                      : "—"}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="border-t border-slate-100 pt-4">
              <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest mb-4">
                Szczegóły przyjęcia
              </span>
              <div className="space-y-2.5 max-w-sm">
                <div className="flex justify-between items-end">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sztuki</span>
                  <div className="flex-1 border-b-2 border-dotted border-slate-200 mx-3 relative top-[-4px]"></div>
                  <span className="text-sm font-black text-slate-700">{totalUnits} <span className="text-[10px] font-bold text-slate-400">szt.</span></span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Kartony</span>
                  <div className="flex-1 border-b-2 border-dotted border-slate-200 mx-3 relative top-[-4px]"></div>
                  <span className="text-sm font-black text-slate-700">{totalCartons} <span className="text-[10px] font-bold text-slate-400">szt.</span></span>
                </div>
                
                {Object.entries(palettes).map(([pal, palQty]) => (
                  <div key={pal} className="flex justify-between items-end pt-1">
                    <span className="text-[11px] font-black text-[#5a4fcf] uppercase tracking-wider">{pal}</span>
                    <div className="flex-1 border-b-2 border-dotted border-[#5a4fcf]/20 mx-3 relative top-[-4px]"></div>
                    <span className="text-sm font-black text-[#5a4fcf]">{palQty} <span className="text-[10px] font-bold text-[#5a4fcf]/60">szt.</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* =========================================================
              3. GŁÓWNY KONTROLER — PRZYJMUJESZ TERAZ (delta)
              ========================================================= */}
          <div className="bg-white border border-slate-100 rounded-[2rem] p-6 sm:p-8 flex flex-col items-center shadow-sm">
            
            {!needsSerial && (
              <>
                <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest mb-4">
                  Przyjmujesz teraz
                </span>
                <div className="flex bg-slate-50/80 p-1.5 rounded-2xl w-full max-w-[440px] mb-8 border border-slate-100 shadow-inner">
                  <button
                    type="button"
                    onClick={setQtyModeUnits}
                    className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                      qtyMode === "units" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    Sztuki
                  </button>
                  <button
                    type="button"
                    onClick={setQtyModeCartons}
                    className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                      qtyMode === "cartons" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    Kartony
                  </button>
                </div>

                <div className="flex items-center justify-between w-full max-w-[440px]">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => bumpQty(-1)}
                    className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-[1.25rem] bg-white border border-slate-200 text-slate-900 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition shadow-sm disabled:opacity-40"
                  >
                    <Minus className="w-8 h-8" strokeWidth={2.5} />
                  </button>
                  
                  <div className="flex-1 flex items-baseline justify-center mx-4 text-[#5a4fcf]">
                    <span className="text-3xl sm:text-4xl font-black text-[#5a4fcf]/70 mr-1 select-none" aria-hidden>
                      +
                    </span>
                    <input
                      ref={qtyInputRef}
                      type="text"
                      inputMode="numeric"
                      enterKeyHint="done"
                      value={inputVal}
                      disabled={busy}
                      aria-label="Przyjmujesz teraz"
                      onChange={(e) => {
                        setInputVal(e.target.value.replace(/[^\d.,]/g, ""));
                        setModalErrors((p) => (p.qty === CARTON_PACK_WARNING ? p : { ...p, qty: undefined }));
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void submitInput();
                        }
                      }}
                      onBlur={() => {
                        window.setTimeout(() => refocusScannerInput(), 120);
                      }}
                      className="w-full max-w-[140px] sm:max-w-[180px] text-center text-[5rem] sm:text-[6rem] font-medium leading-none tracking-tighter bg-transparent border-none focus:ring-0 p-0 outline-none font-sans tabular-nums"
                    />
                    <span className="text-xl sm:text-2xl font-bold text-slate-400 ml-1 font-sans tracking-wide">
                      {qtyMode === "cartons" ? "kart." : "szt."}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => bumpQty(1)}
                    className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-[1.25rem] bg-white border border-slate-200 text-slate-900 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition shadow-sm disabled:opacity-40"
                  >
                    <Plus className="w-8 h-8" strokeWidth={2.5} />
                  </button>
                </div>
              </>
            )}

            {modalErrors.qty && (
              <p className="mt-5 text-center text-sm font-semibold text-rose-600">{modalErrors.qty}</p>
            )}
            
            {qtyMode === "cartons" && cartonsConfigured && parsedQty > 0 && (
              <p className="mt-5 text-center text-sm font-semibold text-[#5a4fcf]">
                1 kart. = {pack} szt. <span className="text-slate-400 mx-2">·</span> Przyjmujesz teraz {parsedQty * pack} szt.
              </p>
            )}

            <div className="mt-8 text-center">
              <span className="text-[10px] sm:text-[11px] font-black text-slate-400 tracking-widest uppercase">
                <span className="bg-slate-100 border border-slate-200 text-slate-500 px-2.5 py-1 rounded-md mr-2 font-black uppercase tracking-widest text-[10px]">Enter</span>
                zatwierdź • Skan EAN dodaje +1 do „Przyjmujesz teraz”
              </span>
            </div>
          </div>

          {/* =========================================================
              3B. POLA DLA PARTII / DATY / SERIAL
              ========================================================= */}
          {(adminMode || hasLotFields) && (
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-5 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">Szczegóły partii</span>
                {showDocumentControl ? (
                  <button
                    type="button"
                    onClick={onToggleAdminMode}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                      adminMode ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                    }`}
                    aria-label="Dane partii"
                  >
                    <Settings2 size={18} strokeWidth={2.5} />
                  </button>
                ) : null}
              </div>
              
              {needsExpiry && (
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500">Ważność*</label>
                  <input
                    type="text"
                    value={modalExpiry}
                    onChange={(e) => {
                      setModalExpiry(formatExpiryInputWhileTyping(e.target.value));
                      setModalErrors((p) => ({ ...p, expiry: undefined }));
                    }}
                    className="w-full rounded-2xl border-2 border-slate-200 px-5 py-4 font-mono text-base font-bold focus:border-[#5a4fcf] focus:ring-0 outline-none text-slate-800"
                    placeholder="DD.MM.RRRR"
                  />
                  {modalErrors.expiry && <p className="mt-2 text-[11px] text-rose-600 font-bold">{modalErrors.expiry}</p>}
                </div>
              )}
              
              {needsBatch && (
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500">Partia*</label>
                  <input
                    type="text"
                    value={modalBatch}
                    onChange={(e) => {
                      setModalBatch(e.target.value);
                      setModalErrors((p) => ({ ...p, batch: undefined }));
                    }}
                    className="w-full rounded-2xl border-2 border-slate-200 px-5 py-4 text-base font-bold focus:border-[#5a4fcf] focus:ring-0 outline-none text-slate-800"
                  />
                  {modalErrors.batch && <p className="mt-2 text-[11px] text-rose-600 font-bold">{modalErrors.batch}</p>}
                </div>
              )}
              
              {needsSerial && (
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500">Numer Seryjny*</label>
                  <input
                    type="text"
                    value={modalSerial}
                    onChange={(e) => {
                      setModalSerial(e.target.value);
                      setModalErrors((p) => ({ ...p, serial: undefined }));
                    }}
                    className="w-full rounded-2xl border-2 border-slate-200 px-5 py-4 font-mono text-base font-bold focus:border-[#5a4fcf] focus:ring-0 outline-none text-slate-800"
                  />
                  {modalErrors.serial && <p className="mt-2 text-[11px] text-rose-600 font-bold">{modalErrors.serial}</p>}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              4. WYBÓR NOŚNIKA DOCELOWEGO
              ========================================================= */}
          {carriersOnPz && (
            <div className="pt-2">
              <span className="text-[10px] font-black text-slate-400 block uppercase tracking-widest mb-3 px-1">
                Wybierz nośnik docelowy
              </span>
              <div className="grid grid-cols-2 gap-3">
                
                {/* Opcja: Luzem */}
                <button
                  type="button"
                  onClick={() => handleCarrierChange(null)}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                    lineCarrierChoice === null 
                      ? 'border-amber-400 bg-amber-50/50 text-amber-900 shadow-sm' 
                      : 'border-slate-100 bg-white hover:border-slate-200 text-slate-700'
                  }`}
                >
                  <div className={`flex items-center justify-center w-8 h-8 rounded-xl transition-colors shrink-0 ${
                    lineCarrierChoice === null ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Box size={18} strokeWidth={2.5} />
                  </div>
                  <span className="font-bold text-[13px] tracking-tight truncate">Sztuki (Luzem)</span>
                </button>

                {/* Lista nośników z dokumentu */}
                {carriers.map((carrier) => {
                  const isActive = lineCarrierChoice === carrier.carrier_id;
                  const label = carrier.code || carrier.barcode || `#${carrier.carrier_id}`;
                  
                  return (
                    <button
                      key={carrier.carrier_id}
                      type="button"
                      onClick={() => handleCarrierChange(carrier.carrier_id)}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                        isActive 
                          ? 'border-amber-400 bg-amber-50/50 text-amber-900 shadow-sm' 
                          : 'border-slate-100 bg-white hover:border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-xl transition-colors shrink-0 ${
                        isActive ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Layers size={18} strokeWidth={2.5} />
                      </div>
                      <span className="font-bold text-[13px] tracking-tight truncate">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* =========================================================
            5. DOLNE PRZYCISKI AKCJI 
            ========================================================= */}
        <div className="flex items-center gap-4 mt-10">
          
          <button 
            type="button"
            disabled={busy}
            onClick={onMarkDamage}
            className="flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-6 py-6 rounded-2xl text-[13px] font-black uppercase tracking-widest transition-colors active:scale-95 shadow-sm disabled:opacity-50"
          >
            <AlertTriangle size={20} strokeWidth={3} />
            <span className="hidden sm:inline">Wada</span>
          </button>
          
          <button 
            type="button"
            onClick={onClose}
            className="flex-[1] bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-black py-6 rounded-2xl text-[13px] tracking-widest uppercase transition-colors active:scale-95 shadow-sm"
          >
            Zamknij
          </button>
          
          {!needsSerial && (
            <button 
              type="button"
              disabled={submitDisabled}
              onClick={() => void submitInput()}
              className="flex-[1.5] bg-[#5a4fcf] hover:bg-[#4a40b2] text-white font-black py-6 rounded-2xl text-[13px] tracking-widest uppercase transition-all active:scale-95 shadow-lg shadow-indigo-500/20 disabled:bg-[#c7d2fe] disabled:shadow-none"
            >
              Zatwierdź
            </button>
          )}
          
        </div>

      </div>
    </div>
  );
}