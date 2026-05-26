import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import type { StockDocumentItemRead, StockDocumentRead } from "../../api/stockDocumentsApi";
import { scanWmsCarrierByBarcode } from "../../api/wmsCarrierApi";
import {
  ensureWmsReceivingPzProductLine,
  patchWmsReceivingPzItemQuantity,
  postReceivingPzCarriers,
  receiveWmsPzSerial,
  resolveWmsReceivingScan,
  type ReceivingScanResolve,
} from "../../api/wmsReceivingApi";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { looksLikeCarrierBarcode, normalizeCarrierBarcode } from "../../utils/carrierBarcode";
import { playScanBeep } from "../../utils/playScanBeep";
import { classifyWmsScanCode } from "../../utils/wmsScanClassify";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { scanIsCarton } from "./putawayLineUtils";
import {
  isGhostReceivingLine,
  pickReceivingLineForProduct,
  toReceivingCountValue,
} from "./wmsReceivingLineGroups";
import { WMS_RECEIVING_UPDATED_EVENT } from "./wmsRoutes";

function packageSizeFromScan(res: ReceivingScanResolve): number {
  if (res.match_kind === "bulk_ean") {
    return Math.max(1, Math.floor(Number(res.default_quantity) || 1));
  }
  if (res.match_kind === "product_barcode") {
    return Math.max(1, Math.floor(Number(res.default_quantity) || 1));
  }
  return 1;
}

function needsReceivingDecision(_line: StockDocumentItemRead, scan: ReceivingScanResolve): boolean {
  if (scan.track_serial) return true;
  if (scan.track_batch) return true;
  if (scan.track_expiry) return true;
  return false;
}

function wmsReceivingApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown } | undefined;
    if (typeof d?.detail === "string" && d.detail.trim()) return d.detail.trim();
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}

type ApplyReceiveOpts = {
  line: StockDocumentItemRead;
  addQty: number;
  cartonsDelta: number;
  looseDelta: number;
  warehouseCarrierId: number | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  serialNumber?: string | null;
};

export type ProductDataGateContext = {
  productId: number;
  productName?: string | null;
  productEan?: string | null;
  imageUrl?: string | null;
  missingLabels: string[];
  forceAllFields?: boolean;
};

type UseOpts = {
  tenantId: number;
  pzId: number;
  canEdit: boolean;
  detail: StockDocumentRead | null;
  setDetail: (d: StockDocumentRead) => void;
  setCountedByLineId: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setLastTouchedAtByLineId: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  lastTouchedAtByLineId: Record<number, number>;
  busy: boolean;
  setBusy: (v: boolean) => void;
  receivingModalOpen: boolean;
  receivingExecutionLineId: number | null;
  assignCarrierOpen: boolean;
  newProductModalOpen: boolean;
  productDataModalOpen: boolean;
  onExecutionCarrierPicked?: (carrierId: number) => void;
  onOpenLineModal: (line: StockDocumentItemRead, opts?: { initialQty?: number; freshLot?: boolean }) => void;
  onRequestNewProduct: (ean: string) => void;
  onProductDataGate?: (ctx: ProductDataGateContext) => Promise<boolean>;
};

export function useWmsReceivingCountScan({
  tenantId,
  pzId,
  canEdit,
  detail,
  setDetail,
  setCountedByLineId,
  setLastTouchedAtByLineId,
  lastTouchedAtByLineId,
  busy,
  setBusy,
  receivingModalOpen,
  receivingExecutionLineId,
  assignCarrierOpen,
  newProductModalOpen,
  productDataModalOpen,
  onExecutionCarrierPicked,
  onOpenLineModal,
  onRequestNewProduct,
  onProductDataGate,
}: UseOpts) {
  const {
    registerScanHandler,
    showScannerToast,
    appendScanToHistory,
    clearDevScannerInput,
    refocusScannerInput,
    setScannerInputPlaceholder,
  } = useWmsScanner();

  const [activeCarrierId, setActiveCarrierId] = useState<number | null>(null);
  const [activeCarrierCode, setActiveCarrierCode] = useState<string | null>(null);

  const detailRef = useRef(detail);
  const busyRef = useRef(busy);
  const lastTouchedRef = useRef<Record<number, number>>({});
  const activeCarrierIdRef = useRef<number | null>(null);
  const activeCarrierCodeRef = useRef<string | null>(null);
  const modalOpenRef = useRef(false);
  const assignOpenRef = useRef(false);
  const executionOpenRef = useRef(false);
  const executionLineIdRef = useRef<number | null>(null);
  const serialAwaitingRef = useRef<ReceivingScanResolve | null>(null);

  detailRef.current = detail;
  busyRef.current = busy;
  activeCarrierIdRef.current = activeCarrierId;
  activeCarrierCodeRef.current = activeCarrierCode;
  modalOpenRef.current = newProductModalOpen || productDataModalOpen;
  assignOpenRef.current = assignCarrierOpen;
  executionOpenRef.current = receivingModalOpen;
  executionLineIdRef.current = receivingExecutionLineId;
  useEffect(() => {
    const ph = serialAwaitingRef.current
      ? "Zeskanuj numer seryjny"
      : "EAN / serial / nośnik (↑↓ historia)";
    setScannerInputPlaceholder(ph);
    return () => setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
  }, [setScannerInputPlaceholder, detail?.id]);

  useEffect(() => {
    lastTouchedRef.current = lastTouchedAtByLineId;
  }, [lastTouchedAtByLineId]);

  const syncCountsFromDoc = useCallback((doc: StockDocumentRead) => {
    const next: Record<number, number> = {};
    for (const it of doc.items ?? []) next[it.id] = toReceivingCountValue(it.received_quantity);
    setCountedByLineId(next);
  }, [setCountedByLineId]);

  const receiveSerialUnit = useCallback(
    async (res: ReceivingScanResolve, serialRaw: string) => {
      if (!res.product_id || !res.track_serial) return false;
      const sn = serialRaw.trim();
      if (!sn) return false;
      setBusy(true);
      try {
        const wcId = (detailRef.current?.receiving_carriers?.length ?? 0) > 0 ? activeCarrierIdRef.current : null;
        const updated = await receiveWmsPzSerial(tenantId, pzId, {
          product_id: res.product_id,
          serial_number: sn,
          batch_number: res.parsed_batch || undefined,
          expiry_date: res.parsed_expiry || undefined,
          warehouse_carrier_id: wcId ?? undefined,
          raw_scan: sn,
        });
        setDetail(updated);
        syncCountsFromDoc(updated);
        playScanBeep();
        showScannerToast(`+1 · serial ${sn}`);
        serialAwaitingRef.current = null;
        setScannerInputPlaceholder("EAN / serial / nośnik (↑↓ historia)");
        return true;
      } catch (e) {
        showScannerToast(wmsReceivingApiErrorMessage(e, "Nie udało się przyjąć serialu"));
        return false;
      } finally {
        setBusy(false);
        clearDevScannerInput();
        refocusScannerInput();
      }
    },
    [
      tenantId,
      pzId,
      setDetail,
      syncCountsFromDoc,
      setBusy,
      showScannerToast,
      clearDevScannerInput,
      refocusScannerInput,
      setScannerInputPlaceholder,
    ],
  );

  const applyReceive = useCallback(
    async (opts: ApplyReceiveOpts) => {
      const d = detailRef.current;
      if (!d || busyRef.current) return false;
      const { line, addQty, cartonsDelta, looseDelta, warehouseCarrierId } = opts;
      if (addQty <= 0) return false;
      const trackSerial = Boolean(line.track_serial);
      const sn = (opts.serialNumber ?? "").trim();
      if (trackSerial) {
        if (!sn) {
          showScannerToast("Numer seryjny wymagany");
          return false;
        }
        if (!line.product_id) return false;
        if (addQty > 1 + 1e-9) {
          showScannerToast("1 numer seryjny = 1 sztuka");
          return false;
        }
      }
      setBusy(true);
      try {
        const bn =
          opts.batchNumber !== undefined
            ? (opts.batchNumber || "").trim() || null
            : (line.batch_number ?? "").toString().trim() || null;
        const exp =
          opts.expiryDate !== undefined
            ? opts.expiryDate
            : line.expiry_date != null && String(line.expiry_date).trim() !== ""
              ? String(line.expiry_date).slice(0, 10)
              : null;

        const updated = trackSerial
          ? await receiveWmsPzSerial(tenantId, pzId, {
              product_id: line.product_id!,
              serial_number: sn,
              batch_number: bn || undefined,
              expiry_date: exp || undefined,
              warehouse_carrier_id: warehouseCarrierId ?? undefined,
            })
          : await patchWmsReceivingPzItemQuantity(tenantId, pzId, line.id, {
              quantity_received: addQty,
              batch_number: bn,
              expiry_date: exp,
              cartons_count: cartonsDelta,
              loose_units_count: looseDelta,
              warehouse_carrier_id: warehouseCarrierId,
            });
        setDetail(updated);
        syncCountsFromDoc(updated);
        setLastTouchedAtByLineId((p) => {
          const n = { ...p, [line.id]: Date.now() };
          lastTouchedRef.current = n;
          return n;
        });
        window.dispatchEvent(new CustomEvent(WMS_RECEIVING_UPDATED_EVENT, { detail: { tenantId, pzId } }));
        playScanBeep();
        return true;
      } catch (e) {
        showScannerToast(wmsReceivingApiErrorMessage(e, "Błąd zapisu przyjęcia"));
        return false;
      } finally {
        setBusy(false);
        clearDevScannerInput();
        refocusScannerInput();
      }
    },
    [
      tenantId,
      pzId,
      setDetail,
      syncCountsFromDoc,
      setLastTouchedAtByLineId,
      setBusy,
      showScannerToast,
      clearDevScannerInput,
      refocusScannerInput,
    ],
  );

  const resolveCarrierForActive = useCallback(
    async (raw: string): Promise<{ id: number; code: string } | null> => {
      const bc = normalizeCarrierBarcode(raw);
      if (!bc) return null;
      const sc = await scanWmsCarrierByBarcode(tenantId, bc);
      if (!sc.found || !sc.carrier) {
        showScannerToast("Nie znaleziono nośnika");
        return null;
      }
      const c = sc.carrier;
      const code = (c.code || c.barcode || "").trim() || `#${c.id}`;
      const d = detailRef.current;
      const linked = (d?.receiving_carriers ?? []).some((x) => x.carrier_id === c.id);
      if (!linked && d) {
        try {
          const updated = await postReceivingPzCarriers(tenantId, pzId, { warehouse_carrier_id: c.id });
          setDetail(updated);
        } catch {
          showScannerToast("Nie udało się przypisać nośnika do PZ");
          return null;
        }
      }
      return { id: c.id, code };
    },
    [tenantId, pzId, setDetail, showScannerToast],
  );

  const setActiveCarrier = useCallback(
    (id: number | null, code: string | null) => {
      setActiveCarrierId(id);
      setActiveCarrierCode(code);
      activeCarrierIdRef.current = id;
    },
    [],
  );

  const clearActiveCarrier = useCallback(() => {
    setActiveCarrier(null, null);
    showScannerToast("Przyjmujesz luzem");
  }, [setActiveCarrier, showScannerToast]);

  const receiveLoose = useCallback(() => {
    clearActiveCarrier();
  }, [clearActiveCarrier]);

  const handleGlobalScan = useCallback(
    async (raw: string) => {
      const key = normalizeScanEan(raw);
      if (!key) return;
      const d = detailRef.current;
      if (!d || !canEdit || busyRef.current || modalOpenRef.current || assignOpenRef.current) return;

      const kind = classifyWmsScanCode(key);
      const carrierLike = kind === "carrier_barcode" || looksLikeCarrierBarcode(key);

      if (carrierLike) {
        const hit = await resolveCarrierForActive(key);
        if (!hit) {
          clearDevScannerInput();
          refocusScannerInput();
          return;
        }
        setActiveCarrier(hit.id, hit.code);
        onExecutionCarrierPicked?.(hit.id);
        appendScanToHistory(key);
        showScannerToast(`Aktywny nośnik: ${hit.code}`);
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      if (kind === "location_like" || key.startsWith("LOC")) {
        showScannerToast("Lokalizację ustawisz w rozlokowaniu (putaway), nie podczas liczenia PZ");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      if (kind === "cart_like") {
        showScannerToast("Na przyjęciu PZ skanuj EAN produktu lub kod nośnika (PAL-, BOX-…).");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      let res: ReceivingScanResolve;
      try {
        res = await resolveWmsReceivingScan(tenantId, key);
      } catch {
        showScannerToast("Nie udało się rozpoznać kodu");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      if (!res.found || res.product_id == null) {
        appendScanToHistory(key);
        onRequestNewProduct(key);
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      if (serialAwaitingRef.current?.product_id != null) {
        const pending = serialAwaitingRef.current;
        if (res.product_id === pending.product_id && res.match_kind !== "serial" && !res.parsed_serial) {
          showScannerToast("Zeskanuj numer seryjny (nie EAN produktu)");
          clearDevScannerInput();
          refocusScannerInput();
          return;
        }
        const sn =
          res.match_kind === "serial" || res.parsed_serial
            ? (res.parsed_serial || key).trim()
            : key;
        if (res.product_id != null && res.product_id !== pending.product_id) {
          showScannerToast("Inny produkt — dokończ serial poprzedniego");
          clearDevScannerInput();
          refocusScannerInput();
          return;
        }
        appendScanToHistory(key);
        await receiveSerialUnit(pending, sn);
        return;
      }

      if (res.track_serial) {
        const sn = (res.parsed_serial || (res.match_kind === "serial" ? key : "")).trim();
        if (sn) {
          appendScanToHistory(key);
          await receiveSerialUnit(res, sn);
          return;
        }
        serialAwaitingRef.current = res;
        setScannerInputPlaceholder("Zeskanuj numer seryjny");
        appendScanToHistory(key);
        showScannerToast(`Produkt: ${(res.product_name || "").trim() || res.product_id} — zeskanuj serial`);
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      let workingDetail = d;
      const wcForPick = (d.receiving_carriers ?? []).length > 0 ? activeCarrierIdRef.current : null;
      let line = pickReceivingLineForProduct(
        workingDetail.items ?? [],
        res.product_id,
        lastTouchedRef.current,
        { warehouseCarrierId: wcForPick, preferGhost: true },
      );
      let addedExtraLine = false;
      let autoReceivedOnEnsure = false;
      if (!line) {
        setBusy(true);
        try {
          const ensured = await ensureWmsReceivingPzProductLine(tenantId, pzId, res.product_id);
          workingDetail = ensured.document;
          autoReceivedOnEnsure = ensured.auto_received;
          setDetail(workingDetail);
          syncCountsFromDoc(workingDetail);
          line =
            (workingDetail.items ?? []).find((it) => it.id === ensured.item_id) ??
            pickReceivingLineForProduct(
              workingDetail.items ?? [],
              res.product_id,
              lastTouchedRef.current,
              { warehouseCarrierId: wcForPick, preferGhost: true },
            );
          addedExtraLine = line != null;
        } catch {
          showScannerToast("Nie udało się dodać produktu do PZ");
          clearDevScannerInput();
          refocusScannerInput();
          return;
        } finally {
          setBusy(false);
        }
      }
      if (!line) {
        showScannerToast("Nie udało się dodać produktu do PZ");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      const isCarton = scanIsCarton(res);
      const addQty = isCarton ? packageSizeFromScan(res) : 1;
      const cartonsDelta = isCarton ? 1 : 0;
      const looseDelta = isCarton ? 0 : addQty;

      const execId = executionLineIdRef.current;
      const execLine =
        execId != null ? (d.items ?? []).find((it) => it.id === execId) ?? null : null;
      const inExecution = executionOpenRef.current && execLine != null;

      if (res.requires_data_completion && onProductDataGate && res.product_id != null) {
        const proceed = await onProductDataGate({
          productId: res.product_id,
          productName: res.product_name,
          productEan: res.product_ean,
          imageUrl: res.image_url,
          missingLabels: res.missing_data_labels ?? [],
        });
        if (!proceed) {
          clearDevScannerInput();
          refocusScannerInput();
          return;
        }
      }

      if (needsReceivingDecision(line, res)) {
        appendScanToHistory(key);
        onOpenLineModal(line, { initialQty: addQty, freshLot: true });
        showScannerToast("Uzupełnij partię / datę ważności / serial");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      if (inExecution && execLine && res.product_id === execLine.product_id) {
        const wcId = (d.receiving_carriers ?? []).length > 0 ? activeCarrierIdRef.current : null;
        appendScanToHistory(key);
        const ok = await applyReceive({
          line: (detailRef.current?.items ?? []).find((it) => it.id === execLine.id) ?? execLine,
          addQty,
          cartonsDelta,
          looseDelta,
          warehouseCarrierId: wcId,
        });
        if (ok) showScannerToast(`+${addQty} szt. przyjęto`);
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      appendScanToHistory(key);
      onOpenLineModal(line, {
        initialQty: addQty,
        freshLot: addedExtraLine || needsReceivingDecision(line, res),
      });
      if (addedExtraLine && autoReceivedOnEnsure) {
        showScannerToast("Produkt dodany do PZ — potwierdź przyjęcie");
      } else if (inExecution && execLine && res.product_id !== execLine.product_id) {
        showScannerToast("Przełączono produkt");
      } else if (!inExecution) {
        showScannerToast("Potwierdź przyjęcie na ekranie produktu");
      }
      clearDevScannerInput();
      refocusScannerInput();
    },
    [
      canEdit,
      tenantId,
      pzId,
      resolveCarrierForActive,
      setActiveCarrier,
      onExecutionCarrierPicked,
      appendScanToHistory,
      showScannerToast,
      clearDevScannerInput,
      refocusScannerInput,
      setDetail,
      setBusy,
      syncCountsFromDoc,
      applyReceive,
      onOpenLineModal,
      onRequestNewProduct,
      onProductDataGate,
      receiveSerialUnit,
    ],
  );

  useEffect(() => {
    if (!canEdit || !detail) {
      registerScanHandler(null);
      return;
    }
    registerScanHandler((r) => void handleGlobalScan(r));
    return () => registerScanHandler(null);
  }, [canEdit, detail, registerScanHandler, handleGlobalScan]);

  return {
    activeCarrierId,
    activeCarrierCode,
    setActiveCarrier,
    clearActiveCarrier,
    receiveLoose,
    applyReceive,
    syncCountsFromDoc,
  };
}
