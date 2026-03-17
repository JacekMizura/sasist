import { useState, useEffect, useCallback } from "react";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import type { AssignedLocation } from "../../types/warehouse";
import { LocationPicker } from "../../components/warehouse/LocationPicker";
import { getPositionsFromLayoutRacks, positionFitsDimensions } from "../../components/warehouse/warehouseUtils";
import type { SelectablePosition } from "../../components/warehouse/warehouseUtils";

export type ProductForm = {
  id?: number;
  tenant_id?: number;
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
  label_template_id?: number | null;
  purchase_price?: number | null;
  manufacturer?: string | null;
  unit?: string | null;
  stock_quantity?: number;
  orientation_type?: "any" | "upright" | "no_stack";
  shape_type?: "box" | "cylinder";
  stack_compressible?: boolean;
  compressed_height_cm?: number | null;
  max_stack_weight?: number | null;
  stack_behavior?: "stackable" | "no_stack";
};

type Tenant = { id: number; name: string };

type ProductEditModalProps = {
  product: ProductForm | null;
  tenants: Tenant[];
  onSave: (p: ProductForm) => void;
  onClose: () => void;
};

export function ProductEditModal({ product, tenants, onSave, onClose }: ProductEditModalProps) {
  const isNew = product == null;
  const { warehouse } = useWarehouse();
  const [positions, setPositions] = useState<SelectablePosition[]>([]);
  const [layoutLoading, setLayoutLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tenantId, setTenantId] = useState<number | null>(product?.tenant_id ?? null);
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

  /** Normalize numeric input for API: comma → dot, return number or null. Ensures backend receives numbers, not strings. */
  const parseNumber = useCallback((value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const s = String(value).trim().replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
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
  const [labelTemplateId, setLabelTemplateId] = useState<number | null>(
    product?.label_template_id ?? null
  );
  const [purchasePrice, setPurchasePrice] = useState<number | "">(product?.purchase_price ?? "");
  const [manufacturer, setManufacturer] = useState(product?.manufacturer ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [stockQuantity, setStockQuantity] = useState<number | "">(product?.stock_quantity ?? "");
  const [orientationType, setOrientationType] = useState<"any" | "upright" | "no_stack">(
    product?.orientation_type ?? "any"
  );
  const [shapeType, setShapeType] = useState<"box" | "cylinder">(product?.shape_type ?? "box");
  const [stackBehavior, setStackBehavior] = useState<"stackable" | "no_stack">(product?.stack_behavior ?? "stackable");
  const [stackCompressible, setStackCompressible] = useState<boolean>(product?.stack_compressible ?? false);
  const [compressedHeightCm, setCompressedHeightCm] = useState<number | "">(
    product?.compressed_height_cm != null && product.compressed_height_cm > 0 ? product.compressed_height_cm : ""
  );
  const [maxStackWeight, setMaxStackWeight] = useState<number | "">(
    product?.max_stack_weight != null && product.max_stack_weight > 0 ? product.max_stack_weight : ""
  );
  const [productTemplates, setProductTemplates] = useState<{ id: number; name: string }[]>([]);
  const [templatePreviewSvg, setTemplatePreviewSvg] = useState<string | null>(null);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);

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
      setTenantId(product.tenant_id ?? null);
      setName(product.name ?? "");
      setEan(product.ean ?? "");
      setSymbol(product.symbol ?? "");
      setLength(product.length ?? "");
      setWidth(product.width ?? "");
      setHeight(product.height ?? "");
      setWeight(product.weight ?? "");
      setVolume(product.volume != null ? round2(Number(product.volume)) : "");
      setImageUrl(product.image_url ?? "");
      setAssignedLocations(product.assignedLocations ?? []);
      setLabelTemplateId(product.label_template_id ?? null);
      setPurchasePrice(product.purchase_price ?? "");
      setManufacturer(product.manufacturer ?? "");
      setUnit(product.unit ?? "");
      setStockQuantity(product.stock_quantity ?? "");
      setOrientationType(product.orientation_type ?? "any");
      setShapeType(product.shape_type ?? "box");
      setStackBehavior(["stackable", "no_stack"].includes(String(product.stack_behavior)) ? product.stack_behavior : "stackable");
      setStackCompressible(product.stack_compressible ?? false);
      setCompressedHeightCm(product.compressed_height_cm != null && product.compressed_height_cm > 0 ? product.compressed_height_cm : "");
      setMaxStackWeight(product.max_stack_weight != null && product.max_stack_weight > 0 ? product.max_stack_weight : "");
    }
  }, [product?.id]);

  useEffect(() => {
    api
      .get<{ id: number; name: string }[]>("/labels/templates/by-type/product", {
        params: { tenant_id: 1 },
      })
      .then((res) => setProductTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProductTemplates([]));
  }, []);

  useEffect(() => {
    if (labelTemplateId == null) {
      setTemplatePreviewSvg(null);
      setTemplatePreviewLoading(false);
      return;
    }
    setTemplatePreviewLoading(true);
    setTemplatePreviewSvg(null);
    api
      .get<{ svg: string }>(`/label-templates/${labelTemplateId}/preview`, { params: { tenant_id: 1 } })
      .then((res) => setTemplatePreviewSvg(res.data?.svg ?? null))
      .catch(() => setTemplatePreviewSvg(null))
      .finally(() => setTemplatePreviewLoading(false));
  }, [labelTemplateId]);

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
    if (isNew && (tenantId == null || tenantId < 1)) {
      alert("Wybierz tenant przy tworzeniu produktu.");
      return;
    }
    setSaving(true);
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
      const purchasePriceVal = purchasePrice === "" ? undefined : (typeof purchasePrice === "number" ? purchasePrice : parseDecimal(String(purchasePrice)));
      const stockQtyVal = stockQuantity === "" ? undefined : (typeof stockQuantity === "number" ? stockQuantity : (Number.isInteger(Number(stockQuantity)) ? Number(stockQuantity) : undefined));
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
        label_template_id: labelTemplateId ?? undefined,
        purchase_price: purchasePriceVal,
        manufacturer: manufacturer.trim() || undefined,
        unit: unit.trim() || undefined,
        stock_quantity: stockQtyVal,
        orientation_type: orientationType,
        shape_type: shapeType,
        stack_compressible: stackCompressible,
        compressed_height_cm: compressedHeightCm === "" ? undefined : (typeof compressedHeightCm === "number" ? compressedHeightCm : parseDecimal(String(compressedHeightCm)) ?? undefined),
        max_stack_weight: maxStackWeight === "" ? undefined : (typeof maxStackWeight === "number" ? maxStackWeight : parseDecimal(String(maxStackWeight)) ?? undefined),
        stack_behavior: stackBehavior,
      };
      // Backend expects metric fields only (no legacy length/width/height/weight/volume).
      const body: Record<string, unknown> = {
        name: payload.name,
        ean: payload.ean ?? "",
        symbol: payload.symbol ?? "",
        length_cm: parseNumber(length) ?? undefined,
        width_cm: parseNumber(width) ?? undefined,
        height_cm: parseNumber(height) ?? undefined,
        weight_kg: parseNumber(weight) ?? undefined,
        volume_dm3: parseNumber(volume) ?? undefined,
        image_url: payload.image_url,
        tenant_id: tenantId,
        assigned_locations: enriched ?? assignedLocations,
        label_template_id: labelTemplateId ?? undefined,
        purchase_price: parseNumber(purchasePrice) ?? undefined,
        manufacturer: payload.manufacturer ?? null,
        unit: payload.unit ?? null,
        orientation_type: orientationType,
        shape_type: shapeType,
        stack_compressible: stackCompressible,
        compressed_height_cm: compressedHeightCm === "" ? undefined : (parseNumber(compressedHeightCm) ?? undefined),
        max_stack_weight: maxStackWeight === "" ? undefined : (parseNumber(maxStackWeight) ?? undefined),
        stack_behavior: stackBehavior,
      };
      if (stockQtyVal !== undefined) body.stock_quantity = stockQtyVal;
      console.log("Payload:", payload);
      if (isNew) {
        const res = await api.post("/products/", body, { params: { tenant_id: tenantId } });
        onSave({ ...payload, id: res.data?.id ?? undefined });
      } else {
        const productId = Number(product!.id);
        if (!Number.isInteger(productId) || productId < 1) {
          alert("Błąd: nieprawidłowy ID produktu.");
          return;
        }
        const res = await api.put(`/products/${productId}/`, body, { params: { tenant_id: tenantId } });
        onSave({ ...payload, id: product!.id, stock_quantity: res.data?.stock_quantity ?? payload.stock_quantity });
      }
      onClose();
    } catch (err: unknown) {
      console.error("Product save failed:", err);
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
          <div className="p-6 overflow-y-auto space-y-6">
            {/* Tenant */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5">Tenant</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tenant</label>
                <select
                  value={tenantId ?? ""}
                  onChange={(e) => setTenantId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                  required={isNew}
                >
                  <option value="">— Select tenant —</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {isNew && (
                  <p className="text-xs text-slate-500 mt-1">Przy tworzeniu produktu tenant jest wymagany.</p>
                )}
              </div>
            </section>
            {/* SECTION 1 — Dane produktu */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5">Dane produktu</h3>
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">URL zdjęcia</label>
                <input
                  type="url"
                  value={image_url}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </section>

            {/* SECTION — Dane handlowe */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5">Dane handlowe</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cena zakupu</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={purchasePrice === "" ? "" : purchasePrice}
                    onChange={(e) => {
                      const s = String(e.target.value).trim().replace(",", ".");
                      if (s === "") setPurchasePrice("");
                      else {
                        const n = parseFloat(s);
                        if (Number.isFinite(n)) setPurchasePrice(n);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Producent</label>
                  <input
                    type="text"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Jednostka</label>
                  <input
                    type="text"
                    list="unit-list"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="np. szt., opak., kg"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                  />
                  <datalist id="unit-list">
                    <option value="szt." />
                    <option value="opak." />
                    <option value="para" />
                    <option value="kg" />
                    <option value="m" />
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stan magazynowy</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={stockQuantity === "" ? "" : stockQuantity}
                    onChange={(e) => {
                      const s = String(e.target.value).trim();
                      if (s === "") setStockQuantity("");
                      else {
                        const n = parseInt(s, 10);
                        if (Number.isInteger(n) && n >= 0) setStockQuantity(n);
                      }
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>
            </section>

            {/* SECTION 2 — Wymiary i waga */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5">Wymiary i waga</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-0.5">Długość (cm)</label>
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
                  <label className="block text-xs text-slate-600 mb-0.5">Szerokość (cm)</label>
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
                  <label className="block text-xs text-slate-600 mb-0.5">Wysokość (cm)</label>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Orientacja produktu</label>
                  <select
                    value={orientationType}
                    onChange={(e) => setOrientationType(e.target.value as "any" | "upright" | "no_stack")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="any">Dowolna</option>
                    <option value="upright">Tylko pionowo</option>
                    <option value="no_stack">Nie układać w stos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kształt produktu</label>
                  <select
                    value={shapeType}
                    onChange={(e) => setShapeType(e.target.value as "box" | "cylinder")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="box">Prostopadłościan</option>
                    <option value="cylinder">Walec (butelka)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-700">Układanie w stos</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Układanie w stos</label>
                  <select
                    value={stackBehavior}
                    onChange={(e) => setStackBehavior(e.target.value as "stackable" | "no_stack")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="stackable">Dozwolone</option>
                    <option value="no_stack">Niedozwolone</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stackCompressible}
                    onChange={(e) => setStackCompressible(e.target.checked)}
                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="text-sm text-slate-700">Kompresja przy układaniu w stos</span>
                </label>
                {stackCompressible && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Wysokość po kompresji (cm)</label>
                    <input
                      type="number"
                      min={0.01}
                      step={0.1}
                      value={compressedHeightCm === "" ? "" : compressedHeightCm}
                      onChange={(e) => {
                        const s = String(e.target.value).trim().replace(",", ".");
                        if (s === "") setCompressedHeightCm("");
                        else {
                          const n = parseFloat(s);
                          if (Number.isFinite(n) && n > 0) setCompressedHeightCm(n);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Maksymalna waga stosu (kg)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={maxStackWeight === "" ? "" : maxStackWeight}
                    onChange={(e) => {
                      const s = String(e.target.value).trim().replace(",", ".");
                      if (s === "") setMaxStackWeight("");
                      else {
                        const n = parseFloat(s);
                        if (Number.isFinite(n) && n >= 0) setMaxStackWeight(n);
                      }
                    }}
                    placeholder="Opcjonalnie"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-cyan-500"
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
                    readOnly
                    value={volume === "" ? "" : (typeof volume === "number" ? round2(volume) : volume)}
                    className={`product-edit-numeric w-full rounded-lg border px-3 py-2 text-slate-700 bg-slate-50 cursor-not-allowed ${
                      hasVolumeOverflow ? "border-red-500 bg-red-50" : "border-slate-200"
                    }`}
                    aria-label="Obliczana z wymiarów"
                  />
                </div>
              </div>
            </section>

            {/* SECTION 3 — Etykiety */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5">Etykiety</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Szablon etykiety</label>
                <select
                  value={labelTemplateId ?? ""}
                  onChange={(e) => setLabelTemplateId(e.target.value === "" ? null : Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Brak</option>
                  {productTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-0.5">Używany przy generowaniu etykiet produktu.</p>
                {labelTemplateId != null && (
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    {productTemplates.find((t) => t.id === labelTemplateId)?.name ?? ""}
                  </p>
                )}
                <div className="mt-2">
                  <p className="text-xs font-medium text-slate-600 mb-1">Podgląd</p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 min-h-[80px] flex items-center justify-center p-3">
                    {templatePreviewLoading ? (
                      <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
                    ) : templatePreviewSvg ? (
                      <div
                        className="max-w-full max-h-40 overflow-auto [&_svg]:max-h-40 [&_svg]:w-auto [&_svg]:h-auto"
                        dangerouslySetInnerHTML={{ __html: templatePreviewSvg }}
                      />
                    ) : (
                      <p className="text-sm text-slate-500">Brak podglądu szablonu</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 4 — Lokalizacje magazynowe */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5">Lokalizacje magazynowe</h3>
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
            </section>
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
