import { Loader2, MapPin, Package } from "lucide-react";

import type { LiveSearchPick, LiveSearchRow } from "./WmsInventoryLiveSearchDropdown";

type Props = {
  query: string;
  open: boolean;
  loading: boolean;
  productRows: LiveSearchRow[];
  locationRows: LiveSearchRow[];
  carrierRows: LiveSearchRow[];
  onPick: (pick: LiveSearchPick) => void;
};

function ResultButton({
  row,
  showEnterHint,
  onPick,
}: {
  row: LiveSearchRow;
  showEnterHint?: boolean;
  onPick: (pick: LiveSearchPick) => void;
}) {
  const pick = (): LiveSearchPick => {
    if (row.kind === "product") return { kind: "product", scanCode: row.scanCode };
    if (row.kind === "location")
      return { kind: "location", locationCode: row.locationCode, taskId: row.taskId };
    return { kind: "carrier", code: row.code };
  };

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#f4f6f9] active:bg-[#eef1f5]"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(pick())}
    >
      {row.kind === "product" ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          {row.image_url ? (
            <img src={row.image_url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <Package className="h-3.5 w-3.5 text-[#c5d0de]" />
          )}
        </div>
      ) : row.kind === "location" ? (
        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#1e4d8c]" />
      ) : (
        <Package className="h-3.5 w-3.5 shrink-0 text-[#5a6b7d]" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#1a2b3c]">{row.label}</span>
        {row.sub ? <span className="block truncate text-xs text-[#5a6b7d]">{row.sub}</span> : null}
      </span>
      {showEnterHint ? <span className="shrink-0 text-[10px] font-bold text-[#8a9bb0]">↵</span> : null}
    </button>
  );
}

function Group({ label, rows, onPick, showEnterOnFirst }: {
  label: string;
  rows: LiveSearchRow[];
  onPick: (pick: LiveSearchPick) => void;
  showEnterOnFirst?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <li>
      <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a9bb0]">{label}</p>
      <ul>
        {rows.map((row, idx) => (
          <li key={row.key}>
            <ResultButton row={row} showEnterHint={showEnterOnFirst && idx === 0} onPick={onPick} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function WmsInventoryLiveSearchDropdown({
  query,
  open,
  loading,
  productRows,
  locationRows,
  carrierRows,
  onPick,
}: Props) {
  const total = productRows.length + locationRows.length + carrierRows.length;
  if (!open || query.trim().length < 2) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-0.5 max-h-[min(280px,40vh)] overflow-auto rounded-md border border-[#d0d7e2] bg-white shadow-lg">
      {loading ? (
        <p className="flex items-center gap-2 px-3 py-2 text-xs text-[#5a6b7d]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Szukam…
        </p>
      ) : null}
      {!loading && total === 0 ? <p className="px-3 py-2 text-xs text-[#8a9bb0]">Brak wyników</p> : null}
      {!loading && total > 0 ? (
        <ul className="py-1">
          <Group label="Produkty" rows={productRows} onPick={onPick} showEnterOnFirst />
          <Group label="Lokalizacje" rows={locationRows} onPick={onPick} />
          <Group label="Nośniki" rows={carrierRows} onPick={onPick} />
        </ul>
      ) : null}
    </div>
  );
}
