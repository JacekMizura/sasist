import {
  cartsAppInputClass,
  cartsFieldLabelClass,
} from "../../../modules/carts/cartsModuleTokens";
import { computeCapacityDm3, type SegmentDimensionDefaults } from "../../../modules/consolidation-racks/rackLayoutUtils";

export const MAX_RACK_DIM = 10_000;

export function parseOptionalDim(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_RACK_DIM) return null;
  return n;
}

export function dimsFromStrings(length: string, width: string, height: string): SegmentDimensionDefaults {
  return {
    length_mm: parseOptionalDim(length),
    width_mm: parseOptionalDim(width),
    height_mm: parseOptionalDim(height),
  };
}

type RackDataFieldsProps = {
  readOnly?: boolean;
  rackName: string;
  onRackNameChange?: (v: string) => void;
  warehouseId: number;
  warehouseLabel: string;
  onWarehouseChange?: (id: number) => void;
  warehouses?: Array<{ id: number; name: string }>;
  showWarehouseSelect?: boolean;
  rowCount: number;
  colCount: number;
  onRowCountChange?: (v: number) => void;
  onColCountChange?: (v: number) => void;
  gridLocked?: boolean;
  defaultLength: string;
  defaultWidth: string;
  defaultHeight: string;
  onDefaultLengthChange?: (v: string) => void;
  onDefaultWidthChange?: (v: string) => void;
  onDefaultHeightChange?: (v: string) => void;
};

export function ConsolidationRackDataFields({
  readOnly = false,
  rackName,
  onRackNameChange,
  warehouseId,
  warehouseLabel,
  onWarehouseChange,
  warehouses = [],
  showWarehouseSelect = false,
  rowCount,
  colCount,
  onRowCountChange,
  onColCountChange,
  gridLocked = false,
  defaultLength,
  defaultWidth,
  defaultHeight,
  onDefaultLengthChange,
  onDefaultWidthChange,
  onDefaultHeightChange,
}: RackDataFieldsProps) {
  const defaultDims = dimsFromStrings(defaultLength, defaultWidth, defaultHeight);
  const defaultCapacity = computeCapacityDm3(defaultDims.length_mm, defaultDims.width_mm, defaultDims.height_mm);
  const segmentCount = rowCount * colCount;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Dane regału</h2>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className={cartsFieldLabelClass}>Nazwa regału</span>
            {readOnly ? (
              <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{rackName}</div>
            ) : (
              <input
                type="text"
                value={rackName}
                onChange={(e) => onRackNameChange?.(e.target.value)}
                className={`${cartsAppInputClass} mt-1`}
                placeholder="RK-01"
              />
            )}
          </label>

          <label className="block">
            <span className={cartsFieldLabelClass}>Magazyn</span>
            {readOnly || !showWarehouseSelect ? (
              <div className="mt-1 text-sm font-medium text-slate-800">{warehouseLabel}</div>
            ) : (
              <select
                value={warehouseId}
                onChange={(e) => onWarehouseChange?.(Number(e.target.value))}
                className={`${cartsAppInputClass} mt-1`}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={cartsFieldLabelClass}>Liczba rzędów</span>
              {readOnly || gridLocked ? (
                <div className="mt-1 tabular-nums text-sm font-medium text-slate-800">{rowCount}</div>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rowCount}
                  onChange={(e) => onRowCountChange?.(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className={`${cartsAppInputClass} mt-1 no-number-spinner`}
                />
              )}
            </label>
            <label className="block">
              <span className={cartsFieldLabelClass}>Liczba kolumn</span>
              {readOnly || gridLocked ? (
                <div className="mt-1 tabular-nums text-sm font-medium text-slate-800">{colCount}</div>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={26}
                  value={colCount}
                  onChange={(e) => onColCountChange?.(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
                  className={`${cartsAppInputClass} mt-1 no-number-spinner`}
                />
              )}
            </label>
          </div>

          {gridLocked ? (
            <p className="text-xs text-slate-500">
              {rowCount} × {colCount} = {segmentCount} segmentów. Układ siatki nie podlega zmianie po utworzeniu.
            </p>
          ) : (
            <p className="text-xs text-slate-500">{segmentCount} segmentów — wszystkie dziedziczą profil wymiarowy poniżej.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Domyślny profil segmentu</h2>
        <p className="mt-1 text-xs text-slate-500">
          {readOnly
            ? "Wspólne wymiary dla segmentów bez indywidualnego nadpisania."
            : "100% segmentów otrzymuje te parametry. Nadpisanie pojedynczego segmentu — opcjonalne (advanced)."}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              ["Domyślna długość (mm)", defaultLength, onDefaultLengthChange],
              ["Domyślna szerokość (mm)", defaultWidth, onDefaultWidthChange],
              ["Domyślna wysokość (mm)", defaultHeight, onDefaultHeightChange],
            ] as const
          ).map(([label, val, setter]) => (
            <label key={label} className="block text-sm">
              <span className={cartsFieldLabelClass}>{label}</span>
              {readOnly ? (
                <div className="mt-1 font-mono tabular-nums text-sm text-slate-800">{val.trim() || "—"}</div>
              ) : (
                <input
                  type="number"
                  min={0}
                  max={MAX_RACK_DIM}
                  value={val}
                  onChange={(e) => setter?.(e.target.value)}
                  className={`${cartsAppInputClass} mt-1 tabular-nums`}
                />
              )}
            </label>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2">
          <span className="text-xs font-medium text-slate-600">Pojemność segmentu (auto)</span>
          <div className="font-mono text-lg font-bold text-violet-900">
            {defaultCapacity != null ? `${defaultCapacity.toFixed(0)} dm³` : "—"}
          </div>
        </div>
      </section>
    </div>
  );
}
