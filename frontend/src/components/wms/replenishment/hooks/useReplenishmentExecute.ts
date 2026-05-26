import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveWmsReceivingScan, type ReceivingScanResolve } from "../../../../api/wmsReceivingApi";
import {
  fetchWmsMmLocationInventory,
  resolveWmsMmLocation,
  type WmsMmLocationInventoryRow,
} from "../../../../api/wmsMmTransferApi";
import type { WmsReplenishmentTaskRead } from "../../../../api/wmsReplenishmentApi";
import { patchReplenishmentTaskExecute } from "../../../../api/wmsReplenishmentApi";
import { playScanBeep } from "../../../../utils/playScanBeep";
import { normalizeScanEan } from "../../../../utils/wmsScanNormalize";

export type ReplenishExecuteStep = "SCAN_SOURCE" | "SCAN_PRODUCT" | "ENTER_QTY" | "SCAN_TARGET" | "READY";

/** Pozostały plan dla bieżącego źródła (segment wskazywany przez ``source_location_id``). */
export function replenishmentPendingSegmentRemaining(task: WmsReplenishmentTaskRead): number {
  const sid = task.source_location_id;
  const seg = task.sources?.find((s) => s.location_id === sid);
  if (seg) {
    const rem = Number(seg.quantity_planned) - (Number(seg.quantity_done) || 0);
    return Math.max(0, rem);
  }
  return Math.max(0, Number(task.quantity) || 0);
}

function scanIsCarton(res: ReceivingScanResolve): boolean {
  if (res.match_kind === "bulk_ean") return true;
  if (res.match_kind === "product_barcode") {
    const dq = Math.max(1, Math.floor(Number(res.default_quantity) || 1));
    return dq > 1;
  }
  return false;
}

function packageSizeFromScan(res: ReceivingScanResolve): number {
  return Math.max(1, Math.floor(Number(res.default_quantity) || 1));
}

function defaultUnitsPerCarton(row: WmsMmLocationInventoryRow | undefined): number {
  if (!row) return 1;
  const u = row.units_per_carton;
  if (u == null || !Number.isFinite(u) || u < 1) return 1;
  return Math.max(1, Math.floor(u));
}

export function parsedUIntReplenish(text: string): number {
  const t = text.trim();
  if (t === "") return 0;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function useReplenishmentExecute({
  tenantId,
  warehouseId,
  task,
  showScannerToast,
  appendScanToHistory,
  clearDevScannerInput,
  refocusScannerInput,
  onFinished,
}: {
  tenantId: number;
  warehouseId: number;
  task: WmsReplenishmentTaskRead;
  showScannerToast: (msg: string) => void;
  appendScanToHistory: (ean: string) => void;
  clearDevScannerInput: () => void;
  refocusScannerInput: () => void;
  /** ``true`` gdy MM domknął całe zadanie; ``false`` gdy kolejny segment BUFFER. */
  onFinished: (taskFullyCompleted: boolean) => void;
}) {
  const [step, setStep] = useState<ReplenishExecuteStep>("SCAN_SOURCE");
  const [productId, setProductId] = useState<number | null>(null);
  const [productName, setProductName] = useState("");
  const [unitsPerCarton, setUnitsPerCarton] = useState(1);
  const [cartons, setCartons] = useState(0);
  const [pieces, setPieces] = useState(0);
  const [qtyInputMode, setQtyInputMode] = useState<"unit" | "carton">("unit");
  const [qtyDraft, setQtyDraft] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inventoryByProductRef = useRef<Map<number, WmsMmLocationInventoryRow>>(new Map());
  const qtyInputFocusedRef = useRef(false);

  const taskProgressKey = useMemo(() => {
    const parts = (task.sources ?? []).map(
      (s) => `${s.location_id}:${Number(s.quantity_planned)}:${Number(s.quantity_done ?? 0)}`,
    );
    return `${task.id}:${task.source_location_id}:${parts.join(";")}`;
  }, [task]);

  useEffect(() => {
    setStep("SCAN_SOURCE");
    setProductId(null);
    setProductName("");
    setUnitsPerCarton(1);
    setCartons(0);
    setPieces(0);
    setQtyInputMode("unit");
    setQtyDraft(null);
    setErr(null);
    inventoryByProductRef.current = new Map();
  }, [taskProgressKey]);

  const segmentCap = useMemo(() => replenishmentPendingSegmentRemaining(task), [task]);
  const activeSourceId = task.source_location_id;

  const taskQtyCap = Math.max(0, segmentCap);
  const maxAtSource = productId != null ? inventoryByProductRef.current.get(productId)?.quantity_total ?? 0 : 0;

  const effectiveMaxUnits = useMemo(
    () => Math.max(0, Math.min(Math.floor(maxAtSource + 1e-9), Math.floor(taskQtyCap + 1e-9))),
    [maxAtSource, taskQtyCap],
  );

  const totalUnits = useMemo(() => cartons * unitsPerCarton + pieces, [cartons, pieces, unitsPerCarton]);

  const invRow = productId != null ? inventoryByProductRef.current.get(productId) : undefined;
  const productImageUrl = invRow?.product_image_url ?? task.product_image_url ?? null;
  const productEan = (invRow?.product_ean || task.product_ean || "").trim() || null;
  const displayProductName =
    (invRow?.product_name || productName || task.product_name || "").trim() ||
    (task.product_id != null ? `Produkt #${task.product_id}` : "");

  const loadSourceInventory = useCallback(async () => {
    const list = await fetchWmsMmLocationInventory(tenantId, warehouseId, activeSourceId);
    const m = new Map<number, WmsMmLocationInventoryRow>();
    for (const r of list) {
      m.set(r.product_id, r);
    }
    inventoryByProductRef.current = m;
  }, [tenantId, warehouseId, activeSourceId]);

  const normalizeCartonsPieces = useCallback(
    (nextC: number, nextP: number): { c: number; p: number } => {
      const upc = Math.max(1, unitsPerCarton);
      let c = Math.floor(Number(nextC));
      let p = Math.floor(Number(nextP));
      if (!Number.isFinite(c)) c = 0;
      if (!Number.isFinite(p)) p = 0;
      c = Math.max(0, c);
      while (p < 0 && c > 0) {
        c -= 1;
        p += upc;
      }
      p = Math.max(0, p);
      c += Math.floor(p / upc);
      p = p % upc;
      let tot = c * upc + p;
      const cap = effectiveMaxUnits;
      if (tot > cap) {
        tot = cap;
        c = Math.floor(tot / upc);
        p = tot - c * upc;
      }
      return { c, p };
    },
    [unitsPerCarton, effectiveMaxUnits],
  );

  const setQtyPair = useCallback(
    (nextC: number, nextP: number) => {
      const { c, p } = normalizeCartonsPieces(nextC, nextP);
      setCartons(c);
      setPieces(p);
    },
    [normalizeCartonsPieces],
  );

  const applyTotalDelta = useCallback(
    (deltaUnits: number) => {
      const upc = Math.max(1, unitsPerCarton);
      const cap = effectiveMaxUnits;
      const t0 = cartons * upc + pieces;
      const t1 = Math.max(0, Math.min(Math.floor(t0 + deltaUnits), cap));
      setCartons(Math.floor(t1 / upc));
      setPieces(t1 % upc);
    },
    [cartons, pieces, unitsPerCarton, effectiveMaxUnits],
  );

  const reapplyCanonicalTotal = useCallback(() => {
    const upc = Math.max(1, unitsPerCarton);
    const cap = effectiveMaxUnits;
    const t = Math.max(0, Math.min(cartons * upc + pieces, cap));
    setCartons(Math.floor(t / upc));
    setPieces(t % upc);
  }, [cartons, pieces, unitsPerCarton, effectiveMaxUnits]);

  const resetQtySession = useCallback(() => {
    setStep("SCAN_PRODUCT");
    setProductId(null);
    setProductName("");
    setUnitsPerCarton(1);
    setCartons(0);
    setPieces(0);
    setQtyInputMode("unit");
    setQtyDraft(null);
  }, []);

  const handleScan = useCallback(
    async (raw: string) => {
      const key = normalizeScanEan(raw);
      if (!key || busy) return;
      if (step === "ENTER_QTY" && qtyInputFocusedRef.current) return;

      setErr(null);

      if (step === "SCAN_SOURCE") {
        const loc = await resolveWmsMmLocation(tenantId, warehouseId, key);
        if (!loc.found || loc.location_id == null) {
          showScannerToast("Nie rozpoznano lokalizacji");
          return;
        }
        if (loc.location_id !== activeSourceId) {
          showScannerToast("Zeskanuj właściwą lokalizację źródłową");
          return;
        }
        playScanBeep();
        appendScanToHistory(key);
        await loadSourceInventory();
        resetQtySession();
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      if (step === "SCAN_PRODUCT") {
        const res = await resolveWmsReceivingScan(tenantId, key);
        if (!res.found || res.product_id == null) {
          showScannerToast("Nie rozpoznano produktu");
          return;
        }
        if (res.product_id !== task.product_id) {
          showScannerToast("Zeskanuj właściwy produkt");
          return;
        }
        const pid = res.product_id;
        const row = inventoryByProductRef.current.get(pid);
        if (!row || row.quantity_total <= 0) {
          showScannerToast("Brak tego produktu w lokalizacji źródłowej");
          return;
        }
        playScanBeep();
        appendScanToHistory(key);
        setProductId(pid);
        setProductName((res.product_name || "").trim() || `Produkt #${pid}`);
        setUnitsPerCarton(defaultUnitsPerCarton(row));
        setCartons(0);
        setPieces(0);
        setQtyInputMode(scanIsCarton(res) ? "carton" : "unit");
        setQtyDraft(null);
        setStep("ENTER_QTY");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      if (step === "ENTER_QTY") {
        if (productId == null) {
          showScannerToast("Brak produktu");
          return;
        }
        const res = await resolveWmsReceivingScan(tenantId, key);
        if (!res.found || res.product_id == null) {
          showScannerToast("Nie rozpoznano produktu");
          return;
        }
        if (res.product_id !== productId) {
          showScannerToast("Inny produkt — użyj tego samego kodu");
          return;
        }
        const isCarton = scanIsCarton(res);
        const add = isCarton ? packageSizeFromScan(res) : 1;
        const upc = Math.max(1, unitsPerCarton);
        let nextCartons = cartons;
        let nextPieces = pieces;
        if (isCarton) {
          nextCartons = cartons + 1;
          nextPieces = pieces + (add - upc);
          if (nextPieces < 0) {
            const newTotal = cartons * upc + pieces + add;
            nextCartons = Math.floor(newTotal / upc);
            nextPieces = newTotal % upc;
          }
        } else {
          nextPieces = pieces + 1;
        }
        const nextTotal = nextCartons * upc + nextPieces;
        if (nextTotal > effectiveMaxUnits + 1e-9) {
          showScannerToast(`Max.: ${effectiveMaxUnits} szt. (segment / stan źródła)`);
          return;
        }
        const clamped = normalizeCartonsPieces(nextCartons, nextPieces);
        playScanBeep();
        appendScanToHistory(key);
        setQtyInputMode(isCarton ? "carton" : "unit");
        setQtyDraft(null);
        setCartons(clamped.c);
        setPieces(clamped.p);
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      if (step === "SCAN_TARGET") {
        const loc = await resolveWmsMmLocation(tenantId, warehouseId, key);
        if (!loc.found || loc.location_id == null) {
          showScannerToast("Nie rozpoznano lokalizacji");
          return;
        }
        if (loc.location_id !== task.target_location_id) {
          showScannerToast("Zeskanuj właściwą lokalizację docelową");
          return;
        }
        playScanBeep();
        appendScanToHistory(key);
        setStep("READY");
        clearDevScannerInput();
        refocusScannerInput();
      }
    },
    [
      busy,
      step,
      tenantId,
      warehouseId,
      activeSourceId,
      task.target_location_id,
      task.product_id,
      loadSourceInventory,
      resetQtySession,
      showScannerToast,
      appendScanToHistory,
      clearDevScannerInput,
      refocusScannerInput,
      productId,
      cartons,
      pieces,
      unitsPerCarton,
      effectiveMaxUnits,
      normalizeCartonsPieces,
    ],
  );

  const beginTargetStep = useCallback(() => {
    if (totalUnits <= 0) {
      setErr("Ustaw ilość większą od zera.");
      return;
    }
    setErr(null);
    setStep("SCAN_TARGET");
    clearDevScannerInput();
    refocusScannerInput();
  }, [totalUnits, clearDevScannerInput, refocusScannerInput]);

  const executeSave = useCallback(async () => {
    if (totalUnits <= 0 || step !== "READY") {
      setErr("Sprawdź ilość i skan lokacji docelowej.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await patchReplenishmentTaskExecute(tenantId, task.id, {
        from_location_id: activeSourceId,
        quantity: totalUnits,
        packaging_type: "UNIT",
        packaging_quantity: null,
        wms_mode: null,
      });
      playScanBeep();
      window.dispatchEvent(
        new CustomEvent("wms:inventory-updated", { detail: { tenantId, warehouseId } }),
      );
      onFinished(Boolean(res.task_completed));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setErr(typeof msg === "string" ? msg : "Zapis nie powiódł się.");
    } finally {
      setBusy(false);
    }
  }, [tenantId, warehouseId, task.id, activeSourceId, totalUnits, step, onFinished]);

  const stepHint = useMemo(() => {
    if (step === "SCAN_SOURCE") return "Zeskanuj lokalizację źródłową.";
    if (step === "SCAN_PRODUCT") return "Zeskanuj produkt lub karton (ten sam kod co przy przyjęciu).";
    if (step === "ENTER_QTY") return "Zwiększaj ilość skanami — sztuka +1, karton +opakowanie.";
    if (step === "SCAN_TARGET") return "Zeskanuj lokalizację docelową (pick).";
    if (step === "READY") return "Potwierdź zapis przesunięcia.";
    return null;
  }, [step]);

  const upcEnterQty = step === "ENTER_QTY" ? Math.max(1, unitsPerCarton) : 1;
  const capTotalEnterQty = step === "ENTER_QTY" ? effectiveMaxUnits : 0;
  const transferQtyCanPlus =
    step === "ENTER_QTY" &&
    (qtyInputMode === "unit" ? totalUnits + 1 <= capTotalEnterQty : totalUnits + upcEnterQty <= capTotalEnterQty);
  const transferQtyCanMinus = step === "ENTER_QTY" && totalUnits > 0;

  const setQtyFocused = useCallback((v: boolean) => {
    qtyInputFocusedRef.current = v;
  }, []);

  return {
    step,
    err,
    busy,
    task,
    effectiveMaxUnits,
    totalUnits,
    handleScan,
    qtyDraft,
    setQtyDraft,
    qtyInputMode,
    cartons,
    pieces,
    setQtyPair,
    applyTotalDelta,
    reapplyCanonicalTotal,
    setQtyInputMode,
    upcEnterQty,
    transferQtyCanPlus,
    transferQtyCanMinus,
    stepHint,
    productImageUrl,
    productEan,
    displayProductName,
    beginTargetStep,
    executeSave,
    setQtyFocused,
  };
}
