import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StockDocumentRead } from "../api/stockDocumentsApi";
import { patchWmsPutawayItem } from "../api/wmsPutawayApi";
import { scanWmsCarrierByBarcode } from "../api/wmsCarrierApi";
import { resolveWmsReceivingScan } from "../api/wmsReceivingApi";
import type { WarehouseLocationItem } from "../api/warehouseGraphApi";
import { useWmsScanner } from "../context/WmsScannerContext";
import {
  commitPutawayQtyInput,
  EMPTY_PUTAWAY_QTY,
  findLocationByScan,
  PUTAWAY_FLOAT_EPS,
  putawayRemaining,
  putawayTotalQty,
  scanIsCarton,
  type PutawayQtyState,
  type PutawaySelectedLocation,
} from "../pages/wms/putawayLineUtils";
import { looksLikeCarrierBarcode, normalizeCarrierScan } from "../utils/carrierBarcode";
import { playScanBeep } from "../utils/playScanBeep";
import { normalizeScanEan } from "../utils/wmsScanNormalize";
import { recordPutawayLineEvent } from "../utils/putawayLineAudit";

export type PutawayExecuteProduct = {
  lineId: number;
  productId: number;
  productName: string;
  displayEan: string;
  imageUrl: string | null;
};

type UsePutawayExecuteArgs = {
  tenantId: number;
  product: PutawayExecuteProduct;
  doc: StockDocumentRead | null;
  setDoc: (doc: StockDocumentRead) => void;
  locations: WarehouseLocationItem[];
  initialLocation: PutawaySelectedLocation | null;
  /** Wejście z „Rozlokuj cały nośnik” — od razu ustawiony nośnik (skan lokalizacji na tym ekranie). */
  initialCarrierPreset?: { id: number; code: string } | null;
  operatorDisplayName?: string;
  onSaved: () => void;
};

export function usePutawayExecute({
  tenantId,
  product,
  doc,
  setDoc,
  locations,
  initialLocation,
  initialCarrierPreset = null,
  operatorDisplayName = "",
  onSaved,
}: UsePutawayExecuteArgs) {
  const { showScannerToast, clearDevScannerInput, refocusScannerInput } = useWmsScanner();

  const [scannedCarrier, setScannedCarrier] = useState<{ id: number; code: string } | null>(null);
  const scannedCarrierRef = useRef<{ id: number; code: string } | null>(null);
  useEffect(() => {
    scannedCarrierRef.current = scannedCarrier;
  }, [scannedCarrier]);

  useEffect(() => {
    if (initialCarrierPreset?.id && initialCarrierPreset.id > 0) {
      setScannedCarrier({
        id: initialCarrierPreset.id,
        code: (initialCarrierPreset.code || "").trim() || `#${initialCarrierPreset.id}`,
      });
    } else {
      setScannedCarrier(null);
    }
  }, [product.lineId, initialCarrierPreset?.id, initialCarrierPreset?.code]);

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const [putawayQty, setPutawayQty] = useState<PutawayQtyState>(() => ({ ...EMPTY_PUTAWAY_QTY }));
  const putawayQtyRef = useRef<PutawayQtyState>({ ...EMPTY_PUTAWAY_QTY });

  const presetQtyAppliedRef = useRef(false);
  useEffect(() => {
    presetQtyAppliedRef.current = false;
  }, [product.lineId]);
  useEffect(() => {
    if (!initialCarrierPreset?.id || presetQtyAppliedRef.current) return;
    const d = doc;
    const m = product;
    if (!d || !m?.lineId) return;
    const line = d.items.find((i) => i.id === m.lineId);
    if (!line) return;
    const rem = putawayRemaining(line);
    if (!(rem > PUTAWAY_FLOAT_EPS)) return;
    presetQtyAppliedRef.current = true;
    const q = { ...EMPTY_PUTAWAY_QTY, inputMode: "unit" as const, unitsCount: Math.max(1, Math.floor(rem + 1e-9)) };
    setPutawayQty(q);
    putawayQtyRef.current = q;
  }, [doc, product.lineId, product, initialCarrierPreset?.id]);

  const [modalLocationId, setModalLocationId] = useState<number | null>(initialLocation?.locationId ?? null);
  const [modalLocationLabel, setModalLocationLabel] = useState<string | null>(initialLocation?.code ?? null);
  const [modalLocationType, setModalLocationType] = useState<string>(initialLocation?.locationType ?? "PICK");
  const [modalLocationStorageType, setModalLocationStorageType] = useState<unknown>(initialLocation?.storageType);

  const modalLocationIdRef = useRef<number | null>(modalLocationId);
  const modalLocationTypeRef = useRef(modalLocationType);
  const modalLocationStorageTypeRef = useRef(modalLocationStorageType);
  const docRef = useRef(doc);
  const productRef = useRef(product);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    putawayQtyRef.current = putawayQty;
  }, [putawayQty]);
  useEffect(() => {
    modalLocationIdRef.current = modalLocationId;
  }, [modalLocationId]);
  useEffect(() => {
    modalLocationTypeRef.current = modalLocationType;
  }, [modalLocationType]);
  useEffect(() => {
    modalLocationStorageTypeRef.current = modalLocationStorageType;
  }, [modalLocationStorageType]);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    productRef.current = product;
  }, [product]);

  useEffect(() => {
    if (!initialLocation) return;
    setModalLocationId(initialLocation.locationId);
    modalLocationIdRef.current = initialLocation.locationId;
    setModalLocationLabel(initialLocation.code);
    setModalLocationType(initialLocation.locationType);
    modalLocationTypeRef.current = initialLocation.locationType;
    setModalLocationStorageType(initialLocation.storageType);
    modalLocationStorageTypeRef.current = initialLocation.storageType;
    const q0 = { ...EMPTY_PUTAWAY_QTY };
    setPutawayQty(q0);
    putawayQtyRef.current = q0;
  }, [initialLocation]);

  const clearScannedCarrier = useCallback(() => {
    setScannedCarrier(null);
  }, []);

  const applySuggestedCarrierFromLine = useCallback(() => {
    const d = docRef.current;
    const m = productRef.current;
    if (!d || !m) return;
    const ln = d.items.find((i) => i.id === m.lineId);
    const cid = ln?.suggested_warehouse_carrier_id;
    if (cid == null || !Number.isFinite(Number(cid)) || Number(cid) < 1) {
      showScannerToast("Brak sugerowanego nośnika na tej linii");
      return;
    }
    const code =
      (ln?.suggested_warehouse_carrier_barcode || "").trim() ||
      (ln as { suggested_warehouse_carrier_code?: string })?.suggested_warehouse_carrier_code ||
      `#${cid}`;
    setScannedCarrier({ id: Number(cid), code });
    showScannerToast(`Nośnik: ${code}`);
    playScanBeep();
  }, [showScannerToast]);

  const applyLocationFromWarehouseItem = useCallback((locHit: WarehouseLocationItem) => {
    setModalLocationId(locHit.id);
    modalLocationIdRef.current = locHit.id;
    const code = (locHit.code ?? locHit.name ?? "").trim() || `Lokalizacja #${locHit.id}`;
    setModalLocationLabel(code);
    const lt = (locHit.type || "PICK").trim() || "PICK";
    setModalLocationType(lt);
    modalLocationTypeRef.current = lt;
    const stRaw = locHit.storage_type;
    const st = stRaw !== undefined && stRaw !== null && String(stRaw).trim() !== "" ? stRaw : undefined;
    setModalLocationStorageType(st);
    modalLocationStorageTypeRef.current = st;
    const q0 = { ...EMPTY_PUTAWAY_QTY };
    setPutawayQty(q0);
    putawayQtyRef.current = q0;
    playScanBeep();
  }, []);

  const applyPutawaySave = useCallback(async (): Promise<boolean> => {
    const m = productRef.current;
    const d = docRef.current;
    if (!m || !d || busy) return false;
    const locId = modalLocationIdRef.current;
    if (!locId) {
      showScannerToast("Najpierw zeskanuj lokalizację");
      return false;
    }
    const qtyState = commitPutawayQtyInput(putawayQtyRef.current);
    setPutawayQty(qtyState);
    putawayQtyRef.current = qtyState;
    const total = putawayTotalQty(qtyState);
    if (total <= 0) {
      showScannerToast("Podaj ilość większą od zera");
      return false;
    }
    const line = d.items.find((i) => i.id === m.lineId);
    if (!line) return false;
    const rem = putawayRemaining(line);
    if (total > rem + PUTAWAY_FLOAT_EPS) {
      showScannerToast("Nie możesz rozlokować więcej niż przyjęto");
      return false;
    }

    setBusy(true);
    try {
      const sc = scannedCarrierRef.current;
      const updated = await patchWmsPutawayItem(tenantId, m.lineId, {
        location_id: locId,
        quantity: total,
        ...(sc ? { warehouse_carrier_id: sc.id } : {}),
      });
      const savedLine = updated.document.items.find((i) => i.id === m.lineId);
      const locCode =
        (savedLine?.putaway_last_location_name || "").trim() || (modalLocationLabel || "").trim();
      const op = operatorDisplayName.trim();
      if (op && locCode && total > 0) {
        recordPutawayLineEvent({
          itemId: m.lineId,
          operatorName: op,
          locationCode: locCode,
          quantity: total,
        });
      }
      setDoc(updated.document);
      const whId = updated.document.warehouse_id;
      if (whId != null) {
        window.dispatchEvent(
          new CustomEvent("wms:inventory-updated", { detail: { tenantId, warehouseId: whId } }),
        );
      }
      playScanBeep();
      clearDevScannerInput();
      refocusScannerInput();
      onSaved();
      return true;
    } catch (ex: unknown) {
      let msg = "Zapis nie powiódł się.";
      if (axios.isAxiosError(ex) && ex.response?.data && typeof ex.response.data === "object") {
        const d0 = (ex.response.data as { detail?: unknown }).detail;
        if (typeof d0 === "string" && d0.trim()) msg = d0;
      }
      showScannerToast(msg);
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    tenantId,
    setDoc,
    showScannerToast,
    clearDevScannerInput,
    refocusScannerInput,
    onSaved,
    operatorDisplayName,
    modalLocationLabel,
  ]);

  const handleScan = useCallback(
    async (ean: string) => {
      if (!ean) return;
      if (busyRef.current) {
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }
      const m = productRef.current;
      const d = docRef.current;
      if (!m || !d) return;

      const scanNorm = normalizeScanEan(ean);
      if (looksLikeCarrierBarcode(scanNorm)) {
        try {
          const out = await scanWmsCarrierByBarcode(tenantId, normalizeCarrierScan(scanNorm));
          if (!out.found || !out.carrier) {
            showScannerToast("Nie znaleziono nośnika");
            clearDevScannerInput();
            refocusScannerInput();
            return;
          }
          setScannedCarrier({
            id: out.carrier.id,
            code: (out.carrier.code || out.carrier.barcode || "").trim() || `#${out.carrier.id}`,
          });
          showScannerToast(`Nośnik: ${out.carrier.code || out.carrier.barcode}`);
          playScanBeep();
          clearDevScannerInput();
          refocusScannerInput();
          return;
        } catch {
          showScannerToast("Błąd skanu nośnika");
          clearDevScannerInput();
          refocusScannerInput();
          return;
        }
      }

      const locHit = findLocationByScan(ean, locations);
      if (locHit) {
        const curLoc = modalLocationIdRef.current;
        if (curLoc === locHit.id) {
          const committed = commitPutawayQtyInput(putawayQtyRef.current);
          const total = putawayTotalQty(committed);
          if (total > 0) {
            setPutawayQty(committed);
            putawayQtyRef.current = committed;
            await applyPutawaySave();
          } else {
            showScannerToast("Ustaw ilość przed ponownym skanem lokalizacji (zapis)");
          }
        } else {
          applyLocationFromWarehouseItem(locHit);
        }
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      let res: Awaited<ReturnType<typeof resolveWmsReceivingScan>>;
      try {
        res = await resolveWmsReceivingScan(tenantId, ean);
      } catch {
        showScannerToast("Nie udało się rozpoznać kodu");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }
      if (!res.found || res.product_id == null || res.product_id !== m.productId) {
        showScannerToast("Nie rozpoznano produktu lub kod z innej karty");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }
      if (!modalLocationIdRef.current) {
        showScannerToast("Najpierw zeskanuj lokalizację");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      const dq = Math.max(1, Math.floor(Number(res.default_quantity) || 1));
      const carton = scanIsCarton(res);
      const line = d.items.find((i) => i.id === m.lineId);
      const rem = line ? putawayRemaining(line) : 0;
      const prev = putawayQtyRef.current;
      const next: PutawayQtyState = carton
        ? {
            ...prev,
            draft: null,
            inputMode: "carton",
            cartonsCount: prev.cartonsCount + 1,
            unitsPerCarton: Math.max(prev.unitsPerCarton, dq),
          }
        : {
            ...prev,
            draft: null,
            inputMode: "unit",
            unitsCount: prev.unitsCount + 1,
          };
      if (putawayTotalQty(next) > rem + PUTAWAY_FLOAT_EPS) {
        showScannerToast("Nie możesz rozlokować więcej niż przyjęto");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }
      setPutawayQty(next);
      putawayQtyRef.current = next;
      playScanBeep();
      clearDevScannerInput();
      refocusScannerInput();
    },
    [
      locations,
      tenantId,
      showScannerToast,
      clearDevScannerInput,
      refocusScannerInput,
      applyPutawaySave,
      applyLocationFromWarehouseItem,
    ],
  );

  const qtyDisabled = !modalLocationId || busy;
  const canSaveManual = useMemo(() => {
    if (!modalLocationId || busy) return false;
    return putawayTotalQty(commitPutawayQtyInput(putawayQty)) > 0;
  }, [modalLocationId, busy, putawayQty]);

  const line = doc?.items.find((i) => i.id === product.lineId);

  return {
    busy,
    putawayQty,
    setPutawayQty,
    modalLocationId,
    modalLocationLabel,
    modalLocationType,
    modalLocationStorageType,
    qtyDisabled,
    canSaveManual,
    line,
    applyPutawaySave,
    handleScan,
    showScannerToast,
    scannedCarrier,
    clearScannedCarrier,
    applySuggestedCarrierFromLine,
  };
}
