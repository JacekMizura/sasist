import { useState, useEffect, useCallback } from "react";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import type { AssignedLocation } from "../../types/warehouse";
import { LocationPicker } from "../../components/warehouse/LocationPicker";
import { getPositionsFromLayoutRacks, positionFitsDimensions } from "../../components/warehouse/warehouseUtils";
import type { SelectablePosition } from "../../components/warehouse/warehouseUtils";

export type ProductForm = {
  id?: number;
  name: string;
  ean: string;
  symbol: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  volume?: number;
  image_url?: string;
  assignedLocations?: AssignedLocation[];
};

type ProductEditModalProps = {
  product: ProductForm | null;
  onSave: (p: ProductForm) => void;
  onClose: () => void;
};

export function ProductEditModal({ product, onSave, onClose }: ProductEditModalProps) {
  const isNew = product == null;
  const { warehouse } = useWarehouse();
  const [positions, setPositions] = useState<SelectablePosition[]>([]);
  const [layoutLoading, setLayoutLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(product?.name ?? "");
  const [ean, setEan] = useState(product?.ean ?? "");
  const [symbol, setSymbol] = useState(product?.symbol ?? "");
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const [length, setLength] = useState<number | "">(product?.length ?? "");
  const [width, setWidth] = useState<number | "">(product?.width ?? "");
  const [height, setHeight] = useState<number | "">(product?.height ?? "");
  const [weight, setWeight] = useState<number | "">(product?.weight ?? "");
  const [volume, setVolume] = useState<number | "">(product?.volume ?? "");

  /** Parse string/number to number; allow comma as decimal separator. */
  const parseDecimal = useCallback((s: string | number | undefined | null): number | undefined => {
    if (s === "" || s === undefined || s === null) return undefined;
    const str = String(s).trim().replace(",", ".");
    if (str === "") return undefined;
    const n = parseFloat(str);
    return Number.isFinite(n) ? n : undefined;
  }, []);

  const updateDimension = useCallback(
    (which: "length" | "width" | "height", raw: string) => {
      const normalized = raw.trim().replace(",", ".");
      const num = normalized === "" ? "" : parseDecimal(normalized);
      const val = num === undefined ? "" : num;
      if (which === "length") setLength(val);
      if (which === "width") setWidth(val);
      if (which === "height") setHeight(val);
      const l = which === "length" ? val : length;
      const w = which === "width" ? val : width;
      const h = which === "height" ? val : height;
      if (l !== "" && w !== "" && h !== "" && typeof l === "number" && typeof w === "number" && typeof h === "number") {
        setVolume(round2((l * w * h) / 1000));
      }
    },
    [length, width, height, parseDecimal]
  );
  const [image_url, setImageUrl] = useState(product?.image_url ?? "");
  const [assignedLocations, setAssignedLocations] = useState<AssignedLocation[]>(
    product?.assignedLocations ?? []
  );

  const productDimensions =
    typeof length === "number" && typeof width === "number" && typeof height === "number" &&
    length > 0 && width > 0 && height > 0
      ? { depthCm: length, widthCm: width, heightCm: height }
      : undefined;
  const productVolumeDm3 = typeof volume === "number" && volume > 0 ? volume : undefined;

  const hasDimensionMismatch =
    productDimensions &&
    assignedLocations.some((a) => {
      const pos = positions.find((p) => p.locationUUID === a.locationUUID);
      return pos != null && !positionFitsDimensions(pos, productDimensions);
    });
  const hasVolumeOverflow =
    productVolumeDm3 != null &&
    assignedLocations.some((a) => {
      const pos = positions.find((p) => p.locationUUID === a.locationUUID);
      const capacity = pos?.capacityDm3;
      if (capacity == null) return false;
      return a.quantity * productVolumeDm3 > capacity;
    });

  useEffect(() => {
    if (product != null) {
      setName(product.name ?? "");
      setEan(product.ean ?? "");
      setSymbol(product.symbol ?? "");
      setLength(product.length ?? "");
      setWidth(product.width ?? "");
      setHeight(product.height ?? "");
      setWeight(product.weight ?? "");
      setVolume(product.volume ?? "");
      setImageUrl(product.image_url ?? "");
      setAssignedLocations(product.assignedLocations ?? []);
    }
  }, [product?.id]);

  const fetchLayout = useCallback(async () => {
    if (!warehouse?.id) {
      setPositions([]);
      setLayoutLoading(false);
      return;
    }
    setLayoutLoading(true);
    try {
      const res = await api.get("/warehouse/layout", {
        params: { tenant_id: 1, warehouse_id: warehouse.id },
      });
      const rawRacks = res.data?.racks ?? [];
      setPositions(getPositionsFromLayoutRacks(rawRacks));
    } catch {
      setPositions([]);
    } finally {
      setLayoutLoading(false);
    }
  }, [warehouse?.id]);

  useEffect(() => {
    fetchLayout();
  }, [fetchLayout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tenantId = 1;
    try {
      const enriched = assignedLocations.length > 0
        ? assignedLocations.map((a) => {
            const pos = positions.find((p) => p.locationUUID === a.locationUUID);
            return {
              locationUUID: a.locationUUID,
              quantity: a.quantity,
              locationAddress: pos?.locationAddress ?? (a as AssignedLocation & { locationAddress?: string }).locationAddress ?? a.locationUUID,
              storageType: pos?.storageType ?? (a as AssignedLocation & { storageType?: "primary" | "reserve" }).storageType,
            };
          })
        : undefined;
      const len = parseDecimal(length);
      const wid = parseDecimal(width);
      const hei = parseDecimal(height);
      const wgt = parseDecimal(weight);
      const vol = parseDecimal(volume);
      const payload: ProductForm = {
        name: name.trim(),
        ean: ean.trim(),
        symbol: symbol.trim(),
        length: len != null ? round2(len) : undefined,
        width: wid != null ? round2(wid) : undefined,
        height: hei != null ? round2(hei) : undefined,
        weight: wgt != null ? round3(wgt) : undefined,
        volume: vol != null ? round2(vol) : undefined,
        image_url: image_url.trim() || undefined,
        assignedLocations: enriched,
      };
      const body = {
        name: payload.name,
        ean: payload.ean ?? "",
        symbol: payload.symbol ?? "",
        length: payload.length,
        width: payload.width,
        height: payload.height,
        weight: payload.weight,
        volume: payload.volume,
        image_url: payload.image_url,
        tenant_id: tenantId,
        assigned_locations: enriched ?? assignedLocations,
      };
      if (isNew) {
        const res = await api.post("/products/", body, { params: { tenant_id: tenantId } });
        onSave({ ...payload, id: res.data?.id ?? undefined });
      } else {
        const productId = Number(product!.id);
        if (!Number.isInteger(productId) || productId < 1) {
          alert("Błąd: nieprawidłowy ID produktu.");
          return;
        }
        await api.put(`/products/${productId}/`, body, { params: { tenant_id: tenantId } });
        onSave({ ...payload, id: product!.id });
      }
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { status?: number; data?: unknown } }).response?.data
          : null;
      const status = err && typeof err === "object" && "response" in err
        ? (err as { response?: { status?: number } }).response?.status
        : null;
      const message = typeof msg === "string" ? msg : (msg && typeof msg === "object" && "detail" in msg ? String((msg as { detail: unknown }).detail) : null) || (msg ? JSON.stringify(msg) : null) || (err instanceof Error ? err.message : "Nie udało się zapisać produktu.");
      alert(status === 404 ? "Nie znaleziono produktu (404). Sprawdź, czy endpoint PUT /products/{id}/ jest dostępny." : `Błąd zapisu: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-800 px-6 py-4 border-b border-slate-100 shrink-0">
          {isNew ? "Dodaj produkt" : "Edytuj produkt"}
        </h3>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col min-h-0 flex-1 overflow-hidden [&_input[type=number]]:appearance-[textfield] [&_input[type=number]]:[&::-webkit-outer-spin-button]:appearance-none [&_input[type=number]]:[&::-webkit-inner-spin-button]:appearance-none"
        >
          <div className="p-6 space-y-4 overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nazwa</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">EAN</label>
                <input
                  type="text"
                  value={ean}
                  onChange={(e) => setEan(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Symbol / SKU</label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-slate-600 mb-0.5">D (cm)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={length === "" ? "" : length}
                  onChange={(e) => updateDimension("length", e.target.value)}
                  className="product-edit-numeric w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-0.5">S (cm)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={width === "" ? "" : width}
                  onChange={(e) => updateDimension("width", e.target.value)}
                  className="product-edit-numeric w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-0.5">W (cm)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={height === "" ? "" : height}
                  onChange={(e) => updateDimension("height", e.target.value)}
                  className="product-edit-numeric w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Waga (kg)</label>
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  value={weight === "" ? "" : weight}
                  onChange={(e) => {
                    const s = String(e.target.value).trim().replace(",", ".");
                    if (s === "") setWeight("");
                    else {
                      const n = parseFloat(s);
                      if (Number.isFinite(n)) setWeight(n);
                    }
                  }}
                  className="product-edit-numeric w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Objętość (dm³)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={volume === "" ? "" : volume}
                  onChange={(e) => {
                    const s = String(e.target.value).trim().replace(",", ".");
                    if (s === "") setVolume("");
                    else {
                      const n = parseFloat(s);
                      if (Number.isFinite(n)) setVolume(n);
                    }
                  }}
                  className={`product-edit-numeric w-full rounded-lg border px-3 py-2 text-slate-800 focus:ring-2 ${
                    hasVolumeOverflow ? "border-red-500 bg-red-50 focus:ring-red-500" : "border-slate-200 focus:ring-cyan-500"
                  }`}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">URL zdjęcia</label>
              <input
                type="url"
                value={image_url}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lokalizacje magazynowe</label>
              {layoutLoading ? (
                <p className="text-sm text-slate-500">Ładowanie planu magazynu…</p>
              ) : positions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {warehouse?.id ? "Brak regałów w planie lub błąd ładowania." : "Wybierz magazyn w górnym pasku."}
                </p>
              ) : (
                <>
                  <LocationPicker
                    positions={positions}
                    value={assignedLocations}
                    onChange={setAssignedLocations}
                    productDimensions={productDimensions}
                    productVolumeDm3={productVolumeDm3}
                  />
                  {hasDimensionMismatch && (
                    <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Uwaga: Produkt nie mieści się w wymiarach co najmniej jednej wybranej lokalizacji (wysokość/szerokość/głębokość przekracza prześwit półki).
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {saving ? "Zapisywanie…" : isNew ? "Dodaj" : "Zapisz"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
