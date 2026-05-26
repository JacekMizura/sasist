import { useState, useMemo } from "react";
import type { AssignedLocation } from "../../types/warehouse";
import type { SelectablePosition, ProductDimensionsCm } from "./warehouseUtils";
import { positionFitsDimensions } from "./warehouseUtils";
import { normalizeStorageType } from "../../utils/storageTypes";
import { LocationTypeBadge } from "./LocationTypeBadge";

export type LocationPickerProps = {
  /** All positions from warehouse layout (e.g. getAllPositionsFromRacks). `locationAddress` is the full display line from `getDisplayLocationLabel`. */
  positions: SelectablePosition[];
  value: AssignedLocation[];
  onChange: (next: AssignedLocation[]) => void;
  /** Optional: max quantity per location (e.g. from capacity). */
  getMaxQuantity?: (locationUUID: string) => number | undefined;
  /** Product dimensions (cm) for fit-check: gray out locations that are too small. */
  productDimensions?: ProductDimensionsCm;
  /** Product volume per unit (dm³) for volume overflow warning on assigned locations. */
  productVolumeDm3?: number;
  /** Used volume (dm³) already in location (from other products). When not provided, only current product volume is checked. */
  getUsedVolumeDm3?: (locationUUID: string) => number;
  disabled?: boolean;
};

export function LocationPicker({
  positions,
  value,
  onChange,
  getMaxQuantity,
  productDimensions,
  productVolumeDm3,
  getUsedVolumeDm3,
  disabled,
}: LocationPickerProps) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addQty, setAddQty] = useState("1");
  const [editingLocationUUID, setEditingLocationUUID] = useState<string | null>(null);
  const [editQtyInput, setEditQtyInput] = useState("");

  const positionFits = useMemo(() => {
    if (!productDimensions) return () => true;
    const dims = productDimensions;
    return (p: SelectablePosition) => positionFitsDimensions(p, dims);
  }, [productDimensions]);

  const assignedVolumeOverflow = useMemo(() => {
    const over = new Set<string>();
    if (productVolumeDm3 == null || productVolumeDm3 <= 0) return over;
    for (const a of value) {
      const pos = positions.find((p) => p.locationUUID === a.locationUUID);
      const capacity = pos?.capacityDm3;
      if (capacity == null) continue;
      const used = getUsedVolumeDm3?.(a.locationUUID) ?? 0;
      const required = a.quantity * productVolumeDm3;
      if (required > capacity - used) over.add(a.locationUUID);
    }
    return over;
  }, [value, positions, productVolumeDm3, getUsedVolumeDm3]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter(
      (p) =>
        p.locationAddress.toLowerCase().includes(q) ||
        p.locationUUID.toLowerCase().includes(q) ||
        p.rowLabel.toLowerCase().includes(q)
    );
  }, [positions, search]);

  const assignedSet = useMemo(() => new Set(value.map((a) => a.locationUUID)), [value]);
  const availableToAdd = filtered.filter((p) => !assignedSet.has(p.locationUUID));

  const addLocation = (locationUUID: string) => {
    const qty = Math.max(0, Math.floor(Number(addQty) || 0));
    const max = getMaxQuantity?.(locationUUID);
    const finalQty = max != null ? Math.min(qty, max) : qty;
    if (finalQty <= 0) return;
    const pos = positions.find((p) => p.locationUUID === locationUUID);
    onChange([...value, { locationUUID, quantity: finalQty, storageType: pos?.storageType }]);
    setAddQty("1");
  };

  const removeLocation = (locationUUID: string) => {
    onChange(value.filter((a) => a.locationUUID !== locationUUID));
  };

  const updateQuantity = (locationUUID: string, quantity: number) => {
    const max = getMaxQuantity?.(locationUUID);
    const finalQty = max != null ? Math.min(Math.max(0, quantity), max) : Math.max(0, quantity);
    onChange(
      value.map((a) => (a.locationUUID === locationUUID ? { ...a, quantity: finalQty } : a))
    );
  };

  const startEditQty = (a: AssignedLocation) => {
    setEditingLocationUUID(a.locationUUID);
    setEditQtyInput(String(a.quantity));
  };

  const saveEditQty = () => {
    if (editingLocationUUID == null) return;
    const qty = Math.floor(Number(editQtyInput) || 0);
    updateQuantity(editingLocationUUID, qty);
    setEditingLocationUUID(null);
    setEditQtyInput("");
  };

  const cancelEditQty = () => {
    setEditingLocationUUID(null);
    setEditQtyInput("");
  };

  const getAddress = (uuid: string) =>
    positions.find((p) => p.locationUUID === uuid)?.locationAddress ?? uuid;

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-slate-700">Przypisane lokalizacje</div>
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a) => {
            const pos = positions.find((p) => p.locationUUID === a.locationUUID);
            const fitsDims = !pos || positionFits(pos);
            const volumeOver = assignedVolumeOverflow.has(a.locationUUID);
            const storageType = normalizeStorageType(a.storageType ?? pos?.storageType);
            const address = getAddress(a.locationUUID);
            const isEditing = editingLocationUUID === a.locationUUID;
            return (
            <li key={a.locationUUID} className="flex min-w-0 items-center gap-2 text-sm">
              {isEditing ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 font-mono text-xs text-slate-600">{address}</span>
                  <input
                    type="number"
                    min={0}
                    max={getMaxQuantity?.(a.locationUUID)}
                    value={editQtyInput}
                    onChange={(e) => setEditQtyInput(e.target.value)}
                    className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    disabled={disabled}
                    autoFocus
                  />
                  <span className="shrink-0 text-xs text-slate-500">szt.</span>
                  <button type="button" onClick={saveEditQty} className="shrink-0 text-xs font-medium text-cyan-600 hover:text-cyan-700">
                    Zapisz
                  </button>
                  <button type="button" onClick={cancelEditQty} className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700">
                    Anuluj
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <LocationTypeBadge
                      locationText={address}
                      quantity={a.quantity}
                      storageType={storageType}
                      volumeError={volumeOver}
                    />
                  </div>
                  {!fitsDims && (
                    <span className="shrink-0 text-amber-600" title="Produkt nie mieści się w wymiarach tej lokalizacji">
                      ⚠
                    </span>
                  )}
                  {volumeOver && (
                    <span className="shrink-0 text-xs text-red-600" title="Przekroczono pojemność (dm³)">
                      dm³
                    </span>
                  )}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => startEditQty(a)}
                      className="shrink-0 text-xs text-slate-500 hover:text-slate-700"
                      title="Zmień ilość"
                    >
                      Zmień ilość
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => removeLocation(a.locationUUID)}
                className="text-red-600 hover:text-red-700 text-xs font-medium shrink-0"
                disabled={disabled}
              >
                Usuń
              </button>
            </li>
          );
          })}
        </ul>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="text-sm font-medium text-cyan-600 hover:text-cyan-700"
          disabled={disabled}
        >
          + Dodaj lokalizację
        </button>
        {showAdd && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 shrink-0">Ilość (szt.):</label>
              <input
                type="number"
                min={1}
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                className="w-20 rounded border border-slate-200 px-2 py-1 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj (np. A-01-02-03 lub A1)..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg">
              {availableToAdd.length === 0 ? (
                <p className="p-2 text-xs text-slate-500">
                  {filtered.length === 0 ? "Brak pozycji w magazynie." : "Wszystkie wybrane lub brak pasujących."}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {availableToAdd.slice(0, 50).map((p) => {
                    const fits = positionFits(p);
                    const storageType = normalizeStorageType(p.storageType);
                    return (
                      <li
                        key={p.locationUUID}
                        className={`flex items-center gap-1.5 px-1 py-0.5 ${fits ? "hover:opacity-95" : "opacity-60"}`}
                        title={!fits ? "Produkt nie mieści się w wymiarach tej lokalizacji" : p.locationAddress}
                      >
                        {!fits && (
                          <span className="shrink-0 text-amber-600" aria-hidden>
                            ⚠
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <LocationTypeBadge locationText={p.locationAddress} storageType={storageType} />
                        </div>
                        <button
                          type="button"
                          onClick={() => fits && addLocation(p.locationUUID)}
                          disabled={!fits || disabled}
                          className="shrink-0 rounded bg-cyan-600 px-2 py-0.5 text-xs text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Dodaj
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {availableToAdd.length > 50 && (
              <p className="text-xs text-slate-500">Pokaż pierwsze 50. Zawęź wyszukiwanie.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
