import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StockDocumentItemRead, StockDocumentRead } from "../../api/stockDocumentsApi";
import { scanWmsCarrierByBarcode } from "../../api/wmsCarrierApi";
import { resolveWmsMmLocation } from "../../api/wmsMmTransferApi";
import { patchWmsPutawayCarrierBulk } from "../../api/wmsPutawayApi";
import { resolveWmsReceivingScan } from "../../api/wmsReceivingApi";
import type { WarehouseLocationItem } from "../../api/warehouseGraphApi";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { looksLikeCarrierBarcode, normalizeCarrierScan } from "../../utils/carrierBarcode";
import { playScanBeep } from "../../utils/playScanBeep";
import { classifyWmsScanCode } from "../../utils/wmsScanClassify";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import {
  findLocationByScan,
  normalizeLocationScanCode,
  pickPutawayScanLine,
  putawayRemaining,
} from "./putawayLineUtils";
import { WMS_RECEIVING_UPDATED_EVENT } from "./wmsRoutes";
import { recordPutawayLineEvent } from "../../utils/putawayLineAudit";

type ActiveCarrier = { id: number; code: string };

type UseOpts = {
  tenantId: number;
  pzId: number;
  doc: StockDocumentRead | null;
  setDoc: (d: StockDocumentRead) => void;
  lines: StockDocumentItemRead[];
  locations: WarehouseLocationItem[];
  putawayEnabled: boolean;
  busy: boolean;
  onOpenLine: (it: StockDocumentItemRead, opts?: { detachFromCarrier?: boolean; carrierPreset?: ActiveCarrier }) => void;
  onLineFlash: (lineId: number) => void;
  touchLine: (lineId: number) => void;
  lastTouchedAtByLineId: Record<number, number>;
  operatorDisplayName?: string;
};

export function useWmsPutawayPzScan({
  tenantId,
  pzId,
  doc,
  setDoc,
  lines,
  locations,
  putawayEnabled,
  busy,
  onOpenLine,
  onLineFlash,
  touchLine,
  lastTouchedAtByLineId,
  operatorDisplayName = "",
}: UseOpts) {
  const { registerScanHandler, showScannerToast, clearDevScannerInput, refocusScannerInput, setScannerInputPlaceholder } =
    useWmsScanner();

  const [activeCarrier, setActiveCarrier] = useState<ActiveCarrier | null>(null);
  const activeCarrierRef = useRef<ActiveCarrier | null>(null);
  const [pendingLocation, setPendingLocation] = useState<WarehouseLocationItem | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const docRef = useRef(doc);
  const linesRef = useRef(lines);
  const locationsRef = useRef(locations);

  useEffect(() => {
    activeCarrierRef.current = activeCarrier;
  }, [activeCarrier]);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  const filteredLines = useMemo(() => {
    if (!activeCarrier) return lines;
    return lines.filter((it) => Number(it.warehouse_carrier_id) === activeCarrier.id);
  }, [lines, activeCarrier]);

  const carrierStats = useMemo(() => {
    const pool = activeCarrier ? filteredLines : lines;
    const skuIds = new Set<number>();
    let units = 0;
    for (const it of pool) {
      if (it.product_id != null) skuIds.add(it.product_id);
      units += putawayRemaining(it);
    }
    return { skuCount: skuIds.size, unitCount: Math.round(units) };
  }, [activeCarrier, filteredLines, lines]);

  const clearCarrier = useCallback(() => {
    setActiveCarrier(null);
    setPendingLocation(null);
  }, []);

  const resetSession = useCallback(() => {
    setActiveCarrier(null);
    setPendingLocation(null);
    showScannerToast("Sesja skanera zresetowana");
  }, [showScannerToast]);

  useEffect(() => {
    const hint = activeCarrier
      ? `Zeskanuj lokalizację docelową dla nośnika ${activeCarrier.code}`
      : "Skanuj nośnik PAL, lokalizację lub EAN produktu";
    setScannerInputPlaceholder(hint);
    return () => setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
  }, [activeCarrier, setScannerInputPlaceholder]);

  const resolveLocationScan = useCallback(
    async (raw: string): Promise<WarehouseLocationItem | null> => {
      const local = findLocationByScan(raw, locationsRef.current);
      if (local) return local;

      const d = docRef.current;
      const whId = d?.warehouse_id;
      if (!whId || whId < 1) return null;

      const code = normalizeLocationScanCode(raw) || String(raw ?? "").trim();
      if (!code) return null;

      try {
        const r = await resolveWmsMmLocation(tenantId, whId, code);
        if (!r.found || r.location_id == null) return null;
        const label = (r.location_name || "").trim() || `#${r.location_id}`;
        return {
          id: r.location_id,
          name: label,
          code: label,
          x: null,
          y: null,
        };
      } catch {
        return null;
      }
    },
    [tenantId],
  );

  const applyCarrierBulkPutaway = useCallback(
    async (loc: WarehouseLocationItem) => {
      const c = activeCarrierRef.current;
      const d = docRef.current;
      if (!c || !d || bulkBusy) return;
      const locLabel = (loc.code ?? loc.name ?? "").trim() || `#${loc.id}`;
      const op = operatorDisplayName.trim();
      const putawayBefore = new Map<number, number>();
      if (op) {
        for (const it of d.items) {
          if (Number(it.warehouse_carrier_id) === c.id) {
            putawayBefore.set(it.id, Number(it.quantity_putaway) || 0);
          }
        }
      }
      setBulkBusy(true);
      try {
        const out = await patchWmsPutawayCarrierBulk(tenantId, {
          document_id: pzId,
          warehouse_carrier_id: c.id,
          location_id: loc.id,
        });
        if (op) {
          for (const it of out.document.items) {
            const prev = putawayBefore.get(it.id);
            if (prev === undefined) continue;
            const delta = (Number(it.quantity_putaway) || 0) - prev;
            if (delta <= 0) continue;
            const code = (it.putaway_last_location_name || "").trim() || locLabel;
            recordPutawayLineEvent({
              itemId: it.id,
              operatorName: op,
              locationCode: code,
              quantity: delta,
            });
          }
        }
        setDoc(out.document);
        window.dispatchEvent(new CustomEvent(WMS_RECEIVING_UPDATED_EVENT, { detail: { tenantId, pzId } }));
        playScanBeep();
        showScannerToast(`Rozlokowano nośnik ${c.code} na lokalizację ${locLabel}`);
        setPendingLocation(null);
        setActiveCarrier(null);
      } catch (ex: unknown) {
        let msg = "Nie udało się rozlokować nośnika";
        if (axios.isAxiosError(ex) && ex.response?.data && typeof ex.response.data === "object") {
          const d0 = (ex.response.data as { detail?: unknown }).detail;
          if (typeof d0 === "string" && d0.trim()) msg = d0;
        }
        showScannerToast(msg);
      } finally {
        setBulkBusy(false);
      }
    },
    [tenantId, pzId, setDoc, showScannerToast, bulkBusy, operatorDisplayName],
  );

  const handleScan = useCallback(
    async (raw: string) => {
      if (!raw || busy || bulkBusy || !putawayEnabled) return;
      const d = docRef.current;
      if (!d) return;
      if (String(d.relocation_status ?? "").toUpperCase() === "DONE") return;

      const scanNorm = normalizeScanEan(raw);
      const scanKind = classifyWmsScanCode(raw);
      const active = activeCarrierRef.current;

      if (looksLikeCarrierBarcode(scanNorm)) {
        try {
          const out = await scanWmsCarrierByBarcode(tenantId, normalizeCarrierScan(scanNorm));
          if (!out.found || !out.carrier) {
            showScannerToast("Nie znaleziono nośnika");
            return;
          }
          const code = (out.carrier.code || out.carrier.barcode || "").trim() || `#${out.carrier.id}`;
          const onDoc = linesRef.current.some((it) => Number(it.warehouse_carrier_id) === out.carrier!.id);
          if (!onDoc) {
            showScannerToast("Ten nośnik nie ma produktów na tej PZ");
            return;
          }
          setActiveCarrier({ id: out.carrier.id, code });
          setPendingLocation(null);
          playScanBeep();
          showScannerToast(`Aktywny nośnik: ${code}`);
        } catch {
          showScannerToast("Błąd skanu nośnika");
        }
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      const tryLocationFirst =
        active != null
          ? scanKind !== "ean_gtin"
          : scanKind === "location_like" || raw.trim().toUpperCase().startsWith("LOC");
      if (tryLocationFirst) {
        const locHit = await resolveLocationScan(raw);
        if (locHit) {
          if (active) {
            await applyCarrierBulkPutaway(locHit);
          } else {
            setPendingLocation(locHit);
            showScannerToast(
              `Lokalizacja: ${(locHit.code ?? locHit.name ?? "").trim() || locHit.id} — wybierz produkt lub nośnik`,
            );
            playScanBeep();
          }
          clearDevScannerInput();
          refocusScannerInput();
          return;
        }
        if (active) {
          showScannerToast("Nie rozpoznano lokalizacji — zeskanuj kod półki (np. A11-A-1)");
          clearDevScannerInput();
          refocusScannerInput();
          return;
        }
        if (scanKind === "location_like" || raw.trim().toUpperCase().startsWith("LOC")) {
          showScannerToast("Nie rozpoznano lokalizacji");
          clearDevScannerInput();
          refocusScannerInput();
          return;
        }
      }

      let res: Awaited<ReturnType<typeof resolveWmsReceivingScan>>;
      try {
        res = await resolveWmsReceivingScan(tenantId, raw);
      } catch {
        showScannerToast("Nie udało się rozpoznać kodu");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }
      if (!res.found || res.product_id == null) {
        showScannerToast("Nie znaleziono produktu");
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      const carrierFilter = active?.id ?? null;
      const pool = carrierFilter
        ? linesRef.current.filter((it) => Number(it.warehouse_carrier_id) === carrierFilter)
        : linesRef.current;
      const pick = pickPutawayScanLine(pool, res.product_id, lastTouchedAtByLineId, carrierFilter);
      if (!pick) {
        showScannerToast(
          carrierFilter ? "Brak tego produktu na aktywnym nośniku" : "Brak linii do rozlokowania dla tego produktu",
        );
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }

      touchLine(pick.id);
      onLineFlash(pick.id);
      const onCarrier = Number(pick.warehouse_carrier_id) > 0;
      if (active && onCarrier && Number(pick.warehouse_carrier_id) === active.id) {
        onOpenLine(pick, { carrierPreset: active });
      } else if (onCarrier && !active) {
        onOpenLine(pick, { detachFromCarrier: true });
      } else {
        onOpenLine(pick, {});
      }
      playScanBeep();
      clearDevScannerInput();
      refocusScannerInput();
    },
    [
      busy,
      bulkBusy,
      putawayEnabled,
      tenantId,
      lastTouchedAtByLineId,
      resolveLocationScan,
      applyCarrierBulkPutaway,
      touchLine,
      onLineFlash,
      onOpenLine,
      showScannerToast,
      clearDevScannerInput,
      refocusScannerInput,
    ],
  );

  useEffect(() => {
    registerScanHandler((r) => void handleScan(r));
    return () => registerScanHandler(null);
  }, [registerScanHandler, handleScan]);

  return {
    activeCarrier,
    filteredLines,
    carrierStats,
    pendingLocation,
    clearCarrier,
    resetSession,
    bulkBusy,
  };
}
