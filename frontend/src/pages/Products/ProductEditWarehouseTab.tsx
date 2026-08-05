import { Link } from "react-router-dom";
import { ArrowLeftRight, Box, Map as MapIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  batchProductLocationCapacities,
  type ProductLocationCapacity,
} from "../../api/slottingApi";
import {
  fetchProductWarehouseStockBreakdown,
  fmtStockQty,
  type ProductWarehouseStockBreakdown,
} from "../../api/multiWarehouseUiApi";
import type { MagazynInvRowDisplay } from "../../components/products/MagazynInventoryLine";
import { ProductLogisticsPackagingMatchingSection } from "../../components/products/ProductLogisticsPackagingMatchingSection";
import { ProductStockCorrectionModal } from "../../components/products/ProductStockCorrectionModal";
import type { ProductDispositionStock } from "../../types/productDispositionStock";
import { Checkbox, Input, PrimaryButton, Select } from "../../design-system";
import { getStorageTypeStyle, normalizeStorageType } from "../../utils/storageTypes";

const labelClass = "mb-1 block text-sm font-medium text-gray-700";
const sectionLabelClass = "mb-4 text-xs font-bold uppercase tracking-wider text-gray-400";

export type ProductEditWarehouseTabProps = {
  isNew: boolean;
  saving: boolean;
  productId: number | null | undefined;
  productName: string;
  tenantId: number | null;
  warehouseId: number | null | undefined;
  physicalStockDisplay: string | null;
  inventoryBreakdown: {
    total: string;
    allocated: string;
    unallocated: string;
    reserved: string | null;
    productionReserved: string | null;
    available: string | null;
  } | null;
  dispositionStock: ProductDispositionStock | null;
  commerciallySellableQty: number | null | undefined;
  salesBlockedQty: number | null | undefined;
  networkCommerciallySellableQty: number | null | undefined;
  inventoryRows: MagazynInvRowDisplay[];
  emptyLocationsMessage: string;
  canManualAdjustStock: boolean;
  stockCorrectionOpen: boolean;
  setStockCorrectionOpen: (v: boolean) => void;
  onStockCorrectionSuccess: () => void;
  onEditTraceability?: (row: MagazynInvRowDisplay) => void;
  enableStockAlert: boolean;
  setEnableStockAlert: (v: boolean) => void;
  minTotalStock: number | "";
  setMinTotalStock: (v: number | "") => void;
  orientationType: "any" | "upright" | "no_stack";
  setOrientationType: (v: "any" | "upright" | "no_stack") => void;
  shapeType: "box" | "cylinder";
  setShapeType: (v: "box" | "cylinder") => void;
  stackBehavior: "stackable" | "no_stack";
  setStackBehavior: (v: "stackable" | "no_stack") => void;
  fragile: boolean;
  setFragile: (v: boolean) => void;
  stackCompressible: boolean;
  setStackCompressible: (v: boolean) => void;
  compressedHeightCm: number | "";
  setCompressedHeightCm: (v: number | "") => void;
  maxStackWeight: number | "";
  setMaxStackWeight: (v: number | "") => void;
  maxStackCount: number | "";
  setMaxStackCount: (v: number | "") => void;
  cartonOrientationType: "any" | "upright" | "no_stack";
  setCartonOrientationType: (v: "any" | "upright" | "no_stack") => void;
  cartonShapeType: "box" | "cylinder";
  setCartonShapeType: (v: "box" | "cylinder") => void;
  cartonStackBehavior: "stackable" | "no_stack";
  setCartonStackBehavior: (v: "stackable" | "no_stack") => void;
  cartonStackCompressible: boolean;
  setCartonStackCompressible: (v: boolean) => void;
  cartonCompressedHeightCm: number | "";
  setCartonCompressedHeightCm: (v: number | "") => void;
  cartonMaxStackWeight: number | "";
  setCartonMaxStackWeight: (v: number | "") => void;
  cartonMaxStackCount: number | "";
  setCartonMaxStackCount: (v: number | "") => void;
  minPickQuantity: number | "";
  setMinPickQuantity: (v: number | "") => void;
  maxPickQuantity: number | "";
  setMaxPickQuantity: (v: number | "") => void;
  minReserveQuantity: number | "";
  setMinReserveQuantity: (v: number | "") => void;
  maxReserveQuantity: number | "";
  setMaxReserveQuantity: (v: number | "") => void;
  dimensionsComplete: boolean;
};

function fmtSzt(v: string | number | null | undefined): string {
  if (v == null || v === "" || v === "—") return "—";
  return `${v} szt.`;
}

function parseNonNeg(raw: string, set: (v: number | "") => void) {
  const s = String(raw).trim().replace(",", ".");
  if (s === "") set("");
  else {
    const n = parseFloat(s);
    if (Number.isFinite(n) && n >= 0) set(n);
  }
}

function LocationCapacityTiles({
  productId,
  tenantId,
  inventoryRows,
}: {
  productId: number;
  tenantId: number;
  inventoryRows: MagazynInvRowDisplay[];
}) {
  const ids = useMemo(
    () =>
      Array.from(
        new Set(
          inventoryRows
            .map((l) => Number(l.location_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ).slice(0, 80),
    [inventoryRows],
  );
  const typeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of inventoryRows) m.set(r.location_id, r.location_type);
    return m;
  }, [inventoryRows]);
  const qtyById = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of inventoryRows) {
      const prev = m.get(r.location_id) ?? 0;
      m.set(r.location_id, prev + (Number(r.quantity) || 0));
    }
    return m;
  }, [inventoryRows]);

  const [items, setItems] = useState<ProductLocationCapacity[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !tenantId || ids.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void batchProductLocationCapacities({
      tenant_id: tenantId,
      product_id: productId,
      location_ids: ids,
    })
      .then((res) => {
        if (!cancelled) setItems(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setErr("Nie udało się wczytać pojemności lokalizacji.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, tenantId, ids.join(",")]);

  if (ids.length === 0) {
    return <p className="text-sm text-gray-500">Brak lokalizacji z stanem.</p>;
  }

  const byId = new Map(items.map((c) => [c.location_id, c]));

  return (
    <>
      {loading ? (
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Liczenie pojemności…
        </div>
      ) : null}
      {err ? <p className="mb-3 text-sm text-rose-700">{err}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ids.map((locId) => {
          const c = byId.get(locId);
          const code = c?.location_code || inventoryRows.find((r) => r.location_id === locId)?.location_code || `#${locId}`;
          const qty = c?.current_quantity ?? qtyById.get(locId) ?? 0;
          const typeStyle = getStorageTypeStyle(typeById.get(locId));
          const norm = normalizeStorageType(typeById.get(locId));
          const barColor =
            norm === "pick"
              ? "bg-green-500"
              : norm === "primary"
                ? "bg-blue-500"
                : norm === "reserve"
                  ? "bg-yellow-500"
                  : norm === "damaged"
                    ? "bg-red-500"
                    : norm === "buffer"
                      ? "bg-purple-500"
                      : "bg-slate-400";
          const util = Math.max(0, Math.min(100, Number(c?.utilization_percent) || 0));
          const estimated = String(c?.confidence ?? "").toUpperCase() === "ESTIMATED";
          const trusted = c?.capacity_numeric_trusted !== false && String(c?.confidence ?? "").toUpperCase() !== "UNKNOWN";
          const totalLabel =
            c?.total_capacity != null
              ? estimated
                ? `~${c.total_capacity}`
                : String(c.total_capacity)
              : "—";
          const addLabel = c?.additional_capacity_label || (trusted ? "—" : "Pojemność nieokreślona");

          return (
            <div key={locId} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div
                className="flex items-center justify-between border-b px-4 py-2"
                style={{ backgroundColor: typeStyle.bg, borderColor: typeStyle.border }}
              >
                <div className="flex items-center" style={{ color: typeStyle.text }}>
                  <Box className="mr-2 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: typeStyle.border }} />
                  <span className="font-mono text-sm font-bold">{code}</span>
                </div>
                <span className="font-mono font-bold" style={{ color: typeStyle.text }}>
                  {fmtStockQty(qty)} szt.
                </span>
              </div>
              <div className="px-4 py-3">
                <div className="mb-1 flex items-start justify-between">
                  <span className="text-xs text-gray-500">Zajętość</span>
                  <span className="rounded bg-gray-100 px-1 py-0.5 text-[9px] font-bold uppercase text-gray-400">
                    {!trusted ? "Nieokreślona" : estimated ? "Szacunkowa" : "Dokładna"}
                  </span>
                </div>
                <div className="mb-1 text-sm font-medium text-gray-800">
                  {fmtStockQty(qty)} / {totalLabel}{" "}
                  <span className="text-xs font-normal text-gray-400">szt.</span>
                </div>
                <div className="mb-2 h-1.5 w-full rounded-full bg-gray-100">
                  <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${util}%` }} />
                </div>
                <div className="text-xs font-medium text-orange-600">{addLabel}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WarehousesColumn({ productId, tenantId }: { productId: number; tenantId: number }) {
  const [data, setData] = useState<ProductWarehouseStockBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetchProductWarehouseStockBreakdown(productId, tenantId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setErr("Nie udało się wczytać stanów magazynowych.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, tenantId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Wczytywanie…
      </div>
    );
  }
  if (err) return <p className="text-sm text-rose-700">{err}</p>;

  const warehouses = data?.warehouses ?? [];
  if (warehouses.length === 0) {
    return <p className="text-sm text-gray-500">Brak przypisanych magazynów dla tenanta.</p>;
  }

  return (
    <div className="space-y-6">
      {warehouses.map((wh, idx) => {
        const muted = idx > 0 && Number(wh.physical_quantity) === 0;
        return (
          <div key={wh.warehouse_id}>
            <h3 className={sectionLabelClass}>{wh.warehouse_name}</h3>
            <div className={`space-y-3 text-sm ${muted ? "text-gray-500" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={muted ? "text-gray-500" : "text-gray-600"}>Stan fizyczny</span>
                <span className={`font-mono ${muted ? "text-gray-500" : "font-bold text-gray-900"}`}>
                  {fmtStockQty(wh.physical_quantity)} szt.
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={muted ? "text-gray-500" : "text-gray-600"}>Dostępne</span>
                <span className={`font-mono ${muted ? "text-gray-500" : "font-bold text-gray-900"}`}>
                  {fmtStockQty(wh.available_quantity)} szt.
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={muted ? "text-gray-500" : "text-gray-600"}>Zarezerwowane</span>
                <span className={`font-mono ${muted ? "text-gray-500" : "font-medium text-gray-500"}`}>
                  {fmtStockQty(wh.reserved_quantity)} szt.
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Product edit — Magazyn tab.
 * DOM hierarchy is a structural 1:1 port of `magazyn karta produktu.html`.
 */
export function ProductEditWarehouseTab({
  isNew,
  saving: _saving,
  productId,
  productName,
  tenantId,
  warehouseId,
  physicalStockDisplay,
  inventoryBreakdown,
  dispositionStock: _dispositionStock,
  commerciallySellableQty,
  salesBlockedQty: _salesBlockedQty,
  networkCommerciallySellableQty,
  inventoryRows,
  emptyLocationsMessage,
  canManualAdjustStock,
  stockCorrectionOpen,
  setStockCorrectionOpen,
  onStockCorrectionSuccess,
  onEditTraceability: _onEditTraceability,
  enableStockAlert,
  setEnableStockAlert,
  minTotalStock,
  setMinTotalStock,
  orientationType,
  setOrientationType,
  shapeType,
  setShapeType,
  stackBehavior,
  setStackBehavior,
  fragile,
  setFragile,
  stackCompressible,
  setStackCompressible,
  compressedHeightCm,
  setCompressedHeightCm,
  maxStackWeight,
  setMaxStackWeight,
  maxStackCount,
  setMaxStackCount,
  cartonOrientationType,
  setCartonOrientationType,
  cartonShapeType,
  setCartonShapeType,
  cartonStackBehavior,
  setCartonStackBehavior,
  cartonStackCompressible,
  setCartonStackCompressible,
  cartonCompressedHeightCm,
  setCartonCompressedHeightCm,
  cartonMaxStackWeight,
  setCartonMaxStackWeight,
  cartonMaxStackCount,
  setCartonMaxStackCount,
  minPickQuantity,
  setMinPickQuantity,
  maxPickQuantity,
  setMaxPickQuantity,
  minReserveQuantity,
  setMinReserveQuantity,
  maxReserveQuantity,
  setMaxReserveQuantity,
  dimensionsComplete,
}: ProductEditWarehouseTabProps) {
  const physicalLabel = physicalStockDisplay ?? inventoryBreakdown?.total ?? "—";
  const availableTrade =
    commerciallySellableQty != null
      ? new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(commerciallySellableQty)
      : inventoryBreakdown?.available ?? "—";
  const allocatedLabel = inventoryBreakdown?.allocated ?? "—";
  const unallocatedLabel = inventoryBreakdown?.unallocated ?? "—";
  const networkTrade =
    networkCommerciallySellableQty != null
      ? new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(networkCommerciallySellableQty)
      : null;

  return (
    <div className="mx-auto max-w-7xl space-y-12">
      <div
        style={{
          background: "#ff0000",
          color: "white",
          fontSize: 32,
          padding: 20,
          fontWeight: "bold",
        }}
      >
        ==============================
        <br />
        TEST MAGAZYN TAB
        <br />
        ==============================
      </div>
      {/* SEKCJA 1: Stan i lokalizacje */}
      <div>
        <div className="mb-8 flex items-center justify-between border-b border-gray-100 pb-4">
          <h2 className="text-xl font-bold text-gray-900">Stan i lokalizacje</h2>
          {canManualAdjustStock ? (
            <PrimaryButton
              type="button"
              density="compact"
              onClick={() => setStockCorrectionOpen(true)}
              className="!rounded-lg !bg-orange-500 !px-4 !py-2 !text-sm !font-semibold shadow-sm hover:!bg-orange-600"
            >
              <ArrowLeftRight className="mr-2 h-4 w-4" strokeWidth={2} aria-hidden />
              Korekta stanu
            </PrimaryButton>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Kolumna 1 */}
          <div className="space-y-6">
            <div>
              <h3 className={sectionLabelClass}>Stan łączny (sieć)</h3>
              <div className="mb-6">
                <div className="mb-1 text-sm text-gray-500">Stan fizyczny ogółem:</div>
                <div className="font-mono text-3xl font-bold text-gray-900">
                  {physicalLabel === "—" ? "—" : physicalLabel}{" "}
                  <span className="text-lg font-medium text-gray-500">szt.</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="text-sm font-medium text-gray-700">Dostępne handlowo</span>
                  <span className="font-mono font-bold text-green-600">
                    {availableTrade === "—" ? "—" : `${availableTrade} szt.`}
                  </span>
                </div>
                {networkTrade != null ? (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Sieć handlowo: <b>{networkTrade} szt.</b>
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Na lokalizacjach: <b>{fmtSzt(allocatedLabel)}</b>
                  </span>
                  <span>
                    Nieprzypisane: <b>{fmtSzt(unallocatedLabel)}</b>
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Powiadomienia</h3>
              <label className="flex cursor-pointer items-center rounded-lg border border-orange-100 bg-orange-50/30 p-3 transition-colors hover:bg-orange-50">
                <Checkbox
                  checked={enableStockAlert}
                  onChange={(e) => setEnableStockAlert(e.target.checked)}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="ml-3 text-sm font-medium text-orange-800">Włącz alarm niskiego stanu</span>
              </label>
              {enableStockAlert ? (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Próg alarmowy (szt.)</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    density="compact"
                    focusTone="brand"
                    value={minTotalStock === "" ? "" : minTotalStock}
                    onChange={(e) => parseNonNeg(e.target.value, setMinTotalStock)}
                    placeholder="np. 10"
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Kolumna 2 */}
          <div className="space-y-6">
            {!isNew && productId != null && tenantId != null ? (
              <WarehousesColumn productId={productId} tenantId={tenantId} />
            ) : (
              <p className="text-sm text-gray-500">Zapisz produkt, aby zobaczyć stany per magazyn.</p>
            )}
          </div>

          {/* Kolumny 3–4: lokalizacje */}
          <div className="space-y-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Lokalizacje (Inventory)</h3>
              <Link to="/designer" className="flex items-center text-xs font-medium text-blue-600 hover:underline">
                <MapIcon className="mr-1 h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Projektant Magazynu
              </Link>
            </div>

            {!isNew && productId != null && tenantId != null && inventoryRows.length > 0 ? (
              <LocationCapacityTiles productId={productId} tenantId={tenantId} inventoryRows={inventoryRows} />
            ) : (
              <p className="text-sm text-gray-500">{emptyLocationsMessage}</p>
            )}
          </div>
        </div>
      </div>

      {/* SEKCJA 2: Parametry logistyczne */}
      <div>
        <div className="mb-8 border-b border-gray-100 pb-4">
          <h2 className="text-xl font-bold text-gray-900">Parametry logistyczne i pakowanie</h2>
          <p className="mt-1 text-sm text-gray-500">
            Ustawienia wymagane przez zaawansowany silnik magazynowy (3D fit) oraz moduł pakowania przesyłek.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-10 lg:col-span-2">
            {/* Produkt detaliczny */}
            <div>
              <h3 className="mb-5 text-base font-bold text-gray-900">Produkt detaliczny (Sztuka)</h3>
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Wymagana orientacja</label>
                  <Select
                    value={orientationType}
                    onChange={(e) => setOrientationType(e.target.value as "any" | "upright" | "no_stack")}
                    density="comfortable"
                    focusTone="brand"
                    className="bg-white"
                  >
                    <option value="any">Dowolna</option>
                    <option value="upright">Pionowo (strzałki do góry)</option>
                    <option value="no_stack">Bez obracania</option>
                  </Select>
                </div>
                <div>
                  <label className={labelClass}>Kształt</label>
                  <Select
                    value={shapeType}
                    onChange={(e) => setShapeType(e.target.value as "box" | "cylinder")}
                    density="comfortable"
                    focusTone="brand"
                    className="bg-white"
                  >
                    <option value="box">Prostopadłościan (Pudełko)</option>
                    <option value="cylinder">Walec (np. Butelka / Tuba)</option>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Reguły układania (Stacking)</label>
                  <Select
                    value={stackBehavior}
                    onChange={(e) => setStackBehavior(e.target.value as "stackable" | "no_stack")}
                    density="comfortable"
                    focusTone="brand"
                    className="bg-white"
                  >
                    <option value="stackable">Można układać w stos</option>
                    <option value="no_stack">Nie można układać w stos (NO_STACK)</option>
                  </Select>
                  <p className="mt-1.5 text-xs text-gray-400">
                    Wybór &quot;NO_STACK&quot; blokuje układanie sztuki na sztuce, ale pozwala obok siebie.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                <label className="flex cursor-pointer items-center">
                  <Checkbox
                    checked={fragile}
                    onChange={(e) => setFragile(e.target.checked)}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Delikatny (Fragile)</span>
                </label>
                <label className="flex cursor-pointer items-center">
                  <Checkbox
                    checked={stackCompressible}
                    onChange={(e) => setStackCompressible(e.target.checked)}
                    disabled={stackBehavior !== "stackable"}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Kompresowalny (np. odzież)</span>
                </label>
              </div>

              {stackBehavior === "stackable" ? (
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {stackCompressible ? (
                    <div>
                      <label className={labelClass}>Wysokość kolejnej sztuki po ściśnięciu (cm)</label>
                      <Input
                        type="number"
                        min={0.01}
                        step={0.1}
                        density="comfortable"
                        focusTone="brand"
                        value={compressedHeightCm === "" ? "" : compressedHeightCm}
                        onChange={(e) => {
                          const s = String(e.target.value).trim().replace(",", ".");
                          if (s === "") setCompressedHeightCm("");
                          else {
                            const n = parseFloat(s);
                            if (Number.isFinite(n) && n > 0) setCompressedHeightCm(n);
                          }
                        }}
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className={labelClass}>Maks. waga stosu (kg)</label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      density="comfortable"
                      focusTone="brand"
                      value={maxStackWeight === "" ? "" : maxStackWeight}
                      onChange={(e) => parseNonNeg(e.target.value, setMaxStackWeight)}
                      placeholder="Bez limitu"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Maks. sztuk w jednym stosie</label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      density="comfortable"
                      focusTone="brand"
                      value={maxStackCount === "" ? "" : maxStackCount}
                      onChange={(e) => {
                        const s = String(e.target.value).trim();
                        if (s === "") setMaxStackCount("");
                        else {
                          const n = parseInt(s, 10);
                          if (Number.isFinite(n) && n >= 1) setMaxStackCount(n);
                        }
                      }}
                      placeholder="Bez limitu"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {/* Master Carton */}
            <div className="border-t border-gray-100 pt-8">
              <h3 className="mb-5 text-base font-bold text-gray-900">Opakowanie zbiorcze (Master Carton)</h3>
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Wymagana orientacja kartonu</label>
                  <Select
                    value={cartonOrientationType}
                    onChange={(e) => setCartonOrientationType(e.target.value as "any" | "upright" | "no_stack")}
                    density="comfortable"
                    focusTone="brand"
                    className="bg-white"
                  >
                    <option value="any">Dowolna orientacja</option>
                    <option value="upright">Tylko w pionie (strzałki do góry)</option>
                    <option value="no_stack">Nie obracać</option>
                  </Select>
                </div>
                <div>
                  <label className={labelClass}>Kształt opakowania</label>
                  <Select
                    value={cartonShapeType}
                    onChange={(e) => setCartonShapeType(e.target.value as "box" | "cylinder")}
                    density="comfortable"
                    focusTone="brand"
                    className="bg-white"
                  >
                    <option value="box">Prostopadłościan</option>
                    <option value="cylinder">Walec (Beczka)</option>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Reguły układania kartonów</label>
                  <Select
                    value={cartonStackBehavior}
                    onChange={(e) => setCartonStackBehavior(e.target.value as "stackable" | "no_stack")}
                    density="comfortable"
                    focusTone="brand"
                    className="bg-white"
                  >
                    <option value="stackable">Tak, karton na kartonie</option>
                    <option value="no_stack">Nie układać stosów!</option>
                  </Select>
                </div>
                <div>
                  <label className={labelClass}>Maks. obciążenie (kg)</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    density="comfortable"
                    focusTone="brand"
                    value={cartonMaxStackWeight === "" ? "" : cartonMaxStackWeight}
                    onChange={(e) => parseNonNeg(e.target.value, setCartonMaxStackWeight)}
                    placeholder="Bez limitu"
                    disabled={cartonStackBehavior !== "stackable"}
                  />
                </div>
                <div>
                  <label className={labelClass}>Maks. stos kartonów (ilość)</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    density="comfortable"
                    focusTone="brand"
                    value={cartonMaxStackCount === "" ? "" : cartonMaxStackCount}
                    onChange={(e) => {
                      const s = String(e.target.value).trim();
                      if (s === "") setCartonMaxStackCount("");
                      else {
                        const n = parseInt(s, 10);
                        if (Number.isFinite(n) && n >= 1) setCartonMaxStackCount(n);
                      }
                    }}
                    placeholder="Bez limitu"
                    disabled={cartonStackBehavior !== "stackable"}
                  />
                </div>
              </div>
              {cartonStackBehavior === "stackable" ? (
                <div className="mt-4 space-y-4">
                  <label className="flex cursor-pointer items-center">
                    <Checkbox
                      checked={cartonStackCompressible}
                      onChange={(e) => setCartonStackCompressible(e.target.checked)}
                      className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Karton &quot;siada&quot; przy nacisku</span>
                  </label>
                  {cartonStackCompressible ? (
                    <div className="max-w-xs">
                      <label className={labelClass}>Wys. po kompresji (cm)</label>
                      <Input
                        type="number"
                        min={0.01}
                        step={0.1}
                        density="comfortable"
                        focusTone="brand"
                        value={cartonCompressedHeightCm === "" ? "" : cartonCompressedHeightCm}
                        onChange={(e) => {
                          const s = String(e.target.value).trim().replace(",", ".");
                          if (s === "") setCartonCompressedHeightCm("");
                          else {
                            const n = parseFloat(s);
                            if (Number.isFinite(n) && n > 0) setCartonCompressedHeightCm(n);
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Prawa kolumna */}
          <div className="space-y-10 lg:border-l lg:border-gray-100 lg:pl-8">
            <div>
              <h3 className="mb-5 text-base font-bold text-gray-900">Poziomy uzupełniania stref</h3>
              <div className="space-y-5">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Strefa kompletacji (Pick-face)
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Min. ilość (szt.)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        density="compact"
                        focusTone="brand"
                        value={minPickQuantity === "" ? "" : minPickQuantity}
                        onChange={(e) => parseNonNeg(e.target.value, setMinPickQuantity)}
                        placeholder="np. 5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Max. ilość (szt.)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        density="compact"
                        focusTone="brand"
                        value={maxPickQuantity === "" ? "" : maxPickQuantity}
                        onChange={(e) => parseNonNeg(e.target.value, setMaxPickQuantity)}
                        placeholder="np. 50"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Strefa zapasu (Reserve)
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Min. ilość (szt.)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        density="compact"
                        focusTone="brand"
                        value={minReserveQuantity === "" ? "" : minReserveQuantity}
                        onChange={(e) => parseNonNeg(e.target.value, setMinReserveQuantity)}
                        placeholder="np. 12"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Max. ilość (szt.)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        density="compact"
                        focusTone="brand"
                        value={maxReserveQuantity === "" ? "" : maxReserveQuantity}
                        onChange={(e) => parseNonNeg(e.target.value, setMaxReserveQuantity)}
                        placeholder="opcjonalnie"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-8">
              <h3 className="mb-4 text-base font-bold text-gray-900">Dopasowanie wysyłkowe</h3>
              <div className="[&_.rounded-xl]:rounded-lg [&_.shadow-sm]:shadow-none">
                <ProductLogisticsPackagingMatchingSection
                  productId={productId ?? null}
                  tenantId={tenantId}
                  dimensionsComplete={dimensionsComplete}
                  isNew={isNew}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isNew && productId != null && tenantId != null && warehouseId != null ? (
        <ProductStockCorrectionModal
          open={stockCorrectionOpen}
          onClose={() => setStockCorrectionOpen(false)}
          onSuccess={onStockCorrectionSuccess}
          tenantId={tenantId}
          warehouseId={warehouseId}
          productId={productId}
          productName={productName}
          inventoryRows={inventoryRows}
        />
      ) : null}
    </div>
  );
}
