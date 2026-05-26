import { useState, useMemo, useEffect } from "react";
import type { WarehouseProduct, AssignedLocation } from "../../types/warehouse";
import { ProductSearchAutocomplete } from "./ProductSearchAutocomplete";
import { LocationPicker } from "./LocationPicker";
import type { SelectablePosition } from "./warehouseUtils";

export type ProductKey = { name: string; sku: string; ean: string };

export type EditProductModalProps = {
  product: WarehouseProduct | null;
  locationOptions: { value: string; label: string }[];
  /** When provided, show Row/Rack/Level/Position picker and use assignedLocations. */
  positionsForPicker?: SelectablePosition[];
  /** When adding new product, pre-fill location if user had selected a bin on the rack. */
  initialLocationId?: string;
  /** Total volume (dm³) currently in the bin (excluding this product when editing). Used to validate capacity. */
  getBinCapacityDm3: (locationId: string) => number;
  /** Current used volume in bin (dm³) from other products when editing this product's location. */
  getBinUsedVolumeDm3: (locationId: string, excludeProductId?: string) => number;
  /** Max quantity per location (by locationUUID). Optional volume_dm3: then returns floor(freeDm3/volume). */
  getMaxQuantityByUUID?: (locationUUID: string, excludeProductId?: string, volumePerUnitDm3?: number) => number | undefined;
  /** Used volume (dm³) already at location (by UUID), excluding current product. For volume overflow highlight in LocationPicker. */
  getUsedVolumeDm3ByUUID?: (locationUUID: string) => number;
  /** Max quantity that can be assigned (free stock). When editing, modal allows up to this + current product quantity. */
  getAvailableQuantity?: (key: ProductKey, excludeProductId?: string) => number | undefined;
  onSave: (p: Omit<WarehouseProduct, "id"> & { id?: string }) => void;
  onClose: () => void;
};

export function EditProductModal({
  product,
  locationOptions,
  positionsForPicker = [],
  initialLocationId,
  getBinCapacityDm3,
  getBinUsedVolumeDm3,
  getMaxQuantityByUUID,
  getUsedVolumeDm3ByUUID,
  getAvailableQuantity,
  onSave,
  onClose,
}: EditProductModalProps) {
  const isNew = product == null;
  const usePicker = positionsForPicker.length > 0;

  const initialAssigned: AssignedLocation[] = useMemo(() => {
    if (product?.assignedLocations?.length) return product.assignedLocations;
    if (product?.location_id && (product?.quantity ?? 0) > 0)
      return [{ locationUUID: product.location_id, quantity: product.quantity }];
    return [];
  }, [product?.assignedLocations, product?.location_id, product?.quantity]);

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [ean, setEan] = useState(product?.ean ?? "");
  const [quantity, setQuantity] = useState(product?.quantity ?? 0);
  const round2 = (v: number) => Math.round(Math.max(0, v) * 100) / 100;
  const [volume_dm3, setVolumeDm3] = useState(round2(product?.volume_dm3 ?? 0));
  const [location_id, setLocationId] = useState<string>(product?.location_id ?? initialLocationId ?? "");
  const [assignedLocations, setAssignedLocations] = useState<AssignedLocation[]>(initialAssigned);
  const [image_url, setImageUrl] = useState<string>(product?.image_url ?? "");
  const [locationSearch, setLocationSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setAssignedLocations(initialAssigned);
  }, [product?.id, product?.assignedLocations, product?.location_id, product?.quantity]);

  useEffect(() => {
    if (isNew && initialLocationId && !usePicker) {
      setLocationId(initialLocationId);
    }
  }, [isNew, initialLocationId, usePicker]);

  useEffect(() => {
    if (product != null) {
      setImageUrl(product.image_url ?? "");
    }
  }, [product?.id, product?.image_url]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const totalFromLocations = useMemo(
    () => assignedLocations.reduce((s, a) => s + a.quantity, 0),
    [assignedLocations]
  );
  const filteredLocations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return locationOptions;
    return locationOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [locationOptions, locationSearch]);

  const selectedLocationId = usePicker ? null : (location_id || null);
  const volumeIfAssigned = selectedLocationId
    ? quantity * volume_dm3
    : usePicker
      ? totalFromLocations * volume_dm3
      : 0;
  const otherUsed = selectedLocationId
    ? getBinUsedVolumeDm3(selectedLocationId, product?.id)
    : 0;
  const capacity = selectedLocationId
    ? getBinCapacityDm3(selectedLocationId)
    : 0;
  const totalWouldBe = otherUsed + volumeIfAssigned;
  const capacityExceeded = selectedLocationId && capacity > 0 && totalWouldBe > capacity;

  const productKey: ProductKey = useMemo(
    () => ({ name: name.trim(), sku: sku.trim(), ean: ean.trim() }),
    [name, sku, ean]
  );
  const availableFree = getAvailableQuantity?.(productKey, product?.id) ?? undefined;
  const maxAllowedQuantity =
    availableFree !== undefined ? availableFree + (product?.quantity ?? 0) : undefined;
  const quantityExceedsAvailable =
    !usePicker && maxAllowedQuantity !== undefined && quantity > maxAllowedQuantity;
  const stockValidationBlocked = quantityExceedsAvailable;

  const getMaxQuantity = useMemo(
    () =>
      getMaxQuantityByUUID && volume_dm3 > 0
        ? (uuid: string) => getMaxQuantityByUUID(uuid, product?.id, volume_dm3)
        : undefined,
    [getMaxQuantityByUUID, product?.id, volume_dm3]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (capacityExceeded || stockValidationBlocked) return;
    setSaving(true);
    setClosing(true);
    const firstAddress =
      usePicker && assignedLocations.length > 0
        ? positionsForPicker.find((p) => p.locationUUID === assignedLocations[0].locationUUID)?.locationAddress ?? null
        : selectedLocationId;
    onSave({
      id: product?.id,
      name: name.trim(),
      sku: sku.trim(),
      ean: ean.trim(),
      quantity: usePicker ? totalFromLocations : Math.max(0, Number(quantity)),
      volume_dm3: round2(Number(volume_dm3)),
      location_id: firstAddress || null,
      assignedLocations: usePicker ? assignedLocations : undefined,
      image_url: image_url.trim() || undefined,
    });
  };

  const delayedClose = () => {
    setClosing(true);
    setTimeout(() => {
      onClose();
    }, 120);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={delayedClose}
      style={{
        pointerEvents: closing ? "none" : "auto",
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-800 px-6 py-4 border-b border-slate-100 shrink-0">
          {isNew ? "Dodaj nowy produkt" : "Edytuj produkt"}
        </h3>
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nazwa produktu</label>
              {isNew ? (
                <ProductSearchAutocomplete
                  value={name}
                  onChange={setName}
                  onSelectProduct={(p) => {
                    setName(p.name);
                    setSku(p.sku);
                    setEan(p.ean);
                    setVolumeDm3(round2(p.volume_dm3));
                    if (p.image_url != null) setImageUrl(p.image_url);
                  }}
                  placeholder="Wpisz nazwę lub wybierz z bazy..."
                  required
                />
              ) : (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  required
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">SKU / EAN</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU lub EAN"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">EAN (opcjonalnie)</label>
              <input
                type="text"
                value={ean}
                onChange={(e) => setEan(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            {!usePicker && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ilość (szt.)</label>
                {maxAllowedQuantity !== undefined && (
                  <p className="text-xs text-slate-500 mb-1">
                    Dostępna ilość do przypisania: <span className="font-semibold text-slate-700">{availableFree} szt.</span>
                  </p>
                )}
                <input
                  type="number"
                  min={0}
                  max={maxAllowedQuantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                  className={`w-full rounded-lg border px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 ${
                    quantityExceedsAvailable ? "border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500" : "border-slate-200"
                  }`}
                />
                {quantityExceedsAvailable && maxAllowedQuantity !== undefined && (
                  <p className="mt-1 text-sm text-red-600">
                    Nie możesz przypisać więcej niż {maxAllowedQuantity} szt.
                  </p>
                )}
              </div>
            )}
            {usePicker && (
              <div className="text-xs text-slate-500">
                Suma ilości we wszystkich lokalizacjach: <span className="font-semibold text-slate-700">{totalFromLocations} szt.</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">URL zdjęcia (opcjonalnie)</label>
              <input
                type="url"
                value={image_url}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Objętość jednostkowa (dm³)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={volume_dm3}
                onChange={(e) => {
                  const raw = e.target.value === "" ? 0 : Number(e.target.value);
                  setVolumeDm3(round2(raw));
                }}
                onBlur={(e) => {
                  const v = e.target.value === "" ? 0 : Number(e.target.value);
                  setVolumeDm3(round2(v));
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            {usePicker ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lokalizacje (Rząd → Regał → Poziom → Pozycja)</label>
                <LocationPicker
                  positions={positionsForPicker}
                  value={assignedLocations}
                  onChange={setAssignedLocations}
                  getMaxQuantity={getMaxQuantity}
                  productVolumeDm3={volume_dm3 > 0 ? volume_dm3 : undefined}
                  getUsedVolumeDm3={getUsedVolumeDm3ByUUID}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Przypisz lokalizację</label>
                <input
                  type="text"
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder="Szukaj (np. A.1-1-A)..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 mb-2"
                />
                <select
                  value={location_id}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white"
                >
                  <option value="">— Nie przypisano —</option>
                  {filteredLocations.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {capacityExceeded && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                Przekroczono pojemność lokalizacji! (łącznie {totalWouldBe.toFixed(1)} dm³, pojemność {capacity.toFixed(1)} dm³)
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0">
            <button
              type="button"
              onClick={delayedClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || capacityExceeded || stockValidationBlocked}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 active:scale-100 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isNew ? "Dodaj" : "Zapisz"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
