import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, ListOrdered, MapPin, Minus, Plus, ScanLine } from "lucide-react";
import api from "../../api/axios";
import { patchReplenishmentTaskExecute } from "../../api/wmsReplenishmentApi";
import type { WmsReplenishmentTaskRead } from "../../api/wmsReplenishmentApi";
import { resolveWmsReceivingScan, type ReceivingScanResolve } from "../../api/wmsReceivingApi";
import {
  appendMmDraftLine,
  fetchWmsMmLocationInventory,
  postWmsMmTransfer,
  resolveWmsMmLocation,
  type WmsMmLocationInventoryRow,
} from "../../api/wmsMmTransferApi";
import {
  MmSourceLocationAutocomplete,
} from "../../components/wms/mm/MmSourceLocationAutocomplete";
import { MmReplenishmentTab } from "../../components/wms/mm/replenishment/MmReplenishmentTab";
import { getWarehouseLocations, type WarehouseLocationItem } from "../../api/warehouseGraphApi";
import { WmsManualProductModal } from "../../components/wms/WmsManualProductModal";
import { LocationBadge } from "../../components/warehouse/LocationBadge";
import { replenishmentPendingSegmentRemaining } from "../../components/wms/replenishment/hooks/useReplenishmentExecute";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { playScanBeep } from "../../utils/playScanBeep";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { WMS_MM_UPDATED_EVENT, WMS_ROUTES } from "./wmsRoutes";

type Tenant = { id: number; name: string };

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";

type MmStep = "SCAN_SOURCE" | "SCAN_PRODUCT" | "ENTER_QTY" | "SCAN_TARGET" | "DECISION";

type MmQtyInputMode = "unit" | "carton";

type ReplenishListMode = "location" | "priority";

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

function parsedUInt(text: string): number {
  const t = text.trim();
  if (t === "") return 0;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function placeInputCaretAtEnd(el: HTMLInputElement | null) {
  if (!el) return;
  window.requestAnimationFrame(() => {
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  });
}

type LocRef = { id: number; name: string; type?: string };

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

export default function WmsMmTransferPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const {
    registerScanHandler,
    showScannerToast,
    clearDevScannerInput,
    refocusScannerInput,
    setActiveDocument,
    appendScanToHistory,
    setScannerInputDisabled,
  } = useWmsScanner();

  const [tenantId, setTenantId] = useState(1);
  const [step, setStep] = useState<MmStep>("SCAN_SOURCE");
  const [source, setSource] = useState<LocRef | null>(null);
  const inventoryByProductRef = useRef<Map<number, WmsMmLocationInventoryRow>>(new Map());
  const [sourceInventoryRows, setSourceInventoryRows] = useState<WmsMmLocationInventoryRow[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  const [productName, setProductName] = useState("");
  const [unitsPerCarton, setUnitsPerCarton] = useState(1);
  const [target, setTarget] = useState<LocRef | null>(null);
  const [cartons, setCartons] = useState(0);
  const [pieces, setPieces] = useState(0);
  const [qtyInputMode, setQtyInputMode] = useState<MmQtyInputMode>("unit");
  const [qtyDraft, setQtyDraft] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [draftDecisionDocId, setDraftDecisionDocId] = useState<number | null>(null);
  const scanBusy = useRef(false);
  const qtyInputFocusedRef = useRef(false);
  const mmQtyInputRef = useRef<HTMLInputElement>(null);

  const [replenishListMode, setReplenishListMode] = useState<ReplenishListMode | null>(null);
  const [activeReplenTask, setActiveReplenTask] = useState<WmsReplenishmentTaskRead | null>(null);
  const [replenishRefreshKey, setReplenishRefreshKey] = useState(0);
  const [manualProductOpen, setManualProductOpen] = useState(false);
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocationItem[]>([]);
  
  const [scanInputValue, setScanInputValue] = useState("");
  const [showInventoryList, setShowInventoryList] = useState(false);

  const maxAtSource = productId != null ? inventoryByProductRef.current.get(productId)?.quantity_total ?? 0 : 0;

  const replenSegmentCap = useMemo(
    () => (activeReplenTask ? replenishmentPendingSegmentRemaining(activeReplenTask) : Number.POSITIVE_INFINITY),
    [activeReplenTask],
  );

  const qtyCapAtSource = useMemo(
    () => Math.max(0, Math.floor(Math.min(maxAtSource + 1e-9, replenSegmentCap + 1e-9))),
    [maxAtSource, replenSegmentCap],
  );

  const totalUnits = useMemo(
    () => cartons * unitsPerCarton + pieces,
    [cartons, pieces, unitsPerCarton],
  );

  const invRowForProduct =
    productId != null ? inventoryByProductRef.current.get(productId) : undefined;
  const productImageUrl = invRowForProduct?.product_image_url ?? null;
  const productEan = (invRowForProduct?.product_ean || "").trim() || null;
  const displayProductName =
    (invRowForProduct?.product_name || productName || "").trim() ||
    (productId != null ? `Produkt #${productId}` : "");

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
      .catch(() => {});
  }, []);

  const whId = warehouse?.id;

  const resetSession = useCallback((opts?: { keepReplenTask?: boolean }) => {
    setStep("SCAN_SOURCE");
    setSource(null);
    inventoryByProductRef.current = new Map();
    setSourceInventoryRows([]);
    setProductId(null);
    setProductName("");
    setUnitsPerCarton(1);
    setTarget(null);
    setCartons(0);
    setPieces(0);
    setQtyInputMode("unit");
    setQtyDraft(null);
    setErr(null);
    setDecisionMessage(null);
    setDraftDecisionDocId(null);
    setScanInputValue("");
    setShowInventoryList(false);
    if (!opts?.keepReplenTask) {
      setActiveReplenTask(null);
    }
  }, []);

  const continueMoreTransfers = useCallback(() => {
    setDecisionMessage(null);
    setProductId(null);
    setProductName("");
    setUnitsPerCarton(1);
    setTarget(null);
    setCartons(0);
    setPieces(0);
    setQtyInputMode("unit");
    setQtyDraft(null);
    setErr(null);
    setActiveReplenTask(null);
    setScanInputValue("");
    setShowInventoryList(false);
    setStep("SCAN_PRODUCT");
  }, []);

  const beginReplenishmentTask = useCallback(
    (task: WmsReplenishmentTaskRead) => {
      setReplenishListMode(null);
      resetSession();
      setActiveReplenTask(task);
    },
    [resetSession],
  );

  const loadSourceInventory = useCallback(
    async (locId: number) => {
      if (!whId) return;
      const list = await fetchWmsMmLocationInventory(tenantId, whId, locId);
      const m = new Map<number, WmsMmLocationInventoryRow>();
      for (const r of list) {
        m.set(r.product_id, r);
      }
      inventoryByProductRef.current = m;
      setSourceInventoryRows(list);
    },
    [tenantId, whId],
  );

  useEffect(() => {
    if (!whId) {
      setWarehouseLocations([]);
      return;
    }
    let cancelled = false;
    void getWarehouseLocations(whId)
      .then((list) => {
        if (!cancelled) setWarehouseLocations(list);
      })
      .catch(() => {
        if (!cancelled) setWarehouseLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [whId]);

  const applySourceLocation = useCallback(
    async (locationId: number, locationName: string, locationType?: string, scanKey?: string) => {
      if (!whId) return;
      if (activeReplenTask != null && locationId !== activeReplenTask.source_location_id) {
        showScannerToast("Zeskanuj lokalizację źródłową z zadania (rezerwa)");
        return;
      }
      playScanBeep();
      if (scanKey) appendScanToHistory(scanKey);
      setSource({ id: locationId, name: locationName, type: locationType });
      setTarget(null);
      setProductId(null);
      setProductName("");
      setCartons(0);
      setPieces(0);
      setQtyInputMode("unit");
      setQtyDraft(null);
      setScanInputValue("");
      setShowInventoryList(false);
      setStep("SCAN_PRODUCT");
      await loadSourceInventory(locationId);
      clearDevScannerInput();
      refocusScannerInput();
    },
    [
      whId,
      activeReplenTask,
      showScannerToast,
      appendScanToHistory,
      loadSourceInventory,
      clearDevScannerInput,
      refocusScannerInput,
    ],
  );

  const applyProductFromInventory = useCallback(
    async (row: WmsMmLocationInventoryRow) => {
      if (!whId || !source) return;
      if (activeReplenTask != null && row.product_id !== activeReplenTask.product_id) {
        showScannerToast("Wybierz produkt z zadania uzupełnienia");
        return;
      }
      if (row.quantity_total <= 0) {
        showScannerToast("Brak tego produktu w lokalizacji źródłowej");
        return;
      }
      playScanBeep();
      setProductId(row.product_id);
      setProductName((row.product_name || "").trim() || `Produkt #${row.product_id}`);
      setUnitsPerCarton(defaultUnitsPerCarton(row));
      setTarget(null);
      setCartons(0);
      setPieces(0);
      setQtyInputMode("unit");
      setQtyDraft(null);
      setScanInputValue("");
      setShowInventoryList(false);
      setStep("ENTER_QTY");
    },
    [whId, source, activeReplenTask, showScannerToast],
  );

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
      const cap = qtyCapAtSource;
      if (tot > cap) {
        tot = cap;
        c = Math.floor(tot / upc);
        p = tot - c * upc;
      }
      return { c, p };
    },
    [unitsPerCarton, qtyCapAtSource],
  );

  const setQtyPair = useCallback(
    (nextC: number, nextP: number) => {
      const { c, p } = normalizeCartonsPieces(nextC, nextP);
      setQtyDraft(null);
      setCartons(c);
      setPieces(p);
    },
    [normalizeCartonsPieces],
  );

  const applyTotalDelta = useCallback(
    (deltaUnits: number) => {
      setQtyDraft(null);
      const upc = Math.max(1, unitsPerCarton);
      const cap = qtyCapAtSource;
      const t0 = cartons * upc + pieces;
      const t1 = Math.max(0, Math.min(Math.floor(t0 + deltaUnits), cap));
      setCartons(Math.floor(t1 / upc));
      setPieces(t1 % upc);
    },
    [cartons, pieces, unitsPerCarton, qtyCapAtSource],
  );

  const reapplyCanonicalTotal = useCallback(() => {
    setQtyDraft(null);
    const upc = Math.max(1, unitsPerCarton);
    const cap = qtyCapAtSource;
    const t = Math.max(0, Math.min(cartons * upc + pieces, cap));
    setCartons(Math.floor(t / upc));
    setPieces(t % upc);
  }, [cartons, pieces, unitsPerCarton, qtyCapAtSource]);

  const handleScan = useCallback(
    async (raw: string) => {
      if (!whId) return;
      const key = normalizeScanEan(raw);
      if (!key) return;

      if (replenishListMode != null) return;
      if (step === "DECISION" || busy) return;

      setErr(null);

      if (step === "SCAN_SOURCE") {
        const loc = await resolveWmsMmLocation(tenantId, whId, key);
        if (!loc.found || loc.location_id == null) {
          showScannerToast("Nie rozpoznano lokalizacji");
          return;
        }
        const name = (loc.location_name || "").trim() || `#${loc.location_id}`;
        await applySourceLocation(loc.location_id, name, (loc as any).location_type || "PICK", key);
        return;
      }

      if (!source) {
        showScannerToast("Brak źródła");
        return;
      }

      if (step === "SCAN_PRODUCT") {
        const res = await resolveWmsReceivingScan(tenantId, key);
        if (!res.found || res.product_id == null) {
          showScannerToast("Nie rozpoznano produktu");
          return;
        }
        const pid = res.product_id;
        if (activeReplenTask != null && pid !== activeReplenTask.product_id) {
          showScannerToast("Zeskanuj właściwy produkt z zadania uzupełnienia");
          return;
        }
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
        setTarget(null);
        setCartons(0);
        setPieces(0);
        setQtyInputMode(scanIsCarton(res) ? "carton" : "unit");
        setQtyDraft(null);
        setScanInputValue("");
        setShowInventoryList(false);
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
        if (nextTotal > qtyCapAtSource + 1e-9) {
          showScannerToast(`Max.: ${fmtQty(qtyCapAtSource)} szt.`);
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
        if (activeReplenTask == null || source == null || productId == null) {
          showScannerToast("Brak danych zadania");
          return;
        }
        const loc = await resolveWmsMmLocation(tenantId, whId, key);
        if (!loc.found || loc.location_id == null) {
          showScannerToast("Nie rozpoznano lokalizacji");
          return;
        }
        if (loc.location_id !== activeReplenTask.target_location_id) {
          showScannerToast("Zeskanuj lokalizację docelową PICK z zadania");
          return;
        }
        setBusy(true);
        setErr(null);
        try {
          const res = await patchReplenishmentTaskExecute(tenantId, activeReplenTask.id, {
            from_location_id: source.id,
            quantity: totalUnits,
            packaging_type: "UNIT",
            packaging_quantity: null,
            wms_mode: null,
          });
          playScanBeep();
          window.dispatchEvent(
            new CustomEvent("wms:inventory-updated", { detail: { tenantId, warehouseId: whId } }),
          );
          setReplenishRefreshKey((k) => k + 1);
          setDecisionMessage(
            res.task_completed
              ? `Zapisano uzupełnienie (MM #${res.document.id}). Zadanie domknięte.`
              : `Zapisano segment uzupełnienia (MM #${res.document.id}).`,
          );
          resetSession();
          setStep("DECISION");
        } catch (e: unknown) {
          const msg =
            e && typeof e === "object" && "response" in e
              ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
              : null;
          showScannerToast(typeof msg === "string" ? msg : "Zapis nie powiódł się.");
        } finally {
          setBusy(false);
        }
        appendScanToHistory(key);
        clearDevScannerInput();
        refocusScannerInput();
        return;
      }
    },
    [
      whId,
      tenantId,
      step,
      busy,
      source,
      productId,
      cartons,
      pieces,
      unitsPerCarton,
      qtyCapAtSource,
      normalizeCartonsPieces,
      showScannerToast,
      appendScanToHistory,
      clearDevScannerInput,
      refocusScannerInput,
      loadSourceInventory,
      applySourceLocation,
      activeReplenTask,
      totalUnits,
      resetSession,
      replenishListMode,
    ],
  );

  const saveMm = useCallback(async () => {
    if (activeReplenTask != null) {
      setErr("Uzupełnienie: użyj „Dalej”, potem zeskanuj lokalizację PICK.");
      return;
    }
    if (!whId || !source || productId == null || totalUnits <= 0) {
      setErr("Ustaw ilość większą od zera i zapisz.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (target != null) {
        const doc = await postWmsMmTransfer(tenantId, {
          warehouse_id: whId,
          from_location_id: source.id,
          to_location_id: target.id,
          product_id: productId,
          quantity: totalUnits,
        });
        playScanBeep();
        window.dispatchEvent(
          new CustomEvent("wms:inventory-updated", { detail: { tenantId, warehouseId: whId } }),
        );
        setDecisionMessage(`Zapisano przesunięcie #${doc.id}.`);
        setTarget(null);
        setProductId(null);
        setProductName("");
        setUnitsPerCarton(1);
        setCartons(0);
        setPieces(0);
        setQtyInputMode("unit");
        setQtyDraft(null);
        setDraftDecisionDocId(null);
        setScanInputValue("");
        setShowInventoryList(false);
        setStep("DECISION");
        await loadSourceInventory(source.id);
      } else {
        const doc = await appendMmDraftLine(tenantId, {
          warehouse_id: whId,
          from_location_id: source.id,
          product_id: productId,
          quantity: totalUnits,
        });
        playScanBeep();
        window.dispatchEvent(new CustomEvent(WMS_MM_UPDATED_EVENT, { detail: { tenantId } }));
        setDecisionMessage(null);
        setDraftDecisionDocId(doc.id);
        setProductId(null);
        setProductName("");
        setUnitsPerCarton(1);
        setTarget(null);
        setCartons(0);
        setPieces(0);
        setQtyInputMode("unit");
        setQtyDraft(null);
        setSource(null);
        inventoryByProductRef.current = new Map();
        setSourceInventoryRows([]);
        setScanInputValue("");
        setShowInventoryList(false);
        setStep("DECISION");
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setErr(typeof msg === "string" ? msg : "Zapis nie powiódł się.");
    } finally {
      setBusy(false);
    }
  }, [whId, source, target, productId, totalUnits, tenantId, loadSourceInventory, activeReplenTask]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Przesunięcia magazynowe" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    if (replenishListMode != null) {
      setScannerInputDisabled(true);
      return () => setScannerInputDisabled(false);
    }
    const typing = qtyInputFocusedRef.current && step === "ENTER_QTY";
    setScannerInputDisabled(typing);
    return () => setScannerInputDisabled(false);
  }, [replenishListMode, step, setScannerInputDisabled]);

  useEffect(() => {
    if (replenishListMode != null || !whId) {
      registerScanHandler(null);
      return () => registerScanHandler(null);
    }
    registerScanHandler((ean) => {
      void (async () => {
        if (scanBusy.current || qtyInputFocusedRef.current) return;
        scanBusy.current = true;
        try {
          await handleScan(ean);
        } finally {
          scanBusy.current = false;
        }
      })();
    });
    return () => registerScanHandler(null);
  }, [replenishListMode, whId, registerScanHandler, handleScan]);

  // Filtrowanie listy produktów wg tego, co wpisano w głównym inpucie
  const filteredInventoryRows = useMemo(() => {
    if (!scanInputValue.trim()) return sourceInventoryRows;
    const q = scanInputValue.toLowerCase().trim();
    return sourceInventoryRows.filter((r) => {
      return (
        (r.product_name || "").toLowerCase().includes(q) ||
        (r.product_sku || "").toLowerCase().includes(q) ||
        (r.product_ean || "").toLowerCase().includes(q)
      );
    });
  }, [sourceInventoryRows, scanInputValue]);

  if (!whId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <p className="text-slate-500 font-bold tracking-widest uppercase">Wybierz magazyn w nagłówku WMS.</p>
      </div>
    );
  }

  const canSave =
    step === "ENTER_QTY" &&
    source != null &&
    productId != null &&
    totalUnits > 0 &&
    !busy;

  const capTotalEnterQty = step === "ENTER_QTY" ? qtyCapAtSource : 0;
  const upcEnterQty = step === "ENTER_QTY" ? Math.max(1, unitsPerCarton) : 1;
  const transferQtyCanPlus =
    step === "ENTER_QTY" &&
    (qtyInputMode === "unit"
      ? totalUnits + 1 <= capTotalEnterQty
      : totalUnits + upcEnterQty <= capTotalEnterQty);
  const transferQtyCanMinus = step === "ENTER_QTY" && totalUnits > 0;

  const centerQuantity = qtyInputMode === "carton" ? cartons : pieces;
  const qtyInputDisplayValue = qtyDraft !== null ? qtyDraft : String(centerQuantity);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 items-center justify-center p-6">
      
      {/* =========================================================================
          TRYB LISTY ZADAŃ (ReplenishmentTab)
          ========================================================================= */}
      {replenishListMode != null ? (
        <div className="w-full max-w-[1600px] flex flex-col flex-1 gap-6 animate-in fade-in duration-300">
          <button
            type="button"
            onClick={() => setReplenishListMode(null)}
            className="self-start inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-colors active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
            Powrót
          </button>
          <MmReplenishmentTab
            tenantId={tenantId}
            warehouseId={whId}
            refreshKey={replenishRefreshKey}
            forcedView={replenishListMode}
            onSelectTask={beginReplenishmentTask}
          />
        </div>
      ) : (
        <main className="w-full max-w-4xl flex flex-col items-center gap-10 animate-in fade-in duration-500 flex-1 justify-center relative">
          
          {err && (
            <div className="w-full rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-800 shadow-sm text-center">
              {err}
            </div>
          )}

          {/* =========================================================================
              WIDOK GŁÓWNY: Skanowanie Źródła / Produktu / Celu
              ========================================================================= */}
          {(step === "SCAN_SOURCE" || step === "SCAN_PRODUCT" || step === "SCAN_TARGET") && (
            <div className="w-full flex flex-col items-center">
              
              {activeReplenTask && step === "SCAN_SOURCE" && (
                <p className="mb-6 text-center text-xs font-black uppercase tracking-widest text-orange-600 bg-orange-50 px-4 py-2 rounded-xl border border-orange-200 shadow-sm">
                  Uzupełnienie: Zeskanuj rezerwę wskazaną w zadaniu
                </p>
              )}

              {/* DUŻY INPUT SKANERA (DLA ŹRÓDŁA I CELU) */}
              {step === "SCAN_SOURCE" ? (
                <MmSourceLocationAutocomplete
                  locations={warehouseLocations}
                  disabled={busy}
                  restrictToLocationId={
                    activeReplenTask != null ? activeReplenTask.source_location_id : null
                  }
                  onSelectLocation={(loc) => {
                    const name = (loc.code ?? loc.name ?? "").trim() || `#${loc.id}`;
                    void applySourceLocation(loc.id, name, (loc as any).type);
                  }}
                  onSubmitScan={(raw) => {
                    void handleScan(raw);
                  }}
                />
              ) : step === "SCAN_TARGET" ? (
                <div className="w-full relative group">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-6 sm:pl-8">
                    <ScanLine
                      className="h-8 w-8 text-slate-400 transition-colors group-focus-within:text-[#5a4fcf] sm:h-10 sm:w-10"
                      strokeWidth={2.5}
                    />
                  </div>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Zeskanuj lokalizację docelową (PICK)..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleScan(e.currentTarget.value);
                        e.currentTarget.value = "";
                      }
                    }}
                    className="w-full rounded-[2rem] border-2 border-slate-200 bg-white py-6 pl-[5rem] pr-8 text-lg font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#5a4fcf] focus:shadow-md focus:ring-4 focus:ring-indigo-500/10 sm:py-8 sm:pl-[6rem] sm:text-2xl"
                  />
                </div>
              ) : (
                /* WIDOK: SKANUJ PRODUKT (Z wyeksponowaną lokalizacją) */
                source && (
                  <div className="w-full flex flex-col items-center">
                    
                    {/* ZOPTYMALIZOWANY BADGE LOKALIZACJI */}
                    <div className="flex flex-col items-center mb-12 animate-in fade-in zoom-in-95 duration-300">
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 text-center">
                        Jesteś na lokalizacji
                      </span>
                      <div className={`flex items-center gap-4 px-8 py-4 sm:px-10 sm:py-5 rounded-[2rem] border-2 shadow-sm transition-colors ${
                        source.type === 'BUFFER'
                          ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-amber-500/10'
                          : 'bg-indigo-50 border-indigo-200 text-[#5a4fcf] shadow-indigo-500/10'
                      }`}>
                        <MapPin size={32} strokeWidth={2.5} className="opacity-80 shrink-0" />
                        <span className="font-black text-3xl sm:text-5xl tracking-wider leading-none">
                          {source.name}
                        </span>
                      </div>
                    </div>

                    <div className="w-full relative group z-10">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-6 sm:pl-8">
                        <ScanLine
                          className="h-8 w-8 text-slate-400 transition-colors group-focus-within:text-[#5a4fcf] sm:h-10 sm:w-10"
                          strokeWidth={2.5}
                        />
                      </div>
                      <input
                        type="text"
                        value={scanInputValue}
                        onChange={(e) => {
                          setScanInputValue(e.target.value);
                          setShowInventoryList(true);
                        }}
                        onClick={() => setShowInventoryList(true)}
                        placeholder="Zeskanuj produkt z wybranej lokalizacji..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleScan(scanInputValue);
                            setScanInputValue("");
                          }
                        }}
                        className="w-full rounded-[2rem] border-2 border-slate-200 bg-white py-6 pl-[5rem] pr-8 text-lg font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#5a4fcf] focus:shadow-md focus:ring-4 focus:ring-indigo-500/10 sm:py-8 sm:pl-[6rem] sm:text-2xl"
                      />
                    </div>

                    {/* LISTA WYSZUKIWANIA PRODUKTÓW (Pojawia się po kliknięciu/wpisaniu) */}
                    {showInventoryList && (
                      <div className="w-full flex flex-col gap-4 mt-8 animate-in slide-in-from-top-4 fade-in duration-300">
                        {filteredInventoryRows.map(row => (
                          <button 
                            key={row.product_id}
                            disabled={busy || activeReplenTask != null}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyProductFromInventory(row)} 
                            className="flex items-center justify-between bg-white border border-slate-200 p-4 sm:p-5 rounded-[1.5rem] hover:border-[#5a4fcf] hover:shadow-md transition-all active:scale-95 group text-left disabled:opacity-50 disabled:hover:shadow-sm"
                          >
                            <div className="flex items-center gap-5 min-w-0">
                              <div className="w-16 h-16 bg-transparent flex items-center justify-center shrink-0">
                                {row.product_image_url ? (
                                  <img src={row.product_image_url} alt="" className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                ) : (
                                  <ImageIcon className="text-slate-200" size={32} strokeWidth={1.5} />
                                )}
                              </div>
                              <div className="min-w-0 pr-4">
                                <h3 className="font-black text-slate-900 truncate text-base sm:text-lg mb-1.5">
                                  {row.product_name || `Produkt #${row.product_id}`}
                                </h3>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    SKU: <strong className="text-slate-600">{row.product_sku || "BRAK"}</strong>
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    EAN: <strong className="text-slate-600">{row.product_ean || "BRAK"}</strong>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 bg-emerald-50/80 text-emerald-700 font-black px-5 py-3 rounded-2xl text-lg sm:text-xl border border-emerald-100 group-hover:bg-emerald-100 transition-colors flex items-baseline gap-1">
                              {row.quantity_total} <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70">szt.</span>
                            </div>
                          </button>
                        ))}

                        {filteredInventoryRows.length === 0 && (
                          <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-slate-100">
                            <p className="text-slate-500 font-bold text-sm">
                              Brak produktów pasujących do "{scanInputValue}"
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}

              {/* OPCJE UZUPEŁNIANIA (Widoczne tylko na ekranie startowym) */}
              {step === "SCAN_SOURCE" && activeReplenTask == null && (
                <div className="w-full flex flex-col items-center mt-12 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="relative flex items-center w-full mb-10">
                    <div className="flex-grow border-t-2 border-dashed border-slate-200"></div>
                    <span className="shrink-0 px-6 text-xs font-black tracking-widest uppercase text-slate-400">
                      LUB
                    </span>
                    <div className="flex-grow border-t-2 border-dashed border-slate-200"></div>
                  </div>

                  <span className="text-[11px] sm:text-xs font-black tracking-widest uppercase text-slate-400 mb-6 text-center">
                    Uzupełnij braki na lokalizacji
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
                    <button 
                      onClick={() => setReplenishListMode("location")}
                      className="flex flex-col items-center justify-center gap-4 bg-white hover:bg-orange-50/40 border-2 border-orange-200 hover:border-orange-400 text-orange-900 p-8 rounded-[2rem] transition-all active:scale-95 shadow-sm group"
                    >
                      <div className="bg-orange-50 p-4 rounded-[1.25rem] group-hover:scale-110 transition-transform">
                        <MapPin className="text-orange-500 w-8 h-8" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-black uppercase tracking-wider text-center">
                        Uzupełnij wg lokalizacji
                      </span>
                    </button>

                    <button 
                      onClick={() => setReplenishListMode("priority")}
                      className="flex flex-col items-center justify-center gap-4 bg-white hover:bg-orange-50/40 border-2 border-orange-200 hover:border-orange-400 text-orange-900 p-8 rounded-[2rem] transition-all active:scale-95 shadow-sm group"
                    >
                      <div className="bg-orange-50 p-4 rounded-[1.25rem] group-hover:scale-110 transition-transform">
                        <ListOrdered className="text-orange-500 w-8 h-8" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-black uppercase tracking-wider text-center">
                        Uzupełnij wg priorytetów
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* PRZYCISK ANULUJ/RESET SESJI */}
              {(step === "SCAN_PRODUCT" || step === "SCAN_TARGET") && (
                <button
                  type="button"
                  onClick={() => resetSession()}
                  className="mt-12 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-800 transition-colors bg-slate-50 hover:bg-slate-100 px-6 py-3 rounded-xl active:scale-95"
                >
                  Anuluj i wróć do startu
                </button>
              )}

            </div>
          )}

          {/* =========================================================================
              WIDOK PODAWANIA ILOŚCI (Karta na środku)
              ========================================================================= */}
          {step === "ENTER_QTY" && (
            <div className="w-full max-w-[580px] rounded-[2.5rem] border border-slate-100 bg-white p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              
              {/* HEADER (ZDJĘCIE + INFO) */}
              <div className="mb-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-2 pr-6">
                <div className="w-32 h-32 flex items-center justify-center shrink-0 bg-transparent">
                  {productImageUrl ? (
                    <img
                      src={productImageUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain mix-blend-multiply"
                    />
                  ) : (
                    <ImageIcon size={48} className="text-slate-200" strokeWidth={1.5} />
                  )}
                </div>
                
                <div className="flex-1 flex flex-col justify-center text-center sm:text-left pt-1">
                  <h2 className="text-[22px] font-black text-slate-900 leading-tight mb-4 line-clamp-2">
                    {displayProductName}
                  </h2>
                  
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    {productEan ? (
                      <span className="text-[11px] font-black text-slate-500 border border-slate-200 px-3.5 py-1.5 rounded-xl uppercase tracking-wide bg-white shadow-sm">
                        EAN: {productEan}
                      </span>
                    ) : (
                      <span className="text-[11px] font-black text-amber-700 border border-amber-200 bg-amber-50 px-3.5 py-1.5 rounded-xl uppercase tracking-wide shadow-sm">
                        Brak kodu EAN
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                
                {/* LOKALIZACJE */}
                <div className="bg-white border border-slate-100 rounded-[1.5rem] p-5 sm:p-6 flex flex-col shadow-sm gap-4">
                  {source && (
                    <div className="w-full">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Lokalizacja źródłowa
                      </p>
                      <LocationBadge code={source.name} type="BUFFER" layoutSpread className="w-full !rounded-xl !py-3 !text-sm !font-black !shadow-sm" />
                    </div>
                  )}

                  {activeReplenTask && (
                    <div className="w-full mt-2 pt-4 border-t border-slate-100">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#5a4fcf]">
                        Cel (PICK) — Zeskanuj po „Dalej”
                      </p>
                      <LocationBadge
                        code={(activeReplenTask.target_location_code || "").trim() || `#${activeReplenTask.target_location_id}`}
                        type="PICK"
                        layoutSpread
                        className="w-full !rounded-xl !py-3 !text-sm !font-black !shadow-sm !border-[#5a4fcf]/30 !bg-indigo-50/50"
                      />
                    </div>
                  )}
                </div>

                {/* GŁÓWNY KONTROLER ILOŚCI */}
                <div className="bg-white border border-slate-100 rounded-[2rem] p-6 sm:p-8 flex flex-col items-center shadow-sm">
                  
                  {/* PRZEŁĄCZNIK SZTUKI/KARTONY */}
                  <div className="flex bg-slate-50/80 p-1.5 rounded-2xl w-full mb-8 border border-slate-100 shadow-inner">
                    <button
                      type="button"
                      onClick={() => {
                        setQtyInputMode("unit");
                        setQtyDraft(null);
                        reapplyCanonicalTotal();
                      }}
                      className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                        qtyInputMode === "unit" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      Sztuki
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQtyInputMode("carton");
                        setQtyDraft(null);
                        reapplyCanonicalTotal();
                      }}
                      className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                        qtyInputMode === "carton" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      Kartony
                    </button>
                  </div>

                  <div className="flex items-center justify-between w-full">
                    <button
                      type="button"
                      disabled={!transferQtyCanMinus}
                      className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-3xl bg-white border border-slate-200 text-slate-900 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition shadow-sm disabled:opacity-40"
                      onClick={() => {
                        applyTotalDelta(qtyInputMode === "carton" ? -upcEnterQty : -1);
                        mmQtyInputRef.current?.focus();
                        placeInputCaretAtEnd(mmQtyInputRef.current);
                      }}
                    >
                      <Minus className="w-8 h-8" strokeWidth={2.5} />
                    </button>

                    <div className="flex-1 flex items-baseline justify-center mx-4 text-[#5a4fcf]">
                      <input
                        ref={mmQtyInputRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={qtyInputDisplayValue}
                        onChange={(e) => setQtyDraft(e.target.value.replace(/\D/g, ""))}
                        onFocus={(e) => {
                          qtyInputFocusedRef.current = true;
                          placeInputCaretAtEnd(e.currentTarget);
                        }}
                        onBlur={() => {
                          qtyInputFocusedRef.current = false;
                          if (qtyDraft === null) return;
                          const raw = qtyDraft !== "" ? qtyDraft : String(qtyInputMode === "carton" ? cartons : pieces);
                          const v = parsedUInt(raw);
                          if (qtyInputMode === "carton") setQtyPair(v, pieces);
                          else setQtyPair(cartons, v);
                          setQtyDraft(null);
                        }}
                        className="w-full max-w-[140px] sm:max-w-[180px] text-center text-[5rem] sm:text-[6rem] font-medium leading-none tracking-tighter bg-transparent border-none focus:ring-0 p-0 outline-none font-sans tabular-nums"
                      />
                      <span className="text-xl sm:text-2xl font-bold text-slate-400 ml-1 font-sans tracking-wide">
                        {qtyInputMode === "carton" ? "kart." : "szt."}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!transferQtyCanPlus}
                      className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-3xl bg-white border border-slate-200 text-slate-900 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition shadow-sm disabled:opacity-40"
                      onClick={() => {
                        applyTotalDelta(qtyInputMode === "carton" ? upcEnterQty : 1);
                        mmQtyInputRef.current?.focus();
                        placeInputCaretAtEnd(mmQtyInputRef.current);
                      }}
                    >
                      <Plus className="w-8 h-8" strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="mt-8 text-center">
                    <span className="text-[9px] sm:text-[10px] font-black text-slate-400 tracking-widest uppercase">
                      <span className="bg-slate-100 border border-slate-200 text-slate-500 px-2.5 py-1 rounded-md mr-2 font-black uppercase tracking-widest text-[10px]">Enter</span>
                      zatwierdza • Skan EAN dodaje +1{qtyInputMode === "carton" && cartonsConfigured ? " kart." : " szt."}
                    </span>
                  </div>

                </div>
                
                <div className="w-full flex items-center justify-between px-2 mt-8">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Suma ogólna
                  </span>
                  <div className="flex items-baseline gap-1.5 font-sans tabular-nums">
                    <span className="text-4xl font-black text-[#5a4fcf]">{fmtQty(totalUnits)}</span>
                    <span className="text-sm font-bold text-slate-400">szt.</span>
                  </div>
                </div>

              </div>

              {/* DOLNE PRZYCISKI AKCJI */}
              <div className="flex items-center gap-3 mt-8">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => resetSession()}
                  className="flex-[1] bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-black py-5 rounded-2xl text-[13px] tracking-widest uppercase transition-colors active:scale-95 shadow-sm"
                >
                  Anuluj
                </button>
                
                {activeReplenTask != null ? (
                  <button
                    type="button"
                    disabled={busy || !canSave}
                    onClick={() => {
                      setErr(null);
                      setStep("SCAN_TARGET");
                      clearDevScannerInput();
                      refocusScannerInput();
                    }}
                    className="flex-[1.5] bg-orange-500 hover:bg-orange-600 text-white font-black py-5 rounded-2xl text-[13px] tracking-widest uppercase transition-all active:scale-95 shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none"
                  >
                    Dalej — skan lokacji PICK
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !canSave}
                    onClick={() => void saveMm()}
                    className="flex-[1.5] bg-[#5a4fcf] hover:bg-[#4a40b2] text-white font-black py-5 rounded-2xl text-[13px] tracking-widest uppercase transition-all active:scale-95 shadow-lg shadow-indigo-500/20 disabled:bg-[#c7d2fe] disabled:shadow-none"
                  >
                    {busy ? "Zapisywanie..." : "Zatwierdź"}
                  </button>
                )}
              </div>

            </div>
          )}

          {/* =========================================================================
              WIDOK SUKCESU (Karta po zapisaniu w trybie draftu/uzupełniania)
              ========================================================================= */}
          {step === "DECISION" && (
            <div className="w-full max-w-[560px] rounded-[2.5rem] border border-emerald-100 bg-white p-10 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col items-center">
              
              <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-8 border border-emerald-100 shadow-inner">
                <MapPin className="w-12 h-12" strokeWidth={2.5} />
              </div>

              {draftDecisionDocId != null ? (
                <>
                  <h2 className="text-3xl font-black leading-tight text-slate-900 text-center mb-10">
                    Produkt dodany<br/>do przesunięcia
                  </h2>
                  <div className="flex flex-col gap-4 w-full">
                    <button
                      type="button"
                      onClick={() => resetSession()}
                      className="w-full rounded-2xl bg-slate-900 px-6 py-5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 transition shadow-lg active:scale-95"
                    >
                      Kontynuuj przesunięcia
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const id = draftDecisionDocId;
                        if (id == null) return;
                        resetSession();
                        navigate(WMS_ROUTES.mmRelocation(id), { state: { tenantId } });
                      }}
                      className="w-full rounded-2xl border-2 border-emerald-500 bg-emerald-50 px-6 py-5 text-xs font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 transition shadow-sm active:scale-95"
                    >
                      Dokończ przesunięcie (PM)
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {decisionMessage && (
                    <p className="text-center text-xl font-black text-emerald-600 mb-10 leading-snug">{decisionMessage}</p>
                  )}
                  <div className="flex flex-col gap-4 w-full">
                    <button
                      type="button"
                      onClick={() => continueMoreTransfers()}
                      className="w-full rounded-2xl bg-slate-900 px-6 py-5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 transition shadow-lg active:scale-95"
                    >
                      Kontynuuj z tej lokalizacji
                    </button>
                    <button
                      type="button"
                      onClick={() => resetSession()}
                      className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 py-5 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition shadow-sm active:scale-95"
                    >
                      Nowa sesja (inne źródło)
                    </button>
                  </div>
                </>
              )}

            </div>
          )}

        </main>
      )}

      {/* MODAL (Ręczny produkt dla Search Panela) */}
      <WmsManualProductModal
        variant="minimal"
        open={manualProductOpen}
        tenantId={tenantId}
        onClose={() => setManualProductOpen(false)}
        onCreated={() => {
          setManualProductOpen(false);
          showScannerToast("Produkt utworzony — przyjmij towar lub dodaj stan, aby go przesunąć");
        }}
      />
    </div>
  );
}